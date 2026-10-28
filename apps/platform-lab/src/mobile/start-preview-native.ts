import { Directory, File, Paths } from 'expo-file-system';
import { openDriver } from '../storage';
import { realHistoryUuid } from '../vereinsflieger/real-history-contract';
import { START_PREVIEW_LIMIT } from './start-preview';

/** Disposable OS cache: excluded from user archives and platform data backups. */
async function withCache<T>(storeId: string, create: boolean, work: (db: Awaited<ReturnType<typeof openDriver>>) => Promise<T>): Promise<T | null> {
  realHistoryUuid(storeId);
  const directory=new Directory(Paths.cache,'moflight-start-preview-v1');
  const name=`start-${storeId}.sqlite`;
  if(!create&&!new File(directory,name).exists)return null;
  if(create)directory.create({idempotent:true,intermediates:true});
  const db=await openDriver(name,directory.uri);
  try {
    if(create)await db.exec('PRAGMA synchronous=FULL; PRAGMA secure_delete=ON; CREATE TABLE IF NOT EXISTS start_preview(id INTEGER PRIMARY KEY CHECK(id=1),payload TEXT NOT NULL);');
    return await work(db);
  } finally { await db.close(); }
}
export async function loadStartPreviewCache(storeId:string):Promise<string|null> {
  return await withCache(storeId,false,async db=>{
    const row=await db.first<{payload:string}>('SELECT payload FROM start_preview WHERE id=1 AND length(CAST(payload AS BLOB))<=?',START_PREVIEW_LIMIT);
    return row?.payload??null;
  });
}
export async function saveStartPreviewCache(storeId:string,payload:string,gate:()=>Promise<void>):Promise<void> {
  if(encodeURIComponent(payload).replace(/%[A-F\d]{2}|./g,'x').length>START_PREVIEW_LIMIT)return;
  await gate();
  await withCache(storeId,true,async db=>{
    await gate();
    await db.run('INSERT INTO start_preview(id,payload) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload',payload);
    await gate();
  });
}
export async function clearStartPreviewCache(storeId:string):Promise<void> {
  await withCache(storeId,false,async db=>{await db.run('DELETE FROM start_preview');});
}

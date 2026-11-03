import * as Crypto from 'expo-crypto';
import {Directory,File,Paths} from 'expo-file-system';
import {canonical} from '@moflight/flight-logbook';
import {loadStartPreviewCache,saveStartPreviewCache,clearStartPreviewCache} from '../mobile/start-preview-native';
import {makeStartPreview,readStartPreview} from '../mobile/start-preview';
import {createNativeStartCacheFixture} from './native-start-cache-fixture';
import {RECOVERY_AT} from './android-core-recovery-fixture';

/** Build-only cache I/O proof: random synthetic UUID files, no owner registry,
 * provider, production history, AI or ordinary Start UI. */
export async function runNativeStartCacheProof() {
 const ids=[Crypto.randomUUID(),Crypto.randomUUID()];
 const directory=new Directory(Paths.cache,'moflight-start-preview-v1');
 const files=ids.map(id=>new File(directory,`start-${id}.sqlite`));
 if(files.some(file=>file.exists))throw new Error('Synthetic cache UUID collision');
 const checks:string[]=[],samples:{stage:string;milliseconds:number;trial?:number}[]=[];
 const gate=async()=>{};
 const now=Date.parse(RECOVERY_AT),history=new Directory(Paths.cache,`moflight-cache-proof-${Crypto.randomUUID()}`);
 if(history.exists)throw new Error('Synthetic history UUID collision');
 history.create();
 const fixtures:Awaited<ReturnType<typeof createNativeStartCacheFixture>>[]=[];
 const values:Awaited<ReturnType<typeof createNativeStartCacheFixture>>['preview'][]=[],texts:string[]=[];
 const expected=(i:number)=>({ownerId:values[i]!.ownerId,storeId:ids[i]!,scope:values[i]!.providerScope,selectionSeq:1});
 const check=(value:unknown,message:string)=>{if(!value)throw new Error(message);checks.push(message);};
 const stage=async<T>(name:string,work:()=>Promise<T>,trial?:number)=>{
  const at=performance.now();try{return await work();}finally{
   const sample={stage:name,milliseconds:performance.now()-at,...(trial===undefined?{}:{trial})};samples.push(sample);
   console.info('MOFLIGHT_START_CACHE_SAMPLE '+JSON.stringify(sample));
  }
 };
 let cleaned=false,error:string|null=null;
 try {
  await stage('prepare-native-history',async()=>{
   for(const [i,id] of ids.entries()){
    const fixture=await createNativeStartCacheFixture(history,id,i?7:101,String(999990101+i));
    fixtures.push(fixture);values.push(fixture.preview);texts.push(canonical(fixture.preview));
   }
  });
  await stage('seed-two-cache-stores',async()=>{for(const [i,id] of ids.entries())await saveStartPreviewCache(id,texts[i]!,gate);});
  await stage('closed-cache-readback-isolation',async()=>{
   for(const [i,id] of ids.entries()){
    const text=await loadStartPreviewCache(id);
    check(text===texts[i],`closed native cache ${i} exact readback`);
    check(text!==null&&readStartPreview(text,expected(i),now)!==null,`native cache ${i} admits its own valid envelope`);
   }
   check(readStartPreview((await loadStartPreviewCache(ids[0]!))!,expected(1),now)===null,'foreign account/store envelope rejected');
  });
  await stage('cancelled-cache-write',async()=>{
   let calls=0,rejected=false;
   try{await saveStartPreviewCache(ids[0]!,'rejected cache',async()=>{if(++calls===2)throw new Error('Synthetic cancelled write');});}catch{rejected=true;}
   check(rejected&&await loadStartPreviewCache(ids[0]!)===texts[0],'cancelled write preserves committed cache');
  });
  for(let trial=1;trial<=5;trial++){
   const cached=async()=>{
    const preview=await stage('cached-summary-ready',async()=>{
     const text=await loadStartPreviewCache(ids[0]!);return text===null?null:readStartPreview(text,expected(0),now);
    },trial);
    if(canonical(preview?.dashboard)!==canonical(values[0]!.dashboard))throw new Error('Compared cached summary changed');
   };
   const full=async()=>{
    const view=await stage('validated-history-ready',()=>fixtures[0]!.read(),trial);
    const computed=makeStartPreview(view,values[0]!.providerScope,now,values[0]!.revision);
    if(canonical(computed?.dashboard)!==canonical(values[0]!.dashboard))throw new Error('Compared native history changed');
   };
   if(trial%2){await cached();await full();}else{await full();await cached();}
  }
  await stage('damaged-cache-rewarm',async()=>{
   files[0]!.write('Synthetic damaged SQLite cache');
   check(await loadStartPreviewCache(ids[0]!)===null&&!files[0]!.exists,'damaged native SQLite cache discarded as miss');
   await saveStartPreviewCache(ids[0]!,texts[0]!,gate);
   check(await loadStartPreviewCache(ids[0]!)===texts[0],'verified values can warm cache after damage');
  });
  await stage('invalidation-isolation',async()=>{
   await clearStartPreviewCache(ids[0]!);
   check(await loadStartPreviewCache(ids[0]!)===null,'failed-history cache invalidation removes saved preview');
   check(await loadStartPreviewCache(ids[1]!)===texts[1],'other account/store cache remains exact');
  });
 } catch(failure) { error=String(failure).slice(0,500); }
 finally {
  // Each handle has closed; delete only newly generated fixture files.
  for(const file of files)try{if(file.exists)file.delete();}catch(failure){error??=String(failure).slice(0,500);}
  for(const fixture of fixtures)fixture.close();
  try{if(history.exists)history.delete();}catch(failure){error??=String(failure).slice(0,500);}
  cleaned=files.every(file=>!file.exists)&&!history.exists;
 }
 if(!cleaned)error??='Synthetic cache cleanup failed';
 return {version:1,status:error?'failed':'passed',error,sourceCommit:process.env.EXPO_PUBLIC_MOFLIGHT_SOURCE,checks,samples,cleaned,comparison:{flights:101,pairs:5,order:'alternating',cache:'closed SQLite cache read and envelope validation',history:'fresh native service read/validation; projection parity asserted outside timing'},
  limitation:'Synthetic native cache/helper proof; no ordinary owner-registry/account-switch UI, complete history validation, first-visible frame, live provider, phone or iOS acceptance.'};
}

import type { Connection } from '@moflight/local-data';
import { validateView, type ViewPreferences } from './view';
// Existing ownership tables from the earlier lab are left intact but unused.
// The fixed backup name is user-reserved; pending recovery owns the lifecycle.
export const VIEW_SCHEMA = 'CREATE TABLE IF NOT EXISTS provider_view_recovery (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL);';
export async function rememberView(db: Connection, input: unknown) {
  const payload = JSON.stringify(validateView(input));
  // Never replace unresolved recovery evidence with a later export's view.
  await db.run('INSERT INTO provider_view_recovery (id,payload) VALUES (1,?) ON CONFLICT(id) DO NOTHING', payload);
  const saved = await pendingView(db);
  if (!saved || JSON.stringify(saved) !== payload) throw new Error('An earlier provider view still needs restoration.');
}
export async function pendingView(db: Connection): Promise<ViewPreferences | null> {
  const row = await db.first<{payload:string}>('SELECT payload FROM provider_view_recovery WHERE id=1');
  if (!row) return null;
  if (row.payload.length > 400_000) throw new Error('Oversized view recovery.');
  return validateView(JSON.parse(row.payload));
}
export async function forgetView(db: Connection, expected: ViewPreferences) {
  // Clear only the journal that was actually verified by the current request.
  await db.run('DELETE FROM provider_view_recovery WHERE id=1 AND payload=?', JSON.stringify(validateView(expected)));
  if (await pendingView(db)) throw new Error('Provider view recovery could not be cleared.');
}

/** Called in a scoped transaction after fresh matching-account proof. Never replay stale preferences. */
export async function supersedeView(db: Connection, expected: ViewPreferences | null) {
  const current=await pendingView(db);
  if(JSON.stringify(current)!==JSON.stringify(expected))throw new Error('Provider view changed before fresh attempt.');
  if(!current)return;
  // Unlike legacy list preferences, a changed global page size must be restored
  // before a fresh attempt can replace its recovery evidence.
  if(current.rowsPerPage!==undefined)throw new Error('Restore the original provider page size before a fresh attempt.');
  await db.exec('CREATE TABLE IF NOT EXISTS provider_view_superseded_v1(payload TEXT PRIMARY KEY,reason TEXT NOT NULL CHECK(reason=\'fresh-fetch\'));');
  const payload=JSON.stringify(current);
  await db.run('INSERT OR IGNORE INTO provider_view_superseded_v1(payload,reason) VALUES (?,?)',payload,'fresh-fetch');
  const retained=await db.first<{payload:string}>('SELECT payload FROM provider_view_superseded_v1 WHERE payload=?',payload);
  if(retained?.payload!==payload)throw new Error('Previous view evidence could not be retained.');
  await forgetView(db,current);
}

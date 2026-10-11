import type { Connection } from '@moflight/local-data';
import { validateView, type ViewPreferences } from './view';
export const VIEW_SCHEMA = 'CREATE TABLE IF NOT EXISTS provider_view_recovery (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS provider_view_backup_owner (id INTEGER PRIMARY KEY CHECK(id=1), account_label TEXT NOT NULL);';
export async function backupOwner(db: Connection): Promise<string | null> {
  const row = await db.first<{account_label:string}>('SELECT account_label FROM provider_view_backup_owner WHERE id=1');
  if (!row) return null;
  if (typeof row.account_label !== 'string' || !row.account_label.trim() || row.account_label.length > 200) throw new Error('Invalid backup ownership.');
  return row.account_label;
}
export async function ownBackup(db: Connection, original: ViewPreferences) {
  const v = validateView(original), pending = await pendingView(db);
  if (v.reset || !pending || JSON.stringify(pending) !== JSON.stringify(v)) throw new Error('Backup ownership requires matching pending recovery.');
  await db.run('INSERT INTO provider_view_backup_owner (id,account_label) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET account_label=excluded.account_label', v.accountLabel);
}
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

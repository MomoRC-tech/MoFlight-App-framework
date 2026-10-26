import type { Connection } from '@moflight/local-data';
import { decodeSyncRecovery, type SyncRecoveryRecord } from './sync-recovery';

export const SYNC_RECOVERY_SCHEMA = 'CREATE TABLE IF NOT EXISTS sync_recovery(owner TEXT NOT NULL, store TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(owner,store));';

export async function readSyncRecoveryRow(db: Connection, ownerId: string, storeId: string): Promise<SyncRecoveryRecord | null> {
  const row = await db.first<{payload:string}>('SELECT payload FROM sync_recovery WHERE owner=? AND store=?', ownerId, storeId);
  return row ? decodeSyncRecovery(JSON.parse(row.payload) as unknown, ownerId, storeId) : null;
}

export async function saveSyncRecoveryRow(db: Connection, record: SyncRecoveryRecord): Promise<void> {
  const checked = decodeSyncRecovery(record, record.ownerId, record.storeId);
  await db.run('INSERT INTO sync_recovery(owner,store,payload) VALUES (?,?,?) ON CONFLICT(owner,store) DO UPDATE SET payload=excluded.payload',
    checked.ownerId, checked.storeId, JSON.stringify(checked));
}

export async function clearSyncRecoveryRow(db: Connection, ownerId: string, storeId: string): Promise<void> {
  await db.run('DELETE FROM sync_recovery WHERE owner=? AND store=?', ownerId, storeId);
}

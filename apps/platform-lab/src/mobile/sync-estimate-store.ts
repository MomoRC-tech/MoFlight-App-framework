import type { Connection } from '@moflight/local-data';
import { parseSyncEstimateHistory, type SyncEstimateHistory } from './sync-estimate';

export const SYNC_ESTIMATE_HISTORY_BYTES = 64 * 1024;
export const SYNC_ESTIMATE_SCHEMA = 'CREATE TABLE IF NOT EXISTS sync_estimate_hints(owner TEXT NOT NULL, store TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(owner,store));';

function validContext(context: string): void {
  if (typeof context !== 'string' || !context || context.length > 128) throw new Error('Invalid Sync estimate context.');
}

/** Disposable hints only: malformed or incompatible local hints become cold-start history. */
export async function readSyncEstimateHistoryRow(db: Connection, ownerId: string, storeId: string, context: string): Promise<SyncEstimateHistory> {
  validContext(context);
  // Bound the text returned from SQLite before parsing even a manually damaged row.
  const row = await db.first<{payload: string | null}>(
    'SELECT CASE WHEN length(CAST(payload AS BLOB)) <= ? THEN payload ELSE NULL END AS payload FROM sync_estimate_hints WHERE owner=? AND store=?',
    SYNC_ESTIMATE_HISTORY_BYTES, ownerId, storeId);
  return parseSyncEstimateHistory(row?.payload, context);
}

export async function saveSyncEstimateHistoryRow(db: Connection, ownerId: string, storeId: string, history: SyncEstimateHistory): Promise<void> {
  validContext(history.scope);
  const payload = JSON.stringify(parseSyncEstimateHistory(history, history.scope));
  if (new TextEncoder().encode(payload).length > SYNC_ESTIMATE_HISTORY_BYTES) throw new Error('Sync estimate history exceeds its local bound.');
  await db.run('INSERT INTO sync_estimate_hints(owner,store,payload) VALUES (?,?,?) ON CONFLICT(owner,store) DO UPDATE SET payload=excluded.payload',
    ownerId, storeId, payload);
}

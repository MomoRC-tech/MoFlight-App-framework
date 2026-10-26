import type { Connection } from '@moflight/local-data';
import { Directory, Paths } from 'expo-file-system';
import { openDriver } from '../storage';
import type { RealFlightNativeScope } from '../vereinsflieger/real-flight-native';
import type { SyncEstimateHistory } from './sync-estimate';
import { readSyncEstimateHistoryRow, saveSyncEstimateHistoryRow, SYNC_ESTIMATE_SCHEMA } from './sync-estimate-store';

// Disposable performance hints stay outside user history, recovery journals and backup exports.
const FILE = 'moflight-sync-estimate-hints-v1.sqlite';

async function guarded<T>(scope: RealFlightNativeScope, write: boolean, work: (db: Connection) => Promise<T>): Promise<T> {
  const permitted = () => {
    const permit = scope.authorize();
    if (!permit || permit.ownerId !== scope.lease.ownerId || permit.storeId !== scope.lease.storeId ||
        permit.leaseId !== scope.lease.leaseId || write && !permit.writable) throw new Error('Sync estimate owner changed.');
  };
  const current = async () => { permitted(); await scope.registry.assertCurrent(scope.lease); permitted(); };
  await current();
  // Eviction is a cold start, not data loss. Cache storage also excludes these
  // device-local hints from platform backups; never fall back to user storage.
  const cache = new Directory(Paths.cache, 'moflight-sync-estimate-hints');
  cache.create({ idempotent: true, intermediates: true });
  await current();
  const db = await openDriver(FILE, cache.uri);
  try {
    await current();
    await db.exec('PRAGMA synchronous=FULL; ' + SYNC_ESTIMATE_SCHEMA);
    let result!: T;
    await db.transaction(async tx => {
      await current();
      result = await work(tx);
      await current();
    });
    await current();
    return result;
  } finally { await db.close(); }
}

export function readSyncEstimateHistory(scope: RealFlightNativeScope, context: string): Promise<SyncEstimateHistory> {
  return guarded(scope, false, db => readSyncEstimateHistoryRow(db, scope.lease.ownerId, scope.lease.storeId, context));
}

export function saveSyncEstimateHistory(scope: RealFlightNativeScope, history: SyncEstimateHistory): Promise<void> {
  return guarded(scope, true, db => saveSyncEstimateHistoryRow(db, scope.lease.ownerId, scope.lease.storeId, history));
}

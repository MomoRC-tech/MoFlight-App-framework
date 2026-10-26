import { openDriver } from '../storage';
import type { RealFlightNativeScope } from '../vereinsflieger/real-flight-native';
import type { SyncRecoveryRecord } from './sync-recovery';
import { clearSyncRecoveryRow, readSyncRecoveryRow, saveSyncRecoveryRow, SYNC_RECOVERY_SCHEMA } from './sync-recovery-store';

const FILE = 'moflight-sync-recovery-v1.sqlite';

async function guarded<T>(scope: RealFlightNativeScope, write: boolean,
  work: (db: Awaited<ReturnType<typeof openDriver>>) => Promise<T>): Promise<T> {
  const permitted = () => {
    const permit = scope.authorize();
    if (!permit || permit.ownerId !== scope.lease.ownerId || permit.storeId !== scope.lease.storeId ||
        permit.leaseId !== scope.lease.leaseId || write && !permit.writable) throw new Error('Sync recovery owner changed.');
  };
  permitted();
  await scope.registry.assertCurrent(scope.lease);
  const db = await openDriver(FILE);
  try {
    await db.exec('PRAGMA synchronous=FULL; ' + SYNC_RECOVERY_SCHEMA);
    permitted();
    const result = await work(db);
    permitted();
    await scope.registry.assertCurrent(scope.lease);
    return result;
  } finally { await db.close(); }
}

export function readSyncRecovery(scope: RealFlightNativeScope): Promise<SyncRecoveryRecord | null> {
  return guarded(scope, false, db => readSyncRecoveryRow(db,scope.lease.ownerId,scope.lease.storeId));
}

export function saveSyncRecovery(scope: RealFlightNativeScope, record: SyncRecoveryRecord): Promise<void> {
  if(record.ownerId!==scope.lease.ownerId||record.storeId!==scope.lease.storeId)throw new Error('Foreign Sync recovery record.');
  return guarded(scope, true, db => saveSyncRecoveryRow(db,record));
}

export function clearSyncRecovery(scope: RealFlightNativeScope): Promise<void> {
  return guarded(scope, true, db => clearSyncRecoveryRow(db,scope.lease.ownerId,scope.lease.storeId));
}

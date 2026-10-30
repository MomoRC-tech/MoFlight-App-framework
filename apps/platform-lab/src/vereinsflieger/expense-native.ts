import { File } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import { hash, openDriver } from '../storage';
import { assertNoPendingUserBackupRestore, openUserBackupRestoreJournal } from '../user-backup-restore-journal-native';
import { createFinancialNativeAdapter } from './expense-native-adapter';
import { loadProviderScope } from './scoped-storage';
import { canonical } from '@moflight/flight-logbook';
import { validateFinancialObservationTarget } from './expense-observation-store';
import type { FinancialCaptureOptions } from './expense-capture-request';
import type { FinancialObservationTarget } from './expense-ledger-observation';
import type { RealFlightNativeScope } from './real-flight-native';

/** Existing Expo file/SQLite primitives; no provider sessions or credentials. */
export const financialNative = createFinancialNativeAdapter({
  file(name) {
    const directory = SQLite.defaultDatabaseDirectory;
    return new File(directory.startsWith('file:') ? directory : 'file://' + directory, name);
  },
  openDriver, hash, currentProviderScope: loadProviderScope,
  async assertRecovery(permit) {
    await assertNoPendingUserBackupRestore(permit);
    if (!permit) return;
    const journal = await openUserBackupRestoreJournal(false);
    if (!journal) throw Error('Financial restore requires a pending aggregate operation.');
    try {
      const pending = await journal.pending();
      if (!pending || pending.status !== 'pending' || pending.operationId !== permit.operationId ||
          pending.ownerId !== permit.ownerId || pending.storeId !== permit.storeId) throw Error('Foreign or completed financial restore permit.');
    } finally { await journal.close(); }
  },
});

/** Bind one explicit capture to its original native owner lease and raw target. */
export function nativeFinancialCaptureOptions(scope: RealFlightNativeScope, selected: FinancialObservationTarget,
  observedListUrl: string, observedDetailUrl: string): FinancialCaptureOptions {
  const held = { ...scope, lease: Object.freeze({ ...scope.lease }) }, target = validateFinancialObservationTarget(selected);
  const identity = canonical(target);
  if (target.scope.owner !== held.lease.ownerId || target.storeId !== held.lease.storeId || held.backupRestoreOperationId) throw Error('Foreign financial capture owner.');
  return { target, observedListUrl, observedDetailUrl,
    async authorize(gate) {
      await gate();
      if (!held.authorize()?.writable || canonical(await financialNative.currentTarget(held, gate)) !== identity) throw Error('Financial capture ownership is unavailable.');
      await gate();
    },
    save: (run, gate) => financialNative.withCurrentStore(held, JSON.parse(identity) as FinancialObservationTarget, gate,
      store => run.save(store, () => JSON.parse(identity) as FinancialObservationTarget, gate)),
  };
}

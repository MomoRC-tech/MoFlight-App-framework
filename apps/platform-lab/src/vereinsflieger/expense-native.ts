import { File } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import { hash, openDriver } from '../storage';
import { assertNoPendingUserBackupRestore, openUserBackupRestoreJournal } from '../user-backup-restore-journal-native';
import { createFinancialNativeAdapter } from './expense-native-adapter';
import { loadProviderScope } from './scoped-storage';

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

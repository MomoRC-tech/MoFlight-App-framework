import { File } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import { openDriver } from './storage';
import { USER_BACKUP_RESTORE_JOURNAL_FILE_NAME, UserBackupRestoreJournal } from './user-backup-restore-journal';

const directory = SQLite.defaultDatabaseDirectory;
const journalFile = new File(directory.startsWith('file:') ? directory : 'file://' + directory, USER_BACKUP_RESTORE_JOURNAL_FILE_NAME);
let readGateSnapshot: { pending: Awaited<ReturnType<UserBackupRestoreJournal['pending']>> } | { error: unknown } | null = null;

export function invalidateUserBackupRestoreReadGate(): void { readGateSnapshot = null; }

export async function openUserBackupRestoreJournal(create = false): Promise<UserBackupRestoreJournal | null> {
  if (create) invalidateUserBackupRestoreReadGate();
  if (!journalFile.exists) {
    if (!create) return null;
    journalFile.create({ overwrite: false, intermediates: true });
    if (!journalFile.exists) throw new Error('Could not reserve the user restore journal.');
  }
  const db = await openDriver(USER_BACKUP_RESTORE_JOURNAL_FILE_NAME);
  await db.exec('PRAGMA synchronous=FULL;');
  return UserBackupRestoreJournal.open(db, create);
}

export async function assertNoPendingUserBackupRestore(allowedOperation?: {
  operationId: string; ownerId: string; storeId: string;
}): Promise<void> {
  if (!readGateSnapshot) {
    try {
      const journal = await openUserBackupRestoreJournal(false);
      let pending: Awaited<ReturnType<UserBackupRestoreJournal['pending']>> = null;
      if (journal) { try { pending = await journal.pending(); } finally { await journal.close(); } }
      readGateSnapshot = { pending };
    } catch (error) { readGateSnapshot = { error }; }
  }
  if ('error' in readGateSnapshot) throw readGateSnapshot.error;
  const pending = readGateSnapshot.pending;
  if (!pending) return;
  if (allowedOperation && pending.operationId === allowedOperation.operationId && pending.ownerId === allowedOperation.ownerId &&
      pending.storeId === allowedOperation.storeId) return;
  throw new Error('A supported user restore is incomplete. Resume it before opening local data.');
}

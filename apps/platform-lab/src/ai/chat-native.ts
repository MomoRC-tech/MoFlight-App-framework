import { File } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import type { Connection, Driver } from '../../../../packages/local-data/src/index';
import { openDriver } from '../storage';
import type { RealFlightNativeScope } from '../vereinsflieger/real-flight-native';
import { assertNoPendingUserBackupRestore } from '../user-backup-restore-journal-native';
import { emptyUserChatArchive } from '../user-backup';
import { ChatStore } from './chat-store';
import { encodeChatArchive, validateChatArchive, type ChatArchive } from './chat-model';

export function ownerChatFileName(ownerId: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ownerId)) throw new Error('Invalid chat owner');
  return `moflight-ai-chats-${ownerId}.sqlite`;
}
function readOnlyDriver(db: Driver): Driver {
  const refuse = async () => { throw new Error('AI chat store is read-only'); };
  const read = (connection: Connection): Connection => ({ first: connection.first.bind(connection), all: connection.all.bind(connection), run: refuse, exec: refuse });
  return { ...read(db), close: db.close.bind(db), transaction: work => db.transaction(tx => work(read(tx))) };
}
async function openOwnerChats(scope: RealFlightNativeScope, writable: boolean, gate: () => Promise<void>): Promise<ChatStore | null> {
  const ownerId = scope.lease.ownerId, name = ownerChatFileName(ownerId);
  const check = async () => {
    await gate(); await scope.registry.assertCurrent(scope.lease);
    const p = scope.authorize();
    if (!p || p.ownerId !== ownerId || p.storeId !== scope.lease.storeId || p.leaseId !== scope.lease.leaseId || writable && !p.writable) throw new Error('Chat owner lease changed');
    await assertNoPendingUserBackupRestore(scope.backupRestoreOperationId ? {
      operationId: scope.backupRestoreOperationId, ownerId, storeId: scope.lease.storeId,
    } : undefined);
  };
  await check();
  const directory = SQLite.defaultDatabaseDirectory;
  const file = new File(directory.startsWith('file:') ? directory : 'file://' + directory, name);
  if (!file.exists) {
    if (!writable) return null;
    file.create({ overwrite: false, intermediates: true });
    if (!file.exists) throw new Error('Could not reserve owner chat storage');
  }
  await check();
  const driver = await openDriver(name);
  try { await driver.exec('PRAGMA synchronous=FULL;'); }
  catch (error) { await driver.close(); throw error; }
  return ChatStore.open(writable ? driver : readOnlyDriver(driver), ownerId, check, writable);
}
export async function readOwnerChatArchiveNative(scope: RealFlightNativeScope, gate: () => Promise<void>): Promise<ChatArchive> {
  const store = await openOwnerChats(scope, false, gate);
  if (!store) return emptyUserChatArchive(scope.lease.ownerId);
  try { return await store.archive(); } finally { await store.close(); }
}
/** Called only behind the aggregate restore's exact durable operation permit. */
export async function restoreOwnerChatsNative(scope: RealFlightNativeScope, archive: ChatArchive, gate: () => Promise<void>): Promise<void> {
  const parsed = validateChatArchive(archive, scope.lease.ownerId, { interruptActive: true });
  if (!scope.backupRestoreOperationId) throw new Error('Chat restore needs the aggregate operation permit');
  const store = await openOwnerChats(scope, true, gate);
  if (!store) throw new Error('Chat restore storage unavailable');
  try {
    await store.restore(parsed);
    if (encodeChatArchive(await store.archive()) !== encodeChatArchive(parsed)) throw new Error('Chat restore readback differs');
  } finally { await store.close(); }
}

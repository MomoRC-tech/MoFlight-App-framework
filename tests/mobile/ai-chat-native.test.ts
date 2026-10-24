import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { ChatStore } from '../../apps/platform-lab/src/ai/chat-store.ts';
import * as codec from '../../apps/platform-lab/src/ai/chat-model.ts';
import { emptyUserChatArchive } from '../../apps/platform-lab/src/user-backup.ts';
import { nodeDriver } from './sqlite-driver.ts';

const ownerId = '11111111-1111-4111-8111-111111111111', storeId = '22222222-2222-4222-8222-222222222222';
const at = '2026-10-24T12:00:00.000Z';
const source = ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/ai/chat-native.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: false },
}).outputText;
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'moflight-chat-native-'));
  let writable = true, current = true, pending: string | null = null;
  class File {
    readonly path: string;
    constructor(_directory: string, name: string) { assert.match(name, /^[a-zA-Z0-9.-]+$/); this.path = join(directory, name); }
    get exists() { return existsSync(this.path); }
    create() { writeFileSync(this.path, '', { flag: 'wx' }); }
  }
  const modules: Record<string, unknown> = {
    'expo-file-system': { File }, 'expo-sqlite': { defaultDatabaseDirectory: directory },
    '../storage': { openDriver: async (name: string) => nodeDriver(join(directory, name)) },
    '../user-backup': { emptyUserChatArchive }, './chat-store': { ChatStore }, './chat-model': { ...codec,
      // VM leaf replacement crosses JS realms; real native composition does not.
      validateChatArchive: (value: unknown, owner: string, options: codec.ChatArchiveOptions) => codec.validateChatArchive(value, owner, { ...options }),
    },
    '../user-backup-restore-journal-native': { assertNoPendingUserBackupRestore: async (allowed?: { operationId: string; ownerId: string; storeId: string }) => {
      if (pending && (allowed?.operationId !== pending || allowed.ownerId !== ownerId || allowed.storeId !== storeId)) throw new Error('Aggregate restore incomplete');
    } },
  };
  const exports: any = {};
  runInNewContext(source, { exports, require: (name: string) => { assert.ok(name in modules, name); return modules[name]; } });
  const scope = { lease: { ownerId, storeId, leaseId: 'lease-1' }, registry: { assertCurrent: async () => { if (!current) throw new Error('Owner changed'); } },
    authorize: () => ({ ownerId, storeId, leaseId: 'lease-1', writable }) };
  return { directory, exports, scope, writable: (value: boolean) => { writable = value; }, switchOwner: () => { current = false; }, pending: (value: string | null) => { pending = value; },
    async close() { await rm(directory, { recursive: true, force: true }); } };
}
test('native chat read leaves missing storage missing and validates owner paths before filesystem access', async () => {
  const f = await fixture();
  try {
    const result = await f.exports.readOwnerChatArchiveNative(f.scope, async () => {});
    assert.equal(codec.encodeChatArchive(result), codec.encodeChatArchive(emptyUserChatArchive(ownerId)));
    assert.equal(existsSync(join(f.directory, f.exports.ownerChatFileName(ownerId))), false);
    assert.throws(() => f.exports.ownerChatFileName('../foreign'));
    f.switchOwner(); await assert.rejects(f.exports.readOwnerChatArchiveNative(f.scope, async () => {}), /Owner changed/);
  } finally { await f.close(); }
});
test('native chat backup read preserves a live running attempt and durable drafts without reopening recovery', async () => {
  const f = await fixture();
  try {
    const store = await ChatStore.open(nodeDriver(join(f.directory, f.exports.ownerChatFileName(ownerId))), ownerId, async () => {});
    await store.saveDraft('chat-one', 'Synthetic', 'Offline draft', null, at);
    await store.appendMessage('chat-one', { id: 'message-one', input: 'Synthetic question', context: null, status: 'running', answer: null,
      attempt: { attemptId: 'attempt-one', runId: 'run-one', policyId: null, round: 0 }, createdAt: at }, at);
    const before = codec.encodeChatArchive(await store.archive()); await store.close();
    f.writable(false);
    const archive = await f.exports.readOwnerChatArchiveNative(f.scope, async () => {});
    assert.equal(codec.encodeChatArchive(archive), before); assert.equal(archive.conversations[0].messages[0].status, 'running');
    assert.equal(archive.conversations[0].draft, 'Offline draft');
  } finally { await f.close(); }
});
test('native restore requires the exact aggregate permit and a writable current owner; readback survives restart', async () => {
  const f = await fixture();
  try {
    const archive = emptyUserChatArchive(ownerId);
    archive.identity = { version: 1, localOwnerId: ownerId, provider: 'vereinsflieger', accountRef: '12345', observedAt: at,
      provenance: { kind: 'authenticated-profile', verification: 'observed-profile-number' } };
    await assert.rejects(f.exports.restoreOwnerChatsNative(f.scope, archive, async () => {}), /permit/);
    f.pending('restore-one');
    await assert.rejects(f.exports.restoreOwnerChatsNative({ ...f.scope, backupRestoreOperationId: 'other' }, archive, async () => {}), /incomplete/);
    const permitted = { ...f.scope, backupRestoreOperationId: 'restore-one' };
    f.writable(false); await assert.rejects(f.exports.restoreOwnerChatsNative(permitted, archive, async () => {}), /lease/);
    f.writable(true); await f.exports.restoreOwnerChatsNative(permitted, archive, async () => {});
    await assert.rejects(f.exports.readOwnerChatArchiveNative(f.scope, async () => {}), /incomplete/);
    f.pending(null);
    const result = await f.exports.readOwnerChatArchiveNative(f.scope, async () => {});
    assert.equal(codec.encodeChatArchive(result), codec.encodeChatArchive(archive));
    await assert.rejects(f.exports.restoreOwnerChatsNative(permitted, { ...archive, ownerId: storeId }, async () => {}), /Foreign/);
  } finally { await f.close(); }
});

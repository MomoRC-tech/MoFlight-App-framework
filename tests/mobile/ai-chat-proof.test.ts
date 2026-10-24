import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { decodeChatArchive } from '../../apps/platform-lab/src/ai/chat-model.ts';
import { AI_CHAT_PROOF_FILES, reopenAiChatProof, seedAiChatProof, verifyAiChatProof } from '../../apps/platform-lab/src/development/ai-chat-proof-fixture.ts';
import { UPDATE_ACCOUNTS } from '../../apps/platform-lab/src/development/update-preservation-fixture.ts';
import { nodeDriver } from './sqlite-driver.ts';
import type { Driver } from '../../packages/local-data/src/index.ts';

const hash = async (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'moflight-ai-chat-proof-'));
  const drivers = new Set<Driver>();
  function path(name: string) {
    assert.match(name, /^[a-z][a-z0-9.-]+$/);
    return join(directory, name);
  }
  const ports = {
    open: async (name: string): Promise<Driver> => {
      const db = nodeDriver(path(name));
      let closed = false;
      const tracked: Driver = { ...db, close: async () => {
        if (!closed) { closed = true; drivers.delete(tracked); await db.close(); }
      } };
      drivers.add(tracked);
      return tracked;
    },
    exists: async (name: string) => access(path(name)).then(() => true, () => false),
    read: (name: string) => readFile(path(name), 'utf8'),
    write: (name: string, value: string) => writeFile(path(name), value, 'utf8'),
    hash,
  };
  return {
    directory, path, ports,
    async cleanup() {
      for (const db of drivers) await db.close().catch(() => {});
      const target = resolve(directory);
      assert.equal(dirname(target), resolve(tmpdir()));
      assert.match(basename(target), /^moflight-ai-chat-proof-/);
      await rm(target, { recursive: true, force: true });
    },
  };
}

test('AI chat proof seeds separate owners, recovers a lost aggregate acknowledgement and survives reopen', async () => {
  const f = await fixture();
  try {
    await seedAiChatProof(f.ports);
    const initial = JSON.parse(await f.ports.read('ai-expected.json')) as { a: string; b: string };
    const a = UPDATE_ACCOUNTS.find(value => value.key === 'a')!, b = UPDATE_ACCOUNTS.find(value => value.key === 'b')!;
    const archiveA = decodeChatArchive(initial.a, a.ownerId), archiveB = decodeChatArchive(initial.b, b.ownerId);
    assert.equal(archiveA.conversations.length, 50);
    assert.equal(archiveA.conversations.some(chat => chat.id === 'old-1'), false);
    assert.equal(archiveA.conversations.find(chat => chat.id === 'old-0')?.draft, 'Independent draft stays beside the sent question');
    assert.equal(archiveA.conversations.find(chat => chat.id === 'old-0')?.messages[0]?.status, 'running');
    assert.equal(archiveB.conversations[0]?.id, 'old-0');
    assert.equal(archiveA.identity?.accountRef, a.account);
    assert.equal(archiveB.identity?.accountRef, b.account);
    assert.notEqual(archiveA.conversations[0]?.draft, archiveB.conversations[0]?.draft);

    for (const name of ['a-chats.sqlite', 'b-chats.sqlite', 'ai-archive.json', 'ai-expected.json']) {
      assert.equal(await f.ports.exists(name), true, name);
    }
    assert.notDeepEqual(await readFile(f.path('a-chats.sqlite')), await readFile(f.path('b-chats.sqlite')));

    const originals = ['a-real.sqlite', 'b-real.sqlite', 'a-books.sqlite', 'b-books.sqlite',
      'a-information.sqlite', 'b-information.sqlite', 'restore.sqlite', 'archive.json'];
    const originalBytes = await Promise.all(originals.map(name => readFile(f.path(name))));

    const verified = await verifyAiChatProof(f.ports);
    assert.deepEqual(verified, { version: 1, chats: 50, owners: 2, evicted: 'old-1', draft: true,
      activeRestore: 'interrupted', lateReplyRejected: true, recovery: 'complete', retry: 'already-restored', reopened: false });
    for (const name of AI_CHAT_PROOF_FILES) assert.equal(await f.ports.exists(name), true, name);
    for (const [index, name] of originals.entries()) assert.deepEqual(await readFile(f.path(name)), originalBytes[index], name);
    assert.equal(await f.ports.exists('ai-lost-ack.json'), true);

    // Open fresh stores against disk-backed ports after verification; the helper retains no store state.
    const reopened = await reopenAiChatProof(f.ports);
    assert.deepEqual(reopened, { ...verified, reopened: true });
  } finally { await f.cleanup(); }
});

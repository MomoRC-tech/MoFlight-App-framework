import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { canonical } from '../../packages/flight-logbook/src/index.ts';
import type { AiContext, HistoricalProviderIdentity } from '../../packages/ai-contracts/src/index.ts';
import { CHAT_LIMITS, decodeChatArchive, encodeChatArchive, validateChatArchive,
  type ChatArchive, type ChatConversation, type ChatMessage, type StoredChatAnswer } from '../../apps/platform-lab/src/ai/chat-model.ts';
import { ChatStore } from '../../apps/platform-lab/src/ai/chat-store.ts';
import { nodeDriver } from './sqlite-driver.ts';

const at = '2026-10-24T12:00:00.000Z';
const later = '2026-10-24T12:01:00.000Z';
const gate = async () => {};

function context(ownerId = 'owner-a', accountRef = '12345', generation = 1): AiContext {
  return { version: 1, localOwnerId: ownerId, provider: 'vereinsflieger', accountRef, contextVersion: generation,
    flights: { state: 'available', storeId: 'store-a', generation, snapshotRevision: `snapshot-${generation}` } };
}

function identity(ownerId = 'owner-a', accountRef = '12345'): HistoricalProviderIdentity {
  return { version: 1, localOwnerId: ownerId, provider: 'vereinsflieger', accountRef, observedAt: at,
    provenance: { kind: 'authenticated-profile', verification: 'observed-profile-number' } };
}

function answer(ctx: AiContext, evidenceId = 'evidence-1'): StoredChatAnswer {
  return { version: 1, text: 'One saved flight matched.', evidence: [
    { id: evidenceId, flightId: 'flight-1', factsRevision: 'facts-1', context: ctx },
  ], actions: [{ kind: 'open-flight', referenceIds: [evidenceId] }],
  metrics: [{ referenceId: 'metric-1', measure: 'knownMinutes', value: 60, unit: 'minutes' }] };
}

function message(idValue: string, ctx: AiContext | null = null, status: ChatMessage['status'] = 'running', attemptId = `attempt-${idValue}`): ChatMessage {
  return { id: idValue, input: 'How many saved flights?', context: ctx, status, answer: null,
    attempt: status === 'complete' ? null : { attemptId, runId: `run-${idValue}`, policyId: null, round: 0 }, createdAt: at };
}

function conversation(idValue: string, activitySequence: number, draft = '', ownerId = 'owner-a'): ChatConversation {
  return { version: 1, id: idValue, ownerId, title: idValue, draft, context: null, messages: [], activitySequence, updatedAt: at };
}

function archive(ownerId = 'owner-a', conversations: ChatConversation[] = [], activitySequence = 0,
  savedIdentity: HistoricalProviderIdentity | null = null): ChatArchive {
  return { version: 1, ownerId, activitySequence, identity: savedIdentity, conversations };
}

async function withTemp<T>(run: (directory: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), 'moflight-ai-chat-'));
  try { return await run(directory); }
  finally { await rm(directory, { recursive: true, force: true }); }
}

test('archive codec is canonical, bounded and validates evidence against its message context', () => {
  const contextOne = context();
  const chat = conversation('chat-1', 3);
  chat.context = context('owner-a', '12345', 2);
  chat.messages = [{ ...message('message-1', contextOne, 'complete'), answer: answer(contextOne) }];
  const value = archive('owner-a', [chat], 3, identity());
  const encoded = encodeChatArchive(value);
  assert.equal(encoded, canonical(validateChatArchive(value, 'owner-a')));
  assert.deepEqual(decodeChatArchive(encoded, 'owner-a'), validateChatArchive(value, 'owner-a'));
  assert.equal(decodeChatArchive(encoded, 'owner-a').conversations[0]?.messages[0]?.answer?.evidence[0]?.context.contextVersion, 1);
  assert.throws(() => decodeChatArchive(` ${encoded}`, 'owner-a'), /canonical/);
  assert.throws(() => decodeChatArchive(encoded, 'owner-b'), /Foreign/);

  const staleEvidence = structuredClone(value);
  staleEvidence.conversations[0]!.messages[0]!.answer!.evidence[0]!.context = context('owner-a', '12345', 2);
  assert.throws(() => validateChatArchive(staleEvidence, 'owner-a'));
  const rowCitation = { kind: 'source-row' as const, id: 'row-ref-1', captureId: 'capture-1', captureSha256: 'a'.repeat(64), rowIndex: 0, context: contextOne };
  const rowArchive = archive('owner-a', [{ ...conversation('row-chat', 1), context: contextOne, messages: [
    { ...message('row-message', contextOne, 'complete'), answer: { version: 1, text: 'This row is evidence.', evidence: [rowCitation], actions: [], metrics: [] } },
  ] }], 1, identity());
  assert.deepEqual(validateChatArchive(rowArchive, 'owner-a').conversations[0]?.messages[0]?.answer?.evidence[0], rowCitation);
  const navigableRow = structuredClone(rowArchive);
  navigableRow.conversations[0]!.messages[0]!.answer!.actions = [{ kind: 'open-flight', referenceIds: ['row-ref-1'] }];
  assert.throws(() => validateChatArchive(navigableRow, 'owner-a'), /action reference/);
  const extra = structuredClone(value) as ChatArchive & { capability?: string };
  extra.capability = 'must-not-be-backed-up';
  assert.throws(() => validateChatArchive(extra, 'owner-a'));

  let getterCalled = false;
  const accessor = { ...value };
  Object.defineProperty(accessor, 'version', { enumerable: true, get() { getterCalled = true; return 1; } });
  assert.throws(() => validateChatArchive(accessor, 'owner-a'));
  assert.equal(getterCalled, false);
  assert.throws(() => validateChatArchive({ ...value, [Symbol('extra')]: true }, 'owner-a'));
  assert.throws(() => decodeChatArchive('x'.repeat(CHAT_LIMITS.archiveBytes + 1), 'owner-a'), /16 MiB/);
});

test('disk reopen preserves drafts and one owner cannot open another owner database', async () => {
  await withTemp(async directory => {
    const ownerAPath = join(directory, 'owner-a.sqlite');
    const first = await ChatStore.open(nodeDriver(ownerAPath), 'owner-a', gate);
    await first.saveDraft('chat-1', 'Draft', 'Offline question survives restart.', context(), at);
    await first.close();

    const reopened = await ChatStore.open(nodeDriver(ownerAPath), 'owner-a', gate);
    assert.equal((await reopened.archive()).conversations[0]?.draft, 'Offline question survives restart.');
    await reopened.close();
    await assert.rejects(ChatStore.open(nodeDriver(ownerAPath), 'owner-b', gate), /another owner/);

    const ownerB = await ChatStore.open(nodeDriver(join(directory, 'owner-b.sqlite')), 'owner-b', gate);
    await ownerB.saveDraft('chat-1', 'Separate owner', 'Separate local data.', context('owner-b'), at);
    assert.equal((await ownerB.archive()).conversations[0]?.ownerId, 'owner-b');
    await ownerB.close();
  });
});

test('unknown database versions are preserved without initialization or reset', async () => {
  await withTemp(async directory => {
    const path = join(directory, 'unknown.sqlite');
    const original = nodeDriver(path);
    await original.exec('CREATE TABLE sentinel(value TEXT NOT NULL); PRAGMA user_version=9; INSERT INTO sentinel VALUES (\'keep-me\');');
    await original.close();
    await assert.rejects(ChatStore.open(nodeDriver(path), 'owner-a', gate), /Unsupported AI chat database schema/);
    const check = nodeDriver(path);
    try { assert.equal((await check.first<{ value: string }>('SELECT value FROM sentinel'))?.value, 'keep-me'); }
    finally { await check.close(); }

    const viewPath = join(directory, 'unversioned-view.sqlite');
    const unversioned = nodeDriver(viewPath);
    await unversioned.exec("CREATE VIEW saved_view AS SELECT 'preserve-view' AS value;");
    await unversioned.close();
    await assert.rejects(ChatStore.open(nodeDriver(viewPath), 'owner-a', gate), /SQL object/);
    const viewCheck = nodeDriver(viewPath);
    try { assert.equal((await viewCheck.first<{ value: string }>('SELECT value FROM saved_view'))?.value, 'preserve-view'); }
    finally { await viewCheck.close(); }
  });
});

test('open rejects extra SQL objects and changed maintained columns without repairing either database', async () => {
  await withTemp(async directory => {
    const extraPath = join(directory, 'extra-object.sqlite');
    const store = await ChatStore.open(nodeDriver(extraPath), 'owner-a', gate);
    await store.close();
    const extra = nodeDriver(extraPath);
    await extra.exec("CREATE TABLE extra_object(value TEXT NOT NULL); INSERT INTO extra_object VALUES ('preserve-extra');");
    await extra.close();
    await assert.rejects(ChatStore.open(nodeDriver(extraPath), 'owner-a', gate), /Unexpected AI chat database objects/);
    const extraCheck = nodeDriver(extraPath);
    try { assert.equal((await extraCheck.first<{ value: string }>('SELECT value FROM extra_object'))?.value, 'preserve-extra'); }
    finally { await extraCheck.close(); }

    const changedPath = join(directory, 'changed-column.sqlite');
    const changed = nodeDriver(changedPath);
    await changed.exec(`CREATE TABLE ai_chat_manifest(singleton INTEGER PRIMARY KEY CHECK(singleton=1), owner_id TEXT NOT NULL, schema_version INTEGER NOT NULL CHECK(schema_version=1));
      CREATE TABLE ai_chat_state(singleton INTEGER PRIMARY KEY CHECK(singleton=1), activity_sequence INTEGER NOT NULL CHECK(activity_sequence >= 0), backup_json TEXT NOT NULL);
      PRAGMA user_version=1;
      INSERT INTO ai_chat_manifest VALUES (1,'owner-a',1);
      INSERT INTO ai_chat_state VALUES (1,0,'preserve-column-data');`);
    await changed.close();
    await assert.rejects(ChatStore.open(nodeDriver(changedPath), 'owner-a', gate), /Unsupported AI chat table schema/);
    const changedCheck = nodeDriver(changedPath);
    try { assert.equal((await changedCheck.first<{ backup_json: string }>('SELECT backup_json FROM ai_chat_state'))?.backup_json, 'preserve-column-data'); }
    finally { await changedCheck.close(); }
  });
});

test('activity sequence applies stable tie eviction and old drafts participate in the 50-chat cap', async () => {
  await withTemp(async directory => {
    const db = nodeDriver(join(directory, 'cap.sqlite'));
    const store = await ChatStore.open(db, 'owner-a', gate);
    const tied = Array.from({ length: 50 }, (_, index) => conversation(`chat-${String(index).padStart(2, '0')}`, 1,
      index === 0 ? 'old unsent draft' : ''));
    const starting = archive('owner-a', tied, 1);
    await store.restore(starting);
    await store.saveDraft('chat-new', 'New', 'Fresh work.', null, at);
    let result = await store.archive();
    assert.equal(result.conversations.length, 50);
    assert.equal(result.conversations.some(item => item.id === 'chat-00'), false);
    assert.equal(result.conversations.some(item => item.draft === 'old unsent draft'), false);
    assert.equal(result.conversations.some(item => item.id === 'chat-01'), true);

    await store.restore(starting);
    await store.touch('chat-00', later);
    await store.saveDraft('chat-new', 'New', 'Fresh work.', null, at);
    result = await store.archive();
    assert.equal(result.conversations.some(item => item.id === 'chat-00'), true);
    assert.equal(result.conversations.some(item => item.id === 'chat-01'), false);
    assert.equal(result.activitySequence, 3);
    await store.close();
  });
});

test('empty chats stay absent, ordinary reopen preserves active work, and explicit recovery interrupts it', async () => {
  await withTemp(async directory => {
    const path = join(directory, 'recovery.sqlite');
    let store = await ChatStore.open(nodeDriver(path), 'owner-a', gate);
    await store.saveDraft('empty-chat', '', '', null, at);
    assert.equal((await store.archive()).conversations.length, 0);
    await store.appendMessage('active-chat', message('message-active'), at);
    await store.appendMessage('deleted-chat', message('message-deleted', null, 'pending'), at);
    assert.equal((await store.archive()).conversations.find(item => item.id === 'active-chat')?.messages[0]?.status, 'running');
    await store.close();

    store = await ChatStore.open(nodeDriver(path), 'owner-a', gate);
    const recovered = await store.archive();
    assert.equal(recovered.conversations.find(item => item.id === 'active-chat')?.messages[0]?.status, 'running');
    assert.equal(recovered.conversations.find(item => item.id === 'deleted-chat')?.messages[0]?.status, 'pending');
    await store.recoverActive();
    const interrupted = await store.archive();
    assert.equal(interrupted.conversations.find(item => item.id === 'active-chat')?.messages[0]?.status, 'interrupted');
    await store.delete('deleted-chat');
    const late = { ...message('message-deleted', null, 'complete'), answer: { version: 1, text: 'Late answer', evidence: [], actions: [], metrics: [] } as StoredChatAnswer };
    assert.equal(await store.updateMessage('deleted-chat', late, later), false);
    assert.equal((await store.archive()).conversations.some(item => item.id === 'deleted-chat'), false);
    await store.close();
  });
});

test('append clears only a draft that exactly matches the submitted input', async () => {
  await withTemp(async directory => {
    const store = await ChatStore.open(nodeDriver(join(directory, 'draft-clear.sqlite')), 'owner-a', gate);
    try {
      const ctx = context();
      await store.saveDraft('chat-1', 'Question', 'submitted question', ctx, at);
      await store.appendMessage('chat-1', { ...message('message-1', ctx, 'pending'), input: 'submitted question' }, later);
      assert.equal((await store.archive()).conversations[0]?.draft, '');

      await store.saveDraft('chat-1', 'Edited follow-up', 'new unsent draft', ctx, later);
      await store.appendMessage('chat-1', { ...message('message-2', ctx, 'pending'), input: 'another submitted question' }, later);
      assert.equal((await store.archive()).conversations[0]?.draft, 'new unsent draft');
    } finally { await store.close(); }
  });
});

test('a failed recovery gate rolls back the transaction and leaves stored bytes intact', async () => {
  await withTemp(async directory => {
    let failAt = 0;
    let calls = 0;
    const gated = async () => { calls++; if (failAt !== 0 && calls === failAt) throw new Error('recovery gate closed'); };
    const db = nodeDriver(join(directory, 'gate.sqlite'));
    const store = await ChatStore.open(db, 'owner-a', gated);
    await store.saveDraft('chat-1', 'Saved', 'Keep these bytes.', null, at);
    const before = await db.first<{ archive_json: string; activity_sequence: number }>('SELECT archive_json,activity_sequence FROM ai_chat_state WHERE singleton=1');
    calls = 0;
    failAt = 3; // The in-transaction post-work gate runs before commit.
    await assert.rejects(store.saveDraft('chat-2', 'Blocked', 'Must roll back.', null, later), /gate closed/);
    failAt = 0;
    const after = await db.first<{ archive_json: string; activity_sequence: number }>('SELECT archive_json,activity_sequence FROM ai_chat_state WHERE singleton=1');
    assert.deepEqual(after, before);
    assert.deepEqual((await store.archive()).conversations.map(item => item.id), ['chat-1']);
    await store.close();
  });
});

test('message updates stay on one attempt, move rounds forward and ignore late answers after cancellation', async () => {
  await withTemp(async directory => {
    const store = await ChatStore.open(nodeDriver(join(directory, 'attempts.sqlite')), 'owner-a', gate);
    try {
      const original = message('message-1', null, 'running', 'attempt-current');
      await store.appendMessage('chat-1', original, at);
      const roundOne = { ...original, attempt: { ...original.attempt!, round: 1 } };
      assert.equal(await store.updateMessage('chat-1', roundOne, later), true);
      assert.equal(await store.updateMessage('chat-1', original, at), false); // Stale round.
      const otherAttempt = { ...roundOne, attempt: { ...roundOne.attempt!, attemptId: 'attempt-old' } };
      assert.equal(await store.updateMessage('chat-1', otherAttempt, later), false); // Late prior attempt.

      const cancelled = { ...roundOne, status: 'cancelled' as const };
      assert.equal(await store.updateMessage('chat-1', cancelled, later), true);
      const lateAnswer = { ...roundOne, status: 'complete' as const,
        answer: { version: 1 as const, text: 'Arrived after cancellation.', evidence: [], actions: [], metrics: [] } };
      assert.equal(await store.updateMessage('chat-1', lateAnswer, later), false);
      assert.equal(await store.updateMessage('chat-1', cancelled, later), true); // Idempotent terminal update.
      assert.equal((await store.archive()).conversations[0]?.messages[0]?.status, 'cancelled');
    } finally { await store.close(); }
  });
});

test('invalid, foreign and oversized restores preserve the saved archive bytes', async () => {
  await withTemp(async directory => {
    const db = nodeDriver(join(directory, 'restore.sqlite'));
    const store = await ChatStore.open(db, 'owner-a', gate);
    try {
      await store.saveDraft('chat-1', 'Saved', 'Original bytes.', null, at);
      const before = await db.first<{ archive_json: string; activity_sequence: number }>('SELECT archive_json,activity_sequence FROM ai_chat_state WHERE singleton=1');

      await assert.rejects(store.restore(archive('owner-b') as ChatArchive), /Foreign/);
      const tooLong = archive('owner-a', [{ ...conversation('too-long', 0), draft: 'x'.repeat(CHAT_LIMITS.draftChars + 1) }], 0);
      await assert.rejects(store.restore(tooLong), /text/);
      const after = await db.first<{ archive_json: string; activity_sequence: number }>('SELECT archive_json,activity_sequence FROM ai_chat_state WHERE singleton=1');
      assert.deepEqual(after, before);
    } finally { await store.close(); }
  });
});

test('active states become interrupted only when requested by the codec, and forbidden receipt fields fail closed', () => {
  const active = archive('owner-a', [{ ...conversation('chat-1', 1), messages: [message('message-1')] }], 1);
  const preserved = validateChatArchive(active, 'owner-a');
  assert.equal(preserved.conversations[0]?.messages[0]?.status, 'running');
  const interrupted = validateChatArchive(active, 'owner-a', { interruptActive: true });
  assert.equal(interrupted.conversations[0]?.messages[0]?.status, 'interrupted');
  assert.equal(decodeChatArchive(encodeChatArchive(active), 'owner-a', { interruptActive: true }).conversations[0]?.messages[0]?.status, 'interrupted');

  const forbidden = structuredClone(active) as ChatArchive & { budget?: unknown };
  forbidden.conversations[0]!.messages[0]!.attempt = { ...forbidden.conversations[0]!.messages[0]!.attempt!, budget: { remainingMicroEur: 1 } } as ChatMessage['attempt'];
  assert.throws(() => validateChatArchive(forbidden, 'owner-a'));
  const badMessage = structuredClone(active);
  (badMessage.conversations[0]!.messages[0] as ChatMessage & { protocol?: unknown }).protocol = [{ role: 'assistant' }];
  assert.throws(() => validateChatArchive(badMessage, 'owner-a'));
  assert.throws(() => validateChatArchive({ ...active, conversations: [...active.conversations, active.conversations[0]!] }, 'owner-a'), /Duplicate/);
  const duplicateMessage = archive('owner-a', [
    { ...conversation('chat-a', 1), messages: [message('same-message', null, 'complete')] },
    { ...conversation('chat-b', 1), messages: [message('same-message', null, 'complete')] },
  ], 1);
  assert.throws(() => validateChatArchive(duplicateMessage, 'owner-a'), /Duplicate/);
  const tooMany = { ...active, conversations: [{ ...active.conversations[0]!, messages: Array.from({ length: 501 }, (_, index) => message(`message-${index}`, null, 'complete')) }] };
  assert.throws(() => validateChatArchive(tooMany, 'owner-a'));
  assert.throws(() => validateChatArchive({ ...active, activitySequence: Number.MAX_SAFE_INTEGER + 1 }, 'owner-a'));
});

test('appending a later context keeps older answer evidence bound to its original context', async () => {
  await withTemp(async directory => {
    const store = await ChatStore.open(nodeDriver(join(directory, 'contexts.sqlite')), 'owner-a', gate);
    const older = context('owner-a', '12345', 1);
    const newer = context('owner-a', '12345', 2);
    const first = message('message-1', older);
    await store.appendMessage('chat-1', first, at);
    await store.saveDraft('chat-1', 'Next question', 'Use the refreshed flight snapshot.', newer, later);
    const completed = { ...first, status: 'complete' as const, answer: answer(older) };
    assert.equal(await store.updateMessage('chat-1', completed, later), true);
    const saved = await store.archive();
    const chat = saved.conversations[0]!;
    assert.equal(chat.context?.contextVersion, 2);
    assert.equal(chat.messages[0]?.answer?.evidence[0]?.context.contextVersion, 1);
    assert.equal(chat.messages[0]?.context?.contextVersion, 1);
    await store.close();
  });
});

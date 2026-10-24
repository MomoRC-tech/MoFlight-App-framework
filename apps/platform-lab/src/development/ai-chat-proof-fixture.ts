import { canonical } from '@moflight/flight-logbook';
import { PilotBooks } from '../../../../packages/local-data/src/books';
import { ChatStore } from '../ai/chat-store';
import { rememberHistoricalIdentity } from '../ai/historical-provider-identity';
import { decodeChatArchive, encodeChatArchive, type ChatMessage } from '../ai/chat-model';
import { restoreUserBackup, type UserBackupServicePorts } from '../user-backup-service';
import { createUserBackup, validateUserBackup, type UserBackupPayloadV1, type UserBackupPayloadV2 } from '../user-backup';
import { UserBackupRestoreJournal, assertUserBackupReadAllowed } from '../user-backup-restore-journal';
import { InformationStore } from '../vereinsflieger/information-store';
import { RealFlightLibrary } from '../vereinsflieger/real-flight-library';
import { validateScope, type ProviderScope } from '../vereinsflieger/scope-store';
import { UPDATE_ACCOUNTS, UPDATE_AT, captureUpdateProof, seedUpdateProof, updateId, type UpdateAccount, type UpdateProofPorts } from './update-preservation-fixture';

const CHAT_JOURNAL = 'ai-journal.sqlite';
const CHAT_ARCHIVE = 'ai-archive.json';
const CHAT_EXPECTED = 'ai-expected.json';
const LOST_ACK = 'ai-lost-ack.json';
const SELECTION = 'ai-selection.json';
const REAL_CANDIDATE = 'ai-real.sqlite';
const INFORMATION_CANDIDATE = 'ai-information.sqlite';
const OPERATION_ID = updateId(901);
const CANDIDATE_BOOKS = `pilot-restore-${OPERATION_ID}.sqlite`;

/** Files created by this overlay, including the deterministic aggregate pilot candidate. */
export const AI_CHAT_PROOF_FILES = Object.freeze([
  'a-chats.sqlite', 'b-chats.sqlite', CHAT_JOURNAL, CHAT_ARCHIVE, CHAT_EXPECTED, LOST_ACK, SELECTION,
  REAL_CANDIDATE, INFORMATION_CANDIDATE, CANDIDATE_BOOKS,
] as const);

export interface AiChatProofResult {
  version: 1;
  chats: 50;
  owners: 2;
  evicted: 'old-1';
  draft: true;
  activeRestore: 'interrupted';
  lateReplyRejected: true;
  recovery: 'complete';
  retry: 'already-restored';
  reopened: boolean;
}

function account(key: 'a' | 'b'): UpdateAccount {
  const found = UPDATE_ACCOUNTS.find(value => value.key === key);
  if (!found) throw new Error(`Missing synthetic account ${key}`);
  return found;
}

function identity(value: UpdateAccount) {
  return {
    version: 1 as const, localOwnerId: value.ownerId, provider: 'vereinsflieger' as const,
    accountRef: value.account, observedAt: UPDATE_AT,
    provenance: { kind: 'authenticated-profile' as const, verification: 'observed-profile-number' as const },
  };
}

function runningMessage(): ChatMessage {
  return {
    id: 'message-old-0', input: 'Question sent while offline', context: null, status: 'running', answer: null,
    attempt: { attemptId: 'attempt-old-0', runId: 'run-old-0', policyId: 'policy-old-0', round: 1 }, createdAt: UPDATE_AT,
  };
}

function readLegacyParts(text: string): { rawScope: unknown; body: Record<string, unknown> } {
  const envelope: unknown = JSON.parse(text);
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope) || typeof (envelope as Record<string, unknown>).payload !== 'string') {
    throw new Error('Legacy user backup envelope is malformed.');
  }
  const body: unknown = JSON.parse((envelope as Record<string, unknown>).payload as string);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Legacy user backup payload is malformed.');
  const value = body as Record<string, unknown>;
  const information = value.information;
  if (information === null) return { rawScope: null, body: value };
  if (!information || typeof information !== 'object' || Array.isArray(information)) throw new Error('Legacy information section is malformed.');
  return { rawScope: (information as Record<string, unknown>).scope, body: value };
}

async function legacyPayload(p: UpdateProofPorts): Promise<{ payload: UserBackupPayloadV1; scope: ProviderScope | null }> {
  const text = await p.read('archive.json');
  const { rawScope } = readLegacyParts(text);
  const scope = rawScope === null ? null : validateScope(rawScope);
  const parsed = await validateUserBackup(text, {
    ownerId: account('a').ownerId, storeId: account('a').storeId, informationScope: scope,
  }, p.hash);
  if (parsed.version !== 1) throw new Error('Expected the original v1 upgrade archive.');
  return { payload: parsed, scope };
}

async function openChat(p: UpdateProofPorts, value: UpdateAccount, gate: () => Promise<void> = async () => {}) {
  return ChatStore.open(await p.open(`${value.key}-chats.sqlite`), value.ownerId, gate);
}

async function saveSeedChats(p: UpdateProofPorts): Promise<{ a: string; b: string }> {
  const a = account('a');
  const aStore = await openChat(p, a);
  try {
    await rememberHistoricalIdentity(aStore, identity(a), async () => {});
    for (let index = 0; index < 50; index++) {
      const id = `old-${index}`;
      await aStore.saveDraft(id, `Conversation ${index}`, `Draft ${index}`, null, UPDATE_AT);
    }
    await aStore.touch('old-0', UPDATE_AT);
    await aStore.saveDraft('old-0', 'Conversation 0', 'Independent draft stays beside the sent question', null, UPDATE_AT);
    await aStore.saveDraft('old-50', 'Conversation 50', 'Draft 50', null, UPDATE_AT);
    await aStore.appendMessage('old-0', runningMessage(), UPDATE_AT);
  } finally { await aStore.close(); }

  const b = account('b');
  const bStore = await openChat(p, b);
  try {
    await rememberHistoricalIdentity(bStore, identity(b), async () => {});
    await bStore.saveDraft('old-0', 'Account B conversation', 'Different owner, account and draft', null, UPDATE_AT);
  } finally { await bStore.close(); }

  const aRead = await openChat(p, a), bRead = await openChat(p, b);
  try {
    return {
      a: encodeChatArchive(await aRead.archive()),
      b: encodeChatArchive(await bRead.archive()),
    };
  } finally { await aRead.close(); await bRead.close(); }
}

/** Seed a disjoint owner-scoped chat overlay and a real v2 user backup. */
export async function seedAiChatProof(p: UpdateProofPorts): Promise<void> {
  if (await p.exists(CHAT_EXPECTED)) throw new Error('Existing AI chat proof preserved; choose a fresh namespace.');
  await seedUpdateProof(p);
  const expected = await saveSeedChats(p);
  const a = account('a');
  const { payload: legacy, scope } = await legacyPayload(p);
  const aArchive = decodeChatArchive(expected.a, a.ownerId);
  const backup = await createUserBackup({
    createdAt: legacy.createdAt,
    ownerId: legacy.ownerId,
    storeId: legacy.storeId,
    pilot: legacy.pilot,
    realFlights: legacy.realFlights,
    information: legacy.information,
    ai: { archive: encodeChatArchive(aArchive) },
  }, p.hash);
  const validated = await validateUserBackup(backup, { ownerId: a.ownerId, storeId: a.storeId, informationScope: scope }, p.hash);
  if (validated.version !== 2 || validated.ai.archive !== expected.a) throw new Error('AI v2 backup failed exact validation.');
  await p.write(CHAT_ARCHIVE, backup);
  await p.write(CHAT_EXPECTED, canonical(expected));
}

async function openJournal(p: UpdateProofPorts): Promise<UserBackupRestoreJournal | null> {
  if (!(await p.exists(CHAT_JOURNAL))) return null;
  return UserBackupRestoreJournal.open(await p.open(CHAT_JOURNAL), false);
}

function realPermit(ownerId: string, storeId: string) {
  return () => ({ ownerId, storeId, leaseId: 'synthetic-ai-chat-proof', writable: true });
}

function createRestorePorts(p: UpdateProofPorts, text: string, scope: ProviderScope | null): UserBackupServicePorts {
  let pilotCandidateName: string | null = null;
  let nextId = 901;
  const service: UserBackupServicePorts = {
    io: {
      pickBackup: async () => ({ canceled: false, assets: [{ uri: 'ai-archive.json', size: new TextEncoder().encode(text).length }] }),
      readPickedFile: async () => text,
    },
    hash: p.hash,
    uuid: () => updateId(nextId++),
    now: () => UPDATE_AT,
    async openJournal(create) {
      if (!create && !(await p.exists(CHAT_JOURNAL))) return null;
      return UserBackupRestoreJournal.open(await p.open(CHAT_JOURNAL), create);
    },
    currentInformationScope: async ownerId => ownerId === account('a').ownerId ? scope : null,
    async stagePilot(input) {
      pilotCandidateName = input.candidateName;
      const books = new PilotBooks(await p.open(input.candidateName), 'synthetic-pilot', p.hash);
      try {
        await books.initialize();
        if (await books.backup() === input.backup) return;
        const count = await books.db.first<{ count: number }>(`SELECT
          (SELECT count(*) FROM books) + (SELECT count(*) FROM source_revisions) +
          (SELECT count(*) FROM memberships) + (SELECT count(*) FROM book_state) +
          (SELECT count(*) FROM book_snapshots) + (SELECT count(*) FROM book_entries) AS count`);
        if (count?.count !== 0) throw new Error('Existing pilot candidate differs from the AI chat proof backup.');
        await books.restore(input.backup);
        if (await books.backup() !== input.backup) throw new Error('Pilot candidate differs from archive.');
      } finally { await books.db.close(); }
    },
    async restoreRealFlights(input, gate) {
      const candidate = await RealFlightLibrary.restoreIntoEmptyValidated(
        await p.open(REAL_CANDIDATE), input.backup, input.permit.ownerId, input.permit.storeId, p.hash,
        realPermit(input.permit.ownerId, input.permit.storeId), async () => {}, async () => gate(),
      );
      try {
        if (await candidate.exportBackup() !== input.backup) throw new Error('Real-flight candidate differs from archive.');
      } finally { await candidate.close(); }
      return 'restored';
    },
    async restoreInformation(input, gate) {
      const existed = await p.exists(INFORMATION_CANDIDATE);
      const info = new InformationStore(await p.open(INFORMATION_CANDIDATE), input.scope, async () => gate());
      try {
        await info.initialize(!existed);
        const count = await info.db.first<{ count: number }>('SELECT count(*) AS count FROM information_captures');
        if (!count) throw new Error('Information candidate count unavailable.');
        if (count.count > 0) {
          await info.verifyBackup(input.backup, p.hash);
          return 'already-activated';
        }
        await info.restoreBackup(input.backup, p.hash);
        await info.verifyBackup(input.backup, p.hash);
        return 'restored';
      } finally { await info.db.close(); }
    },
    async activatePilot(input) {
      if (pilotCandidateName !== input.candidateName) pilotCandidateName = input.candidateName;
      if (!pilotCandidateName) throw new Error('Pilot candidate was not staged.');
      const payload = JSON.parse(text) as { payload: string };
      const backupBody = JSON.parse(payload.payload) as { pilot: { selectedBookId: string | null } };
      const books = new PilotBooks(await p.open(input.candidateName), 'synthetic-pilot', p.hash);
      try {
        await books.initialize();
        if (backupBody.pilot.selectedBookId) await books.book(backupBody.pilot.selectedBookId);
      } finally { await books.db.close(); }
      await p.write(SELECTION, canonical({ ownerId: input.permit.ownerId, storeId: input.permit.storeId,
        selectedBookId: backupBody.pilot.selectedBookId }));
    },
    async restoreAi(input, gate) {
      const allowed = () => assertUserBackupReadAllowed(() => openJournal(p), input.permit);
      const store = await ChatStore.open(await p.open('a-chats.sqlite'), input.permit.ownerId, allowed);
      try {
        await store.restore(input.archive);
        if (encodeChatArchive(await store.archive()) !== encodeChatArchive(input.archive)) throw new Error('AI chat restore failed exact readback.');
      } finally { await store.close(); }

      const lostAck = canonical({ version: 1, operationId: input.permit.operationId,
        archiveSha256: await p.hash(encodeChatArchive(input.archive)) });
      if (!(await p.exists(LOST_ACK))) {
        await p.write(LOST_ACK, lostAck);
        if (await p.read(LOST_ACK) !== lostAck) throw new Error('Lost AI acknowledgement marker did not persist.');
        throw new Error('Synthetic lost AI restore acknowledgement.');
      }
      if (await p.read(LOST_ACK) !== lostAck) throw new Error('Lost AI acknowledgement marker differs from this operation.');
      await gate();
    },
  };
  return service;
}

async function validateStoredBackup(p: UpdateProofPorts): Promise<{ payload: UserBackupPayloadV2; scope: ProviderScope | null }> {
  const text = await p.read(CHAT_ARCHIVE);
  const legacyParts = readLegacyParts(await p.read('archive.json'));
  const scope = legacyParts.rawScope === null ? null : validateScope(legacyParts.rawScope);
  const a = account('a');
  const value = await validateUserBackup(text, { ownerId: a.ownerId, storeId: a.storeId, informationScope: scope }, p.hash);
  if (value.version !== 2) throw new Error('AI chat proof archive must be v2.');
  return { payload: value, scope };
}

async function assertCandidateReadback(p: UpdateProofPorts, payload: UserBackupPayloadV2, scope: ProviderScope | null): Promise<void> {
  const a = account('a');
  const real = await RealFlightLibrary.open(await p.open(REAL_CANDIDATE), a.ownerId, a.storeId, p.hash, realPermit(a.ownerId, a.storeId));
  try { if (await real.exportBackup() !== payload.realFlights.backup) throw new Error('Restored real-flight source readback differs.'); }
  finally { await real.close(); }

  const books = new PilotBooks(await p.open(CANDIDATE_BOOKS), 'synthetic-pilot', p.hash);
  try {
    await books.initialize();
    if (await books.backup() !== payload.pilot.backup) throw new Error('Restored pilot source readback differs.');
    if (payload.pilot.selectedBookId) await books.book(payload.pilot.selectedBookId);
  } finally { await books.db.close(); }

  if (payload.information) {
    if (!scope) throw new Error('Information restore scope is missing.');
    const info = new InformationStore(await p.open(INFORMATION_CANDIDATE), scope, async () => {});
    try { await info.initialize(false); await info.verifyBackup(payload.information.backup, p.hash); }
    finally { await info.db.close(); }
  }
  const selection = canonical({ ownerId: payload.ownerId, storeId: payload.storeId, selectedBookId: payload.pilot.selectedBookId });
  if (await p.read(SELECTION) !== selection) throw new Error('Restored pilot selection readback differs.');
}

async function assertFinishedState(p: UpdateProofPorts, reopened: boolean): Promise<AiChatProofResult> {
  const initial = JSON.parse(await p.read(CHAT_EXPECTED)) as { a: string; b: string };
  const { payload, scope } = await validateStoredBackup(p);
  const a = account('a'), b = account('b');
  const restoredA = decodeChatArchive(payload.ai.archive, a.ownerId, { interruptActive: true });
  const expectedA = decodeChatArchive(initial.a, a.ownerId, { interruptActive: true });
  if (encodeChatArchive(restoredA) !== encodeChatArchive(expectedA)) throw new Error('Interrupted AI archive differs from its seeded state.');

  const genericGate = () => assertUserBackupReadAllowed(() => openJournal(p));
  const aStore = await openChat(p, a, genericGate), bStore = await openChat(p, b, genericGate);
  try {
    const actualA = await aStore.archive(), actualB = await bStore.archive();
    if (encodeChatArchive(actualA) !== encodeChatArchive(restoredA)) throw new Error('Restored A chat archive differs after reopening.');
    if (encodeChatArchive(actualB) !== initial.b) throw new Error('Owner B chats changed during A restore.');
    if (actualA.conversations.length !== 50 || actualA.conversations.some(chat => chat.id === 'old-1') ||
        !actualA.conversations.some(chat => chat.id === 'old-0' && chat.draft === 'Independent draft stays beside the sent question')) {
      throw new Error('AI chat retention or independent draft check failed.');
    }
    if (actualA.conversations.find(chat => chat.id === 'old-0')?.messages[0]?.status !== 'interrupted') {
      throw new Error('Active restored chat message was not interrupted.');
    }
  } finally { await aStore.close(); await bStore.close(); }

  await assertCandidateReadback(p, payload, scope);
  const original = JSON.parse(await p.read('expected.json')) as unknown;
  if (canonical(await captureUpdateProof(p)) !== canonical(original)) throw new Error('Aggregate AI restore changed original source stores.');
  const journal = await openJournal(p);
  if (!journal) throw new Error('Aggregate AI restore journal is missing.');
  try { if (await journal.pending()) throw new Error('Aggregate AI restore remains pending after completion.'); }
  finally { await journal.close(); }
  return { version: 1, chats: 50, owners: 2, evicted: 'old-1', draft: true, activeRestore: 'interrupted',
    lateReplyRejected: true, recovery: 'complete', retry: 'already-restored', reopened };
}

/** Verify durable seed state, explicit interruption recovery, and aggregate lost-ack resumption. */
export async function verifyAiChatProof(p: UpdateProofPorts): Promise<AiChatProofResult> {
  const initial = JSON.parse(await p.read(CHAT_EXPECTED)) as { a: string; b: string };
  const { payload: backup, scope } = await validateStoredBackup(p);
  const text = await p.read(CHAT_ARCHIVE), a = account('a'), b = account('b');
  if (backup.ai.archive !== initial.a) throw new Error('Aggregate backup does not include the exact seeded A chat archive.');

  const openA = await openChat(p, a), openB = await openChat(p, b);
  let lateUpdateAccepted = true;
  try {
    if (encodeChatArchive(await openA.archive()) !== initial.a || encodeChatArchive(await openB.archive()) !== initial.b) {
      throw new Error('Ordinary AI chat reopen changed durable seed state.');
    }
    const before = await openA.archive();
    await openA.recoverActive();
    const interrupted = decodeChatArchive(initial.a, a.ownerId, { interruptActive: true });
    if (encodeChatArchive(await openA.archive()) !== encodeChatArchive(interrupted)) throw new Error('Explicit active chat recovery failed.');
    await openA.delete('old-0');
    const oldMessage = before.conversations.find(chat => chat.id === 'old-0')?.messages[0];
    if (!oldMessage) throw new Error('Running proof message is missing.');
    lateUpdateAccepted = await openA.updateMessage('old-0', { ...oldMessage, status: 'complete' }, UPDATE_AT);
    if (lateUpdateAccepted) throw new Error('Deleted conversation accepted a late AI result.');
  } finally { await openA.close(); await openB.close(); }

  const ports = createRestorePorts(p, text, scope);
  const interrupted = await restoreUserBackup(a.ownerId, a.storeId, async () => {}, ports);
  if (interrupted.state !== 'recovery-required' || interrupted.operationId !== OPERATION_ID) {
    throw new Error('Lost chat acknowledgement did not leave the expected durable recovery operation.');
  }
  let genericReaderBlocked = false;
  try { await assertUserBackupReadAllowed(() => openJournal(p)); } catch { genericReaderBlocked = true; }
  if (!genericReaderBlocked) throw new Error('Generic AI chat reader bypassed the unfinished aggregate restore gate.');
  let unexpectedlyOpened: ChatStore | null = null;
  try { unexpectedlyOpened = await ChatStore.open(await p.open('a-chats.sqlite'), a.ownerId,
    () => assertUserBackupReadAllowed(() => openJournal(p))); }
  catch { /* A fail-closed open closes its database handle before rejecting. */ }
  if (unexpectedlyOpened) {
    await unexpectedlyOpened.close();
    throw new Error('AI chat store opened through the unfinished aggregate restore gate.');
  }

  const restartedPorts = createRestorePorts(p, text, scope);
  const resumed = await restoreUserBackup(a.ownerId, a.storeId, async () => {}, restartedPorts, OPERATION_ID);
  if (resumed.state !== 'restored') throw new Error('AI aggregate restore did not resume after process restart.');
  const repeated = await restoreUserBackup(a.ownerId, a.storeId, async () => {}, restartedPorts, OPERATION_ID);
  if (repeated.state !== 'already-restored') throw new Error('Completed AI aggregate restore was not idempotent.');
  if (lateUpdateAccepted) throw new Error('Late AI reply unexpectedly changed a deleted conversation.');
  return assertFinishedState(p, false);
}

/** Reopen after a later process restart and verify restored A, preserved B, and a complete journal. */
export async function reopenAiChatProof(p: UpdateProofPorts): Promise<AiChatProofResult> {
  return assertFinishedState(p, true);
}

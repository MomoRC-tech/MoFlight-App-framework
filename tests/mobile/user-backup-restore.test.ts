import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { canonical } from '../../packages/flight-logbook/src/index.ts';
import { PilotBooks, sourceId, type SourceFlight } from '../../packages/local-data/src/books.ts';
import { RealFlightLibrary, type RealFlightPermit } from '../../apps/platform-lab/src/vereinsflieger/real-flight-library.ts';
import type { RealHistoryManifest } from '../../apps/platform-lab/src/vereinsflieger/real-history-contract.ts';
import type { RealFlightSourceInput } from '../../apps/platform-lab/src/vereinsflieger/real-flight-source.ts';
import { InformationStore } from '../../apps/platform-lab/src/vereinsflieger/information-store.ts';
import { validateInformationCapture } from '../../apps/platform-lab/src/vereinsflieger/information.ts';
import type { ProviderScope } from '../../apps/platform-lab/src/vereinsflieger/scope-store.ts';
import { createUserBackup, validateUserBackup, selectedPilotBookForBackup, emptyUserChatArchive } from '../../apps/platform-lab/src/user-backup.ts';
import { ChatStore } from '../../apps/platform-lab/src/ai/chat-store.ts';
import { encodeChatArchive, decodeChatArchive, type ChatArchive } from '../../apps/platform-lab/src/ai/chat-model.ts';
import { restoreUserBackup, type UserBackupServicePorts } from '../../apps/platform-lab/src/user-backup-service.ts';
import { USER_BACKUP_RESTORE_JOURNAL_FILE_NAME, UserBackupRestoreJournal, assertUserBackupReadAllowed } from '../../apps/platform-lab/src/user-backup-restore-journal.ts';
import { nodeDriver } from './sqlite-driver.ts';

const ownerId = '11111111-1111-4111-8111-111111111111';
const storeId = '22222222-2222-4222-8222-222222222222';
const connectionId = '33333333-3333-4333-8333-333333333333';
const at = '2026-10-23T10:00:00.000Z';
const hash = async (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const scope: ProviderScope = { version: 1, owner: ownerId, connectionId,
  context: { accountNumber: '12345', clubLabel: 'Synthetic club', clubIdentity: 'display-label-only', verification: 'observed-profile-number' } };
const manifest: RealHistoryManifest = { singleton: 1, family: 'moflight-real-flight-history', schema_version: 1,
  payload_version: 1, owner_id: ownerId, store_id: storeId, created_at: at };

test('pilot backup selection stays null for an empty library and rejects a stale nonempty selection', () => {
  assert.equal(selectedPilotBookForBackup([], null), null);
  assert.equal(selectedPilotBookForBackup([{ id: 'book-one' }], 'book-one'), 'book-one');
  assert.throws(() => selectedPilotBookForBackup([{ id: 'book-one' }], 'missing'), /unavailable/);
});

test('restore journal binds the pilot candidate filename to its operation identity', async () => {
  const journal = await UserBackupRestoreJournal.open(nodeDriver(':memory:'));
  try {
    await assert.rejects(journal.prepare({ operationId: uuid(1), ownerId, storeId, archiveSha256: 'a'.repeat(64),
      pilotCandidateName: `pilot-restore-${uuid(9)}.sqlite`, realCandidateId: uuid(2), realOperationId: uuid(3),
      informationOperationId: null, informationScope: null, selectedBookId: 'book-one',
      createdAt: at, updatedAt: at }), /Invalid aggregate user restore journal row/);
    assert.equal(await journal.pending(), null);
  } finally { await journal.close(); }
});

test('empty generation-zero user restore journal can be explicitly initialized; unknown tables are preserved', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'moflight-user-backup-journal-v0-'));
  try {
    const emptyPath = join(directory, 'empty.sqlite');
    await assert.rejects(UserBackupRestoreJournal.open(nodeDriver(emptyPath), false), /Uninitialized user backup restore journal/);
    const initialized = await UserBackupRestoreJournal.open(nodeDriver(emptyPath), true);
    assert.equal(await initialized.pending(), null); await initialized.close();

    const unknownPath = join(directory, 'unknown.sqlite');
    const unknown = nodeDriver(unknownPath); await unknown.exec('CREATE TABLE unrelated(value TEXT);'); await unknown.close();
    await assert.rejects(UserBackupRestoreJournal.open(nodeDriver(unknownPath), true), /Existing user backup restore journal preserved/);
    const check = nodeDriver(unknownPath);
    assert.equal((await check.first<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' AND name='unrelated'"))?.name, 'unrelated');
    await check.close();
  } finally { await rm(directory, { recursive: true, force: true }); }
});

function realSource(captureId: string): RealFlightSourceInput {
  const context = { accountNumber: '12345', clubLabel: 'Synthetic club', clubIdentity: 'display-label-only' as const,
    verification: 'observed-profile-number' as const };
  const window = { from: '2026-10-01', to: '2026-10-23', participation: 'Pilot oder Fluglehrer' as const };
  return { version: 1, binding: { provider: 'vereinsflieger', accountRef: '12345' }, contextBefore: context, contextAfter: context,
    requestedWindow: window, capture: { captureId, retrievedAt: at, headers: ['Datum', 'Lfz.', 'Start', 'Landung', 'Flugzeit', 'Pilot'],
      rows: [{ values: ['20.10.2026', 'D-TEST', '09:00', '10:00', '1:00', 'Synthetic pilot'], sourceFlightId: '1' }],
      sourceIdentity: 'unverified', coverage: 'complete-requested-list', timeBasis: 'unknown',
      exportContext: { ...window, preset: 'Konfiguration laden', accountLabel: 'Synthetic account', recordCount: 1, pageCount: 1,
        columnIds: ['1', '2', '3', '4', '5', '6'], adapterVersion: 2 } } };
}

async function archive(ai?: ChatArchive, withFlights = true) {
  const permit: RealFlightPermit = { ownerId, storeId, leaseId: '44444444-4444-4444-8444-444444444444', writable: true };
  const real = await RealFlightLibrary.create(nodeDriver(':memory:'), manifest, hash, () => permit);
  let realBackup = '';
  try {
    if (withFlights) {
      const binding = realSource('binding-capture');
      await real.bindAccount({ kind: 'bind', commandId: uuid(100), baseGeneration: 0, source: binding, at });
      const input = realSource('flight-capture');
      const plan = await real.prepareImport(input);
      await real.saveUnassigned({ kind: 'import-unassigned', commandId: uuid(101), baseGeneration: plan.baseGeneration,
        bindingId: plan.bindingId, source: input, planToken: plan.planToken, at });
    }
    realBackup = await real.exportBackup();
  } finally { await real.close(); }

  const pilot = new PilotBooks(nodeDriver(':memory:'), 'synthetic-pilot', hash);
  await pilot.initialize();
  await pilot.createBook({ id: 'book-one', owner: 'synthetic-pilot', name: 'Synthetic book',
    format: 'synthetic-powered-five-row-v1', classes: ['glider'], from: '2020-01-01', through: null });
  const flight = JSON.parse(readFileSync('tests/fixtures/local-logbook/mobile.json', 'utf8')).source.flights.at(-1);
  const id = sourceId('synthetic-pilot', 'synthetic-provider', '1');
  const sourceFlight: SourceFlight = { transport: 'synthetic-proof', id, owner: 'synthetic-pilot', connection: 'synthetic-provider',
    reference: '1', aircraftClass: 'glider', duplicate: false, flight: { ...flight, id, pilot_role: 'PIC' }, raw: 'synthetic original source' };
  await pilot.ingest([sourceFlight]); await pilot.associate('book-one', id, true);
  await pilot.saveState('book-one', 'pending', { draft: 'synthetic pending state' });
  const pilotBackup = await pilot.backup(); await pilot.db.close();

  const info = new InformationStore(nodeDriver(':memory:'), scope, async () => {});
  await info.initialize();
  await info.save(validateInformationCapture({ version: 1, id: 'medical-source', retrievedAt: at, owner: ownerId,
    connectionId, sourceIdentity: 'provisional-observed-profile', category: 'medical', path: '/member/profile/viewprofile',
    columns: [{ key: 'kind', label: 'Medical-Art', index: 0 }, { key: 'expiry', label: 'Gültig bis · Originaltext', index: 1 }],
    rows: [{ position: 1, values: ['Synthetic class', '31.12.2027'] }],
    filters: [], empty: false, coverage: { kind: 'visible-page', truncated: false, pagination: 'unverified' } }));
  const infoBackup = await info.exportBackup(hash); await info.db.close();
  return createUserBackup({ createdAt: at, ownerId, storeId,
    pilot: { ownerId: 'synthetic-pilot', backup: pilotBackup, displayName: 'Synthetic pilot', selectedBookId: 'book-one' },
    realFlights: { backup: realBackup }, information: { scope, backup: infoBackup }, ...(ai ? { ai: { archive: encodeChatArchive(ai) } } : {}) }, hash);
}

function chatArchive(): ChatArchive {
  const context = { version: 1 as const, localOwnerId: ownerId, provider: 'vereinsflieger' as const, accountRef: '12345', contextVersion: 1,
    flights: { state: 'available' as const, storeId, generation: 2, snapshotRevision: 'generation-2' } };
  return { version: 1, ownerId, activitySequence: 1, identity: { version: 1, localOwnerId: ownerId, provider: 'vereinsflieger', accountRef: '12345',
    observedAt: at, provenance: { kind: 'authenticated-profile', verification: 'observed-profile-number' } },
    conversations: [{ version: 1, id: 'chat-one', ownerId, title: 'Synthetic conversation', draft: 'Durable offline draft', context, activitySequence: 1, updatedAt: at,
      messages: [{ id: 'question-one', input: 'How many saved flights?', context, status: 'running', answer: null,
        attempt: { attemptId: 'attempt-one', runId: 'run-one', policyId: 'policy-one', round: 1 }, createdAt: at }] }] };
}

function makePorts(directory: string, text: string, failAfterReal = false): UserBackupServicePorts {
  const journalPath = join(directory, USER_BACKUP_RESTORE_JOURNAL_FILE_NAME);
  let nextUuid = 1, failed = false, realActive = false, pilotCandidate = false, pilotActive = false, infoActive = false;
  const events: string[] = [];
  const ports: UserBackupServicePorts = {
    io: { pickBackup: async () => ({ canceled: false, assets: [{ uri: 'backup.json', size: Buffer.byteLength(text) }] }),
      readPickedFile: async () => text },
    hash, uuid: () => uuid(nextUuid++), now: () => at,
    async openJournal(create) {
      if (!existsSync(journalPath) && !create) return null;
      const existed = existsSync(journalPath), db = nodeDriver(journalPath);
      try { return await UserBackupRestoreJournal.open(db, create || !existed); }
      catch (error) { await db.close().catch(() => {}); throw error; }
    },
    currentInformationScope: async () => scope,
    async restoreRealFlights(input) {
      assert.equal(input.backup.length > 0, true); events.push('real');
      if (realActive) return 'already-activated';
      realActive = true;
      if (failAfterReal && !failed) { failed = true; throw new Error('synthetic interruption after real activation'); }
      return 'restored';
    },
    async stagePilot(input) {
      assert.match(input.candidateName, /^pilot-restore-/);
      assert.equal(input.selectedBookId, 'book-one'); assert.equal(input.displayName, 'Synthetic pilot');
      events.push('pilot-candidate'); pilotCandidate = true;
    },
    async restoreInformation(input) {
      assert.equal(input.scope.owner, ownerId); assert.ok(input.backup.length > 0); events.push('information');
      if (infoActive) return 'already-activated';
      infoActive = true; return 'restored';
    },
    async activatePilot() { assert.equal(pilotCandidate, true); events.push('pilot-active'); pilotActive = true; },
    async preflightDutyTargets() {},
    async restoreDutyTargets() { events.push('duty-targets'); },
    async restoreAi(input) { assert.equal(input.archive.ownerId, ownerId); events.push('ai'); },
  };
  Object.defineProperty(ports, 'testState', { get: () => ({ events, realActive, pilotCandidate, pilotActive, infoActive }) });
  return ports;
}

test('aggregate restore blocks all readers after a partial activation and resumes the same populated archive', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'moflight-user-backup-'));
  try {
    const text = await archive(), ports = makePorts(directory, text, true);
    const interrupted = await restoreUserBackup(ownerId, storeId, async () => {}, ports);
    assert.deepEqual(interrupted, { state: 'recovery-required', operationId: uuid(1), phase: 'prepared' });
    const journal = await ports.openJournal(false);
    assert.ok(journal); const pending = await journal.pending();
    assert.equal(pending?.archiveSha256, await hash(text)); assert.equal(pending?.selectedBookId, 'book-one');
    await journal.close();
    await assert.rejects(assertUserBackupReadAllowed(() => ports.openJournal(false)), /incomplete/);

    const resumed = await restoreUserBackup(ownerId, storeId, async () => {}, ports, uuid(1));
    assert.deepEqual(resumed, { state: 'restored', operationId: uuid(1) });
    const repeated = await restoreUserBackup(ownerId, storeId, async () => {}, ports, uuid(1));
    assert.deepEqual(repeated, { state: 'already-restored', operationId: uuid(1) });
    const state = (ports as UserBackupServicePorts & { testState: { events: string[]; realActive: boolean; pilotCandidate: boolean; pilotActive: boolean; infoActive: boolean } }).testState;
    assert.equal(state.realActive, true); assert.equal(state.pilotCandidate, true); assert.equal(state.pilotActive, true); assert.equal(state.infoActive, true);
    assert.deepEqual(state.events, ['pilot-candidate', 'real', 'pilot-candidate', 'real', 'information', 'ai', 'pilot-active']);
    await assertUserBackupReadAllowed(() => ports.openJournal(false));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('deeply malformed pilot records fail before the aggregate journal or real-flight activation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'moflight-user-backup-pilot-invalid-'));
  try {
    const original = await archive();
    const outer = JSON.parse(original) as { format: string; version: number; payload: string; checksum: string };
    const payload = JSON.parse(outer.payload) as { pilot: { backup: string }; [key: string]: unknown };
    const pilotEnvelope = JSON.parse(payload.pilot.backup) as { format: string; payload: string; checksum: string };
    const pilotPayload = JSON.parse(pilotEnvelope.payload) as { sources: unknown[]; [key: string]: unknown };
    pilotPayload.sources.push({ seq: 1, id: 'malformed-source', checksum: '0'.repeat(64), payload: '{}' });
    const encodedPilot = canonical(pilotPayload);
    payload.pilot.backup = canonical({ format: pilotEnvelope.format, payload: encodedPilot, checksum: await hash(encodedPilot) });
    const encodedPayload = canonical(payload);
    const malformed = canonical({ format: outer.format, version: outer.version, payload: encodedPayload, checksum: await hash(encodedPayload) });
    const ports = makePorts(directory, malformed);
    const stage = ports.stagePilot;
    ports.stagePilot = async input => {
      const candidate = new PilotBooks(nodeDriver(':memory:'), 'synthetic-pilot', hash);
      try { await candidate.initialize(); await candidate.restore(input.backup); }
      finally { await candidate.db.close(); }
      await stage(input);
    };
    await assert.rejects(restoreUserBackup(ownerId, storeId, async () => {}, ports), /Invalid identity/);
    assert.equal(existsSync(join(directory, USER_BACKUP_RESTORE_JOURNAL_FILE_NAME)), false);
    const state = (ports as UserBackupServicePorts & { testState: { events: string[]; realActive: boolean } }).testState;
    assert.deepEqual(state.events, []);
    assert.equal(state.realActive, false);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('foreign-owner archive is rejected before the aggregate journal or any store activation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'moflight-user-backup-foreign-'));
  try {
    const text = await archive(), ports = makePorts(directory, text);
    await assert.rejects(restoreUserBackup('99999999-9999-4999-8999-999999999999', storeId, async () => {}, ports), /Foreign user backup owner or store/);
    assert.equal(existsSync(join(directory, USER_BACKUP_RESTORE_JOURNAL_FILE_NAME)), false);
    const state = (ports as UserBackupServicePorts & { testState: { events: string[] } }).testState;
    assert.deepEqual(state.events, []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

for (const phase of ['real-flight', 'information', 'pilot'] as const) {
  test(`a restarted aggregate restore resumes after durable ${phase} progress without regressing its journal`, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'moflight-user-backup-progress-'));
    try {
      const text = await archive(), ports = makePorts(directory, text);
      const open = ports.openJournal;
      let interrupted = false;
      ports.openJournal = async create => {
        const journal = await open(create);
        if (!journal) return null;
        const advance = journal.advance.bind(journal);
        journal.advance = async (...args) => {
          const result = await advance(...args);
          if (args[1] === phase && !interrupted) {
            interrupted = true;
            throw new Error('Synthetic lost acknowledgement after durable restore phase');
          }
          return result;
        };
        return journal;
      };
      assert.deepEqual(await restoreUserBackup(ownerId, storeId, async () => {}, ports),
        { state: 'recovery-required', operationId: uuid(1), phase });
      await assert.rejects(assertUserBackupReadAllowed(() => ports.openJournal(false)), /incomplete/);

      if (phase !== 'real-flight') {
        const guarded = await open(false);
        assert.ok(guarded);
        try { await assert.rejects(guarded.advance(uuid(1), 'real-flight', at), /cannot move backwards/); }
        finally { await guarded.close(); }
      }

      // Recreate ports too: no in-memory completion flags survive this restart.
      const restarted = makePorts(directory, text);
      assert.deepEqual(await restoreUserBackup(ownerId, storeId, async () => {}, restarted, uuid(1)),
        { state: 'restored', operationId: uuid(1) });
      await assertUserBackupReadAllowed(() => restarted.openJournal(false));
      assert.deepEqual(await restoreUserBackup(ownerId, storeId, async () => {}, restarted, uuid(1)),
        { state: 'already-restored', operationId: uuid(1) });
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
}

test('v2 aggregate chat restore survives lost acknowledgement, gates all readers and restores active work as interrupted', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'moflight-chat-aggregate-'));
  try {
    const text = await archive(chatArchive()), payload = await validateUserBackup(text, { ownerId, storeId, informationScope: scope }, hash);
    assert.equal(payload.version, 2);
    const path = join(directory, 'chats.sqlite');
    const original = await ChatStore.open(nodeDriver(path), ownerId, async () => {});
    await original.saveDraft('original', 'Original', 'Preserved until valid restore', null, at); await original.close();
    let acknowledgementLost = false;
    const make = () => {
      const ports = makePorts(directory, text);
      ports.restoreAi = async input => {
        const store = await ChatStore.open(nodeDriver(path), ownerId, () => assertUserBackupReadAllowed(() => ports.openJournal(false), input.permit));
        try {
          await store.restore(input.archive);
          assert.equal(encodeChatArchive(await store.archive()), encodeChatArchive(input.archive));
        } finally { await store.close(); }
        if (!acknowledgementLost) { acknowledgementLost = true; throw new Error('Lost chat activation acknowledgement'); }
      };
      return ports;
    };
    const ports = make(), first = await restoreUserBackup(ownerId, storeId, async () => {}, ports);
    assert.equal(first.state, 'recovery-required');
    await assert.rejects(assertUserBackupReadAllowed(() => ports.openJournal(false)), /incomplete/);
    await assert.rejects(ChatStore.open(nodeDriver(path), ownerId, () => assertUserBackupReadAllowed(() => ports.openJournal(false))), /incomplete/);
    const restarted = make();
    assert.equal((await restoreUserBackup(ownerId, storeId, async () => {}, restarted, uuid(1))).state, 'restored');
    await assertUserBackupReadAllowed(() => restarted.openJournal(false));
    const restored = await ChatStore.open(nodeDriver(path), ownerId, async () => {});
    try {
      const result = await restored.archive();
      assert.equal(result.conversations.length, 1); assert.equal(result.conversations[0]?.id, 'chat-one');
      assert.equal(result.conversations[0]?.draft, 'Durable offline draft');
      assert.equal(result.conversations[0]?.messages[0]?.status, 'interrupted');
      assert.equal(result.identity?.accountRef, '12345');
      assert.equal(JSON.stringify(result).includes('runCapability'), false);
      assert.equal(JSON.stringify(result).includes('budget'), false);
    } finally { await restored.close(); }
    assert.equal((await restoreUserBackup(ownerId, storeId, async () => {}, restarted, uuid(1))).state, 'already-restored');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('v1 backups remain readable and explicitly restore zero chats with no new historical receipt', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'moflight-chat-v1-'));
  try {
    const text = await archive(), payload = await validateUserBackup(text, { ownerId, storeId, informationScope: scope }, hash);
    assert.equal(payload.version, 1);
    const ports = makePorts(directory, text); let restored: ChatArchive | null = null;
    ports.restoreAi = async input => { restored = input.archive; };
    assert.equal((await restoreUserBackup(ownerId, storeId, async () => {}, ports)).state, 'restored');
    assert.deepEqual(restored, emptyUserChatArchive(ownerId));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('invalid/foreign/over-cap v2 chat sections preserve current bytes before any aggregate staging or activation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'moflight-chat-invalid-'));
  try {
    const valid = await archive(chatArchive());
    const path = join(directory, 'chats.sqlite'), existing = await ChatStore.open(nodeDriver(path), ownerId, async () => {});
    await existing.saveDraft('original', 'Original', 'Keep these bytes', null, at);
    const before = encodeChatArchive(await existing.archive());
    for (const mutate of [
      (data: any) => { data.ownerId = uuid(999); },
      (data: any) => { data.identity.accountRef = '98765'; data.conversations = []; },
      (data: any) => { data.runCapability = 'not-backed-up'; },
      (data: any) => { data.conversations = Array.from({ length: 51 }, (_, i) => ({ ...data.conversations[0], id: `chat-${i}`, messages: [] })); },
    ]) {
      const envelope = JSON.parse(valid), body = JSON.parse(envelope.payload), chat = JSON.parse(body.ai.archive);
      mutate(chat); body.ai.archive = canonical(chat); envelope.payload = canonical(body); envelope.checksum = await hash(envelope.payload);
      const ports = makePorts(directory, canonical(envelope));
      await assert.rejects(restoreUserBackup(ownerId, storeId, async () => {}, ports));
      assert.equal(encodeChatArchive(await existing.archive()), before);
      assert.equal(existsSync(join(directory, USER_BACKUP_RESTORE_JOURNAL_FILE_NAME)), false);
      assert.deepEqual((ports as UserBackupServicePorts & { testState: { events: string[] } }).testState.events, []);
    }
    await existing.close();
    const noFlightsReceipt = emptyUserChatArchive(ownerId); noFlightsReceipt.identity = chatArchive().identity;
    assert.equal(decodeChatArchive(encodeChatArchive(noFlightsReceipt), ownerId).identity?.accountRef, '12345');
    const noFlightsBackup = await archive(noFlightsReceipt, false);
    const validated = await validateUserBackup(noFlightsBackup, { ownerId, storeId, informationScope: scope }, hash);
    assert.equal(validated.version, 2);
    if (validated.version !== 2) throw new Error('Expected v2');
    assert.equal(decodeChatArchive(validated.ai.archive, ownerId).identity?.accountRef, '12345');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

async function archiveV3() {
  const old = await validateUserBackup(await archive(chatArchive()), { ownerId, storeId, informationScope:scope },hash);
  if (old.version !== 2) throw Error('Expected v2 fixture');
  return createUserBackup({ createdAt:old.createdAt,ownerId,storeId,pilot:old.pilot,realFlights:old.realFlights,information:old.information,ai:old.ai,
    dutyTargets:{scope:{ownerId,storeId,accountRef:'12345'},targets:[{year:2025,hours:0},{year:2026,hours:37.5}]} },hash);
}
test('v3 target restore resumes after lost acknowledgement, retains gate and does not repeat initial preflight',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'moflight-user-backup-v3-'));
  try {
    const text=await archiveV3(),ports=makePorts(directory,text);let preflights=0,attempts=0;const restored=new Map<number,number>();
    ports.preflightDutyTargets=async()=>{preflights++;};
    ports.restoreDutyTargets=async(input)=>{ for(const row of input.archive.targets)restored.set(row.year,row.hours);if(++attempts===1)throw Error('lost target acknowledgement'); };
    assert.equal((await restoreUserBackup(ownerId,storeId,async()=>{},ports)).state,'recovery-required');
    await assert.rejects(assertUserBackupReadAllowed(()=>ports.openJournal(false)),/incomplete/);
    assert.equal((await restoreUserBackup(ownerId,storeId,async()=>{},ports,uuid(1))).state,'restored');
    assert.equal(preflights,1);assert.equal(attempts,2);assert.deepEqual([...restored],[[2025,0],[2026,37.5]]);
    await assertUserBackupReadAllowed(()=>ports.openJournal(false));
  } finally { await rm(directory,{recursive:true,force:true}); }
});
test('v3 corrupt target destination preflight refuses before journal or selected-store activation',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'moflight-user-backup-v3-preflight-'));
  try {
    const ports=makePorts(directory,await archiveV3());ports.preflightDutyTargets=async()=>{throw Error('corrupt destination');};
    await assert.rejects(restoreUserBackup(ownerId,storeId,async()=>{},ports),/corrupt destination/);
    assert.equal(await ports.openJournal(false),null);
    const state=(ports as UserBackupServicePorts & {testState:{realActive:boolean;events:string[]}}).testState;
    assert.equal(state.realActive,false);assert.ok(!state.events.includes('duty-targets'));
  } finally { await rm(directory,{recursive:true,force:true}); }
});
test('v1/v2 restore never reads or writes provisional targets or invents defaults',async()=>{
  for(const text of [await archive(),await archive(chatArchive())]){
    const directory=await mkdtemp(join(tmpdir(),'moflight-user-backup-legacy-targets-'));
    try {
      const ports=makePorts(directory,text);ports.preflightDutyTargets=ports.restoreDutyTargets=async()=>{throw Error('Legacy archive touched target files');};
      assert.equal((await restoreUserBackup(ownerId,storeId,async()=>{},ports)).state,'restored');
    }finally{await rm(directory,{recursive:true,force:true});}
  }
});
test('v3 scope/year/value/coverage tampering fails complete archive validation before staging',async()=>{
  const text=await archiveV3();
  const directory=await mkdtemp(join(tmpdir(),'moflight-user-backup-v3-invalid-'));
  try {
    for(const mutate of [(p:any)=>p.dutyTargets.scope.accountRef='99999',(p:any)=>p.dutyTargets.targets.push({year:2026,hours:1}),
      (p:any)=>p.dutyTargets.targets[0].year=1900,(p:any)=>p.dutyTargets.targets[0].hours=1.234,(p:any)=>p.includes.pop()]){
      const envelope=JSON.parse(text),payload=JSON.parse(envelope.payload);mutate(payload);envelope.payload=canonical(payload);envelope.checksum=await hash(envelope.payload);
      const ports=makePorts(directory,canonical(envelope));
      await assert.rejects(restoreUserBackup(ownerId,storeId,async()=>{},ports));
      assert.equal(await ports.openJournal(false),null);
      assert.deepEqual((ports as UserBackupServicePorts & {testState:{events:string[]}}).testState.events,[]);
    }
  } finally { await rm(directory,{recursive:true,force:true}); }
});

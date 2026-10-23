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
import { createUserBackup, selectedPilotBookForBackup } from '../../apps/platform-lab/src/user-backup.ts';
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

async function archive() {
  const permit: RealFlightPermit = { ownerId, storeId, leaseId: '44444444-4444-4444-8444-444444444444', writable: true };
  const real = await RealFlightLibrary.create(nodeDriver(':memory:'), manifest, hash, () => permit);
  let realBackup = '';
  try {
    const binding = realSource('binding-capture');
    await real.bindAccount({ kind: 'bind', commandId: uuid(100), baseGeneration: 0, source: binding, at });
    const input = realSource('flight-capture');
    const plan = await real.prepareImport(input);
    await real.saveUnassigned({ kind: 'import-unassigned', commandId: uuid(101), baseGeneration: plan.baseGeneration,
      bindingId: plan.bindingId, source: input, planToken: plan.planToken, at });
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
    realFlights: { backup: realBackup }, information: { scope, backup: infoBackup } }, hash);
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
    assert.deepEqual(state.events, ['pilot-candidate', 'real', 'pilot-candidate', 'real', 'information', 'pilot-active']);
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

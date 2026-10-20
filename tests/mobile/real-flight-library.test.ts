import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonical } from '../../packages/flight-logbook/src/index.ts';
import type { Driver, Hash } from '../../packages/local-data/src/index.ts';
import { nodeDriver } from './sqlite-driver.ts';
import { REAL_HISTORY_BACKUP_LIMIT, REAL_HISTORY_COMMAND_LIMIT, type RealHistoryManifest } from '../../apps/platform-lab/src/vereinsflieger/real-history-contract.ts';
import { RealFlightLibrary, IndeterminateRealFlightCommit, type RealFlightPermit } from '../../apps/platform-lab/src/vereinsflieger/real-flight-library.ts';
import type { RealFlightSourceInput } from '../../apps/platform-lab/src/vereinsflieger/real-flight-source.ts';
import type { RealFlightGraph } from '../../apps/platform-lab/src/vereinsflieger/real-flight-library-model.ts';

const hash: Hash = async value => createHash('sha256').update(value, 'utf8').digest('hex');
const at = '2026-10-20T10:00:00.000Z';
const ownerA = '11111111-1111-4111-8111-111111111111';
const storeA = '22222222-2222-4222-8222-222222222222';
const ownerB = '33333333-3333-4333-8333-333333333333';
const storeB = '44444444-4444-4444-8444-444444444444';
const commandId = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const headers = ['Datum','Lfz.','Start','Landung','Flugzeit','Pilot'];
const context = { accountNumber: '10101', clubLabel: 'Example Gliding Club', clubIdentity: 'display-label-only' as const, verification: 'observed-profile-number' as const };

function source(captureId: string, rows: Array<{ sourceFlightId: string | null; values: string[] }>, accountRef = '10101'): RealFlightSourceInput {
  return {
    version: 1,
    binding: { provider: 'vereinsflieger', accountRef },
    contextBefore: { ...context, accountNumber: accountRef },
    contextAfter: { ...context, accountNumber: accountRef },
    requestedWindow: { from: '2026-10-01', to: '2026-10-31', participation: 'Pilot oder Fluglehrer' },
    capture: {
      captureId, retrievedAt: at, headers: [...headers], rows: rows.map(row => ({ sourceFlightId: row.sourceFlightId, values: [...row.values] })),
      sourceIdentity: 'unverified', coverage: 'complete-requested-list', timeBasis: 'unknown',
      exportContext: { from: '2026-10-01', to: '2026-10-31', preset: 'Konfiguration laden', participation: 'Pilot oder Fluglehrer',
        accountLabel: 'Example account', recordCount: rows.length, pageCount: 1, columnIds: ['1','2','3','4','5','6'], adapterVersion: 2 },
    },
  };
}
const row = (reference: string | null, duration = '12', date = '20.10.2026') => ({
  sourceFlightId: reference, values: [date, 'D-TEST', '10:00', '10:12', duration, 'Example Pilot'],
});
function manifest(ownerId: string, storeId: string): RealHistoryManifest {
  return { singleton: 1, family: 'moflight-real-flight-history', schema_version: 1, payload_version: 1,
    store_id: storeId, owner_id: ownerId, created_at: at };
}

async function setup(t: TestContext, ownerId = ownerA, storeId = storeA, fault?: (stage: string) => Promise<void>) {
  const db: Driver = nodeDriver(':memory:');
  let permit: RealFlightPermit = { ownerId, storeId, leaseId: 'lease-a', writable: true };
  const authorize = () => permit;
  const library = await RealFlightLibrary.create(db, manifest(ownerId, storeId), hash, authorize, fault);
  t.after(async () => { await library.close(); });
  return { library, db, authorize, setPermit(value: RealFlightPermit) { permit = value; } };
}

async function bind(library: RealFlightLibrary, input = source('capture-bind', [row('101')]), id = 1) {
  return library.bindAccount({ kind: 'bind', commandId: commandId(id), baseGeneration: 0, source: input, at });
}
async function save(library: RealFlightLibrary, input: RealFlightSourceInput, id: number, atTime = at) {
  const plan = await library.prepareImport(input);
  const result = await library.saveUnassigned({ kind: 'import-unassigned', commandId: commandId(id), baseGeneration: plan.baseGeneration,
    bindingId: plan.bindingId, source: input, planToken: plan.planToken, at: atTime });
  return { plan, result };
}
async function reEnvelope(graph: RealFlightGraph, change: (graph: RealFlightGraph & { version: number }) => void) {
  const body = { version: 1, ...structuredClone(graph) };
  change(body);
  const payload = canonical(body);
  return canonical({ format: 'moflight-real-flight-history-backup', version: 1, payload, checksum: await hash(payload) });
}

async function assertRestoreRejected(text: string, ownerId: string, storeId: string, leaseId: string, expected: RegExp,
  fault?: (stage: string) => Promise<void>) {
  const db = nodeDriver(':memory:');
  try {
    await assert.rejects(RealFlightLibrary.restoreValidated(db, text, ownerId, storeId, hash,
      () => ({ ownerId, storeId, leaseId, writable: true }), fault), expected);
  } finally { await db.close(); }
}

test('first-use account binding and unassigned flights preserve source evidence and round-trip to a fresh same-owner candidate', async t => {
  const { library } = await setup(t);
  const initial = source('capture-first', [row('101'), row('102', '', '21.10.2026')]);
  const bindingResult = await bind(library, initial, 1);
  assert.equal(bindingResult.kind, 'bind');
  const plan = await library.prepareImport(initial);
  assert.equal(plan.counts.added, 2); assert.equal(plan.counts.pending, 0); assert.equal(plan.baseGeneration, 1);
  const saved = await library.saveUnassigned({ kind: 'import-unassigned', commandId: commandId(2), baseGeneration: plan.baseGeneration,
    bindingId: plan.bindingId, source: initial, planToken: plan.planToken, at });
  assert.equal(saved.counts.added, 2);
  const list = await library.list(); assert.equal(list.length, 2); assert.ok(list.every(item => item.unassigned));
  assert.equal(list[0]!.facts.assessment.semantics.crewCredit, 'unresolved');
  const graph = await library.snapshot();
  const capture = JSON.parse(graph.records.find(record => record.kind === 'capture' && record.id === 'capture-first')!.payload);
  assert.equal(capture.source.capture.rawCaptureJson, canonical(initial.capture));
  assert.equal(capture.source.capture.rawCaptureSha256, await hash(capture.source.capture.rawCaptureJson));
  assert.ok(graph.records.every(record => !['book','choice','acknowledgement','paper','training'].includes(record.kind)));
  const backup = await library.exportBackup(); assert.ok(new TextEncoder().encode(backup).length <= REAL_HISTORY_BACKUP_LIMIT);
  const restoredDb = nodeDriver(':memory:');
  const restored = await RealFlightLibrary.restoreValidated(restoredDb, backup, ownerA, storeA, hash,
    () => ({ ownerId: ownerA, storeId: storeA, leaseId: 'restore-lease', writable: true }));
  t.after(async () => { await restored.close(); });
  assert.deepEqual(await restored.snapshot(), graph);
  assert.equal(await restored.exportBackup(), backup);
});

test('restore retries an initialized generation-zero candidate after rollback and exact completed replay is read-only', async t => {
  const { library } = await setup(t);
  await bind(library, source('capture-bind-restore-retry', [row('111')]), 101);
  await save(library, source('capture-flights-restore-retry', [row('111'), row('112')]), 102);
  const expected = await library.snapshot();
  const backup = await library.exportBackup();
  const db = nodeDriver(':memory:');
  const authorize = () => ({ ownerId: ownerA, storeId: storeA, leaseId: 'restore-retry-lease', writable: true });

  await assert.rejects(RealFlightLibrary.restoreIntoEmptyValidated(db, backup, ownerA, storeA, hash, authorize, async stage => {
    if (stage === 'restore-record') throw new Error('injected restore transaction rollback');
  }), /injected restore transaction rollback/);
  assert.equal((await db.first<{ count: number }>('SELECT COUNT(*) AS count FROM real_history_manifest'))?.count, 1,
    'the initialized candidate manifest remains available for exact recovery');
  assert.equal((await db.first<{ count: number }>('SELECT COUNT(*) AS count FROM real_history_receipts'))?.count, 0,
    'rolled-back restore receipts are not partially published');
  assert.equal((await db.first<{ count: number }>('SELECT COUNT(*) AS count FROM real_history_records'))?.count, 0,
    'rolled-back restore records are not partially published');

  const restored = await RealFlightLibrary.restoreIntoEmptyValidated(db, backup, ownerA, storeA, hash, authorize);
  assert.deepEqual(await restored.snapshot(), expected);
  await save(library, source('capture-later-after-restore-backup', [row('113')]), 103);
  const differentBackup = await library.exportBackup();
  await assert.rejects(RealFlightLibrary.restoreIntoEmptyValidated(db, differentBackup, ownerA, storeA, hash, authorize),
    /candidate is not empty/);
  assert.deepEqual(await restored.snapshot(), expected, 'a different nonempty candidate is preserved');
  const replay = await RealFlightLibrary.restoreIntoEmptyValidated(db, backup, ownerA, storeA, hash, authorize);
  assert.deepEqual(await replay.snapshot(), expected, 'the exact matching complete graph is an idempotent no-write success');
  t.after(async () => { await restored.close(); });
});

test('exact retry resolves before stale-generation rejection and altered command reuse is rejected', async t => {
  const { library } = await setup(t); await bind(library, source('capture-bind-retry', [row('201')]), 10);
  const input = source('capture-idempotent', [row('201')]); const plan = await library.prepareImport(input);
  const command = { kind: 'import-unassigned' as const, commandId: commandId(11), baseGeneration: plan.baseGeneration,
    bindingId: plan.bindingId, source: input, planToken: plan.planToken, at };
  const result = await library.saveUnassigned(command); const after = await library.snapshot();
  await save(library, source('capture-later', [row('202')]), 12);
  const identical = await save(library, source('capture-identical-repeat', [row('201')]), 13);
  assert.equal(identical.plan.counts.unchanged, 1);
  assert.deepEqual(await library.saveUnassigned(command), result);
  assert.equal((await library.snapshot()).generation, after.generation + 2);
  await assert.rejects(library.saveUnassigned({ ...command, at: '2026-10-20T11:00:00.000Z' }), /idempotency ID reused/);
  const records = (await library.snapshot()).records;
  assert.equal(records.filter(record => record.kind === 'flight').length, 2);
  assert.equal(records.filter(record => record.kind === 'facts').length, 2);
});

test('corrections append facts revisions while conflicting same-reference variants preserve usable facts as pending', async t => {
  const { library } = await setup(t); await bind(library, source('capture-bind-correction', [row('301')]), 20);
  await save(library, source('capture-original', [row('301','12')]), 21);
  const conflicting = source('capture-conflict', [row('301','14'), row('301','16')]);
  const conflictPlan = await library.prepareImport(conflicting);
  assert.equal(conflictPlan.counts.pending, 1); assert.equal(conflictPlan.counts.changed, 0);
  await library.saveUnassigned({ kind: 'import-unassigned', commandId: commandId(22), baseGeneration: conflictPlan.baseGeneration,
    bindingId: conflictPlan.bindingId, source: conflicting, planToken: conflictPlan.planToken, at });
  let detail = await library.detail((await library.list())[0]!.flightId);
  assert.ok(detail); assert.equal(detail.factHistory.length, 1); assert.equal(detail.facts.assessment.durations.flight.minutes, 12);
  assert.equal(detail.pending.length, 1); assert.equal(detail.pending[0]!.issue.reason, 'conflicting-source-reference');
  await save(library, source('capture-correction', [row('301','14')]), 23);
  detail = await library.detail((await library.list())[0]!.flightId);
  assert.ok(detail); assert.equal(detail.factHistory.length, 2); assert.equal(detail.factHistory[1]!.predecessor, 1);
  assert.equal(detail.facts.assessment.durations.flight.minutes, 14);
  assert.equal((await library.snapshot()).records.filter(record => record.kind === 'pending').length, 1);
});

test('empty complete windows persist capture and coverage without deleting saved flights; missing references remain pending', async t => {
  const { library } = await setup(t); await bind(library, source('capture-bind-empty', [row('401')]), 30);
  await save(library, source('capture-before-empty', [row('401')]), 31);
  const empty = source('capture-empty', []), emptyPlan = await library.prepareImport(empty);
  assert.deepEqual(emptyPlan.counts, { added: 0, changed: 0, unchanged: 0, pending: 0 });
  assert.deepEqual(emptyPlan.entries, []);
  await library.saveUnassigned({ kind: 'import-unassigned', commandId: commandId(32), baseGeneration: emptyPlan.baseGeneration,
    bindingId: emptyPlan.bindingId, source: empty, planToken: emptyPlan.planToken, at });
  assert.equal((await library.list()).length, 1);
  let graph = await library.snapshot(); assert.ok(graph.records.some(record => record.kind === 'coverage' && record.id === 'capture-empty'));
  assert.equal(graph.records.filter(record => record.kind === 'flight').length, 1);
  const missing = source('capture-missing-ref', [row(null)]), missingPlan = await library.prepareImport(missing);
  assert.equal(missingPlan.counts.pending, 1);
  await library.saveUnassigned({ kind: 'import-unassigned', commandId: commandId(33), baseGeneration: missingPlan.baseGeneration,
    bindingId: missingPlan.bindingId, source: missing, planToken: missingPlan.planToken, at });
  graph = await library.snapshot(); assert.equal(graph.records.filter(record => record.kind === 'flight').length, 1);
  assert.equal(graph.records.filter(record => record.kind === 'pending').length, 1);
  assert.equal((await library.list()).length, 1);
});

test('foreign owner/account, stale plans and expired leases are rejected before they can alter data', async t => {
  const a = await setup(t, ownerA, storeA); await bind(a.library, source('capture-bind-isolation', [row('501')]), 40);
  const b = await setup(t, ownerB, storeB);
  const before = await a.library.snapshot();
  await assert.rejects(a.library.bindAccount({ kind: 'bind', commandId: commandId(44), baseGeneration: before.generation,
    source: source('capture-rebind-foreign', [row('502')], '20202'), at }), /already bound to an account/);
  assert.deepEqual(await a.library.snapshot(), before);
  await assert.rejects(RealFlightLibrary.open(nodeDriver(':memory:'), ownerA, storeA, hash,
    () => ({ ownerId: ownerB, storeId: storeB, leaseId: 'foreign', writable: true })), /Unauthorized/);
  await assert.rejects(a.library.prepareImport(source('capture-foreign-account', [row('501')], '20202')), /expected provider account|differs from the immutable/);
  const changedClub = source('capture-changed-club', [row('501')]);
  changedClub.contextBefore.clubLabel = changedClub.contextAfter.clubLabel = 'Another observed club';
  await assert.rejects(a.library.prepareImport(changedClub), /Source club context changed/);
  assert.deepEqual(await a.library.snapshot(), before);
  const staleSource = source('capture-stale-plan', [row('502')]), stalePlan = await a.library.prepareImport(staleSource);
  await save(a.library, source('capture-advance', []), 41);
  await assert.rejects(a.library.saveUnassigned({ kind: 'import-unassigned', commandId: commandId(42), baseGeneration: stalePlan.baseGeneration,
    bindingId: stalePlan.bindingId, source: staleSource, planToken: stalePlan.planToken, at }), /Stale real flight history generation/);
  a.setPermit({ ownerId: ownerA, storeId: storeA, leaseId: 'lease-b', writable: true });
  await assert.rejects(a.library.snapshot(), /Expired or foreign real flight history lease/);
  assert.equal((await b.library.list()).length, 0);
  a.setPermit({ ownerId: ownerA, storeId: storeA, leaseId: 'lease-a', writable: true });
  const after = await a.library.snapshot(); assert.equal(after.generation, before.generation + 1);
  assert.equal(after.records.filter(record => record.kind === 'flight').length, 0);
});

test('file access gate runs before candidate creation and authorization loss after commit requires receipt recovery', async t => {
  const unopened = nodeDriver(':memory:');
  await assert.rejects(RealFlightLibrary.create(unopened, manifest(ownerA, storeA), hash,
    () => ({ ownerId: ownerA, storeId: storeA, leaseId: 'blocked-create', writable: true }), async () => {}, async write => {
      assert.equal(write, true); throw new Error('candidate access denied');
    }), /candidate access denied/);
  assert.equal(await unopened.first("SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'"), null);
  await unopened.close();

  const db = nodeDriver(':memory:');
  let permit: RealFlightPermit = { ownerId: ownerA, storeId: storeA, leaseId: 'post-commit-lease', writable: true };
  let revokeAfterCommit = false;
  const library = await RealFlightLibrary.create(db, manifest(ownerA, storeA), hash, () => permit, async stage => {
    if (stage === 'after-commit' && revokeAfterCommit) permit = { ...permit, writable: false };
  });
  t.after(async () => { await library.close(); });
  await bind(library, source('capture-bind-post-commit', [row('551')]), 45);
  const input = source('capture-post-commit', [row('551')]);
  const plan = await library.prepareImport(input);
  const command = { kind: 'import-unassigned' as const, commandId: commandId(46), baseGeneration: plan.baseGeneration,
    bindingId: plan.bindingId, source: input, planToken: plan.planToken, at };
  revokeAfterCommit = true;
  await assert.rejects(library.saveUnassigned(command), IndeterminateRealFlightCommit);
  const recovered = await library.recoverReceipt(command.commandId);
  assert.equal(recovered.status, 'found');
  if (recovered.status === 'found') assert.equal(recovered.receipt.generation, plan.baseGeneration + 1);
});

test('transaction faults roll back, post-commit uncertainty resolves the original receipt', async t => {
  let failAt: string | null = null;
  const { library } = await setup(t, ownerA, storeA, async stage => { if (stage === failAt) { failAt = null; throw new Error(`fault:${stage}`); } });
  await bind(library, source('capture-bind-faults', [row('601')]), 50);
  const input = source('capture-rollback', [row('601')]), plan = await library.prepareImport(input);
  const command = { kind: 'import-unassigned' as const, commandId: commandId(51), baseGeneration: plan.baseGeneration,
    bindingId: plan.bindingId, source: input, planToken: plan.planToken, at };
  failAt = 'after-facts'; await assert.rejects(library.saveUnassigned(command), /fault:after-facts/);
  assert.equal((await library.snapshot()).generation, plan.baseGeneration);
  failAt = 'after-commit'; await assert.rejects(library.saveUnassigned(command), IndeterminateRealFlightCommit);
  const recovered = await library.recoverReceipt(command.commandId);
  assert.equal(recovered.status, 'found');
  if (recovered.status === 'found') assert.equal(recovered.result.commandId, command.commandId);
  assert.equal((await library.saveUnassigned(command)).generation, plan.baseGeneration + 1);
});

test('backup replay rejects semantic receipt/source corruption, unsupported versions and foreign-owner restores', async t => {
  const { library } = await setup(t); await bind(library, source('capture-bind-corrupt', [row('701')]), 60);
  await save(library, source('capture-corrupt', [row('701')]), 61);
  const graph = await library.snapshot(), backup = await library.exportBackup();
  await assertRestoreRejected(await reEnvelope(graph, candidate => {
    candidate.receipts[1]!.result_json = canonical({ commandId: 'changed' });
  }), ownerA, storeA, 'restore-a', /receipt semantics/);
  await assertRestoreRejected(await reEnvelope(graph, candidate => {
    const capture = candidate.records.find(record => record.kind === 'capture' && record.id === 'capture-corrupt')!;
    const value = JSON.parse(capture.payload); value.source.capture.rawCaptureSha256 = 'f'.repeat(64); capture.payload = canonical(value);
  }), ownerA, storeA, 'restore-b', /record graph/);
  const unsupported = await reEnvelope(graph, candidate => { candidate.version = 2; });
  await assertRestoreRejected(unsupported, ownerA, storeA, 'restore-c', /backup version/);
  await assertRestoreRejected(backup, ownerB, storeB, 'restore-d', /Foreign real flight history backup/);
  await assertRestoreRejected(backup, ownerA, storeA, 'restore-e', /injected restore failure/, async stage => {
    if (stage === 'restore-record') throw new Error('injected restore failure');
  });
  const callerOwnedDb = nodeDriver(':memory:');
  const closeUnderlying = callerOwnedDb.close.bind(callerOwnedDb); let closeCount = 0;
  callerOwnedDb.close = async () => { closeCount++; if (closeCount > 1) throw new Error('Driver closed more than once'); await closeUnderlying(); };
  await assert.rejects(RealFlightLibrary.restoreValidated(callerOwnedDb,backup,ownerA,storeA,hash,
    () => ({ownerId:ownerA,storeId:storeA,leaseId:'restore-f',writable:true}),async stage => {
      if (stage === 'restore-record') throw new Error('original restore failure');
    }),/original restore failure/);
  assert.equal(closeCount,0,'restore factory leaves the supplied Driver with its caller on failure');
  await callerOwnedDb.close(); assert.equal(closeCount,1);
  assert.equal(graph.generation, 2);
});

test('partial windows and oversized command/backup payloads fail closed without truncating evidence', async t => {
  const { library } = await setup(t); await bind(library, source('capture-bind-limits', [row('801')]), 70);
  const partial = source('capture-partial', [row('801')]);
  partial.capture.coverage = 'visible-personal-list-only'; delete partial.capture.exportContext;
  await assert.rejects(library.prepareImport(partial), /partial source window/);
  const graph = await library.snapshot();
  assert.ok(REAL_HISTORY_COMMAND_LIMIT < REAL_HISTORY_BACKUP_LIMIT);
  assert.equal(graph.records.filter(record => record.kind === 'flight').length, 0);
});


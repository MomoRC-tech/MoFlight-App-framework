import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { canonical } from '../../packages/flight-logbook/src/index.ts';
import { decodeFlightBillingObservation, type FlightBillingObservation } from '../../apps/platform-lab/src/vereinsflieger/expense-flight-billing.ts';
import { encodeFinancialCollectionCheckpoint, FINANCIAL_COLLECTION_BATCH_SIZE, validateFinancialCollectionCheckpoint, type FinancialCollectionCheckpoint } from '../../apps/platform-lab/src/vereinsflieger/expense-collection-checkpoint.ts';
import { FinancialEvidenceStore, decodeFinancialEvidence, type FinancialEvidenceSnapshot } from '../../apps/platform-lab/src/vereinsflieger/expense-evidence-store.ts';
import { financialAt, financialHash, financialRead, financialTarget } from './fixtures/expense-capture.ts';
import { evidenceSnapshot } from './fixtures/expense-evidence.ts';
import { nodeDriver } from './sqlite-driver.ts';

const refs = Array.from({ length: 12 }, (_, index) => String(54321 + index));
const recipient = 'Example, Alex';
const selected = { source: 'verified-own-flight-library' as const, sourceFlightRefs: refs };
const noGate = async () => {};

function billedObservation(ref: string, retrievedAt = financialAt): FlightBillingObservation {
  const url = `https://vereinsflieger.de/member/profile/viewflight.php?flid=${ref}`;
  return decodeFlightBillingObservation({ ...financialRead(), sourceFlightId: ref, url }, {
    ...financialTarget, ownRecipientLabel: recipient, observedDetailUrl: url,
  }, financialTarget, financialTarget.scope.context, financialTarget.scope.context, retrievedAt);
}

async function batch(id: string, batchRefs: string[], billedRefs: string[], retrievedAt = financialAt) {
  const snapshot = await evidenceSnapshot(id);
  snapshot.retrievedAt = retrievedAt;
  snapshot.selection.sourceFlightRefs = [...batchRefs];
  snapshot.sources = await Promise.all(billedRefs.map(async sourceFlightRef => ({
    sourceFlightRef, sourceHash: await financialHash(canonical(billedObservation(sourceFlightRef, retrievedAt).source)),
  })));
  snapshot.unknown = batchRefs.filter(ref => !billedRefs.includes(ref)).map((sourceFlightRef, index) => ({
    sourceFlightRef, reason: index % 2 === 0 ? 'unavailable' as const : 'unbilled' as const,
  }));
  for (const ledger of snapshot.ledgers) ledger.observation.capture.retrievedAt = retrievedAt;
  return { snapshot, billed: billedRefs.map(ref => billedObservation(ref, retrievedAt)) };
}

async function checkpoint(id = 'checkpoint-a', batches = 2, secondTime = financialAt): Promise<FinancialCollectionCheckpoint> {
  const firstRefs = refs.slice(0, FINANCIAL_COLLECTION_BATCH_SIZE);
  const result: FinancialCollectionCheckpoint = {
    version: 1, id, target: structuredClone(financialTarget), selection: structuredClone(selected), startedAt: financialAt, batches: [],
  };
  if (batches > 0) result.batches.push(await batch(`${id}-part-0`, firstRefs, [firstRefs[0]!, firstRefs[3]!]));
  if (batches > 1) result.batches.push(await batch(`${id}-part-1`, refs.slice(10), [refs[10]!], secondTime));
  return result;
}

function completedSnapshot(value: FinancialCollectionCheckpoint): FinancialEvidenceSnapshot {
  const last = value.batches.at(-1)!.snapshot;
  return {
    ...structuredClone(last), id: value.id,
    selection: structuredClone(value.selection), sources: value.batches.flatMap(entry => structuredClone(entry.snapshot.sources)),
    unknown: value.batches.flatMap(entry => structuredClone(entry.snapshot.unknown)),
  };
}

async function diskStore(path: string, create = false, gate = noGate) {
  const db = nodeDriver(path), store = new FinancialEvidenceStore(db, financialTarget, financialHash, gate);
  await store.initialize(create); return { db, store };
}

test('checkpoint validator enforces exact ordered prefixes, billed hashes, timestamps, recipient, and inventories', async () => {
  const valid = await checkpoint();
  assert.deepEqual(await validateFinancialCollectionCheckpoint(valid, financialTarget, financialHash), valid);
  const skeleton = await checkpoint('empty-journal', 0);
  assert.deepEqual((await validateFinancialCollectionCheckpoint(skeleton, financialTarget, financialHash)).batches, []);
  const emptySelection: FinancialCollectionCheckpoint = { ...skeleton, id: 'empty-selection', selection: { source: selected.source, sourceFlightRefs: [] },
    batches: [await batch('empty-selection-part-0', [], [])] };
  assert.equal((await validateFinancialCollectionCheckpoint(emptySelection, financialTarget, financialHash)).batches.length, 1);

  const foreignPrefix = structuredClone(valid); foreignPrefix.batches[1]!.snapshot.selection.sourceFlightRefs[0] = '99999';
  const duplicateBilled = structuredClone(valid); duplicateBilled.batches[0]!.billed.push(duplicateBilled.batches[0]!.billed[0]!);
  const badHash = structuredClone(valid); badHash.batches[0]!.snapshot.sources[0]!.sourceHash = '0'.repeat(64);
  const badTime = structuredClone(valid); badTime.batches[0]!.billed[0]!.retrievedAt = '2026-10-31T12:00:00.000Z';
  const foreignRecipient = structuredClone(valid); foreignRecipient.batches[1]!.snapshot.ownRecipientLabel = 'Other Pilot';
  const missing = structuredClone(valid); missing.batches[0]!.snapshot.unknown.pop();
  const wrongTarget = structuredClone(valid); wrongTarget.target.storeId = '44444444-4444-4444-8444-444444444444';
  for (const invalid of [foreignPrefix, duplicateBilled, badHash, badTime, foreignRecipient, missing, wrongTarget]) {
    await assert.rejects(() => validateFinancialCollectionCheckpoint(invalid, financialTarget, financialHash));
  }
});

test('real SQLite journal resumes after close/reopen and pending batches stay out of existing exports', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'moflight-financial-checkpoint-'));
  const path = join(dir, 'evidence.sqlite');
  try {
    const { db, store } = await diskStore(path, true);
    const started = await checkpoint('disk-resume', 0);
    const originalExport = await store.exportBackup();
    await store.checkpointCollection(started);
    assert.equal(await store.exportBackup(), originalExport);
    assert.deepEqual(await decodeFinancialEvidence(await store.exportBackup(), financialTarget, financialHash), []);
    await store.checkpointCollection(await checkpoint('disk-resume', 1));
    await db.close();

    const reopened = await diskStore(path);
    const pending = await reopened.store.pendingCollection(refs);
    assert.equal(pending?.id, 'disk-resume');
    assert.equal(pending?.batches.length, 1);
    assert.deepEqual(pending?.batches[0]?.snapshot.selection.sourceFlightRefs, refs.slice(0, 10));
    const full = await checkpoint('disk-resume', 2);
    await reopened.store.checkpointCollection(full);
    assert.deepEqual(await reopened.store.pendingCollection(refs), full);
    await reopened.store.save(completedSnapshot(full));
    await reopened.store.checkpointCollection(full); // Exact retry after an uncertain final save acknowledgement.
    assert.equal(await reopened.store.pendingCollection(refs), null);
    const archive = await reopened.store.exportBackup();
    const snapshots = await decodeFinancialEvidence(archive, financialTarget, financialHash);
    assert.equal(snapshots.length, 1);
    assert.equal(snapshots[0]!.id, 'disk-resume');
    await reopened.db.close();

    const afterComplete = await diskStore(path);
    assert.equal(await afterComplete.store.pendingCollection(refs), null);
    await afterComplete.db.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('checkpoint append is idempotent, rejects rewriting and serializes concurrent branches', async () => {
  const db = nodeDriver(':memory:');
  try {
    const store = new FinancialEvidenceStore(db, financialTarget, financialHash, noGate);
    await store.initialize(true);
    const first = await checkpoint('append-run', 0), one = await checkpoint('append-run', 1), left = await checkpoint('append-run', 2);
    const right = await checkpoint('append-run', 2, '2026-10-31T12:00:00.000Z');
    await store.checkpointCollection(first);
    await store.checkpointCollection(first);
    await store.checkpointCollection(one);
    await store.checkpointCollection(one);
    await assert.rejects(() => store.checkpointCollection(first));
    const branches = await Promise.allSettled([store.checkpointCollection(left), store.checkpointCollection(right)]);
    assert.equal(branches.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(branches.filter(result => result.status === 'rejected').length, 1);
    assert.equal((await store.pendingCollection(refs))?.batches.length, 2);
  } finally { await db.close(); }
});

test('revoked append rolls back and malformed, foreign, duplicate, or ambiguous jobs never leak as pending', async () => {
  const db = nodeDriver(':memory:'); let calls = 0, revokeAt = 0, revoked = false;
  const gate = async () => { calls++; if (revoked || (revokeAt > 0 && calls === revokeAt)) { revoked = true; revokeAt = 0; throw Error('revoked'); } };
  try {
    const store = new FinancialEvidenceStore(db, financialTarget, financialHash, gate);
    await store.initialize(true); await store.save(await evidenceSnapshot('before-revoked-write')); const original = await store.exportBackup();
    calls = 0; revokeAt = 3;
    await assert.rejects(async () => store.checkpointCollection(await awaitableCheckpoint('revoked-run')), /revoked/);
    revoked = false; calls = 0;
    assert.equal(await store.pendingCollection(refs), null);
    assert.equal(await store.exportBackup(), original);

    const tenRefs = refs.slice(0, 10);
    const wrongSelection: FinancialCollectionCheckpoint = { version: 1, id: 'foreign-selection', target: structuredClone(financialTarget),
      selection: { source: selected.source, sourceFlightRefs: tenRefs }, startedAt: financialAt,
      batches: [await batch('foreign-selection-part-0', tenRefs, [tenRefs[0]!])] };
    await store.checkpointCollection({ ...wrongSelection, batches: [] });
    await store.checkpointCollection(wrongSelection);
    assert.equal(await store.pendingCollection(refs), null);
    assert.equal((await store.pendingCollection(tenRefs))?.id, 'foreign-selection');

    const duplicate = await checkpoint('duplicate-selection', 0);
    duplicate.selection.sourceFlightRefs = tenRefs;
    // A valid competing journal is rejected at insertion, so there is no ambiguous result.
    await assert.rejects(() => store.checkpointCollection(duplicate));
    assert.equal((await store.pendingCollection(tenRefs))?.id, 'foreign-selection');

    const legacy = await checkpoint('legacy-collision', 0);
    await store.prepare(legacy.id, legacy.selection, legacy.startedAt);
    await assert.rejects(() => store.checkpointCollection(legacy));
    assert.equal(await store.pendingCollection(refs), null);
  } finally { await db.close(); }
});

test('pending lookup refuses corrupted rows and ambiguous duplicate matches instead of falling back', async () => {
  const db = nodeDriver(':memory:');
  try {
    const store = new FinancialEvidenceStore(db, financialTarget, financialHash, noGate);
    await store.initialize(true);
    const first = await checkpoint('pending-one', 0), duplicate = await checkpoint('pending-two', 0);
    await store.checkpointCollection(first);
    await db.run('INSERT INTO financial_evidence_jobs(id,payload,status) VALUES (?,?,?)', duplicate.id,
      await encodeFinancialCollectionCheckpoint(duplicate, financialTarget, financialHash), 'collecting');
    await assert.rejects(() => store.pendingCollection(refs), /Ambiguous matching/);
    await db.run("UPDATE financial_evidence_jobs SET status='complete' WHERE id=?", duplicate.id);
    await db.run('UPDATE financial_evidence_jobs SET payload=? WHERE id=?', '{corrupt', first.id);
    await assert.rejects(() => store.pendingCollection(refs), /Corrupt financial checkpoint/);
  } finally { await db.close(); }
});

function awaitableCheckpoint(id: string) { return checkpoint(id, 0); }

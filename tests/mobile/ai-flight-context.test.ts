import assert from 'node:assert/strict';
import test from 'node:test';
import { readAiFlightSnapshot, assertAiFlightSnapshotCurrent, type AiFlightContextPorts } from '../../apps/platform-lab/src/ai/flight-context.ts';
import type { OwnFlightStoredSnapshot } from '../../apps/platform-lab/src/vereinsflieger/real-flight-service.ts';
import type { SavedSourceReview } from '../../apps/platform-lab/src/vereinsflieger/real-flight-review-evidence.ts';
import { AI_SOURCE_OWNER, AI_SOURCE_STORE, aiSourceIdentity, aiSourceFlight } from './fixtures/ai-source.ts';
function fixture() {
  let owner: string | null = AI_SOURCE_OWNER, closed = 0, pending = false, failRead = false;
  let onAssert = () => {};
  let review: SavedSourceReview | undefined;
  const snapshot: OwnFlightStoredSnapshot = { version: 1, ownerId: AI_SOURCE_OWNER, storeId: AI_SOURCE_STORE, generation: 4,
    account: { provider: 'vereinsflieger', accountRef: '10001' }, coverage: [], savedRetrievals: [], pending: [], latestSavedResult: null, recovery: { readOnly: false, warning: null } };
  const flights = [aiSourceFlight('101', '01.08.2026', '1:00')];
  const ports: AiFlightContextPorts = { currentOwner: async () => owner, flights: { open: async () => ({
    ownerId: AI_SOURCE_OWNER, storeId: AI_SOURCE_STORE,
    assertCurrent: async () => { onAssert(); if (owner !== AI_SOURCE_OWNER) throw new Error('Owner changed'); },
    pendingCommand: async () => pending,
    service: { readStored: async () => { if (failRead) throw new Error('unreadable'); return { snapshot, flights }; }, detail: async () => { throw new Error('Not used'); },
      ...(review ? { readReviewEvidence: async () => review! } : {}) },
    readMedical: async () => { throw new Error('Medical must not be read'); },
    readFeatureInformation: async () => { throw new Error('Information must not be read'); },
    readDuties: async () => { throw new Error('Duties must not be read'); },
    close: async () => { closed++; },
  }) } };
  return { snapshot, flights, ports, closed: () => closed, owner: (value: string | null) => { owner = value; }, pending: () => { pending = true; }, fail: () => { failRead = true; }, onAssert: (action: () => void) => { onAssert = action; }, review: (value: SavedSourceReview) => { review = value; } };
}
test('reads only real flight ports and releases lease before returning a copied snapshot', async () => {
  const f = fixture(); const result = await readAiFlightSnapshot(f.ports, aiSourceIdentity, 1);
  assert.equal(result.context.flights.state, 'available'); assert.equal(result.projection?.rows[0]?.knownMinutes, 60);
  assert.equal(f.closed(), 1);
  f.flights[0]!.facts.assessment.observation.row.values.fill('mutated');
  assert.equal(result.projection?.rows[0]?.knownMinutes, 60);
  assert.equal(result.projection?.sourceByReference.values().next().value?.facts.assessment.observation.row.values.includes('mutated'), false);
});
test('historical identity admits general context with no store or binding, without a current provider session', async () => {
  const f = fixture();
  const missing = { ...f.ports, flights: { open: async () => null } };
  const result = await readAiFlightSnapshot(missing, aiSourceIdentity, 1);
  assert.equal(result.context.flights.state, 'flights-unavailable'); assert.equal(result.projection, null);
  f.snapshot.account = null; f.flights.length = 0;
  assert.equal((await readAiFlightSnapshot(f.ports, aiSourceIdentity, 1)).unavailableReason, 'no-flight-binding');
  f.owner(null); await assert.rejects(readAiFlightSnapshot(f.ports, aiSourceIdentity, 1));
});
test('pending operations, read failures and recovery block flight evidence while preserving general context', async () => {
  const f = fixture(); f.pending();
  assert.equal((await readAiFlightSnapshot(f.ports, aiSourceIdentity, 1)).unavailableReason, 'recovery');
  const failed = fixture(); failed.fail();
  assert.equal((await readAiFlightSnapshot(failed.ports, aiSourceIdentity, 1)).unavailableReason, 'read-failed');
  assert.equal(failed.closed(), 1);
  const recovery = fixture(); recovery.snapshot.recovery.readOnly = true;
  assert.equal((await readAiFlightSnapshot(recovery.ports, aiSourceIdentity, 1)).unavailableReason, 'recovery');
});
test('foreign owner/account/store and switching during a read fail closed and release leases', async () => {
  for (const field of ['ownerId', 'storeId'] as const) {
    const f = fixture(); f.snapshot[field] = 'foreign';
    await assert.rejects(readAiFlightSnapshot(f.ports, aiSourceIdentity, 1)); assert.equal(f.closed(), 1);
  }
  const account = fixture(); account.snapshot.account!.accountRef = '20002';
  await assert.rejects(readAiFlightSnapshot(account.ports, aiSourceIdentity, 1)); assert.equal(account.closed(), 1);
  const switched = fixture(); switched.onAssert(() => switched.owner('owner-b'));
  await assert.rejects(readAiFlightSnapshot(switched.ports, aiSourceIdentity, 1)); assert.equal(switched.closed(), 1);
});
test('generation, availability and owner changes revoke a pinned read before late publication', async () => {
  const f = fixture(), original = await readAiFlightSnapshot(f.ports, aiSourceIdentity, 1);
  await assertAiFlightSnapshotCurrent(f.ports, aiSourceIdentity, original);
  f.snapshot.generation++; await assert.rejects(assertAiFlightSnapshotCurrent(f.ports, aiSourceIdentity, original));
  f.snapshot.generation--; f.pending(); await assert.rejects(assertAiFlightSnapshotCurrent(f.ports, aiSourceIdentity, original));
  f.owner('owner-b'); await assert.rejects(assertAiFlightSnapshotCurrent(f.ports, aiSourceIdentity, original));
});

test('current fences freshly validate same-generation flights and retain the pinned projection', async () => {
  for (const variant of ['valid-change', 'altered-facts', 'conflicting-reference', 'invalid-reference'] as const) {
    const f = fixture(), original = await readAiFlightSnapshot(f.ports, aiSourceIdentity, 1);
    if (variant === 'valid-change') f.flights[0] = aiSourceFlight('101', '01.08.2026', '2:00');
    if (variant === 'altered-facts') f.flights[0]!.facts.assessment.observation.row.values[4] = '02:00';
    if (variant === 'conflicting-reference') f.flights.push({ ...f.flights[0]!, flightId: 'another-flight' });
    if (variant === 'invalid-reference') f.flights[0]!.flightId = 'not a valid reference';
    if (variant === 'valid-change') {
      // The existing context contract allows valid same-generation content;
      // checking it must not replace the originally pinned evidence.
      await assertAiFlightSnapshotCurrent(f.ports, aiSourceIdentity, original);
      assert.equal(original.projection!.rows[0]!.knownMinutes, 60);
    } else {
      await assert.rejects(readAiFlightSnapshot(f.ports, aiSourceIdentity, 1));
      await assert.rejects(assertAiFlightSnapshotCurrent(f.ports, aiSourceIdentity, original));
    }
    assert.equal(f.closed(), variant === 'valid-change' ? 2 : 3);
  }
});

test('current fences preserve source-review provenance, bounds and issue-reference validation', async () => {
  for (const variant of ['valid', 'foreign-store', 'generation', 'bad-checksum', 'provenance', 'altered-facts', 'missing-reference', 'row-limit', 'omitted-count'] as const) {
    const f = fixture(), facts = structuredClone(f.flights[0]!.facts);
    const review: SavedSourceReview = { version: 1, ownerId: AI_SOURCE_OWNER, storeId: AI_SOURCE_STORE, generation: 4,
      accountRef: '10001', rows: [{ captureId: facts.assessment.observation.captureId, captureSha256: 'a'.repeat(64), rowIndex: 0, facts }],
      issues: [{ id: 'issue-1', kind: 'missing-source-reference', evidenceIndexes: [0], rowCount: 1 }],
      totalRows: 1, omittedRows: 0, totalIssues: 1 };
    f.review(review);
    const original = await readAiFlightSnapshot(f.ports, aiSourceIdentity, 1);
    if (variant === 'foreign-store') review.storeId = 'foreign';
    if (variant === 'generation') review.generation++;
    if (variant === 'bad-checksum') review.rows[0]!.captureSha256 = 'invalid';
    if (variant === 'provenance') review.rows[0]!.rowIndex = 1;
    if (variant === 'altered-facts') review.rows[0]!.facts.assessment.observation.row.values[4] = '02:00';
    if (variant === 'missing-reference') review.issues[0]!.evidenceIndexes = [1];
    if (variant === 'row-limit') { review.rows = Array.from({ length: 201 }, () => review.rows[0]!); review.totalRows = 201; }
    if (variant === 'omitted-count') review.omittedRows = 1;
    if (variant === 'valid') {
      await assertAiFlightSnapshotCurrent(f.ports, aiSourceIdentity, original);
      assert.equal(original.sourceReview!.rows[0]!.knownMinutes, 60);
    } else {
      await assert.rejects(readAiFlightSnapshot(f.ports, aiSourceIdentity, 1));
      await assert.rejects(assertAiFlightSnapshotCurrent(f.ports, aiSourceIdentity, original));
    }
    assert.equal(f.closed(), variant === 'valid' ? 2 : 3);
  }
});

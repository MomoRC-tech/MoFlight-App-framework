import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planReconciliation, sourceIdentity, type RetrievalBatch, type ImportState } from '../../apps/platform-lab/src/vereinsflieger/reconciliation.ts';

const binding = { datasetId: 'synthetic-local', accountRef: 'example-account', clubRef: 'example-club' };
function batch(): RetrievalBatch {
  return { binding: { ...binding }, identityVerified: true, sourceIdsVerified: true, timeBasisVerified: true,
    scope: 'own-pilot-or-companion', coverage: { from: '2026-01-01', through: '2026-01-31', complete: true },
    records: [{ sourceFlightId: '12345', flight: { date: '2026-01-10', start: '10:00', landing: '10:12', time_basis: 'UTC', minutes: 12,
      registration: 'D-EX01', aircraft_model: 'Example glider', pilot_role: null, crew: [], launch: null, start_place: null,
      landing_place: null, landings: null, remarks: null } }] };
}
const empty = (): ImportState => ({ binding: { ...binding }, flights: [] });
test('repeat retrieval is idempotent; field edits retain source identity and both revisions', () => {
  const first = planReconciliation(empty(), batch());
  const state = { binding, flights: first.added };
  const repeated = batch(); repeated.records.push(structuredClone(repeated.records[0]!));
  const same = planReconciliation(state, repeated);
  assert.equal(same.added.length, 0); assert.equal(same.changed.length, 0); assert.equal(same.unchanged, 1); assert.equal(same.repeatedRows, 1);
  const edit = batch(); edit.records[0]!.flight.registration = 'D-EX02';
  const changed = planReconciliation(state, edit);
  assert.equal(changed.changed[0]!.next.id, first.added[0]!.id);
  assert.equal(changed.changed[0]!.previous.registration, 'D-EX01');
  assert.equal(changed.changed[0]!.next.registration, 'D-EX02');
  assert.equal(state.flights[0]!.registration, 'D-EX01');
});
test('partial, unverified and wrong-account batches cannot alter prior history', () => {
  const state = { binding, flights: planReconciliation(empty(), batch()).added }, before = structuredClone(state);
  for (const key of ['identityVerified', 'sourceIdsVerified', 'timeBasisVerified'] as const) {
    const rejected = batch(); rejected[key] = false; assert.throws(() => planReconciliation(state, rejected));
  }
  const partial = batch(); partial.coverage.complete = false; assert.throws(() => planReconciliation(state, partial));
  for (const key of ['datasetId', 'accountRef', 'clubRef'] as const) {
    const rejected = batch(); rejected.binding[key] = 'different'; assert.throws(() => planReconciliation(state, rejected));
  }
  assert.deepEqual(state, before);
  const foreign = structuredClone(state);
  foreign.flights[0]!.id = sourceIdentity({ ...binding, accountRef: 'foreign' }, '12345');
  assert.throws(() => planReconciliation(foreign, batch()), /not scoped/);
});
test('omissions never delete flights; empty verified windows remain distinct from failed reads', () => {
  const state = { binding, flights: planReconciliation(empty(), batch()).added };
  const noRows = batch(); noRows.records = [];
  const result = planReconciliation(state, noRows);
  assert.equal(result.added.length, 0); assert.equal(result.changed.length, 0); assert.equal(state.flights.length, 1);
  noRows.coverage.complete = false; assert.throws(() => planReconciliation(state, noRows));
});
test('source identity conflicts and invalid coverage fail atomically; distinct IDs are never merged by matching values', () => {
  const conflict = batch(); conflict.records.push(structuredClone(conflict.records[0]!)); conflict.records[1]!.flight.minutes = 13;
  assert.throws(() => planReconciliation(empty(), conflict), /Conflicting/);
  const distinct = batch(); distinct.records.push({ ...structuredClone(distinct.records[0]!), sourceFlightId: '67890' });
  assert.equal(planReconciliation(empty(), distinct).added.length, 2);
  for (const from of ['2026-02-30', '2026-02-01', '2026-1-01']) {
    const rejected = batch(); rejected.coverage.from = from; assert.throws(() => planReconciliation(empty(), rejected));
  }
  const rejected = batch(); rejected.records[0]!.flight.date = '2025-12-31'; assert.throws(() => planReconciliation(empty(), rejected));
});
test('planner outputs do not alias source evidence; scoped identities cannot collide across accounts', () => {
  const input = batch(), result = planReconciliation(empty(), input);
  input.records[0]!.flight.registration = 'changed-after-plan';
  assert.equal(result.added[0]!.registration, 'D-EX01');
  assert.notEqual(sourceIdentity(binding, '12345'), sourceIdentity({ ...binding, accountRef: 'other' }, '12345'));
  assert.notEqual(sourceIdentity({ ...binding, accountRef: 'a:b', clubRef: 'c' }, '12345'), sourceIdentity({ ...binding, accountRef: 'a', clubRef: 'b:c' }, '12345'));
  assert.throws(() => sourceIdentity(binding, 'row-number'));
});

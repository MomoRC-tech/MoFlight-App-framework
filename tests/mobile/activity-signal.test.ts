import test from 'node:test';
import assert from 'node:assert/strict';
import { createActivitySignal, reduceActivitySignal, type ActivityContext, type ActivityMarkers,
  type ActivityObservation, type ActivitySignal } from '../../apps/platform-lab/src/mobile/activity-signal.ts';

const start = Date.parse('2026-10-23T12:00:00.000Z');
const context: ActivityContext = { owner: 'synthetic-owner', store: 'library-a', connection: 'connection-a',
  account: '123', club: 'Synthetic Club', source: 'flights', configuration: 'v1|all-pilot-flights|2026|date-desc|matching-total' };
function observation(markers: ActivityMarkers, offset = 0, scope = context): ActivityObservation {
  return { context: { ...scope }, markers, observedAt: start + offset, expiresAt: start + offset + 60_000 };
}
function observe(state: ActivitySignal, markers: ActivityMarkers, offset = 0) {
  const value = observation(markers, offset);
  return reduceActivitySignal(state, { kind: 'observation', observation: value }, value.observedAt);
}
function baseline(markers: ActivityMarkers = { count: 4, newest: 'record-4@2026-10-22T15:00' }) {
  return observe(createActivitySignal(context), markers).state;
}
function hinted() { return observe(baseline(), { count: 5, newest: 'record-5@2026-10-23T12:00' }, 1000).state; }

test('first read establishes a baseline without announcing new activity', () => {
  const result = observe(createActivitySignal(context), { count: 4 });
  assert.equal(result.comparison, 'unknown');
  assert.equal(result.reason, 'baseline');
  assert.equal(result.state.hintSince, null);
  assert.equal(result.state.baseline?.markers.count, 4);
});

test('a changed comparable count suggests sync for additions and removals', () => {
  for (const count of [0, 3, 5]) {
    const result = observe(baseline({ count: 4 }), { count }, 1000);
    assert.equal(result.comparison, 'changed');
    assert.deepEqual(result.changedMarkers, ['count']);
    assert.equal(result.state.hintSince, start + 1000);
  }
});

test('a different newest record detects activity even when the count is equal', () => {
  const result = observe(baseline(), { count: 4, newest: 'record-7@2026-10-23T13:00' }, 1000);
  assert.equal(result.comparison, 'changed');
  assert.deepEqual(result.changedMarkers, ['newest']);
  assert.equal(result.state.hintSince, start + 1000);
});

test('unchanged markers intentionally ignore edits to older details and retain only markers', () => {
  const old = { ...observation({ count: 4, newest: 'record-4' }), olderDetails: 'old synthetic note' };
  const initial = reduceActivitySignal(createActivitySignal(context), { kind: 'observation', observation: old }, start).state;
  const changedDetails = { ...observation({ count: 4, newest: 'record-4', olderDetails: 'edited synthetic note' } as ActivityMarkers, 1000), olderDetails: 'another edit' };
  const result = reduceActivitySignal(initial, { kind: 'observation', observation: changedDetails }, start + 1000);
  assert.equal(result.comparison, 'unchanged');
  assert.equal(result.state.hintSince, null);
  assert.deepEqual(result.state.baseline?.markers, { count: 4, newest: 'record-4' });
  assert.equal('olderDetails' in result.state.baseline!, false);
});

test('either independently available marker is sufficient', () => {
  assert.equal(observe(baseline({ count: 4 }), { count: 5 }, 1000).comparison, 'changed');
  assert.equal(observe(baseline({ newest: 'record-4' }), { newest: 'record-5' }, 1000).comparison, 'changed');
  assert.equal(observe(baseline({ count: 4, newest: 'record-4' }), { count: 4 }, 1000).comparison, 'unchanged');
});

test('explicit empty evidence differs from unavailable and detects new or removed activity', () => {
  const empty = baseline({ count: 0, newest: null });
  assert.equal(observe(empty, { count: 0, newest: null }, 1000).comparison, 'unchanged');
  const added = observe(empty, { count: 1, newest: 'first-record' }, 1000);
  assert.equal(added.comparison, 'changed');
  assert.deepEqual(added.changedMarkers, ['count', 'newest']);
  assert.equal(observe(baseline(), { count: 0, newest: null }, 1000).comparison, 'changed');
  assert.equal(observe(baseline({ newest: null }), { newest: 'first-record' }, 1000).comparison, 'changed');
});

test('incomplete evidence is not silently treated as an empty source', () => {
  const state = hinted();
  const missing = observe(state, {}, 2000);
  assert.equal(missing.comparison, 'unknown');
  assert.equal(missing.reason, 'invalid-evidence');
  assert.equal(missing.state, state);
  const disjoint = observe(baseline({ count: 4 }), { newest: 'record-4' }, 1000);
  assert.equal(disjoint.comparison, 'unknown');
  assert.equal(disjoint.reason, 'no-common-marker');
  assert.equal(disjoint.state.hintSince, null);
  assert.equal(observe(disjoint.state, { newest: 'record-5' }, 2000).comparison, 'changed');
});

test('invalid counts, ambiguous newest keys and contradictory empty evidence are rejected', () => {
  const invalid: ActivityMarkers[] = [ { count: -1 }, { count: 1.5 }, { count: NaN }, { count: Infinity },
    { count: Number.MAX_SAFE_INTEGER + 1 }, { newest: '' }, { newest: ' ' }, { newest: 'x'.repeat(513) },
    { count: 0, newest: 'record' }, { count: 1, newest: null }, { count: '4' } as unknown as ActivityMarkers ];
  const state = hinted();
  for (const markers of invalid) {
    const result = observe(state, markers, 2000);
    assert.equal(result.reason, 'invalid-evidence');
    assert.equal(result.state, state);
  }
});

test('foreign owner/library/connection/account/club/source or changed configuration cannot affect a hint', () => {
  const state = hinted();
  const scopes: ActivityContext[] = [ ...(['owner', 'store', 'connection', 'account', 'club'] as const)
    .map(key => ({ ...context, [key]: 'foreign' })), { ...context, source: 'own-duties' },
    { ...context, source: 'club-duties' }, { ...context, configuration: 'different-filter' },
    { ...context, configuration: 'different-window' }, { ...context, configuration: 'different-sort-or-schema' } ];
  for (const scope of scopes) {
    const value = observation({ count: 0 }, 2000, scope);
    for (const kind of ['observation', 'sync'] as const) {
      const event = kind === 'sync' ? { kind, observation: value, committedAt: start + 3000 } : { kind, observation: value };
      const result = reduceActivitySignal(state, event, start + 3000);
      assert.equal(result.reason, 'context');
      assert.equal(result.state, state);
    }
  }
  assert.equal(createActivitySignal({ ...context, account: 'another-account' }).hintSince, null);
  assert.equal(state.hintSince, start + 1000, 'Returning to the original context retains its own hint');
});

test('a historical baseline remains useful while incoming evidence must still be fresh', () => {
  const state = baseline({ count: 4 });
  assert.equal(observe(state, { count: 5 }, 86_400_000).comparison, 'changed');
  const stale = observation({ count: 5 }, 1000);
  for (const now of [stale.expiresAt, stale.expiresAt + 1]) {
    const result = reduceActivitySignal(state, { kind: 'observation', observation: stale }, now);
    assert.equal(result.reason, 'expired');
    assert.equal(result.state, state);
  }
});

test('future, malformed and reversed evidence times cannot create or erase a recommendation', () => {
  const state = hinted();
  const value = observation({ count: 5 }, 2000);
  for (const invalid of [ { ...value, observedAt: start + 4000 }, { ...value, observedAt: NaN },
    { ...value, expiresAt: value.observedAt }, { ...value, expiresAt: Infinity }, { ...value, observedAt: -1 } ]) {
    const result = reduceActivitySignal(state, { kind: 'observation', observation: invalid }, start + 3000);
    assert.equal(result.reason, 'invalid-evidence');
    assert.equal(result.state, state);
  }
  assert.equal(reduceActivitySignal(state, { kind: 'observation', observation: value }, NaN).reason, 'invalid-evidence');
});

test('recommendations remain sticky through unchanged, reverted, unavailable and expired reads', () => {
  let state = hinted();
  const detectedAt = state.hintSince;
  for (const [offset, count, newest] of [[2000, 5, 'record-5@2026-10-23T12:00'], [3000, 4, 'record-4@2026-10-22T15:00']] as const) {
    state = observe(state, { count, newest }, offset).state;
    assert.equal(state.hintSince, detectedAt);
  }
  assert.equal(reduceActivitySignal(state, { kind: 'unavailable' }, start + 4000).state, state);
  const expired = observation({ count: 4 }, 4000);
  assert.equal(reduceActivitySignal(state, { kind: 'observation', observation: expired }, expired.expiresAt).state, state);
});

test('only a fresh matching committed source sync acknowledges the hint and establishes its baseline', () => {
  const state = hinted();
  const captured = observation({ count: 5, newest: 'record-5@2026-10-23T12:00' }, 2000);
  const result = reduceActivitySignal(state, { kind: 'sync', observation: captured, committedAt: start + 3000 }, start + 3000);
  assert.equal(result.comparison, 'synced');
  assert.equal(result.state.hintSince, null);
  assert.equal(result.state.settledAt, start + 3000);
  assert.equal(observe(result.state, captured.markers, 4000).comparison, 'unchanged');
  assert.equal(observe(result.state, { count: 6, newest: 'record-6' }, 5000).comparison, 'changed');
});

test('duplicate and late observations or sync captures cannot overwrite newer evidence', () => {
  const state = hinted();
  for (const offset of [0, 1000]) {
    const value = observation({ count: 99 }, offset);
    assert.equal(reduceActivitySignal(state, { kind: 'observation', observation: value }, start + 3000).reason, 'out-of-order');
  }
  const oldCapture = observation({ count: 4 }, 0);
  const result = reduceActivitySignal(state, { kind: 'sync', observation: oldCapture, committedAt: start + 3000 }, start + 3000);
  assert.equal(result.reason, 'out-of-order');
  assert.equal(result.state, state);
});

test('invalid sync timestamps and expired captures cannot acknowledge hints', () => {
  const state = hinted();
  const value = observation({ count: 5 }, 2000);
  for (const committedAt of [start + 1000, start + 4000, NaN]) {
    const result = reduceActivitySignal(state, { kind: 'sync', observation: value, committedAt }, start + 3000);
    assert.equal(result.reason, 'invalid-evidence');
    assert.equal(result.state, state);
  }
  assert.equal(reduceActivitySignal(state, { kind: 'sync', observation: value, committedAt: start + 3000 }, value.expiresAt).reason, 'expired');
  const synced = reduceActivitySignal(state, { kind: 'sync', observation: value, committedAt: start + 3000 }, start + 3000).state;
  const delayed = observation({ count: 99 }, 2500);
  assert.equal(reduceActivitySignal(synced, { kind: 'observation', observation: delayed }, start + 4000).reason, 'out-of-order');
  assert.equal(reduceActivitySignal(synced, { kind: 'sync', observation: value, committedAt: start + 3000 }, start + 4000).reason, 'out-of-order');
});

test('state round trips through JSON without losing a hint or clearing unrelated source states', () => {
  const flights: ActivitySignal = JSON.parse(JSON.stringify(hinted()));
  const dutyContext: ActivityContext = { ...context, source: 'own-duties', configuration: 'own-current-day-2026-10-23' };
  let duties = createActivitySignal(dutyContext);
  duties = reduceActivitySignal(duties, { kind: 'observation', observation: observation({ count: 0 }, 0, dutyContext) }, start).state;
  duties = reduceActivitySignal(duties, { kind: 'observation', observation: observation({ count: 1 }, 1000, dutyContext) }, start + 1000).state;
  const result = reduceActivitySignal(flights, { kind: 'sync', observation: observation({ count: 5 }, 2000), committedAt: start + 3000 }, start + 3000);
  assert.equal(result.state.hintSince, null);
  assert.equal(duties.hintSince, start + 1000);
  assert.equal(flights.hintSince, start + 1000, 'Transitions never mutate the caller state');
});

test('captured state does not retain references to mutable incoming evidence', () => {
  const scope = { ...context }, markers = { count: 4 };
  const value = observation(markers, 0, scope);
  const result = reduceActivitySignal(createActivitySignal(scope), { kind: 'observation', observation: value }, start);
  markers.count = 50;
  (value.context as { account: string }).account = 'foreign';
  assert.equal(result.state.baseline?.markers.count, 4);
  assert.equal(result.state.baseline?.context.account, '123');
  assert.equal(result.state.context.account, '123');
});

test('invalid contexts cannot initialize a comparison state', () => {
  assert.throws(() => createActivitySignal({ ...context, owner: ' ' }), /context/);
  assert.throws(() => createActivitySignal({ ...context, source: 'activities' } as unknown as ActivityContext), /context/);
});

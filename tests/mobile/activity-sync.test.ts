import test from 'node:test';
import assert from 'node:assert/strict';
import { acknowledgeActivitySync, type ActivitySyncEvidence } from '../../apps/platform-lab/src/mobile/activity-sync.ts';
import { createActivityLedger, observeActivityLedger, decodeActivityLedger, type ActivityLedger, type ActivitySourceMarker } from '../../apps/platform-lab/src/mobile/activity-ledger.ts';

const identity = { owner: 'synthetic-owner', store: 'synthetic-store', connection: 'vf', account: 'account-a', club: 'club-a' };
const window = { from: '2026-01-01', to: '2026-12-31' };
const flight: ActivitySourceMarker = { source: 'flights', configuration: 'filtered-view', markers: { count: 1 }, window, participation: 'Pilot oder Fluglehrer' };
const saved: ActivitySyncEvidence = { source: 'flights', capturedAt: 3_000, committedAt: 4_000, window, participation: 'Pilot oder Fluglehrer' };

function pending(marker: ActivitySourceMarker = flight): ActivityLedger {
  let ledger = observeActivityLedger(createActivityLedger(identity), [marker], 1_000, 1_000);
  ledger = observeActivityLedger(ledger, [{ ...marker, markers: { count: 2 } }], 2_000, 2_000);
  return ledger;
}
const hint = (ledger: ActivityLedger, index = 0) => ledger.entries[index]!.signal.hintSince;

test('complete saved flight window settles matching filtered view inclusively and roundtrips the canonical ledger', () => {
  const initial = pending(), before = JSON.stringify(initial);
  const next = acknowledgeActivitySync(initial, saved, 5_000);
  assert.equal(hint(next), null);
  assert.equal(next.entries[0]!.signal.settledAt, 4_000);
  assert.deepEqual(next.entries[0]!.signal.baseline?.markers, { count: 2 });
  assert.equal(next.entries[0]!.signal.baseline?.observedAt, 3_000);
  assert.deepEqual(decodeActivityLedger(JSON.stringify(next), identity), next);
  assert.equal(JSON.stringify(initial), before, 'helper must not mutate prior state');
  const larger = acknowledgeActivitySync(initial, { ...saved, window: { from: '2025-01-01', to: '2027-12-31' } }, 5_000);
  assert.equal(hint(larger), null);
  for (const participation of ['Pilot', 'Fluglehrer']) {
    assert.equal(hint(acknowledgeActivitySync(pending({ ...flight, participation }), saved, 5_000)), null);
  }
});

test('missing or invalid saved bounds, uncovered known bounds, foreign source and role evidence never clear hints', () => {
  const initial = pending();
  for (const evidence of [
    { ...saved, window: undefined }, { ...saved, window: { from: '2026-02-01', to: '2026-12-31' } },
    { ...saved, window: { from: '2026-01-01', to: '2026-11-30' } },
    { ...saved, window: { from: '2026-02-31', to: '2026-12-31' } },
    { ...saved, window: { from: '2026-12-31', to: '2026-01-01' } },
    { ...saved, participation: undefined }, { ...saved, participation: 'Pilot' }, { ...saved, participation: 'Begleiter' },
    { ...saved, source: 'own-duties' as const },
  ]) assert.deepEqual(acknowledgeActivitySync(initial, evidence, 5_000), initial);
});

test('successful compatible flight sync clears unknown-window advice and a later count change can advise again', () => {
  const { window: _window, ...unknownWindow } = flight;
  const initial = pending(unknownWindow);
  const next = acknowledgeActivitySync(initial, saved, 5_000);
  assert.equal(hint(next), null, 'Successful flight sync acknowledges the heuristic even without proven tracked bounds');
  assert.equal(next.entries[0]!.window, undefined, 'Acknowledgment must not invent source coverage');
  assert.equal(next.entries[0]!.signal.settledAt, 4_000);
  assert.deepEqual(next.entries[0]!.signal.baseline?.markers, { count: 2 });
  assert.deepEqual(decodeActivityLedger(JSON.stringify(next), identity), next);
  const unchanged = observeActivityLedger(next, [{ ...unknownWindow, markers: { count: 2 } }], 6_000, 6_000);
  assert.equal(hint(unchanged), null, 'The acknowledged count does not immediately alert again');
  const changed = observeActivityLedger(unchanged, [{ ...unknownWindow, markers: { count: 3 } }], 7_000, 7_000);
  assert.equal(hint(changed), 7_000);
  for (const evidence of [
    { ...saved, window: undefined }, { ...saved, participation: 'Pilot' },
    { ...saved, source: 'own-duties' as const }, { ...saved, capturedAt: 1_999 },
  ]) assert.deepEqual(acknowledgeActivitySync(initial, evidence, 5_000), initial);
});

test('capture, commit and clock ordering preserve late or newer observations', () => {
  const initial = pending();
  for (const evidence of [
    { ...saved, capturedAt: 1_999 }, { ...saved, capturedAt: 5_000 },
    { ...saved, committedAt: 5_001 }, { ...saved, capturedAt: -1 },
    { ...saved, committedAt: Number.NaN }, { ...saved, committedAt: 2_000, capturedAt: 2_000 },
  ]) assert.deepEqual(acknowledgeActivitySync(initial, evidence, 5_000), initial);
  for (const now of [-1, Number.NaN, Number.MAX_SAFE_INTEGER]) assert.deepEqual(acknowledgeActivitySync(initial, saved, now), initial);
  const latest = observeActivityLedger(initial, [{ ...flight, markers: { count: 2 } }], 3_500, 3_500);
  assert.equal(hint(acknowledgeActivitySync(latest, saved, 5_000)), 2_000);
  assert.equal(hint(acknowledgeActivitySync(initial, { ...saved, capturedAt: 2_000 }, 5_000)), null, 'capture at the latest observation is eligible when committed afterwards');
});

test('slow durable saves can settle without violating canonical persisted observation TTL', () => {
  const next = acknowledgeActivitySync(pending(), { ...saved, committedAt: 120_000 }, 125_000);
  assert.equal(hint(next), null);
  assert.equal(next.entries[0]!.signal.baseline?.expiresAt, 63_000);
  assert.deepEqual(decodeActivityLedger(JSON.stringify(next), identity), next);
});

test('only covered pending entries settle and unrelated or unhinted states remain unchanged', () => {
  const markers: ActivitySourceMarker[] = [flight,
    { ...flight, configuration: 'outside-window', window: { from: '2025-01-01', to: '2026-12-31' } },
    { source: 'own-duties', configuration: 'own-view', markers: { count: 1 }, participation: 'Meine Dienste' },
    { ...flight, configuration: 'no-hint' }];
  let ledger = observeActivityLedger(createActivityLedger(identity), markers, 1_000, 1_000);
  ledger = observeActivityLedger(ledger, markers.slice(0, 3).map(m => ({ ...m, markers: { count: 2 } })), 2_000, 2_000);
  const next = acknowledgeActivitySync(ledger, saved, 5_000);
  assert.equal(hint(next), null); assert.equal(hint(next, 1), 2_000); assert.equal(hint(next, 2), 2_000);
  assert.deepEqual(next.entries[3], ledger.entries[3]);
});

test('duty save requires actual matching configuration, exact count markers and same participation', () => {
  for (const source of ['own-duties', 'club-duties'] as const) {
    const marker: ActivitySourceMarker = { source, configuration: 'duty-view', markers: { count: 1 }, participation: 'Meine Dienste' };
    const initial = pending(marker);
    const evidence: ActivitySyncEvidence = { source, configuration: 'duty-view', markers: { count: 2 }, participation: 'Meine Dienste', capturedAt: 3_000, committedAt: 4_000 };
    assert.equal(hint(acknowledgeActivitySync(initial, evidence, 5_000)), null);
    for (const bad of [
      { ...evidence, configuration: undefined }, { ...evidence, configuration: 'other-view' },
      { ...evidence, markers: undefined }, { ...evidence, markers: { count: 1 } },
      { ...evidence, markers: { count: 2, newest: 'unexpected-marker' } },
      { ...evidence, participation: undefined }, { ...evidence, committedAt: Number.NaN },
      { ...evidence, capturedAt: 1_500 },
    ]) assert.deepEqual(acknowledgeActivitySync(initial, bad, 5_000), initial);
  }
});

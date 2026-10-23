import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activityCheckDue,
  activityLedgerChanged,
  createActivityLedger,
  decodeActivityLedger,
  observeActivityLedger,
  recordActivityAttempt,
  type ActivityIdentity,
  type ActivityLedger,
  type ActivitySourceMarker,
} from '../../apps/platform-lab/src/mobile/activity-ledger.ts';

const identity: ActivityIdentity = { owner: 'owner-a', store: 'store-a', connection: 'vf', account: 'acct-a', club: 'club-a' };

function flightMarker(configuration: string, count: number, newest: string | null = `flight-${count}`, extras: Partial<ActivitySourceMarker> = {}): ActivitySourceMarker {
  return { source: 'flights', configuration, markers: { count, newest }, ...extras };
}

function entry(ledger: ActivityLedger, configuration: string) {
  return ledger.entries.find(item => item.signal.context.configuration === configuration)!;
}

test('ledger JSON roundtrip validates scope and copies only allowlisted state', () => {
  const initial = createActivityLedger(identity);
  const saved = observeActivityLedger(initial, [flightMarker('flight-list-v1', 2, 'row-2', {
    window: { from: '2026-01-01', to: '2026-10-22' }, participation: 'member-view',
  })], 1_000, 1_000);
  const encoded = JSON.stringify(saved);
  assert.deepEqual(decodeActivityLedger(encoded, identity), saved);
  assert.deepEqual(decodeActivityLedger(JSON.parse(encoded) as unknown, identity), saved);

  const raw = JSON.parse(encoded) as any;
  const copied = decodeActivityLedger(raw, identity);
  raw.entries[0].signal.baseline.markers.count = 99;
  assert.equal(entry(copied, 'flight-list-v1').signal.baseline?.markers.count, 2, 'decoded state must not alias caller-owned input');
  assert.throws(() => decodeActivityLedger(encoded, { ...identity, account: 'other-account' }), /another identity/);

  const corrupt = JSON.parse(encoded) as any;
  corrupt.entries[0].signal.baseline.context.configuration = 'foreign-config';
  assert.throws(() => decodeActivityLedger(corrupt, identity), /Inconsistent activity baseline context/);
  const extraField = JSON.parse(encoded) as any;
  extraField.entries[0].signal.baseline.markers.privateRows = ['must-not-persist'];
  assert.throws(() => decodeActivityLedger(extraField, identity), /Invalid activity ledger/);
});

test('ledger rejects noncanonical scopes, windows, marker combinations and times', () => {
  const valid = observeActivityLedger(createActivityLedger(identity), [flightMarker('flight-list-v1', 1, 'row-1')], 1_000, 1_000);
  const raw = JSON.parse(JSON.stringify(valid)) as any;
  raw.entries[0].window = { from: '2026-02-30', to: '2026-03-01' };
  assert.throws(() => decodeActivityLedger(raw, identity), /Invalid activity window/);

  const badCount = JSON.parse(JSON.stringify(valid)) as any;
  badCount.entries[0].signal.baseline.markers.count = -1;
  assert.throws(() => decodeActivityLedger(badCount, identity), /Invalid activity markers/);

  const badExpiry = JSON.parse(JSON.stringify(valid)) as any;
  badExpiry.entries[0].signal.baseline.expiresAt++;
  assert.throws(() => decodeActivityLedger(badExpiry, identity), /Invalid activity observation time/);

  assert.throws(() => observeActivityLedger(createActivityLedger(identity), [flightMarker('x', 0, 'not-empty')], 1_000, 1_000), /Inconsistent activity markers/);
  assert.throws(() => observeActivityLedger(createActivityLedger(identity), [flightMarker('x', 1, 'row', { window: { from: '2026-02-02', to: '2026-02-01' } })], 1_000, 1_000), /Invalid activity window/);
});

test('persisted limit counts UTF-8 bytes and rejects oversized serialized state', () => {
  const largeIdentity: ActivityIdentity = {
    owner: 'ä'.repeat(450), store: 'ß'.repeat(450), connection: 'ü'.repeat(450), account: 'ö'.repeat(450), club: 'é'.repeat(450),
  };
  const entries = Array.from({ length: 16 }, (_, index) => {
    const context = { ...largeIdentity, source: 'flights', configuration: `configuration-${index}` };
    return { signal: { context, baseline: { context, markers: { count: 1 }, observedAt: 1_000, expiresAt: 61_000 }, hintSince: null, settledAt: 1_000 } };
  });
  const persisted = JSON.stringify({ version: 1, identity: largeIdentity, lastAttemptAt: null, entries });
  assert.ok(persisted.length < 128_000, 'character count should stay below the byte cap');
  assert.ok(Buffer.byteLength(persisted, 'utf8') > 128_000, 'multibyte identity text should exceed the UTF-8 byte cap');
  assert.throws(() => decodeActivityLedger(persisted, largeIdentity), /128000 byte limit/);
});

test('hourly checks reject invalid/backward time and attempt recording remains monotonic', () => {
  const initial = createActivityLedger(identity);
  assert.equal(activityCheckDue(initial, 0), true);
  assert.equal(activityCheckDue(initial, Number.NaN), false);
  assert.equal(activityCheckDue(initial, -1), false);

  const attempted = recordActivityAttempt(initial, 10_000);
  assert.equal(initial.lastAttemptAt, null, 'recording returns a new ledger');
  assert.equal(attempted.lastAttemptAt, 10_000);
  assert.equal(activityCheckDue(attempted, 9_999), false);
  assert.equal(activityCheckDue(attempted, 10_000), false);
  assert.equal(activityCheckDue(attempted, 3_609_999), false);
  assert.equal(activityCheckDue(attempted, 3_610_000), true);
  assert.equal(recordActivityAttempt(attempted, 2_000).lastAttemptAt, 10_000, 'clock rollback cannot move the hourly gate backward');
  assert.throws(() => recordActivityAttempt(attempted, Number.POSITIVE_INFINITY), /Invalid activity attempt time/);
});

test('source/config states stay isolated and pending hints survive unchanged observations and restart', () => {
  const initial = createActivityLedger(identity);
  const baseline = observeActivityLedger(initial, [flightMarker('flight-all-v1', 2, 'flight-2'), {
    source: 'own-duties', configuration: 'own-duties-v1', markers: { count: 0, newest: null },
  }], 1_000, 1_000);
  assert.equal(baseline.entries.length, 2);
  assert.equal(activityLedgerChanged(baseline), false);

  const changed = observeActivityLedger(baseline, [flightMarker('flight-all-v1', 3, 'flight-3'), flightMarker('flight-current-year-v1', 8, 'other-8')], 2_000, 2_000);
  assert.equal(entry(changed, 'flight-all-v1').signal.hintSince, 2_000);
  assert.equal(entry(changed, 'flight-current-year-v1').signal.hintSince, null, 'a new configuration establishes its own baseline');
  assert.equal(changed.entries.find(item => item.signal.context.source === 'own-duties')?.signal.hintSince, null);
  assert.equal(activityLedgerChanged(changed), true);

  const restarted = decodeActivityLedger(JSON.stringify(changed), identity);
  const same = observeActivityLedger(restarted, [flightMarker('flight-all-v1', 3, 'flight-3')], 3_000, 3_000);
  assert.equal(entry(same, 'flight-all-v1').signal.hintSince, 2_000, 'unchanged evidence does not acknowledge or clear a hint');
  assert.equal(activityLedgerChanged(same), true);
});

test('bounded retention preserves every hinted state and rejects growth when all slots are pending', () => {
  const markers = Array.from({ length: 16 }, (_, index) => flightMarker(`config-${index}`, index + 1, `row-${index}`));
  let ledger = observeActivityLedger(createActivityLedger(identity), markers, 1_000, 1_000);
  ledger = observeActivityLedger(ledger, [flightMarker('config-0', 100, 'changed-row-0')], 2_000, 2_000);
  assert.equal(entry(ledger, 'config-0').signal.hintSince, 2_000);

  ledger = observeActivityLedger(ledger, [flightMarker('config-16', 17, 'row-16')], 3_000, 3_000);
  assert.equal(ledger.entries.length, 16);
  assert.ok(ledger.entries.some(item => item.signal.context.configuration === 'config-0'), 'pending change survives eviction pressure');
  assert.ok(!ledger.entries.some(item => item.signal.context.configuration === 'config-1'), 'oldest unhinted state is evicted');
  assert.ok(ledger.entries.some(item => item.signal.context.configuration === 'config-16'));

  const allHintedSources = ledger.entries.map(item => {
    const currentCount = item.signal.baseline?.markers.count ?? 0;
    return flightMarker(item.signal.context.configuration, currentCount + 100, `new-${item.signal.context.configuration}`);
  });
  const allHinted = observeActivityLedger(ledger, allHintedSources, 4_000, 4_000);
  assert.equal(allHinted.entries.length, 16);
  assert.ok(allHinted.entries.every(item => item.signal.hintSince !== null));
  assert.throws(() => observeActivityLedger(allHinted, [flightMarker('config-17', 18, 'row-17')], 5_000, 5_000), /full of pending hints/);
  assert.equal(allHinted.entries.length, 16, 'failed insertion does not mutate the prior ledger');
});

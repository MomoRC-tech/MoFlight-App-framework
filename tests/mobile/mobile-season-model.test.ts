import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Flight } from '../../packages/flight-logbook/src/index.ts';
import { aircraftSeasonShares, seasonRingSlices } from '../../apps/platform-lab/src/mobile/season-model.ts';

function flight(id: string, registration: string | null, minutes: number | null): Flight {
  return { id, date: '2026-06-01', start: null, landing: null, time_basis: null, minutes,
    registration, aircraft_model: 'Synthetic glider', pilot_role: null, crew: [], launch: null,
    start_place: null, landing_place: null, landings: null, remarks: null };
}

test('season aircraft shares deduplicate identity, retain registrations and distinguish unknown time', () => {
  const shares = aircraftSeasonShares([flight('a', 'd-syn1', 30), flight('b', 'D-SYN1', null),
    flight('c', 'D-SYN2', null), flight('a', 'D-SYN2', 90), flight('d', null, 0)]);
  assert.deepEqual(shares.map(({ color, ...share }) => share), [
    { aircraft: 'D-SYN1', count: 2, knownMinutes: 30, unknownDurationCount: 1 },
    { aircraft: 'D-SYN2', count: 1, knownMinutes: null, unknownDurationCount: 1 },
    { aircraft: 'Kennzeichen unbekannt', count: 1, knownMinutes: 0, unknownDurationCount: 0 },
  ]);
});

test('registration colors remain stable when the aircraft list changes or reorders', () => {
  const first = aircraftSeasonShares([flight('a', 'D-SYN1', 30), flight('b', 'D-SYN2', 15)]);
  const second = aircraftSeasonShares([flight('c', 'D-SYN3', 1), flight('b', 'D-SYN2', 15), flight('a', 'D-SYN1', 30)]);
  for (const share of first) assert.equal(second.find(row => row.aircraft === share.aircraft)?.color, share.color);
});

test('count and known-time rings use independent exact distributions with no invented progress', () => {
  const shares = aircraftSeasonShares([flight('a', 'D-SYN1', 90), flight('b', 'D-SYN2', 30), flight('c', 'D-SYN2', null)]);
  const count = seasonRingSlices(shares, 'count');
  const time = seasonRingSlices(shares, 'knownMinutes');
  assert.deepEqual(count.map(({ start, sweep }) => ({ start, sweep })), [{ start: -90, sweep: 120 }, { start: 30, sweep: 240 }]);
  assert.deepEqual(time.map(({ start, sweep }) => ({ start, sweep })), [{ start: -90, sweep: 270 }, { start: 180, sweep: 90 }]);
  assert.equal(count[0]?.color, time[0]?.color);
});

test('empty, unknown-only and zero-time snapshots have no fabricated duration arcs', () => {
  assert.deepEqual(seasonRingSlices([], 'count'), []);
  const shares = aircraftSeasonShares([flight('a', 'D-SYN1', null), flight('b', 'D-SYN2', 0)]);
  assert.deepEqual(seasonRingSlices(shares, 'knownMinutes'), []);
  assert.equal(shares[0]?.knownMinutes, null);
  assert.equal(shares[1]?.knownMinutes, 0);
  assert.equal(seasonRingSlices(shares, 'count').reduce((sum, slice) => sum + slice.sweep, 0), 360);
});

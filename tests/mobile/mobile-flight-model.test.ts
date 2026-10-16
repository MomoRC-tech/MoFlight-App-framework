import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Flight } from '../../packages/flight-logbook/src/index.ts';
import { flightYears, selectFlights, summarizeFlights, formatDuration } from '../../apps/platform-lab/src/mobile/flight-model.ts';

function flight(id: string, patch: Partial<Flight> = {}): Flight {
  return { id, date: '2026-06-01', start: '10:00', landing: null, time_basis: 'UTC', minutes: 30,
    registration: 'D-SYN1', aircraft_model: 'ASK 21', pilot_role: 'PIC', crew: [], launch: null,
    start_place: 'Synthetic field', landing_place: 'Synthetic destination', landings: 1, remarks: null, ...patch };
}
const all = { year: null, search: '', category: 'all' } as const;

test('year filter excludes unknown dates and derives descending choices from unique records', () => {
  const rows = [flight('a'), flight('b', { date: null }), flight('c', { date: '2024-02-29' }), flight('a', { date: '2023-01-01' })];
  assert.deepEqual(flightYears(rows), [2026, 2024]);
  assert.deepEqual(selectFlights(rows, { ...all, year: 2026 }).map(row => row.id), ['a']);
  assert.equal(selectFlights(rows, all).at(-1)?.id, 'b');
});

test('search, training role and selected year apply together without inferring from aircraft or remarks', () => {
  const rows = [flight('dual', { pilot_role: 'Dual' }), flight('fi', { pilot_role: 'FI', date: '2025-06-01' }),
    flight('pic', { remarks: 'Schulung', pilot_role: 'PIC' }), flight('unknown', { pilot_role: null })];
  assert.deepEqual(selectFlights(rows, { year: 2026, search: '  ask 21 ', category: 'training' }).map(row => row.id), ['dual']);
  assert.deepEqual(selectFlights(rows, { ...all, search: 'DESTINATION' }).map(row => row.id), ['dual', 'pic', 'unknown', 'fi']);
  assert.deepEqual(selectFlights(rows, { ...all, search: 'not recorded' }), []);
});

test('only comparable UTC clocks order same-day flights; ambiguous days preserve input order', () => {
  const morning = flight('morning'), evening = flight('evening', { start: '18:00' });
  assert.deepEqual(selectFlights([morning, evening], all).map(row => row.id), ['evening', 'morning']);
  for (const patch of [{ start: null }, { time_basis: 'local' }]) {
    const ambiguous = flight('ambiguous', patch);
    assert.deepEqual(selectFlights([morning, ambiguous, evening], all).map(row => row.id), ['morning', 'ambiguous', 'evening']);
  }
  assert.deepEqual(selectFlights([evening, flight('older', { date: '2024-01-01' }), morning], all).map(row => row.id), ['evening', 'morning', 'older']);
});

test('deduplicated known totals and averages retain missing duration semantics', () => {
  assert.deepEqual(summarizeFlights([]), { count: 0, knownMinutes: null, unknownDurationCount: 0, averageMinutes: null });
  assert.deepEqual(summarizeFlights([flight('a', { minutes: null })]), { count: 1, knownMinutes: null, unknownDurationCount: 1, averageMinutes: null });
  assert.deepEqual(summarizeFlights([flight('a'), flight('a'), flight('b', { minutes: null })]),
    { count: 2, knownMinutes: 30, unknownDurationCount: 1, averageMinutes: null });
  assert.deepEqual(summarizeFlights([flight('a', { minutes: 0 }), flight('b', { minutes: 61 })]),
    { count: 2, knownMinutes: 61, unknownDurationCount: 0, averageMinutes: 30.5 });
});

test('duration display distinguishes unknown, zero and rounded averages with hour rollover', () => {
  assert.equal(formatDuration(null), '—');
  assert.equal(formatDuration(0), '0:00');
  assert.equal(formatDuration(59.6), '1:00');
  assert.equal(formatDuration(143), '2:23');
  assert.equal(formatDuration(-1), '—');
});

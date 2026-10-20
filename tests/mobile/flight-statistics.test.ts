import { test } from 'node:test';
import assert from 'node:assert/strict';
import { annualFlightComparison, durationDistribution, type Flight } from '../../packages/flight-logbook/src/index.ts';

const flight = (id: string, patch: Partial<Flight> = {}): Flight => ({ id, date: '2026-10-20', start: '23:50', landing: '00:10', time_basis: null,
  minutes: 60, registration: 'D-SYN1', aircraft_model: null, pilot_role: null, crew: [], launch: null,
  start_place: null, landing_place: null, landings: null, remarks: null, ...patch });
const complete = [{ from: '2025-01-01', through: '2026-10-20', complete: true }];

test('duration bands partition all selected integer boundaries, zero and unknown with supporting identities', () => {
  const minutes = [0, 14, 15, 29, 30, 59, 60, 119, 120, 179, 180, 10000];
  const rows = minutes.map(m => flight(String(m), { minutes: m }));
  const result = durationDistribution([...rows, rows[0]!, flight('unknown', { minutes: null })]);
  assert.deepEqual(result.bands.map(b => b.supportingIds), [['0', '14'], ['15', '29'], ['30', '59'], ['119', '60'], ['120', '179'], ['10000', '180']]);
  assert.deepEqual(result.bands.map(b => b.count), [2, 2, 2, 2, 2, 2]);
  assert.deepEqual(result.unknownDurationIds, ['unknown']);
  assert.deepEqual(result.conflictingIds, []);
  // Recorded 60 wins over clocks that could suggest twenty minutes/overnight.
  assert.deepEqual(durationDistribution([flight('recorded')]).bands[3]!.supportingIds, ['recorded']);
});

test('conflicting stable IDs remain pending regardless of order and never contribute twice across books', () => {
  const row = flight('repeated');
  const a = flight('conflict', { minutes: 10 }), b = flight('conflict', { minutes: 200 });
  const result = durationDistribution([row, row, a, b]);
  assert.deepEqual(result.conflictingIds, ['conflict']);
  assert.equal(result.bands.reduce((sum, band) => sum + band.count, 0), 1);
  assert.deepEqual(result, durationDistribution([b, row, a, row]));
});

test('filters use exact person and own role facts; same-name people are distinct and unknowns remain pending', () => {
  const one = flight('one', { pilot_role: 'Dual', crew: [{ person_id: 'one', name: 'Same Name', role: 'instructor' }] });
  const two = flight('two', { crew: [{ person_id: 'two', name: 'Same Name', role: 'instructor' }] });
  const result = durationDistribution([one, two, flight('unknown')], { person_id: 'one', crew_role: 'instructor', pilot_role: 'Dual' });
  assert.deepEqual(result.bands[3]!.supportingIds, ['one']);
  assert.deepEqual(result.unknownFilterIds, ['unknown']);
  assert.throws(() => durationDistribution([one], { crew_role: 'PIC' }));
  assert.deepEqual(durationDistribution([one], { registration: 'D-OTHER' }).bands.map(b => b.count), [0, 0, 0, 0, 0, 0]);
});

test('annual comparison uses inclusive recorded dates, same-calendar cutoff and supporting flights', () => {
  const rows = [flight('current', { minutes: 90 }), flight('jan', { date: '2026-01-01', minutes: 30 }),
    flight('prior', { date: '2025-10-20', minutes: 60 }), flight('later', { date: '2026-10-21' }),
    flight('prior-later', { date: '2025-10-21' }), flight('earlier', { date: '2024-12-31' })];
  const result = annualFlightComparison([...rows, rows[0]!], '2026-10-20', complete);
  assert.equal(result.state, 'supported');
  assert.deepEqual(result.current.supportingIds, ['current', 'jan']);
  assert.deepEqual(result.previous!.supportingIds, ['prior']);
  assert.equal(result.previous!.through, '2025-10-20');
  assert.deepEqual(result.countChange, { percent: 100, suppressedReason: null });
  assert.deepEqual(result.knownMinutesChange, { percent: 100, suppressedReason: null });
});

test('coverage unions adjacent complete windows while preserving actual gaps and partial evidence', () => {
  const rows = [flight('current'), flight('prior', { date: '2025-10-20' })];
  const coverage = [{ from: '2025-01-01', through: '2025-05-31', complete: true },
    { from: '2025-06-01', through: '2025-10-20', complete: true },
    { from: '2026-01-01', through: '2026-10-20', complete: true }];
  assert.equal(annualFlightComparison(rows, '2026-10-20', coverage).countChange.percent, 0);
  for (const replacement of [{ ...coverage[1]!, from: '2025-06-02' }, { ...coverage[1]!, complete: false }]) {
    const result = annualFlightComparison(rows, '2026-10-20', [coverage[0]!, replacement, coverage[2]!]);
    assert.equal(result.previous!.count, 1);
    assert.equal(result.previous!.coverageComplete, false);
    assert.deepEqual(result.countChange, { percent: null, suppressedReason: 'incomplete-coverage' });
    assert.deepEqual(result.coverage, [coverage[0]!, replacement, coverage[2]!]);
  }
  const none = annualFlightComparison([], '2026-10-20', []);
  assert.equal(none.current.count, 0);
  assert.equal(none.countChange.suppressedReason, 'incomplete-coverage');
});

test('unknown dates/conflicts suppress comparisons; unknown durations suppress time only and preserve known totals', () => {
  const rows = [flight('current', { minutes: null }), flight('prior', { date: '2025-10-20', minutes: 30 })];
  const unknown = annualFlightComparison(rows, '2026-10-20', complete);
  assert.equal(unknown.current.knownMinutes, null);
  assert.deepEqual(unknown.current.unknownDurationIds, ['current']);
  assert.equal(unknown.countChange.percent, 0);
  assert.equal(unknown.knownMinutesChange.suppressedReason, 'unknown-durations');
  for (const additions of [[flight('undated', { date: null })], [flight('current', { minutes: 40 })]]) {
    const pending = annualFlightComparison([...rows, ...additions], '2026-10-20', complete);
    assert.equal(pending.countChange.suppressedReason, 'pending-facts');
    assert.equal(pending.knownMinutesChange.suppressedReason, 'pending-facts');
  }
  const partialKnown = annualFlightComparison([...rows, flight('known', { minutes: 12 })], '2026-10-20', complete);
  assert.equal(partialKnown.current.knownMinutes, 12);
});

test('zero baseline never becomes a percentage, zero recorded durations remain known and leap day is explicit', () => {
  const empty = annualFlightComparison([], '2026-10-20', complete);
  assert.equal(empty.current.knownMinutes, 0);
  assert.equal(empty.countChange.suppressedReason, 'zero-baseline');
  assert.equal(empty.knownMinutesChange.suppressedReason, 'zero-baseline');
  const zero = annualFlightComparison([flight('current', { minutes: 0 }), flight('prior', { date: '2025-10-20', minutes: 30 })], '2026-10-20', complete);
  assert.equal(zero.knownMinutesChange.percent, -100);
  const leap = annualFlightComparison([flight('leap', { date: '2024-02-29' })], '2024-02-29', []);
  assert.equal(leap.state, 'unsupported-leap-day');
  assert.equal(leap.previous, null);
  assert.deepEqual(leap.current.supportingIds, ['leap']);
  assert.equal(leap.countChange.suppressedReason, 'unsupported-leap-day');
});

test('invalid dates, coverage and canonical facts reject instead of fabricating results; inputs remain unchanged', () => {
  const rows = [flight('sample')]; const before = structuredClone(rows);
  annualFlightComparison(rows, '2026-10-20', complete); durationDistribution(rows);
  assert.deepEqual(rows, before);
  assert.throws(() => annualFlightComparison(rows, '2026-02-29', complete));
  assert.throws(() => annualFlightComparison(rows, '2026-10-20', [{ from: '2026-10-21', through: '2026-10-20', complete: true }]));
  assert.throws(() => durationDistribution([flight('bad', { minutes: -1 })]));
});

test('unsafe recorded minutes and aggregate overflow reject rather than expose rounded or infinite totals', () => {
  for (const minutes of [1e308, Number.MAX_SAFE_INTEGER + 1, Infinity]) {
    const rows = [flight('unsafe', { minutes })];
    assert.throws(() => durationDistribution(rows));
    assert.throws(() => annualFlightComparison(rows, '2026-10-20', complete));
  }
  const rows = [flight('one', { minutes: Number.MAX_SAFE_INTEGER }), flight('two', { minutes: Number.MAX_SAFE_INTEGER })];
  assert.throws(() => annualFlightComparison(rows, '2026-10-20', complete), /total exceeds safe integer/);
  const exact = annualFlightComparison([flight('safe', { minutes: Number.MAX_SAFE_INTEGER })], '2026-10-20', complete);
  assert.equal(exact.current.knownMinutes, Number.MAX_SAFE_INTEGER);
});

test('runtime empty, null and invalid role filters reject rather than silently removing a restriction', () => {
  const rows = [flight('sample')];
  for (const value of ['', null, 'invalid']) {
    const own = { pilot_role: value } as never;
    const crew = { person_id: 'person', crew_role: value } as never;
    for (const filters of [own, crew]) {
      assert.throws(() => durationDistribution(rows, filters), /Unsupported/);
      assert.throws(() => annualFlightComparison(rows, '2026-10-20', complete, filters), /Unsupported/);
    }
  }
});

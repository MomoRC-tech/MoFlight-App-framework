import test from 'node:test';
import assert from 'node:assert/strict';
import {
  annualStatisticsComparison, dateFlightIds, monthFlightIds, rankStatisticsAircraft,
  selectStatisticsFlights, statisticsDurationGroups, statisticsPeriodBounds,
  statisticsYears, summarizeStatisticsFlights, validStatisticsDate, validStatisticsRange,
} from '../../apps/platform-lab/src/mobile/statistics-overlay-model.ts';
import { ownFlightFixture } from './own-flight-fixture.ts';

const setDate = (flight: any, value: string | null) => {
  flight.facts.assessment.date = value ? { ...flight.facts.assessment.date, state: 'parsed', value } : { ...flight.facts.assessment.date, state: 'invalid', value: null };
};
const setRegistration = (flight: any, value: string | null) => {
  flight.facts.assessment.fields.registration = value === null ? { state: 'blank', raw: '', label: 'Lfz.' } : { state: 'value', raw: value, label: 'Lfz.' };
};
const setModel = (flight: any, value: string | null) => {
  flight.facts.assessment.fields.model = value === null ? { state: 'blank', raw: '', label: 'Lfz.-Muster' } : { state: 'value', raw: value, label: 'Lfz.-Muster' };
};
const setMinutes = (flight: any, state: 'known' | 'unknown' | 'conflict' | 'invalid', minutes: number | null = null) => {
  flight.facts.assessment.durations.flight = state === 'known' ? { state, minutes, evidence: [] } : { state, minutes: null, evidence: [] };
};

test('period selection validates leap dates and keeps undated facts outside year/custom ranges', () => {
  const { flights } = ownFlightFixture();
  setDate(flights[0]!, '2024-02-29'); setDate(flights[1]!, '2024-03-01'); setDate(flights[2]!, null);
  assert.equal(validStatisticsDate('2024-02-29'), true);
  assert.equal(validStatisticsDate('0000-01-01'), false);
  assert.equal(validStatisticsDate('2025-02-29'), false);
  assert.equal(validStatisticsRange('2024-02-29', '2024-03-01'), true);
  assert.equal(validStatisticsRange('2024-03-01', '2024-02-29'), false);
  assert.deepEqual(statisticsPeriodBounds({ kind: 'year', year: 2026 }, '2026-10-22'), { from: '2026-01-01', to: '2026-10-22' });
  assert.deepEqual(selectStatisticsFlights(flights, { kind: 'year', year: 2024 }, '2026-10-22').flights.map(f => f.flightId), ['flight-0', 'flight-1']);
  const all = selectStatisticsFlights(flights, { kind: 'all' }, '2026-10-22');
  assert.equal(all.flights.length, 3);
  assert.equal(all.unknownDateCount, 1);
  assert.deepEqual(selectStatisticsFlights(flights, { kind: 'custom', from: '2024-02-29', to: '2024-02-29' }, '2026-10-22').flights.map(f => f.flightId), ['flight-0']);
});

test('statistics totals deduplicate identical IDs and exclude conflicting duplicate facts', () => {
  const { flights } = ownFlightFixture();
  for (const [index, date] of ['2026-02-28', '2026-03-01', '2026-04-01'].entries()) setDate(flights[index]!, date);
  setMinutes(flights[0]!, 'known', 0); setMinutes(flights[1]!, 'known', 75); setMinutes(flights[2]!, 'conflict');
  const exactDuplicate = structuredClone(flights[0]!);
  const conflictingDuplicate = structuredClone(flights[0]!);
  setMinutes(conflictingDuplicate, 'known', 9);
  const summary = summarizeStatisticsFlights([flights[0]!, flights[1]!, flights[2]!, exactDuplicate, conflictingDuplicate]);
  assert.equal(summary.count, 2);
  assert.equal(summary.knownMinutes, 75);
  assert.equal(summary.knownDurationCount, 1);
  assert.equal(summary.unknownDurationCount, 1);
  assert.deepEqual(summary.conflictingIds, ['flight-0']);
  assert.deepEqual(summary.supportingIds, ['flight-1', 'flight-2']);
});

test('aircraft rankings keep registrations distinct, require consistent model evidence, and preserve exact IDs', () => {
  const { flights } = ownFlightFixture();
  setRegistration(flights[0]!, 'D-SYN1'); setRegistration(flights[1]!, 'D-SYN2'); setRegistration(flights[2]!, 'D-SYN1');
  setModel(flights[0]!, 'ASK 21'); setModel(flights[1]!, 'ASK 21'); setModel(flights[2]!, null);
  setMinutes(flights[0]!, 'known', 60); setMinutes(flights[1]!, 'known', 90); setMinutes(flights[2]!, 'unknown');
  const ranked = rankStatisticsAircraft(flights, 'flights');
  assert.deepEqual(ranked.map(row => row.registration), ['D-SYN1', 'D-SYN2']);
  assert.equal(ranked[0]!.model, null);
  assert.equal(ranked[0]!.modelConsistent, false);
  assert.deepEqual(ranked[0]!.supportingIds, ['flight-0', 'flight-2']);
  assert.equal(ranked[0]!.unknownDurationCount, 1);
  assert.equal(rankStatisticsAircraft(flights, 'minutes')[0]!.registration, 'D-SYN2');
});

test('duration bands keep known zero, every boundary, unknown and conflicting values separate', () => {
  const { flights: fixtureFlights } = ownFlightFixture();
  const minutes = [0, 15, 30, 60, 120, 180];
  const flights = minutes.map((value, index) => {
    const copy = structuredClone(fixtureFlights[index % fixtureFlights.length]!);
    copy.flightId = `duration-${index}`;
    setMinutes(copy, 'known', value);
    return copy;
  });
  const extra = [14, 29, 59, 119, 179].map((value, index) => {
    const copy = structuredClone(fixtureFlights[index % fixtureFlights.length]!);
    copy.flightId = `extra-${index}`; setMinutes(copy, 'known', value); return copy;
  });
  const conflict = structuredClone(fixtureFlights[0]!); conflict.flightId = 'duration-conflict'; setMinutes(conflict, 'conflict');
  const unknown = structuredClone(fixtureFlights[0]!); unknown.flightId = 'unknown-duration'; setMinutes(unknown, 'unknown');
  const result = statisticsDurationGroups([...flights, ...extra, conflict, unknown]);
  assert.deepEqual(result.bands.map(band => band.count), [2, 2, 2, 2, 2, 1]);
  assert.deepEqual(result.bands[0]!.supportingIds, ['duration-0', 'extra-0']);
  assert.deepEqual(result.unknownIds, ['duration-conflict', 'unknown-duration']);
  assert.deepEqual(result.conflictingIds, ['duration-conflict']);
});

test('annual comparison uses saved coverage and actual same-date supporting flights', () => {
  const { flights } = ownFlightFixture();
  setDate(flights[0]!, '2026-10-22'); setDate(flights[1]!, '2025-10-22');
  setMinutes(flights[0]!, 'known', 120); setMinutes(flights[1]!, 'known', 60);
  const saved = [
    { from: '2025-01-01', to: '2025-10-22', retrievedAt: '2026-10-22T10:00:00.000Z', savedAt: '2026-10-22T10:00:00.000Z' },
    { from: '2026-01-01', to: '2026-10-22', retrievedAt: '2026-10-22T10:00:00.000Z', savedAt: '2026-10-22T10:00:00.000Z' },
  ];
  const result = annualStatisticsComparison(flights.slice(0, 2), saved, '2026-10-22', 2026);
  assert.equal(result.countChange.percent, 0);
  assert.equal(result.knownMinutesChange.percent, 100);
  assert.deepEqual(result.current.supportingIds, ['flight-0']);
  assert.deepEqual(result.previous!.supportingIds, ['flight-1']);
  const partial = annualStatisticsComparison(flights.slice(0, 2), saved.slice(1), '2026-10-22', 2026);
  assert.equal(partial.countChange.suppressedReason, 'incomplete-coverage');
  assert.equal(partial.knownMinutesChange.suppressedReason, 'incomplete-coverage');
});

test('annual and monthly contributor sets exclude raw-fact identity conflicts even when projected statistics match', () => {
  const { flights } = ownFlightFixture();
  setDate(flights[0]!, '2026-02-28'); setDate(flights[1]!, '2025-02-28');
  setMinutes(flights[0]!, 'known', 60); setMinutes(flights[1]!, 'known', 30);
  const conflict = structuredClone(flights[0]!);
  conflict.facts.assessment.fields.pic = { state: 'value', raw: 'Unverified source variant', label: 'PIC' };
  const rows = [...flights.slice(0, 2), conflict];
  const saved = [
    { from: '2025-01-01', to: '2025-12-31', retrievedAt: '2026-10-22T10:00:00.000Z', savedAt: '2026-10-22T10:00:00.000Z' },
    { from: '2026-01-01', to: '2026-10-22', retrievedAt: '2026-10-22T10:00:00.000Z', savedAt: '2026-10-22T10:00:00.000Z' },
  ];
  const year = selectStatisticsFlights(rows, { kind: 'year', year: 2026 }, '2026-10-22');
  assert.deepEqual(year.flights.map(flight => flight.flightId), []);
  assert.deepEqual(year.conflictingIds, ['flight-0']);
  assert.deepEqual(monthFlightIds(rows, 2026, 2), []);
  const comparison = annualStatisticsComparison(rows, saved, '2026-10-22', 2026);
  assert.equal(comparison.current.count, 0);
  assert.deepEqual(comparison.current.supportingIds, []);
  assert.equal(comparison.countChange.percent, null);
  assert.equal(comparison.countChange.suppressedReason, 'pending-facts');
  assert.equal(comparison.knownMinutesChange.suppressedReason, 'pending-facts');
  assert.deepEqual(comparison.sourceConflictingIds, ['flight-0']);
  assert.deepEqual(comparison.previous!.supportingIds, ['flight-1']);
});

test('month and custom-date drilldowns return the exact in-range identities', () => {
  const { flights } = ownFlightFixture();
  setDate(flights[0]!, '2024-02-29'); setDate(flights[1]!, '2024-03-01'); setDate(flights[2]!, null);
  assert.deepEqual(monthFlightIds(flights, 2024, 2), ['flight-0']);
  assert.deepEqual(dateFlightIds(flights, '2024-02-29', '2024-03-01'), ['flight-1', 'flight-0']);
  assert.deepEqual(statisticsYears(flights, [], '2026-10-22'), [2026, 2024]);
});

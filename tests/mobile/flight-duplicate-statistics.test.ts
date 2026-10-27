import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptHistoryFacts } from '../../apps/platform-lab/src/vereinsflieger/history-facts.ts';
import type { RealFlightListItem } from '../../apps/platform-lab/src/vereinsflieger/real-flight-library.ts';
import { sourceDuplicateState } from '../../apps/platform-lab/src/mobile/flight-duplicate.ts';
import { summarizeRealFlights } from '../../apps/platform-lab/src/mobile/real-flight-statistics.ts';
import { cockpitRoleMetrics, cockpitSeason } from '../../apps/platform-lab/src/mobile/cockpit-season.ts';
import { allOwnFlights, selectOwnFlights } from '../../apps/platform-lab/src/mobile/own-flight-model.ts';
import {
  annualStatisticsComparison, dateFlightIds, domainStatisticsFlights, groupStatisticsClassification,
  groupStatisticsFlightRoles, monthFlightIds, rankStatisticsAircraft, selectStatisticsFlights,
  statisticsDurationGroups, summarizeStatisticsFlights,
} from '../../apps/platform-lab/src/mobile/statistics-overlay-model.ts';
import { captureFixture } from './capture-review-fixture.ts';

function flight(id: number, marker: string | null, minutes: number, year = 2026): RealFlightListItem {
  const capture = captureFixture();
  const row = capture.rows[0]!;
  row.sourceFlightId = String(2000 + id);
  row.values[0] = `01.08.${year}`;
  row.values[4] = String(minutes);
  row.values[9] = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  row.values[6] = 'Student Example'; row.values[7] = 'Instructor Example'; row.values[8] = 'Instructor Example';
  capture.headers.push('SIC', 'Dual-Time');
  row.values.push('Student Example', row.values[9]!);
  if (marker !== null) { capture.headers.push('Duplikat'); row.values.push(marker); }
  return { flightId: `flight-${id}`, bindingId: 'synthetic-binding', accountRef: 'synthetic-account',
    sourceFlightRef: row.sourceFlightId, firstCaptureId: capture.captureId, factsRevision: 1, unassigned: true,
    facts: adaptHistoryFacts({ ownerId: 'synthetic-owner', scopeId: 'synthetic-binding' }, capture, 0) };
}

test('only explicit observed Ja excludes a source row; missing and unfamiliar markers remain unknown', () => {
  for (const [raw, expected] of [['Ja', 'duplicate'], [' Ja ', 'duplicate'], ['Nein', 'not-marked'],
    ['?', 'unknown'], ['yes', 'unknown'], ['1', 'unknown'], ['ja', 'unknown']] as const) {
    assert.equal(sourceDuplicateState({ state: 'value', label: 'Duplikat', raw }), expected);
  }
  assert.equal(sourceDuplicateState({ state: 'blank', label: 'Duplikat', raw: '' }), 'unknown');
  assert.equal(sourceDuplicateState({ state: 'not-captured' }), 'unknown');
  assert.equal(sourceDuplicateState(undefined), 'unknown');
});

test('season and library totals exclude source duplicates without removing saved inspection rows', () => {
  const ordinary = flight(1, 'Nein', 10), second = flight(2, 'Nein', 20), duplicate = flight(3, 'Ja', 10);
  const rows = [ordinary, second, duplicate, structuredClone(duplicate), structuredClone(ordinary)];
  const before = JSON.stringify(rows);
  const summary = summarizeRealFlights(rows, 2026);
  assert.equal(summary.count, 2); assert.equal(summary.knownMinutes, 30);
  assert.equal(summary.excludedDuplicateCount, 1); assert.equal(summary.unknownDuplicateCount, 0);
  assert.equal(summary.season.count, 2); assert.equal(summary.season.knownMinutes, 30);
  assert.equal(summary.season.aircraft[0]!.count, 2); assert.equal(summary.season.aircraft[0]!.knownMinutes, 30);
  assert.deepEqual(summary.years, [{ year: '2026', flights: 2 }]);
  assert.equal(cockpitSeason(rows, [], 2026, '2026-10-27').time, '0:30');
  assert.equal(cockpitSeason(rows, [], 2026, '2026-10-27').starts, '2');
  assert.ok(selectOwnFlights(rows, allOwnFlights).some(row => row.flightId === duplicate.flightId));
  assert.equal(JSON.stringify(rows), before);
});

test('unknown duplicate evidence retains provisional counts without becoming verified nonduplicate', () => {
  const rows = [flight(1, '', 10), flight(2, null, 20), flight(3, '?', 30)];
  const summary = summarizeRealFlights(rows, 2026);
  assert.equal(summary.count, 3); assert.equal(summary.knownMinutes, 60);
  assert.equal(summary.unknownDuplicateCount, 3); assert.equal(summary.excludedDuplicateCount, 0);
  assert.equal(summarizeStatisticsFlights(rows).count, 3);
  for (const row of rows) assert.equal(row.facts.assessment.semantics.duplicatePolicy, 'unverified');
});

test('all statistics sections and contributors share the source duplicate exclusion for every period', () => {
  const rows = [flight(1, 'Nein', 10), flight(2, 'Nein', 20), flight(3, 'Ja', 10), flight(4, 'Ja', 40, 2025)];
  for (const period of [{ kind: 'all' }, { kind: 'year', year: 2026 },
    { kind: 'custom', from: '2026-08-01', to: '2026-08-01' }] as const) {
    const selected = selectStatisticsFlights(rows, period, '2026-10-27');
    assert.deepEqual(selected.flights.map(row => row.flightId), ['flight-1', 'flight-2']);
  }
  assert.deepEqual(summarizeStatisticsFlights(rows).supportingIds, ['flight-1', 'flight-2']);
  assert.equal(summarizeStatisticsFlights(rows).knownMinutes, 30);
  assert.deepEqual(domainStatisticsFlights(rows).map(row => row.id), ['flight-1', 'flight-2']);
  assert.deepEqual(rankStatisticsAircraft(rows, 'flights')[0]!.supportingIds, ['flight-1', 'flight-2']);
  for (const dimension of ['aircraftCategory', 'launchMethod'] as const) {
    assert.deepEqual(groupStatisticsClassification(rows, dimension).groups.flatMap(row => row.supportingIds).sort(), ['flight-1', 'flight-2']);
  }
  assert.deepEqual(statisticsDurationGroups(rows).bands.flatMap(row => row.supportingIds).sort(), ['flight-1', 'flight-2']);
  const roles = groupStatisticsFlightRoles(rows);
  assert.deepEqual(roles.groups[0]!.supportingIds, ['flight-1', 'flight-2']);
  assert.equal(roles.groups[0]!.knownMinutes, 30);
  assert.equal(cockpitRoleMetrics(rows, 2026, '2026-10-27')[0]!.count, 2);
  assert.deepEqual(monthFlightIds(rows, 2026, 8), ['flight-1', 'flight-2']);
  assert.deepEqual(dateFlightIds(rows, '2026-01-01', '2026-12-31'), ['flight-1', 'flight-2']);
  const annual = annualStatisticsComparison(rows, [], '2026-10-27', 2026);
  assert.equal(annual.current.count, 2); assert.equal(annual.current.knownMinutes, 30);
  assert.equal(annual.previous?.count, 0);
});

test('same-ID conflicting duplicate flags remain a source conflict regardless of input order', () => {
  const ordinary = flight(1, 'Nein', 10), duplicate = structuredClone(ordinary);
  duplicate.facts.assessment.fields.duplicate = { state: 'value', label: 'Duplikat', raw: 'Ja' };
  for (const rows of [[ordinary, duplicate], [duplicate, ordinary]]) {
    const summary = summarizeStatisticsFlights(rows);
    assert.equal(summary.count, 0); assert.deepEqual(summary.conflictingIds, ['flight-1']);
  }
});

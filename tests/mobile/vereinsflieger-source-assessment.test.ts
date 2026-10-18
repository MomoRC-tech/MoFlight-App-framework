import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessSourceFlight } from '../../apps/platform-lab/src/vereinsflieger/source-assessment.ts';
import { decodeProbe, FLIGHT_URL, type ProbeSnapshot } from '../../apps/platform-lab/src/vereinsflieger/probe.ts';
import { planReconciliation, type RetrievalBatch } from '../../apps/platform-lab/src/vereinsflieger/reconciliation.ts';

function snapshot(cells: Record<string, string> = {}): ProbeSnapshot {
  const values = { Datum: '18.10.2026', 'Lfz.': 'D-TEST', Start: '10:00', Landung: '10:15', Flugzeit: '12', ...cells };
  return { captureId: 'synthetic-assessment-1', retrievedAt: '2026-10-18T17:00:00.000Z',
    headers: Object.keys(values), rows: [{ values: Object.values(values), sourceFlightId: '12345' }],
    sourceIdentity: 'unverified', coverage: 'visible-personal-list-only', timeBasis: 'unknown' };
}
const assess = (cells: Record<string, string> = {}) => assessSourceFlight(snapshot(cells), 0);
const codes = (result: ReturnType<typeof assess>) => result.findings.map(value => value.code);

test('existing decoded list composes raw fields, calendar, clocks and reported durations without promotion', () => {
  const input = snapshot({ 'Flugzeit in hh:mm': '00:12', 'Blockzeit in Minuten': '20', 'Blockzeit in hh:mm': '00:20' });
  const decoded = decodeProbe(JSON.stringify({ kind: 'vf-probe-v1', nonce: input.captureId, url: FLIGHT_URL, headers: input.headers, rows: input.rows }), FLIGHT_URL, input.captureId, input.retrievedAt);
  const result = assessSourceFlight(decoded, 0);
  assert.equal(result.date.value, '2026-10-18');
  assert.equal(result.clocks.start.value, '10:00'); assert.equal(result.clocks.landing.value, '10:15');
  assert.equal(result.durations.flight.minutes, 12); assert.equal(result.durations.block.minutes, 20);
  assert.deepEqual(result.observation, { captureId: input.captureId, rowIndex: 0, headers: input.headers, row: input.rows[0] });
  assert.deepEqual(result.semantics, { sourceIdentity: 'unverified', timeBasis: 'unknown', landingDayOffset: null, crewCredit: 'unresolved', aircraftClass: 'unresolved', duplicatePolicy: 'unverified' });
  for (const code of ['unverified-identity', 'unknown-time-basis', 'unknown-landing-day', 'unresolved-crew-credit', 'unresolved-aircraft-class', 'unverified-duplicate-policy']) assert.ok(codes(result).includes(code as typeof result.findings[number]['code']));
});

test('calendar validation handles leap years, padded/legacy German dates and ISO without timezone interpretation', () => {
  for (const [raw, expected] of [['29.02.2024', '2024-02-29'], ['2024-02-29', '2024-02-29'], ['1.2.2026', '2026-02-01'], [' 18.10.2026 ', '2026-10-18']]) {
    const result = assess({ Datum: raw! });
    assert.equal(result.date.state, 'parsed'); assert.equal(result.date.value, expected);
    assert.deepEqual(result.date.source, { state: 'value', label: 'Datum', raw });
    assert.equal(codes(result).includes('invalid-date'), false);
  }
  for (const raw of ['29.02.2026', '31.04.2026', '00.10.2026', '18.13.2026', '2026-02-30', '2026-1-01', '10/18/2026', '2026-10-18T00:00:00Z']) {
    const result = assess({ Datum: raw });
    assert.equal(result.date.state, 'invalid', raw); assert.equal(result.date.value, null);
    assert.ok(result.findings.some(value => value.code === 'invalid-date' && value.fields.includes('date')));
    assert.equal(result.date.source.state === 'value' && result.date.source.raw, raw);
  }
});

test('strict clocks retain midnight/equal/earlier landing clocks without inferring day offset or duration', () => {
  for (const [start, landing] of [['23:55', '00:10'], ['10:00', '10:00'], ['00:00', '23:59']]) {
    const result = assess({ Start: start!, Landung: landing!, 'Off-Block': ' 23:50 ', 'On-Block': '00:15' });
    assert.equal(result.clocks.start.value, start); assert.equal(result.clocks.landing.value, landing);
    assert.equal(result.clocks.offBlock.value, '23:50'); assert.equal(result.clocks.onBlock.value, '00:15');
    assert.equal(result.semantics.timeBasis, 'unknown'); assert.equal(result.semantics.landingDayOffset, null);
    assert.equal(result.durations.flight.minutes, 12);
  }
  for (const raw of ['24:00', '12:60', '9:00', '12:00:00', '12.30', '-01:00', '12:00 UTC']) {
    const result = assess({ Start: raw });
    assert.equal(result.clocks.start.state, 'invalid', raw); assert.equal(result.clocks.start.value, null);
    assert.ok(result.findings.some(value => value.code === 'invalid-clock' && value.fields.includes('start')));
  }
});

test('missing versus blank fields retain different evidence and never acquire zero or calculated durations', () => {
  const input = snapshot(); input.headers = ['Datum', 'Flugzeit']; input.rows[0]!.values = [' \t ', ''];
  const result = assessSourceFlight(input, 0);
  assert.equal(result.date.state, 'blank'); assert.deepEqual(result.date.source, { state: 'blank', label: 'Datum', raw: ' \t ' });
  assert.equal(result.clocks.start.state, 'not-captured'); assert.deepEqual(result.clocks.start.source, { state: 'not-captured' });
  assert.equal(result.durations.flight.state, 'unknown'); assert.equal(result.durations.flight.minutes, null);
  assert.equal(result.durations.block.minutes, null);
  assert.ok(result.findings.some(value => value.code === 'missing-value' && value.fields.includes('date')));
  assert.ok(result.findings.some(value => value.code === 'unknown-duration' && value.fields.includes('flightDuration')));
  const clocksOnly = snapshot(); const index = clocksOnly.headers.indexOf('Flugzeit');
  clocksOnly.headers.splice(index, 1); clocksOnly.rows[0]!.values.splice(index, 1);
  assert.equal(assessSourceFlight(clocksOnly, 0).durations.flight.minutes, null);
  assert.equal(assess({ Flugzeit: '0' }).durations.flight.minutes, 0);
});

test('invalid or conflicting reported durations yield field-linked findings while preserving supported facts', () => {
  const conflict = assess({ 'Flugzeit in hh:mm': '00:13', 'Blockzeit in Minuten': '20' });
  assert.equal(conflict.durations.flight.state, 'conflict'); assert.equal(conflict.durations.flight.minutes, null);
  assert.deepEqual(conflict.findings.find(value => value.code === 'conflicting-duration')?.fields, ['flightDuration', 'flightDurationFormatted']);
  assert.deepEqual(conflict.durations.flight.evidence.map(value => value.minutes), [12, 13]);
  assert.equal(conflict.durations.block.minutes, 20); assert.equal(conflict.date.value, '2026-10-18');
  const invalid = assess({ Flugzeit: 'unclear', 'Flugzeit in hh:mm': '00:12' });
  assert.equal(invalid.durations.flight.minutes, null); assert.ok(codes(invalid).includes('invalid-duration'));
  assert.deepEqual(invalid.fields.flightDuration, { state: 'value', label: 'Flugzeit', raw: 'unclear' });
});

test('same-name people and explicit PIC/companion/role/class/duplicate text remain separate unverified facts', () => {
  const result = assess({ Pilot: 'Synthetic Alex', PIC: 'Synthetic Alex', 'Begleiter/FI': 'Synthetic instructor or guest',
    'Begleiter 2': 'Synthetic passenger', 'Begleiter 3': '', SIC: 'Synthetic SIC', 'PIC-Time': '0', 'Dual-Time': '12', 'FI-Time': '12',
    'Luftfahrzeugart': 'Reisemotorsegler', 'Lfz.-Muster': 'Synthetic model', Duplikat: 'Ja', Motorzeit: '1,5' });
  assert.deepEqual(result.fields.pilot, { state: 'value', label: 'Pilot', raw: 'Synthetic Alex' });
  assert.deepEqual(result.fields.pic, { state: 'value', label: 'PIC', raw: 'Synthetic Alex' });
  assert.equal(result.fields.companion.state === 'value' && result.fields.companion.raw, 'Synthetic instructor or guest');
  assert.equal(result.fields.companion2.state === 'value' && result.fields.companion2.raw, 'Synthetic passenger');
  assert.equal(result.fields.companion3.state, 'blank'); assert.equal(result.fields.sic.state, 'value');
  for (const field of ['picTime', 'dualTime', 'instructorTime', 'aircraftType', 'duplicate', 'engineDuration'] as const) assert.equal(result.fields[field].state, 'value');
  assert.equal(result.semantics.crewCredit, 'unresolved'); assert.equal(result.semantics.aircraftClass, 'unresolved');
  assert.equal(result.semantics.duplicatePolicy, 'unverified'); assert.equal(result.durations.flight.minutes, 12);
  assert.equal(Object.hasOwn(result, 'crew'), false); // No canonical crew with fabricated IDs/credit.
});

test('repeat and reordered observations are deterministic; corrections keep previous assessment and full raw evidence', () => {
  const input = snapshot({ 'Future provider field': ' keep exact future text ' });
  const original = structuredClone(input), first = assessSourceFlight(input, 0);
  assert.deepEqual(assessSourceFlight(input, 0), first);
  const reordered = structuredClone(input); reordered.headers.reverse(); reordered.rows[0]!.values.reverse();
  const reorderedResult = assessSourceFlight(reordered, 0);
  for (const key of ['fields', 'date', 'clocks', 'durations', 'semantics', 'findings'] as const) assert.deepEqual(reorderedResult[key], first[key]);
  assert.deepEqual(reorderedResult.observation.headers, reordered.headers);
  const next = structuredClone(input); next.captureId = 'synthetic-assessment-2';
  next.rows[0]!.values[next.headers.indexOf('Flugzeit')] = '13';
  const changed = assessSourceFlight(next, 0);
  assert.equal(changed.durations.flight.minutes, 13); assert.equal(first.durations.flight.minutes, 12);
  assert.equal(changed.observation.row.sourceFlightId, first.observation.row.sourceFlightId);
  assert.equal(first.observation.row.values.at(-1), ' keep exact future text ');
  first.observation.headers[0] = 'Changed output'; first.observation.row.values[0] = 'Changed output';
  first.fields.pilot.state = 'blank';
  assert.deepEqual(input, original);
  input.headers[0] = 'Changed input'; input.rows[0]!.values[1] = 'Changed input';
  assert.equal(first.date.value, '2026-10-18'); assert.equal(first.observation.row.values[1], 'D-TEST');
});

test('selected row/reference provenance never merges matching rows or namespaces candidate identities', () => {
  const input = snapshot(); input.rows.push({ values: [...input.rows[0]!.values], sourceFlightId: '67890' });
  const first = assessSourceFlight(input, 0), second = assessSourceFlight(input, 1);
  assert.equal(first.observation.row.sourceFlightId, '12345'); assert.equal(second.observation.row.sourceFlightId, '67890');
  assert.equal(second.observation.rowIndex, 1);
  input.rows[1]!.sourceFlightId = null;
  assert.equal(assessSourceFlight(input, 1).observation.row.sourceFlightId, null);
  assert.equal(assessSourceFlight(input, 1).semantics.sourceIdentity, 'unverified');
});

test('empty/invalid row selection and ambiguous or malformed shape fail without altering source', () => {
  const input = snapshot(), before = structuredClone(input);
  for (const index of [-1, 0.5, NaN, Infinity, 1]) assert.throws(() => assessSourceFlight(input, index), /Invalid source observation/);
  const empty = snapshot(); empty.rows = [];
  assert.throws(() => assessSourceFlight(empty, 0), /Invalid source observation/);
  const emptyRow = snapshot(); emptyRow.headers = []; emptyRow.rows[0]!.values = [];
  assert.throws(() => assessSourceFlight(emptyRow, 0), /Invalid source observation/);
  const missingRows = { ...snapshot(), rows: null } as unknown as ProbeSnapshot;
  assert.throws(() => assessSourceFlight(missingRows, 0), /Invalid source observation/);
  const malformedReference = snapshot(); malformedReference.rows[0]!.sourceFlightId = 'not-a-reference';
  assert.throws(() => assessSourceFlight(malformedReference, 0), /Invalid source observation/);
  const duplicate = snapshot(); duplicate.headers.push('Flugzeit'); duplicate.rows[0]!.values.push('13');
  assert.throws(() => assessSourceFlight(duplicate, 0), /Ambiguous/);
  const lost = snapshot(); lost.rows[0]!.values.pop();
  assert.throws(() => assessSourceFlight(lost, 0), /Ambiguous/);
  const oversized = snapshot(); oversized.rows[0]!.values[0] = 'x'.repeat(4097);
  assert.throws(() => assessSourceFlight(oversized, 0), /Invalid source observation/);
  assert.deepEqual(input, before);
});

test('parsed assessments cannot supply canonical verification or bypass existing planner gates', () => {
  const assessment = assess();
  const binding = { datasetId: 'synthetic-local', accountRef: 'example-account', clubRef: 'example-club' };
  const batch: RetrievalBatch = { binding, identityVerified: false, sourceIdsVerified: false, timeBasisVerified: false,
    scope: 'own-pilot-or-companion', coverage: { from: '2026-10-01', through: '2026-10-31', complete: true }, records: [] };
  assert.equal(assessment.semantics.sourceIdentity, 'unverified'); assert.equal(assessment.semantics.timeBasis, 'unknown');
  assert.throws(() => planReconciliation({ binding, flights: [] }, batch), /Source verification incomplete/);
});

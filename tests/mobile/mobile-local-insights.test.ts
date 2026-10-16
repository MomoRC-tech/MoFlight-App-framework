import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Flight } from '../../packages/flight-logbook/src/index.ts';
import { localInsight, localQuestions } from '../../apps/platform-lab/src/mobile/local-insights.ts';

const flight = (id: string, patch: Partial<Flight> = {}): Flight => ({
  id, date: '2026-06-01', start: '12:00', landing: null, time_basis: 'UTC', minutes: 60,
  registration: 'D-SYN1', aircraft_model: null, pilot_role: 'PIC', crew: [], launch: null,
  start_place: null, landing_place: null, landings: null, remarks: null, ...patch,
});

test('yearly known time deduplicates identity and declares missing durations and coverage', () => {
  const known = flight('known', { minutes: 90 });
  const result = localInsight([known, known, flight('missing', { minutes: null }), flight('older', { date: '2025-06-01' })], 0, 2026);
  assert.match(result, /2026: 2 gespeicherte Flüge, 1:30 bekannte Stunden/);
  assert.match(result, /1 Flugzeiten unbekannt/);
  assert.match(result, /Abdeckung des Jahres ist nicht belegt/);
});

test('absent year and wholly unknown durations never borrow totals or render zero known time', () => {
  const rows = [flight('unknown', { minutes: null })];
  assert.match(localInsight(rows, 0, 2025), /2025: 0 gespeicherte Flüge, — bekannte Stunden/);
  assert.match(localInsight(rows, 0, 2026), /1 gespeicherte Flüge, — bekannte Stunden. 1 Flugzeiten unbekannt/);
  assert.equal(localInsight(rows, 1, 2026), 'Keine bekannten Flugzeiten gespeichert.');
});

test('longest known flights exclude unknowns, preserve zero and limit output to three unique records', () => {
  const longest = flight('longest', { registration: 'D-LONG', minutes: 180 });
  const result = localInsight([flight('missing', { minutes: null }), flight('zero', { minutes: 0 }),
    longest, longest, flight('second', { minutes: 90 }), flight('third', { minutes: 30, date: null })], 1, 2026);
  assert.match(result, /^01\. Juni 2026 · D-LONG · 3:00 h/);
  assert.match(result, /Datum unbekannt · D-SYN1 · 0:30 h/);
  assert.match(result, /1 unbekannte Flugzeiten nicht eingeordnet/);
  assert.equal(result.split('\n').length, 4);
  assert.equal(result.includes('0:00 h'), false);
  assert.match(localInsight([flight('zero', { minutes: 0 })], 1, 2026), /0:00 h/);
});

test('aircraft frequency returns every tie and discloses unknown identities without double-counting', () => {
  const a = flight('a');
  const result = localInsight([a, a, flight('b', { registration: 'D-SYN2' }), flight('missing', { registration: null })], 2, 2026);
  assert.match(result, /D-SYN1: 1 Flüge/);
  assert.match(result, /D-SYN2: 1 Flüge/);
  assert.match(result, /1 unbekannte Kennzeichen nicht zugeordnet/);
  assert.equal(localInsight([flight('missing', { registration: null })], 2, 2026), 'Keine bekannten Kennzeichen gespeichert.');
});

test('training answer counts only recorded Dual and FI roles, including unknown dates', () => {
  const dual = flight('dual', { pilot_role: 'Dual' });
  const result = localInsight([dual, dual, flight('fi', { pilot_role: 'FI', date: null }),
    flight('pic', { remarks: 'Schulung' }), flight('unknown', { pilot_role: null })], 3, 2026);
  assert.match(result, /^2 gespeicherte Flüge mit dokumentierter Rolle Dual oder FI/);
});

test('saved-flight count deduplicates records, uses year boundaries, and discloses unknown dates and coverage', () => {
  const start = flight('start', { date: '2026-01-01' });
  const end = flight('end', { date: '2026-12-31' });
  const result = localInsight([flight('before', { date: '2025-12-31' }), start, start, end,
    flight('after', { date: '2027-01-01' }), flight('undated', { date: null })], 4, 2026);
  assert.match(result, /^2026: 2 gespeicherte Flüge im ausgewählten Flugbuch/);
  assert.match(result, /1 Flüge mit unbekanntem Datum sind keinem Jahr zugeordnet/);
  assert.match(result, /Abdeckung des Jahres ist nicht belegt/);
});

test('missing-duration list deduplicates rows, retains and counts unknown dates, and reports zero missing times', () => {
  const undated = flight('undated', { date: null, registration: null, minutes: null });
  const result = localInsight([undated, undated, flight('dated', { date: '2026-02-03', registration: 'D-ABC', minutes: null }),
    flight('known', { minutes: 20 })], 5, 2026);
  assert.match(result, /Datum unbekannt · Flugzeug unbekannt/);
  assert.match(result, /03\. Feb\. 2026 · D-ABC/);
  assert.match(result, /1 Flüge mit unbekanntem Datum sind in dieser Liste enthalten/);
  assert.equal(result.split('\n').length, 3);
  assert.equal(localInsight([flight('known', { minutes: 0 })], 5, 2026), 'Keine fehlenden Flugzeiten in den gespeicherten Flügen.');
});

test('all advertised questions handle empty data and unsupported query IDs have an accurate fallback', () => {
  assert.equal(localQuestions.length, 6);
  for (let index = 0; index < localQuestions.length; index++) {
    assert.equal(localInsight([], index, 2026), 'Im ausgewählten Flugbuch sind noch keine Flüge gespeichert.');
  }
  assert.equal(localInsight([flight('a')], 9, 2026), 'Diese lokale Auswertung ist nicht verfügbar.');
});

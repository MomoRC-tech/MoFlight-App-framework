import { test } from 'node:test';
import assert from 'node:assert/strict';
import { captureReviewPage, openCaptureReview, reviewDuration, reviewParsedField, reviewRawField } from '../../apps/platform-lab/src/vereinsflieger/capture-review.ts';
import { recentCaptureRequest } from '../../apps/platform-lab/src/vereinsflieger/export.ts';
import { captureFixture } from './capture-review-fixture.ts';

test('saved capture review preserves source provenance, crew slots and reported duration across midnight', () => {
  const input = captureFixture(), before = structuredClone(input);
  const result = captureReviewPage(openCaptureReview(input), 0).flights[0]!;
  assert.equal(reviewParsedField(result.date), '2026-10-18');
  assert.equal(reviewParsedField(result.clocks.start), '23:55');
  assert.equal(reviewParsedField(result.clocks.landing), '00:15');
  assert.equal(reviewDuration(result.durations.flight), '12 min (gemeldet)');
  assert.equal(reviewRawField(result.fields.pilot), 'Synthetic A');
  assert.equal(reviewRawField(result.fields.pic), 'Synthetic B');
  assert.equal(reviewRawField(result.fields.companion), 'Synthetic C');
  assert.equal(result.observation.row.sourceFlightId, '1000');
  assert.equal(result.observation.captureId, input.captureId);
  assert.equal(result.semantics.timeBasis, 'unknown'); assert.equal(result.semantics.landingDayOffset, null);
  assert.equal(result.semantics.crewCredit, 'unresolved');
  result.observation.row.values[0] = 'modified view';
  assert.deepEqual(input, before);
});

test('review distinguishes explicit zero, unknown, blank, invalid and conflicting evidence', () => {
  const snapshot = captureFixture();
  const inspect = () => captureReviewPage(openCaptureReview(snapshot), 0).flights[0]!;
  snapshot.rows[0]!.values[4] = '0'; snapshot.rows[0]!.values[9] = '00:00';
  assert.equal(reviewDuration(inspect().durations.flight), '0 min (gemeldet)');
  snapshot.rows[0]!.values[4] = ' '; snapshot.rows[0]!.values[9] = '';
  assert.match(reviewDuration(inspect().durations.flight), /Unbekannt.*leer/);
  snapshot.rows[0]!.values[4] = '12'; snapshot.rows[0]!.values[9] = '00:20';
  assert.match(reviewDuration(inspect().durations.flight), /Widersprüchlich/);
  snapshot.rows[0]!.values[4] = '12min'; snapshot.rows[0]!.values[2] = '25:10';
  assert.match(reviewDuration(inspect().durations.flight), /Ungültig/);
  assert.equal(reviewParsedField(inspect().clocks.start), 'Ungültig: 25:10');
  assert.equal(reviewRawField(inspect().fields.sic), 'Nicht erfasst');
  assert.equal(reviewRawField({ state: 'blank', label: 'PIC', raw: '  ' }), 'Leer im Anbieterbeleg');
  assert.match(reviewDuration(inspect().durations.block), /Unbekannt.*nicht erfasst/);
});

test('five-row paging covers each source row exactly once and handles zero and maximum records', () => {
  for (const count of [0, 1, 5, 6, 12, 20_000]) {
    const input = openCaptureReview(captureFixture(count));
    const pages = captureReviewPage(input, 0).pages;
    const indices = Array.from({ length: pages }, (_, i) => captureReviewPage(input, i).flights.map(f => f.observation.rowIndex)).flat();
    assert.deepEqual(indices, Array.from({ length: count }, (_, i) => i));
    for (const invalid of [-1, .5, NaN, pages]) assert.throws(() => captureReviewPage(input, invalid));
  }
});

test('repeat and corrected captures remain independent; malformed saved evidence is rejected unchanged', () => {
  const input = captureFixture(), first = openCaptureReview(input);
  assert.deepEqual(openCaptureReview(input), first);
  input.captureId = 'synthetic-correction'; input.rows[0]!.values[4] = '14'; input.rows[0]!.values[9] = '00:14';
  assert.equal(captureReviewPage(openCaptureReview(input), 0).flights[0]!.durations.flight.minutes, 14);
  assert.equal(captureReviewPage(first, 0).flights[0]!.durations.flight.minutes, 12);
  for (const bad of [null, {}, { ...input, headers: ['Datum', 'Datum'] }, { ...input, rows: [{ values: [], sourceFlightId: '1000' }] }, { ...input, timeBasis: 'UTC' }]) {
    const before = structuredClone(bad); assert.throws(() => openCaptureReview(bad)); assert.deepEqual(bad, before);
  }
});

test('initial capture covers thirty local calendar days including year, leap and DST boundaries', () => {
  for (const [now, expected] of [
    [new Date(2026, 9, 18, 23, 59), { from: '2026-09-19', to: '2026-10-18' }],
    [new Date(2026, 0, 1), { from: '2025-12-03', to: '2026-01-01' }],
    [new Date(2024, 2, 1), { from: '2024-02-01', to: '2024-03-01' }],
    [new Date(2026, 2, 30), { from: '2026-03-01', to: '2026-03-30' }],
  ] as const) assert.deepEqual(recentCaptureRequest(now), expected);
});

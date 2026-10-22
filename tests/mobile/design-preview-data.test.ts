import test from 'node:test';
import assert from 'node:assert/strict';
import { createDesignPreviewData, DESIGN_PREVIEW_NOW, DESIGN_PREVIEW_SCOPE } from '../../apps/platform-lab/src/mobile/design-preview-data.ts';
import { summarizeRealFlights } from '../../apps/platform-lab/src/mobile/real-flight-statistics.ts';
import { requestedOwnFlight } from '../../apps/platform-lab/src/mobile/own-flight-model.ts';

test('design fixture keeps known, explicit zero and unknown durations distinct across years', () => {
  const { view } = createDesignPreviewData();
  const summary = summarizeRealFlights(view.flights, 2026);
  assert.equal(summary.count, 8);
  assert.equal(summary.knownDurationCount, 6);
  assert.equal(summary.unknownDurationCount, 2);
  assert.equal(summary.knownMinutes, 485);
  assert.equal(summary.season.count, 5);
  assert.equal(summary.season.knownMinutes, 320);
  const zero = view.flights[1]!.facts.assessment.durations.flight;
  assert.equal(zero.state, 'known');
  if (zero.state === 'known') assert.equal(zero.minutes, 0);
  assert.equal(view.flights[2]!.facts.assessment.durations.flight.state, 'unknown');
  assert.equal(new Date(DESIGN_PREVIEW_NOW).toISOString(), '2026-10-22T12:00:00.000Z');
});

test('preview scopes and exact detail identities never borrow a selected account', () => {
  const { view, details } = createDesignPreviewData();
  assert.equal(view.snapshot.ownerId, DESIGN_PREVIEW_SCOPE.ownerId);
  assert.equal(new Set(view.flights.map(f => f.flightId)).size, 8);
  for (const flight of view.flights) {
    assert.match(flight.flightId, /^synthetic-design-/);
    assert.equal(flight.accountRef, DESIGN_PREVIEW_SCOPE.accountRef);
    assert.equal(flight.facts.scope.ownerId, DESIGN_PREVIEW_SCOPE.ownerId);
    assert.equal(requestedOwnFlight(view.flights, { year: null, flightId: flight.flightId }), flight);
    assert.equal(details.find(d => d.flightId === flight.flightId)?.facts, flight.facts);
    assert.equal(flight.facts.assessment.fields.departure.state, 'value');
    assert.equal(flight.facts.assessment.fields.arrival.state, 'value');
  }
  assert.equal(requestedOwnFlight(view.flights, { year: null, flightId: 'foreign-flight' }), null);
  assert.equal(view.snapshot.savedRetrievals.length, 2);
});

test('preview factories are fresh in-memory data and expose no persistence capability', () => {
  const first = createDesignPreviewData(), second = createDesignPreviewData();
  assert.deepEqual(first, second);
  first.view.flights.pop();
  first.view.snapshot.savedRetrievals.length = 0;
  assert.equal(second.view.flights.length, 8);
  assert.equal(second.view.snapshot.savedRetrievals.length, 2);
  assert.deepEqual(Object.keys(first).sort(), ['details', 'view']);
  assert.equal(first.view.pendingCommand, false);
});

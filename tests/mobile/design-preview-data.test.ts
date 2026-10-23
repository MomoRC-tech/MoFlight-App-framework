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
  assert.deepEqual(Object.keys(first).sort(), ['details', 'dutyOverview', 'view']);
  first.dutyOverview.ownItems[0]!.people.push('changed');
  assert.deepEqual(second.dutyOverview.ownItems[0]!.people, ['Demo Pilot A.']);
  assert.equal(first.view.pendingCommand, false);
});


test('club preview contains only fresh bounded synthetic event/document projections', () => {
  const first = createDesignPreviewData(), second = createDesignPreviewData();
  const source = first.view.featureInformation!;
  assert.equal(source.events.items.length, 3); assert.equal(source.documentNotices.items.length, 2);
  assert.equal(source.events.status, 'partial'); assert.equal(source.documentNotices.status, 'partial');
  assert.deepEqual(source.events.filters, ['Quellkategorie: Termine', 'Ab 22.10.2026', 'Ansicht: 3 Monate']);
  assert.equal(source.events.retrievedAt, '2026-10-22T10:00:00.000Z');
  for (const item of [...source.events.items, ...source.documentNotices.items]) assert.match(item.key, /^synthetic-/);
  source.events.items.pop(); source.documentNotices.items[0]!.text = 'changed';
  assert.equal(second.view.featureInformation!.events.items.length, 3);
  assert.equal(second.view.featureInformation!.documentNotices.items[0]!.text, 'Demo Winterprogramm 20.10.2026');
});

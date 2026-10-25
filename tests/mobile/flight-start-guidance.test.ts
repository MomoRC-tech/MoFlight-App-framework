import test from 'node:test';
import assert from 'node:assert/strict';
import { flightStartGuidance } from '../../apps/platform-lab/src/mobile/flight-start-guidance';

test('first and returning accounts get distinct next actions without asserting provider history', () => {
  const base = { phase: 'ready' as const, accountAssociated: false, successfulRetrieval: false, savedFlights: 0 };
  const first = flightStartGuidance(base);
  assert.equal(first?.kind, 'start');
  assert.match(first.message, /Falls nötig.*Originalseite/);
  assert.equal(flightStartGuidance({ ...base, accountAssociated: true })?.kind, 'load');
  assert.match(flightStartGuidance({ ...base, accountAssociated: true })!.message, /sobald du Internet hast/);
  assert.equal(flightStartGuidance({ ...base, phase: 'loading' }), null);
  assert.equal(flightStartGuidance({ ...base, phase: 'failed' }), null);
});

test('confirmed zero is scoped to captured time and saved flights remove onboarding guidance', () => {
  const base = { phase: 'ready' as const, accountAssociated: true, successfulRetrieval: true, savedFlights: 0 };
  const empty = flightStartGuidance(base);
  assert.equal(empty?.kind, 'captured-empty');
  assert.match(empty.message, /nicht erfasste Zeiträume bleiben unbekannt/);
  assert.equal(flightStartGuidance({ ...base, savedFlights: 12 }), null);
  assert.equal(flightStartGuidance({ ...base, accountAssociated: false, savedFlights: 12 }), null);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FLIGHT_REMINDER_AFTER_MS, FLIGHT_REMINDER_SNOOZE_MS, flightReminder, snoozeFlightReminder } from '../../apps/platform-lab/src/mobile/flight-reminder.ts';

const now = Date.parse('2026-10-22T12:00:00.000Z');

test('only successful retrieval receipts older than 72 elapsed hours trigger the age reminder', () => {
  const exact = new Date(now - FLIGHT_REMINDER_AFTER_MS).toISOString();
  const older = new Date(now - FLIGHT_REMINDER_AFTER_MS - 1).toISOString();
  assert.equal(flightReminder({ successfulRetrievalAt: exact, now }).visible, false);
  assert.equal(flightReminder({ successfulRetrievalAt: older, now }).reason, 'saved-data-old');
  for (const successfulRetrievalAt of [null, 'broken', '2026-10-23T12:00:00.000Z']) {
    assert.equal(flightReminder({ successfulRetrievalAt, now }).visible, false);
  }
});

test('a positive new or changed observation triggers independently of save age', () => {
  assert.equal(flightReminder({ successfulRetrievalAt: '2026-10-22T11:59:59.000Z', newOrChangedObservation: true, now }).reason, 'new-or-changed');
  assert.equal(flightReminder({ successfulRetrievalAt: '2026-10-01T12:00:00.000Z', newOrChangedObservation: true, now }).reason, 'both');
});

test('a valid account reminder snooze lasts 24 hours and expires at its boundary', () => {
  const until = snoozeFlightReminder(now)!;
  assert.equal(Date.parse(until), now + FLIGHT_REMINDER_SNOOZE_MS);
  assert.equal(flightReminder({ successfulRetrievalAt: '2026-10-01T12:00:00.000Z', snoozedUntil: until, now }).visible, false);
  assert.equal(flightReminder({ successfulRetrievalAt: '2026-10-01T12:00:00.000Z', snoozedUntil: until, now: Date.parse(until) }).visible, true);
});

test('an invalid clock cannot create a snooze expiry', () => {
  assert.equal(snoozeFlightReminder(Number.NaN), null);
});

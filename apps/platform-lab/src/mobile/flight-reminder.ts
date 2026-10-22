const HOUR_MS = 60 * 60 * 1000;
export const FLIGHT_REMINDER_AFTER_MS = 72 * HOUR_MS;
export const FLIGHT_REMINDER_SNOOZE_MS = 24 * HOUR_MS;

function strictUtcTime(value: string | null | undefined): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value ? time : null;
}

export type FlightReminderReason = 'saved-data-old' | 'new-or-changed' | 'both';
export interface FlightReminderInput {
  successfulRetrievalAt: string | null | undefined;
  newOrChangedObservation?: boolean;
  snoozedUntil?: string | null;
  now?: number;
}

/** A reminder depends on a successful retrieval receipt or an explicit positive observation. */
export function flightReminder(input: FlightReminderInput) {
  const now = input.now ?? Date.now();
  const retrievedAt = strictUtcTime(input.successfulRetrievalAt);
  const savedDataOld = Number.isFinite(now) && retrievedAt !== null && retrievedAt <= now && now - retrievedAt > FLIGHT_REMINDER_AFTER_MS;
  const newOrChanged = input.newOrChangedObservation === true;
  const snoozeUntil = strictUtcTime(input.snoozedUntil);
  const snoozed = Number.isFinite(now) && snoozeUntil !== null && snoozeUntil > now;
  const reason: FlightReminderReason | null = savedDataOld && newOrChanged ? 'both' : savedDataOld ? 'saved-data-old' : newOrChanged ? 'new-or-changed' : null;
  return { visible: reason !== null && !snoozed, reason, savedDataOld, newOrChanged, snoozed };
}

export function snoozeFlightReminder(now = Date.now()): string | null {
  if (!Number.isFinite(now)) return null;
  const until = now + FLIGHT_REMINDER_SNOOZE_MS;
  if (!Number.isFinite(until)) return null;
  try { return new Date(until).toISOString(); } catch { return null; }
}

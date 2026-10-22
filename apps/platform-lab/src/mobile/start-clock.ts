/** Schedule only boundaries that can change visible Start content. */
export function nextStartBoundary(now: number, deadlines: readonly number[] = []): number {
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return Math.min(midnight.getTime(), ...deadlines.filter(time => Number.isFinite(time) && time > now));
}

export interface ReminderSnooze { scopeKey: string; until: string | null }
export function readReminderSnooze(value: unknown, scopeKey: string): ReminderSnooze | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (record.scopeKey !== scopeKey || typeof record.until !== 'string') return null;
  const time = Date.parse(record.until);
  return Number.isFinite(time) && new Date(time).toISOString() === record.until
    ? { scopeKey, until: record.until } : null;
}

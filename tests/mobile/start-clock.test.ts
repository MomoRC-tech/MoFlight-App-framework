import assert from 'node:assert/strict';
import test from 'node:test';
import { nextStartBoundary, readReminderSnooze } from '../../apps/platform-lab/src/mobile/start-clock';

test('Start clock wakes at freshness/snooze boundaries or next local midnight', () => {
  const now = new Date(2026, 9, 22, 12).getTime();
  assert.equal(nextStartBoundary(now, [NaN, now - 1, now + 5_000, now + 50_000]), now + 5_000);
  assert.equal(nextStartBoundary(now), new Date(2026, 9, 23).getTime());
});
test('snooze rejects a foreign scope and noncanonical timestamps', () => {
  const record = { scopeKey: 'owner/store/account', until: '2026-10-23T12:00:00.000Z' };
  assert.deepEqual(readReminderSnooze(record, record.scopeKey), record);
  assert.equal(readReminderSnooze(record, 'other'), null);
  assert.equal(readReminderSnooze({ ...record, until: 'tomorrow' }, record.scopeKey), null);
  assert.equal(readReminderSnooze({ ...record, until: '2026-10-23' }, record.scopeKey), null);
});

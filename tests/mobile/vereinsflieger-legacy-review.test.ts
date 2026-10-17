import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLegacyReview } from '../../apps/platform-lab/src/vereinsflieger/legacy-review.ts';

const metadata = { status: 'present', version: 2, accountLabel: 'Synthetic Pilot', preset: 'Konfiguration laden',
  period: 'Das letzte Jahr', role: 'Pilot', reset: true, journalFingerprint: 'ab'.repeat(32) };
test('legacy review accepts only bounded metadata and never accepts additional journal or flight contents', () => {
  assert.deepEqual(parseLegacyReview(metadata), metadata);
  assert.deepEqual(parseLegacyReview({ status: 'absent' }), { status: 'absent' });
  for (const key of ['filters', 'columns', 'sort', 'rows', 'password', 'cookie', 'payload']) {
    assert.throws(() => parseLegacyReview({ ...metadata, [key]: 'private synthetic sentinel' }), /^Error: Legacy review unavailable\.$/);
    assert.throws(() => parseLegacyReview({ status: 'absent', [key]: 'private synthetic sentinel' }));
  }
});
test('legacy review rejects malformed or misleading metadata with fixed errors', () => {
  for (const input of [null, [], {}, { ...metadata, version: 3 }, { ...metadata, status: 'owned' },
    { ...metadata, reset: 'true' }, { ...metadata, accountLabel: '' }, { ...metadata, accountLabel: 'x'.repeat(201) },
    { ...metadata, preset: 'x'.repeat(101) }, { ...metadata, period: 'x'.repeat(101) },
    { ...metadata, accountLabel: 'Synthetic\nPilot' }, { ...metadata, role: 'Administrator' },
    { ...metadata, journalFingerprint: 'partial' }]) {
    assert.throws(() => parseLegacyReview(input), /^Error: Legacy review unavailable\.$/);
  }
});

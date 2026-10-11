import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Retrieval } from '../../apps/platform-lab/src/vereinsflieger/retrieval.ts';
import { CAPTURE_SCHEMA, persistCapture, readLatestCapture } from '../../apps/platform-lab/src/vereinsflieger/capture-store.ts';
import { validateCapture, REQUIRED_HEADERS, type ProbeSnapshot } from '../../apps/platform-lab/src/vereinsflieger/probe.ts';
import { nodeDriver } from './sqlite-driver.ts';

const snapshot: ProbeSnapshot = { captureId: 'synthetic-request-1', retrievedAt: '2026-10-11T12:00:00.000Z',
  headers: REQUIRED_HEADERS, rows: [{ values: ['11.10.2026', 'D-TEST', '12:00', '12:07', '7'], sourceFlightId: '123' }],
  sourceIdentity: 'unverified', coverage: 'visible-personal-list-only', timeBasis: 'unknown' };

test('request ownership rejects repeated taps and late completion after cancellation/timeout', () => {
  const r = new Retrieval();
  assert.equal(r.start('first'), true); assert.equal(r.start('repeated'), false);
  assert.equal(r.cancel(), true); assert.equal(r.start('second'), true);
  assert.equal(r.beginSave('first'), false); assert.equal(r.finish('first'), false);
  assert.deepEqual(r.state, { phase: 'loading', nonce: 'second' });
  assert.equal(r.finish('second'), true); // timeout/session-required/error
  assert.equal(r.start('retry'), true); assert.equal(r.finish('second'), false);
  assert.equal(r.beginSave('retry'), true); assert.equal(r.beginSave('retry'), false);
});

test('saving cannot be cancelled or overlapped; disposal ignores late save verdict', async () => {
  const r = new Retrieval(); r.start('first'); r.beginSave('first');
  let reject!: (reason: Error) => void;
  const pending = new Promise<void>((_, fail) => { reject = fail; }).catch(() => r.finish('first'));
  assert.equal(r.cancel(), false); assert.equal(r.start('second'), false);
  r.dispose(); r.start('second'); reject(new Error('simulated late disk failure'));
  assert.equal(await pending, false); assert.deepEqual(r.state, { phase: 'loading', nonce: 'second' });
});

test('stored capture rejects false verification flags, malformed rows and metadata', () => {
  assert.deepEqual(validateCapture(snapshot), snapshot);
  for (const change of [null, [], { ...snapshot, captureId: {} }, { ...snapshot, retrievedAt: '2026-02-31T12:00:00.000Z' },
    { ...snapshot, coverage: 'complete' }, { ...snapshot, sourceIdentity: 'verified' }, { ...snapshot, timeBasis: 'UTC' },
    { ...snapshot, rows: [] }, { ...snapshot, rows: [{ values: [], sourceFlightId: '123' }] }]) assert.throws(() => validateCapture(change));
});

test('disk retries preserve one capture, conflicts/failures retain earlier evidence, restart validates identity', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'moflight-capture-')), path = join(dir, 'capture.sqlite');
  let db = nodeDriver(path);
  try {
    await db.exec(CAPTURE_SCHEMA); await persistCapture(db, snapshot); await persistCapture(db, snapshot);
    assert.equal((await db.first<{ n: number }>('SELECT count(*) AS n FROM captures'))!.n, 1);
    await assert.rejects(persistCapture(db, { ...snapshot, rows: [{ ...snapshot.rows[0], sourceFlightId: '456' }] }), /conflict/);
    await assert.rejects(persistCapture(db, { ...snapshot, rows: [] }));
    const failedWriter = { ...db, run: async () => { throw new Error('simulated full disk'); } };
    await assert.rejects(persistCapture(failedWriter, { ...snapshot, captureId: 'next' }), /full disk/);
    assert.deepEqual(await readLatestCapture(db), snapshot);
    await db.close(); db = nodeDriver(path); assert.deepEqual(await readLatestCapture(db), snapshot);
    await db.run('UPDATE captures SET id=?', 'foreign');
    await assert.rejects(readLatestCapture(db), /identity mismatch/);
    await db.run('UPDATE captures SET id=?, payload=?', snapshot.captureId, JSON.stringify({ ...snapshot, coverage: 'complete' }));
    await assert.rejects(readLatestCapture(db), /metadata/);
    assert.equal((await db.first<{ n: number }>('SELECT count(*) AS n FROM captures'))!.n, 1); // corruption is preserved
  } finally { await db.close(); await rm(dir, { recursive: true, force: true }); }
});

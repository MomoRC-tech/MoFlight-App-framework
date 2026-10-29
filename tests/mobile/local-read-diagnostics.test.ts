import test from 'node:test';
import assert from 'node:assert/strict';
import type { Driver } from '../../packages/local-data/src/index';
import { diagnoseLocalDriver, traceLocalRead, localReadFailureCode } from '../../apps/platform-lab/src/local-read-diagnostics';

test('native database failure categories expose no exception contents', () => {
  for (const [message, code] of [
    ['database is locked: private-owner', 'database-locked'],
    ['database table is locked: private-table', 'database-locked'],
    ['database has been closed: private-path', 'database-closed'],
    ['no such table: private-table', 'missing-table'],
    ['java.lang.NullPointerException private-data', 'native-null'],
    ['already finalized private-query', 'statement-finalized'],
    ['unexpected private-data', 'operation-failed'],
  ]) assert.equal(localReadFailureCode(new Error(message)), code);
  assert.equal(localReadFailureCode('private-data'), 'operation-failed');
});

test('failure diagnostics retain only stages and bounded lifetime ordinals, preserving the exact rejection', async () => {
  const output: string[] = [];
  const warn = console.warn;
  console.warn = (...values: unknown[]) => { output.push(values.join(' ')); };
  const failure = new Error('Cannot use shared object that was already released: private-owner');
  let reads = 0;
  const raw = { first: async () => { reads++; throw failure; }, close: async () => {} } as unknown as Driver;
  try {
    const db = diagnoseLocalDriver(raw, 'generic');
    for (let i = 0; i < 30; i++) await assert.rejects(db.first('SELECT private-data', 'private-account'), e => e === failure);
    await assert.rejects(traceLocalRead('restore-gate', () => db.first('secret')), e => e === failure);
    assert.equal(reads, 31, 'no automatic retries');
    const text = output.join('\n');
    assert.ok(!/private|SELECT|secret/.test(text));
    const report = JSON.parse(output.at(-1)!.slice('MoFlight local-read diagnostic '.length));
    assert.equal(report.stage, 'restore-gate'); assert.equal(report.code, 'released-object');
    assert.ok(report.lifetime.length <= 24);
    assert.ok(Buffer.byteLength(output.at(-1)!, 'utf8') < 4000, 'keep each native warning below the logcat line limit');
    assert.ok(report.lifetime.every((event: { connection: unknown }) => typeof event.connection === 'number'));
  } finally { console.warn = warn; }
});

test('lifetime observation preserves outstanding work, close identity and successful values', async () => {
  let finish!: (value: null) => void;
  const work = new Promise<null>(resolve => { finish = resolve; });
  const close = Promise.resolve();
  const db = diagnoseLocalDriver({ first: () => work, close: () => close } as unknown as Driver, 'real-flight');
  const reading = db.first('unused');
  assert.equal(reading, work);
  assert.equal(traceLocalRead('stored-view', () => reading), work);
  assert.equal(db.close(), close);
  finish(null); assert.equal(await reading, null);
});

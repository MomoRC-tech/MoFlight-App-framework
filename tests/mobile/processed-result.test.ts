import test from 'node:test';
import assert from 'node:assert/strict';
import { createProcessedSelector, reuseEqualData } from '../../apps/platform-lab/src/mobile/processed-result.ts';

test('generic selectors reuse cloned content, publish nothing while unavailable and invalidate scope or time inputs', () => {
  let calls = 0;
  const select = createProcessedSelector((input: { rows: { minutes: number }[]; year: number }) => {
    calls++; return { minutes: input.rows.reduce((sum, row) => sum + row.minutes, 0), year: input.year };
  });
  const input = { rows: [{ minutes: 30 }], year: 2026 };
  const first = select('owner/store/account', input);
  assert.equal(select('owner/store/account', structuredClone(input)), first);
  assert.equal(select(null, input), null);
  assert.equal(select('owner/store/account', null), null);
  assert.equal(select('owner/store/account', structuredClone(input)), first);
  assert.equal(calls, 1);
  assert.equal(select('owner/store/account', { ...input, year: 2027 })!.year, 2027);
  assert.equal(calls, 2);
  assert.notEqual(select('other-owner/store/account', { ...input, year: 2027 }), first);
  assert.equal(calls, 3);
  assert.equal(select('other-owner/store/account', { rows: [{ minutes: 45 }], year: 2027 })!.minutes, 45);
  assert.equal(calls, 4);
});

test('structural reuse preserves unaffected branches without trusting counts or generations', () => {
  const previous = { generation: 2, flights: [{ minutes: 30 }, { minutes: 10 }], medical: { text: 'unknown' }, receipts: [] as string[] };
  const identical = reuseEqualData(previous, structuredClone(previous));
  assert.equal(identical, previous);
  const next = structuredClone(previous); next.receipts.push('new receipt');
  const shared = reuseEqualData(previous, next);
  assert.notEqual(shared, previous); assert.equal(shared.flights, previous.flights); assert.equal(shared.medical, previous.medical);
  assert.notEqual(shared.receipts, previous.receipts);
  const corrected = structuredClone(previous); corrected.flights[0]!.minutes = 45;
  const updated = reuseEqualData(previous, corrected);
  assert.notEqual(updated.flights, previous.flights); assert.equal(updated.flights[1], previous.flights[1]);
  assert.equal(updated.flights[0]!.minutes, 45); assert.equal(previous.flights[0]!.minutes, 30);
});

test('failed processing is never cached; retry processes again and falsey results are cached', () => {
  let calls = 0, fail = true;
  const select = createProcessedSelector((value: number) => { calls++; if (fail) throw new Error('synthetic'); return value ? undefined : false; });
  assert.throws(() => select('scope', 1), /synthetic/); fail = false;
  assert.equal(select('scope', 1), undefined); assert.equal(select('scope', 1), undefined); assert.equal(calls, 2);
  assert.equal(select('scope', 0), false); assert.equal(select('scope', 0), false); assert.equal(calls, 3);
});

test('data comparison distinguishes missing properties, array order, empty values and non-plain objects', () => {
  assert.notEqual(reuseEqualData({ a: undefined }, {}), undefined);
  assert.deepEqual(reuseEqualData({ a: undefined }, {}), {});
  assert.notEqual(reuseEqualData([1, 2], [2, 1])[0], 1);
  assert.equal(reuseEqualData<number | null>(0, null), null);
  assert.equal(reuseEqualData<string | undefined>('', undefined), undefined);
  const old = new Date(0), fresh = new Date(1); assert.equal(reuseEqualData(old, fresh), fresh);
  const sparse = new Array(3); sparse[0] = 'value';
  assert.equal(reuseEqualData(new Array(2), sparse).length, 3);
  const value = JSON.parse('{"__proto__":{"safe":true}}');
  const copied = reuseEqualData({}, value); assert.ok(Object.hasOwn(copied, '__proto__')); assert.equal(Object.getPrototypeOf(copied), Object.prototype);
});

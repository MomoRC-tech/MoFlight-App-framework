import test from 'node:test';
import assert from 'node:assert/strict';
import { AiUsageMonitor } from '../../apps/platform-lab/src/ai/usage-monitor.ts';

function budget(settledMicroEur = 100_000) {
  const capMicroEur = 1_000_000;
  return {
    period: '2026-10', timezone: 'Europe/Berlin', capMicroEur, settledMicroEur,
    reservedMicroEur: 50_000, unknownMicroEur: 25_000,
    remainingMicroEur: capMicroEur - settledMicroEur - 50_000 - 25_000,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Expected ${label} to exist`);
  return value;
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

interface ScheduledWork {
  work: () => void;
  delay: number;
  cancelled: boolean;
}

class Harness {
  reads = 0;
  nowCalls = 0;
  updated: { value: unknown; at: string }[] = [];
  staleCalls = 0;
  inferCalls = 0;
  sendCalls = 0;
  retryCalls = 0;
  scheduled: ScheduledWork[] = [];
  monitor: AiUsageMonitor;

  constructor(private readonly readsQueue: Array<() => Promise<unknown>> = []) {
    const ports = {
      read: () => {
        this.reads++;
        const next = this.readsQueue.shift();
        return next ? next() : Promise.resolve(budget());
      },
      now: () => { this.nowCalls++; return '2026-10-24T12:00:00.000Z'; },
      updated: (value: unknown, at: string) => { this.updated.push({ value, at }); },
      stale: () => { this.staleCalls++; },
      schedule: (work: () => void, delay: number) => {
        const scheduled = { work, delay, cancelled: false };
        this.scheduled.push(scheduled);
        return () => { scheduled.cancelled = true; };
      },
      infer: () => { this.inferCalls++; },
      send: () => { this.sendCalls++; },
      retry: () => { this.retryCalls++; },
    };
    this.monitor = new AiUsageMonitor(ports);
  }

  fire(index = this.scheduled.length - 1) {
    required(this.scheduled[index], `scheduled callback ${index}`).work();
  }
}

test('start reads immediately and schedules the next read at exactly 10000 ms', async () => {
  const h = new Harness([() => Promise.resolve(budget())]);
  h.monitor.start();

  assert.equal(h.reads, 1, 'start begins a read before the scheduled refresh');
  assert.equal(h.scheduled.length, 1);
  assert.equal(required(h.scheduled[0], 'initial scheduled callback').delay, 10_000);
  await flush();

  assert.deepEqual(h.updated, [{ value: budget(), at: '2026-10-24T12:00:00.000Z' }]);
  assert.equal(h.nowCalls, 1);
  h.monitor.stop();
});

test('scheduled refresh does not overlap a read that is still pending', async () => {
  const first = deferred<unknown>(), second = deferred<unknown>();
  const h = new Harness([() => first.promise, () => second.promise]);
  h.monitor.start();
  h.fire(0);
  await flush();
  assert.equal(h.reads, 1);

  first.resolve(budget(200_000));
  await flush();
  assert.equal(h.updated.length, 1);
  h.fire(0);
  assert.equal(h.reads, 2, 'the next tick begins after the previous read settles');
  second.resolve(budget(300_000));
  await flush();
  assert.deepEqual(h.updated.map(item => (item.value as ReturnType<typeof budget>).settledMicroEur), [200_000, 300_000]);
  h.monitor.stop();
});

test('stop cancels scheduled work and suppresses late success and failure callbacks', async () => {
  for (const outcome of ['success', 'failure'] as const) {
    const pending = deferred<unknown>();
    const h = new Harness([() => pending.promise]);
    h.monitor.start();
    h.monitor.stop();
    assert.equal(required(h.scheduled[0], 'initial scheduled callback').cancelled, true);

    h.fire(0); // Even a scheduler that delivers a cancelled callback must be fenced.
    assert.equal(h.reads, 1);
    if (outcome === 'success') pending.resolve(budget(400_000));
    else pending.reject(new Error('synthetic read failure'));
    await flush();

    assert.deepEqual(h.updated, []);
    assert.equal(h.staleCalls, 0);
    assert.equal(h.nowCalls, 0);
  }
});

test('restart ignores the previous generation result and accepts only the current read', async () => {
  const previous = deferred<unknown>(), current = deferred<unknown>();
  const h = new Harness([() => previous.promise, () => current.promise]);
  h.monitor.start();
  h.monitor.start();

  assert.equal(h.reads, 2, 'each start performs its own immediate read');
  assert.equal(required(h.scheduled[0], 'previous scheduled callback').cancelled, true);
  assert.equal(required(h.scheduled[1], 'current scheduled callback').delay, 10_000);

  previous.resolve(budget(111_000));
  await flush();
  assert.equal(h.updated.length, 0, 'the prior generation cannot publish a late value');
  current.resolve(budget(222_000));
  await flush();
  assert.deepEqual(h.updated.map(item => (item.value as ReturnType<typeof budget>).settledMicroEur), [222_000]);
  h.monitor.stop();
});

test('failed reads and malformed budgets mark usage stale without publishing fabricated values', async () => {
  const invalidBudget = { ...budget(), remainingMicroEur: 999_999 };
  const cases: Array<() => Promise<unknown>> = [
    () => Promise.reject(new Error('synthetic read failure')),
    () => Promise.resolve(invalidBudget),
  ];

  for (const read of cases) {
    const h = new Harness([read]);
    h.monitor.start();
    await flush();

    assert.equal(h.staleCalls, 1);
    assert.deepEqual(h.updated, [], 'invalid or unavailable accounting never becomes a zero balance');
    assert.equal(h.nowCalls, 0, 'an invalid read does not receive a successful update timestamp');
    h.monitor.stop();
  }
});

test('the monitor uses read and presentation ports without inference, send or retry work', async () => {
  const h = new Harness([() => Promise.resolve(budget())]);
  h.monitor.start();
  await flush();

  assert.equal(h.reads, 1);
  assert.deepEqual(h.updated.map(item => item.value), [budget()]);
  assert.equal(h.inferCalls, 0);
  assert.equal(h.sendCalls, 0);
  assert.equal(h.retryCalls, 0);
  h.monitor.stop();
});

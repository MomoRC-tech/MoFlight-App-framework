import test from 'node:test';
import assert from 'node:assert/strict';
import { ActivityRequest } from '../../apps/platform-lab/src/vereinsflieger/activity-request.ts';
import { PROFILE_URL, type ObservedContext } from '../../apps/platform-lab/src/vereinsflieger/context.ts';

const expected: ObservedContext = {
  accountNumber: '123456', clubLabel: 'Synthetic Club', clubIdentity: 'display-label-only', verification: 'observed-profile-number',
};
const abortScript = 'window.__moflightActivityAbort?.();true;';
const validSources = [{ source: 'flights', configuration: `activity-v1:sha256:${'a'.repeat(64)}`, markers: { count: 7 } }];

type TimerHandle = ReturnType<typeof setTimeout>;
type FakeTimer = { handle: TimerHandle; run: () => void; delay: number; cleared: boolean };

class Harness {
  injected: string[] = [];
  changes: boolean[] = [];
  events: string[] = [];
  timers: FakeTimer[] = [];
  now = 1_800_000_000_000;
  private ids = 0;
  request = new ActivityRequest({
    inject: script => { this.injected.push(script); this.events.push(script === abortScript ? 'abort-injected' : 'probe-injected'); },
    uuid: () => `nonce-${++this.ids}`,
    now: () => this.now,
    changed: active => { this.changes.push(active); this.events.push(active ? 'reserved' : 'released'); },
    schedule: (run, delay) => {
      const handle = { fakeTimer: this.timers.length } as unknown as TimerHandle;
      this.timers.push({ handle, run, delay, cleared: false });
      this.events.push('scheduled');
      return handle;
    },
    clear: handle => {
      const timer = this.timers.find(item => item.handle === handle);
      if (timer) timer.cleared = true;
      this.events.push('timer-cleared');
    },
  });
  fireTimeout(index = this.timers.length - 1) { this.timers[index]!.run(); }
  receive(raw: string, sender = PROFILE_URL, document = PROFILE_URL) { return this.request.receive(sender, document, raw); }
}

function packet(nonce: string, sources = validSources, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ kind: 'vf-activity-v1', nonce, sources, ...extra });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function flush() { await Promise.resolve(); await Promise.resolve(); }
function start(harness: Harness, options: { current?: () => boolean; beforeStart?: () => Promise<void>; terminate?: () => void } = {}) {
  return harness.request.start(expected, {
    current: options.current ?? (() => true),
    beforeStart: options.beforeStart,
    terminate: options.terminate ?? (() => harness.events.push('terminated')),
  });
}

test('cancel keeps the reservation until its bridge reply and blocks overlapping requests', async () => {
  const harness = new Harness(), first = start(harness);
  await flush();
  assert.equal(harness.request.active(), true);
  assert.equal(harness.injected.length, 1);
  assert.equal(harness.timers[0]!.delay, 12_000);

  const cancelled = harness.request.cancel();
  assert.equal(harness.request.active(), true, 'cancel waits for the renderer reply or hard timeout');
  assert.equal(harness.injected[1], abortScript);
  assert.equal(await start(harness), null, 'a second request cannot overlap the cancelled one');
  assert.equal(harness.request.active(), true);

  assert.equal(harness.receive(packet('nonce-1')), true);
  assert.equal(await first, null, 'a late success after cancel is discarded');
  await cancelled;
  assert.equal(harness.request.active(), false);
  assert.deepEqual(harness.changes, [true, false]);
  assert.equal(harness.timers[0]!.cleared, true);
});

test('cancellation during async beforeStart never injects the activity reader', async () => {
  const harness = new Harness(), gate = deferred<void>();
  const pending = start(harness, { beforeStart: () => gate.promise });
  await flush();
  assert.equal(harness.injected.length, 0);

  const cancelled = harness.request.cancel();
  assert.equal(harness.request.active(), true);
  assert.deepEqual(harness.injected, [abortScript]);
  assert.equal(await start(harness), null);
  assert.equal(harness.receive(packet('nonce-1', [], { error: 'unavailable' })), true);
  assert.equal(await pending, null);
  await cancelled;
  gate.resolve();
  await flush();
  assert.deepEqual(harness.injected, [abortScript], 'the async continuation must not inject after cancellation');
  assert.equal(harness.request.active(), false);
});

test('revoked current scope before async preparation completes releases without injection', async () => {
  const harness = new Harness(), gate = deferred<void>();
  let current = true;
  const pending = start(harness, { current: () => current, beforeStart: () => gate.promise });
  await flush();
  assert.equal(harness.request.active(), true);
  current = false;
  gate.resolve();
  assert.equal(await pending, null);
  assert.equal(harness.request.active(), false);
  assert.equal(harness.injected.length, 0);
  assert.deepEqual(harness.changes, [true, false]);
});

test('only a matching nonce from the exact profile bridge can settle a request', async () => {
  const harness = new Harness(), pending = start(harness);
  await flush();

  assert.equal(harness.receive(JSON.stringify({ kind: 'vf-other-v1', nonce: 'nonce-1', sources: validSources })), false);
  assert.equal(harness.receive(packet('foreign-nonce')), true);
  assert.equal(harness.receive(packet('nonce-1'), PROFILE_URL, 'https://vereinsflieger.de/member/profile/other'), true);
  assert.equal(harness.receive(packet('nonce-1'), 'https://evil.example/member/profile/viewprofile', PROFILE_URL), true);
  assert.equal(harness.request.active(), true, 'wrong kind, nonce and bridge are ignored');

  harness.now += 250;
  assert.equal(harness.receive(packet('nonce-1', validSources)), true);
  const result = await pending;
  assert.deepEqual(result, { sources: validSources, observedAt: harness.now });
  assert.equal(harness.request.active(), false);
});

test('matching unavailable or malformed parser results settle with null and reveal no provider error', async () => {
  for (const extra of [{ error: 'unavailable' }, {}]) {
    const harness = new Harness(), pending = start(harness);
    await flush();
    const invalidSources = extra.error ? [] : [{ source: 'flights', configuration: 'private provider detail', markers: { count: 1 } }];
    assert.equal(harness.receive(packet('nonce-1', invalidSources, extra)), true);
    assert.equal(await pending, null);
    assert.equal(harness.request.active(), false);
  }
});

test('beforeStart rejection settles safely and releases its reservation', async () => {
  const harness = new Harness();
  const pending = start(harness, { beforeStart: async () => { throw new Error('synthetic preparation failure'); } });
  assert.equal(await pending, null);
  assert.equal(harness.request.active(), false);
  assert.equal(harness.injected.length, 0);
  assert.deepEqual(harness.changes, [true, false]);
  assert.equal(harness.timers[0]!.cleared, true);
});

test('hard timeout terminates before releasing the reservation', async () => {
  const harness = new Harness();
  const pending = start(harness, { terminate: () => harness.events.push('terminated') });
  await flush();
  harness.fireTimeout(0);

  assert.equal(await pending, null);
  assert.equal(harness.request.active(), false);
  assert.equal(harness.events.indexOf('terminated') < harness.events.indexOf('released'), true);
  assert.equal(harness.timers[0]!.cleared, true);
  assert.deepEqual(harness.changes, [true, false]);
});

test('abandon releases the old epoch and late replies cannot revive or settle its successor', async () => {
  const harness = new Harness(), old = start(harness);
  await flush();
  const oldTimer = harness.timers[0]!;
  harness.request.abandon();
  assert.equal(await old, null);
  assert.equal(harness.request.active(), false);
  assert.equal(oldTimer.cleared, true);

  const next = start(harness);
  await flush();
  assert.equal(harness.request.active(), true);
  oldTimer.run();
  assert.equal(harness.request.active(), true, 'a stale timer from the old epoch is inert');
  assert.equal(harness.receive(packet('nonce-1')), true);
  assert.equal(harness.request.active(), true, 'a stale reply cannot finish the new nonce');
  assert.equal(harness.receive(packet('nonce-2')), true);
  assert.deepEqual(await next, { sources: validSources, observedAt: harness.now });
  assert.equal(harness.request.active(), false);
});


test('a failing renderer-stop callback still releases the timed-out reservation', async () => {
  const h = new Harness();
  const pending = h.request.start(expected, {current:()=>true,terminate:()=>{throw new Error('Synthetic stop failure');}});
  await Promise.resolve();
  assert.doesNotThrow(()=>h.fireTimeout());
  assert.equal(await pending,null);
  assert.equal(h.request.active(),false);
});

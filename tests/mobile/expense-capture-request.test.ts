import assert from 'node:assert/strict';
import test from 'node:test';
import { canonical } from '../../packages/flight-logbook/src/index.ts';
import { FinancialCaptureRequest, type FinancialCaptureOptions, type FinancialCaptureState } from '../../apps/platform-lab/src/vereinsflieger/expense-capture-request.ts';
import { FinancialObservationStore } from '../../apps/platform-lab/src/vereinsflieger/expense-observation-store.ts';
import { PROFILE_URL } from '../../apps/platform-lab/src/vereinsflieger/context.ts';
import { nodeDriver } from './sqlite-driver.ts';
import { financialTarget as target, financialHash as hash, financialAt as at, financialListUrl as listUrl,
  financialDetailUrl as detailUrl, financialObservation as observation, financialProfile as profile, financialRead as read } from './fixtures/expense-capture.ts';

function deferred() { let resolve!: () => void; const promise = new Promise<void>(yes => { resolve = yes; }); return { promise, resolve }; }
async function until(predicate: () => boolean) { for (let i = 0; i < 500; i++) { if (predicate()) return; await Promise.resolve(); } assert.fail('Synthetic asynchronous operation did not reach the expected checkpoint'); }
async function fixture() {
  const db = nodeDriver(':memory:'), store = new FinancialObservationStore(db, target, hash, async () => {}); await store.initialize(true);
  const state = { allowed: true, current: true, generation: 0, url: '', ids: 0, revocations: 0, saveCalls: 0 };
  const navigations: string[] = [], scripts: string[] = [], changes: FinancialCaptureState[] = [];
  const timers: Array<{ run(): void; cleared: boolean }> = [];
  const options: FinancialCaptureOptions = { target, observedListUrl: listUrl, observedDetailUrl: detailUrl,
    async authorize(gate) { await gate(); }, async save(run, gate) { state.saveCalls++; return run.save(store, () => target, gate); } };
  const request = new FinancialCaptureRequest({
    canStart: () => state.allowed, current: selected => state.current && canonical(selected) === canonical(target),
    epoch: () => state.generation, navigate(url) { state.generation++; state.url = url; navigations.push(url); },
    inject(script) { scripts.push(script); }, revoke() { state.revocations++; state.generation++; },
    uuid: () => 'capture-' + ++state.ids, now: () => at, changed: value => changes.push(value),
    schedule(run, ms) { assert.equal(ms, 90_000); const timer = { run, cleared: false }; timers.push(timer); return timer as unknown as ReturnType<typeof setTimeout>; },
    clear(handle) { (handle as unknown as {cleared:boolean}).cleared = true; },
  });
  function start(override: Partial<FinancialCaptureOptions> = {}) { const promise = request.start({ ...options, ...override }); void promise.catch(() => {}); return promise; }
  async function loaded() {
    const count = scripts.length; request.navigationStarted(state.url, state.generation); assert.equal(request.pageLoaded(state.url, state.generation), true);
    await until(() => scripts.length > count || !request.active());
  }
  function packet(extra: Record<string, unknown> = {}) {
    const script = scripts.at(-1)!;
    const kind = JSON.parse(script.match(/kind:("[^"]+")/)![1]!), nonce = JSON.parse(script.match(/nonce:("[^"]+")/)![1]!);
    return JSON.stringify({ kind, nonce, url: state.url, ...(kind === 'vf-financial-profile-v1' ? { profile: profile() }
      : { page: kind === 'vf-financial-link-v1' ? { url: listUrl, detailUrl } : read() }), ...extra });
  }
  async function step(extra: Record<string, unknown> = {}) { await loaded(); await request.receive(state.url, state.url, packet(extra), state.generation); }
  async function firstThree() { for (let i = 0; i < 3; i++) await step(); }
  return { db, store, state, navigations, scripts, changes, timers, request, options, start, loaded, packet, step, firstThree,
    async ready() { await until(() => navigations.length === 1); }, async close() { request.interrupt(); await db.close(); } };
}

test('financial request owns before/list/detail/after native loads and saves one exact receipt', async () => {
  const f = await fixture(); try {
    const pending = f.start(); await f.ready();
    assert.equal(f.request.active(), true); await assert.rejects(f.start(), /unavailable/);
    for (let i = 0; i < 4; i++) await f.step();
    const receipt = await pending; assert.equal(receipt.id, 'capture-1'); assert.deepEqual(receipt.value, observation());
    assert.deepEqual(f.navigations, [PROFILE_URL, listUrl, detailUrl, PROFILE_URL]); assert.equal(f.scripts.length, 4);
    assert.equal((await f.store.history()).total, 1); assert.equal(f.request.active(), false); assert.equal(f.request.hasUncertainSave(), false);
    assert.deepEqual(f.changes.at(-1), { phase: 'idle', failure: null }); assert.ok(f.timers[0]!.cleared);
  } finally { await f.close(); }
});

test('financial request rejects invalid routes and unavailable admission without reserving or navigating', async () => {
  const f = await fixture(); try {
    f.state.allowed = false; await assert.rejects(f.start(), /unavailable/); f.state.allowed = true;
    await assert.rejects(f.start({ observedDetailUrl: 'https://example.invalid/private' }), /could not be verified/);
    assert.equal(f.request.active(), false); assert.equal(f.navigations.length, 0); assert.equal(f.timers.length, 0);
  } finally { await f.close(); }
});

test('native load must be freshly observed before injection and repeated load-end injects only once', async () => {
  const f = await fixture(); try {
    const first = f.start(); await f.ready(); f.request.pageLoaded(f.state.url, f.state.generation);
    await assert.rejects(first, /stopped/); assert.equal(f.scripts.length, 0); assert.equal(f.state.revocations, 1);
    const second = f.start(); await until(() => f.navigations.length === 2); await f.loaded();
    f.request.pageLoaded(f.state.url, f.state.generation); f.request.pageLoaded(f.state.url, f.state.generation);
    await Promise.resolve(); assert.equal(f.scripts.length, 1); f.request.cancel(); await assert.rejects(second);
  } finally { await f.close(); }
});

test('stale epochs, forged sender/document/nonces and malformed/oversized bridge packets cannot advance or save', async () => {
  const f = await fixture(); try {
    const pending = f.start(); await f.ready(); await f.loaded();
    for (const [sender, document, raw, epoch] of [
      [f.state.url, f.state.url, f.packet(), f.state.generation - 1],
      ['https://evil.invalid', f.state.url, f.packet(), f.state.generation],
      [f.state.url, detailUrl, f.packet(), f.state.generation],
      [f.state.url, f.state.url, f.packet({ nonce: 'foreign' }), f.state.generation],
      [f.state.url, f.state.url, '{bad json', f.state.generation],
      [f.state.url, f.state.url, 'x'.repeat(300_001), f.state.generation],
    ] as const) await f.request.receive(sender, document, raw, epoch);
    assert.equal(f.navigations.length, 1); assert.equal(f.state.saveCalls, 0); f.request.cancel(); await assert.rejects(pending);
  } finally { await f.close(); }
});

test('duplicate in-flight reply and replay of a prior stage cannot double-advance the request', async () => {
  const f = await fixture(); try {
    const pending = f.start(); await f.ready(); await f.loaded(); const packet = f.packet(), generation = f.state.generation;
    await Promise.all([f.request.receive(PROFILE_URL, PROFILE_URL, packet, generation), f.request.receive(PROFILE_URL, PROFILE_URL, packet, generation)]);
    assert.equal(f.navigations.length, 2); await f.loaded();
    await f.request.receive(PROFILE_URL, listUrl, packet, f.state.generation); assert.equal(f.navigations.length, 2);
    f.request.cancel(); await assert.rejects(pending);
  } finally { await f.close(); }
});

for (const reason of ['cancelled', 'access', 'timeout', 'source'] as const) {
  test(`financial ${reason} interruption revokes native callbacks and preserves existing receipts`, async () => {
    const f = await fixture(); try {
      await f.store.save('existing', 'billed-flight', observation()); const original = await f.store.exportBackup();
      const pending = f.start(); await f.ready(); await f.loaded(); const oldEpoch = f.state.generation, raw = f.packet();
      if (reason === 'cancelled') assert.equal(f.request.cancel(), true);
      else if (reason === 'timeout') f.timers[0]!.run(); else f.request.interrupt(reason);
      await assert.rejects(pending, /stopped/); assert.equal(f.request.active(), false); assert.ok(f.timers[0]!.cleared);
      await f.request.receive(PROFILE_URL, PROFILE_URL, raw, oldEpoch); assert.equal(f.navigations.length, 1);
      assert.equal(await f.store.exportBackup(), original);
    } finally { await f.close(); }
  });
}

test('revoked scope or cancellation during async authorization cannot navigate or affect a later request', async () => {
  const f = await fixture(); try {
    const hold = deferred(), first = f.start({ authorize: async gate => { await hold.promise; await gate(); } });
    assert.equal(f.request.active(), true); f.state.current = false; hold.resolve(); await assert.rejects(first);
    assert.equal(f.navigations.length, 0); f.state.current = true;
    const second = f.start(); await f.ready(); await Promise.resolve(); assert.equal(f.request.active(), true);
    f.request.cancel(); await assert.rejects(second); assert.equal(f.navigations.length, 1);
  } finally { await f.close(); }
});

test('load authorization must settle before any reader reply is admitted, and cancellation prevents late injection', async () => {
  const f = await fixture(); try {
    const hold = deferred(); let block = false;
    const pending = f.start({ async authorize(gate) { if (block) await hold.promise; await gate(); } }); await f.ready();
    block = true; f.request.navigationStarted(f.state.url, f.state.generation); f.request.pageLoaded(f.state.url, f.state.generation);
    f.request.pageLoaded(f.state.url, f.state.generation);
    await f.request.receive(PROFILE_URL, PROFILE_URL, JSON.stringify({ kind: 'vf-financial-profile-v1', nonce: 'capture-1-before', url: PROFILE_URL, profile: profile() }), f.state.generation);
    assert.equal(f.navigations.length, 1); assert.equal(f.scripts.length, 0);
    f.request.cancel(); await assert.rejects(pending); hold.resolve();
    for (let i = 0; i < 20; i++) await Promise.resolve();
    assert.equal(f.scripts.length, 0); assert.equal(f.request.active(), false);
  } finally { await f.close(); }
});

test('login redirect and unexpected navigation stop the owned source before saving', async () => {
  const f = await fixture(); try {
    const pending = f.start(); await f.ready();
    assert.equal(f.request.allowNavigation('https://vereinsflieger.de/member/login.php', f.state.generation), false);
    await assert.rejects(pending); assert.equal(f.state.saveCalls, 0); assert.equal(f.state.revocations, 1);
  } finally { await f.close(); }
});

for (const source of ['unbilled', 'profile-changed']) {
  test(`financial ${source} evidence fails without a raw receipt`, async () => {
    const f = await fixture(); try {
      const pending = f.start(); await f.ready();
      if (source === 'unbilled') { await f.step(); await f.step(); await f.step({ page: { error: 'not-billed' } }); }
      else { await f.firstThree(); await f.step({ profile: { ...profile(), ownRecipientLabel: 'Other, Person' } }); }
      await assert.rejects(pending); assert.equal((await f.store.history()).total, 0); assert.equal(f.request.hasUncertainSave(), false);
    } finally { await f.close(); }
  });
}

test('save holds renderer ownership until settlement; explicit same-receipt retry performs no provider navigation', async () => {
  const f = await fixture(); try {
    const hold = deferred(); let ackLost = true, committed = false;
    const pending = f.start({ async save(run, gate) {
      const result = await f.options.save(run, gate);
      committed = true;
      if (ackLost) { await hold.promise; ackLost = false; throw Error('Private provider error must not escape'); }
      return result;
    } });
    await f.ready(); await f.firstThree(); const saving = f.step();
    await until(() => committed); assert.equal(f.request.cancel(), false);
    f.request.pageLoaded(f.state.url, f.state.generation); assert.equal(f.state.revocations, 0, 'duplicate load-end cannot interrupt the dispatched write');
    f.timers[0]!.run(); assert.equal(f.request.active(), true); await assert.rejects(f.start());
    hold.resolve(); await saving; await assert.rejects(pending, error => !String(error).includes('Private provider'));
    assert.equal(f.request.hasUncertainSave(), true); assert.equal((await f.store.history()).total, 1);
    const navigations = [...f.navigations], reads = f.scripts.length;
    const receipt = await f.request.retrySave(); assert.equal(receipt.id, 'capture-1');
    assert.deepEqual(f.navigations, navigations); assert.equal(f.scripts.length, reads); assert.equal((await f.store.history()).total, 1);
    assert.equal(f.request.hasUncertainSave(), false);
  } finally { await f.close(); }
});

test('revocation after inner receipt acknowledgement reconciles the already-done run without a second write', async () => {
  const f = await fixture(); try {
    let revoke = true;
    const pending = f.start({ async save(run, gate) { const result = await f.options.save(run, gate); if (revoke) { revoke = false; f.state.current = false; } return result; } });
    await f.ready(); await f.firstThree(); await f.step(); await assert.rejects(pending);
    assert.equal(f.request.hasUncertainSave(), true); await assert.rejects(f.request.retrySave());
    f.state.current = true; const receipt = await f.request.retrySave(); assert.equal(receipt.id, 'capture-1');
    assert.equal((await f.store.history()).total, 1); assert.equal(f.navigations.length, 4);
  } finally { await f.close(); }
});

test('scope revocation before save dispatch retains a retryable original capture without inventing a zero receipt', async () => {
  const f = await fixture(); try {
    let fail = true;
    const pending = f.start({ async save(run, gate) { if (fail) { fail = false; throw Error('Storage unavailable'); } return f.options.save(run, gate); } });
    await f.ready(); await f.firstThree(); await f.step(); await assert.rejects(pending);
    assert.equal((await f.store.history()).total, 0); assert.ok(f.request.hasUncertainSave());
    await f.request.retrySave(); assert.equal((await f.store.history()).total, 1);
  } finally { await f.close(); }
});

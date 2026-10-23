import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';
import { ACTIVITY_READER_SOURCE, ACTIVITY_SOURCE_INSPECTOR, activityProbeScript, decodeActivityProbe, type ActivityProbeSource } from '../../apps/platform-lab/src/vereinsflieger/activity-probe.ts';

const expected = { accountNumber: '123', clubLabel: 'Synthetic club', clubIdentity: 'display-label-only', verification: 'observed-profile-number' } as const;
const text = (textContent: string) => ({ textContent });
type NetworkFault = { at: number; kind: 'offline' | 'body-disconnect' | 'stalled-fetch' | 'stalled-body' | 'non-html' | 401 | 403 | 429 | 500 | 503 };
type FixtureOptions = { count?: number; footer?: string; ownCount?: number; foreignAfter?: boolean; login?: boolean; layout?: boolean; role?: string; filter?: string; period?: string; header?: string; detail?: string; oversized?: boolean; redirect?: boolean; cancelAt?: number; changedUrl?: boolean; badFilter?: boolean; emptyOwnRows?: boolean; timeout?: boolean; sort?: string; frozenAt?: string; layoutRow?: boolean };
function fixture(options: FixtureOptions = {}, networkFault?: NetworkFault) {
  let reachedStall!: () => void;
  const stalledResponse = new Promise<void>(resolve => { reachedStall = resolve; });
  const paths: string[] = [], messages: unknown[] = [], headers = ['Datum', 'Lfz.', 'Start', 'Landung', 'Flugzeit'];
  const location = new URL('https://vereinsflieger.de/member/profile/viewprofile');
  const window: any = { ReactNativeWebView: { postMessage: (m: string) => messages.push(JSON.parse(m)) } }; window.top = window;
  const profile = (foreign = false): any => ({
    querySelector: () => options.login ? {} : null,
    querySelectorAll: (s: string) => s === 'table.tablelist.alternative tr' ? [{ cells: [text('Benutzernummer'), text(foreign ? '456' : '123')] }] :
      s === '#topnavi a[href]' ? [{ ...text('Synthetic club'), getAttribute: () => '/member/community/main' }] : [],
  });
  const doc = (own: boolean): any => {
    const labels = own ? ['Dienst', 'Diensttausch', 'Zeitraum', 'Person(en)', 'Dienstplan von'] : [options.header ?? headers[0]!, ...headers.slice(1)];
    const head = { cells: labels.map((label, i) => ({ ...text(label), querySelectorAll: () => i === 0 && options.sort ? [{ classList: [options.sort] }] : [] })), querySelector: () => null };
    const count = own ? options.ownCount ?? 0 : options.count ?? 20;
    const body = count > 0 || own && options.emptyOwnRows ? [{ cells: labels.map(() => text(options.detail ?? 'Synthetic detail')), querySelector: () => ({}) }] : [];
    const layoutRows = options.layoutRow ? [{ cells: [{ colSpan: 99 }], querySelector: () => ({}) }] : [];
    const table = { rows: [head, ...layoutRows, ...body], nextElementSibling: text(own && count === 0 ? 'Es wurden keine passenden Daten gefunden!td.f1{width:100%}' : options.footer ?? `${count} Datensätze`), querySelectorAll: (s: string) => s === 'thead tr' ? [head] : [] };
    return {
      querySelector: (s: string) => s === '#frmfilter' ? { elements: [{ name: options.badFilter ? 'token' : 'col2', type: 'text', value: options.filter ?? '', checked: false }] } :
        s === '#globalfilter' ? text(options.period ?? 'ab 01.01.2026 bis 31.12.2026') : s === '#globalfilter2' ? text(options.role ?? 'Pilot oder Fluglehrer') : null,
      querySelectorAll: (s: string) => s === `table#${own ? 'tablelist_32' : 'tablelist_20'}` ? options.layout ? [] : [table] :
        s === '#LST_VISIBLE > li' ? labels.map((_, i) => ({ getAttribute: () => String(i + 1) })) :
          s === 'select' && own ? [{ name: '', id: '', value: 'own', selectedOptions: [text('Meine Dienste')] }] : [],
    };
  };
  const documents = new Map<string, any>();
  const fetcher = async (url: string, init: RequestInit) => {
    const path = new URL(url).pathname; paths.push(path);
    assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'error'); assert.equal(init.cache, 'no-store'); assert.equal(init.credentials, 'same-origin');
    const fault = paths.length === networkFault?.at ? networkFault.kind : undefined;
    if (fault === 'offline') throw new TypeError('Synthetic private transport detail: connection lost');
    if (fault === 'stalled-fetch') await new Promise<void>((_resolve, reject) => {
      init.signal!.addEventListener('abort', () => reject(new Error('Synthetic private transport detail: request aborted')), { once: true });
      reachedStall();
    });
    if (options.cancelAt === paths.length) window.__moflightActivityAbort();
    if (options.changedUrl) location.pathname = '/member/profile/flightlog.php';
    const key = String(paths.length); documents.set(key, path.endsWith('viewprofile') ? profile(options.foreignAfter && paths.length > 1) : doc(path.endsWith('myservices.php')));
    let delivered = false;
    return { ok: typeof fault !== 'number', status: typeof fault === 'number' ? fault : 200,
      url: options.redirect ? 'https://other.test/' : url, headers: new Headers({ 'content-type': fault === 'non-html' ? 'application/json' : 'text/html; charset=utf-8' }),
      body: new ReadableStream<Uint8Array>({ pull(c) {
        if (delivered) {
          if (fault === 'stalled-body') return new Promise<void>(resolve => {
            init.signal!.addEventListener('abort', () => { c.error(new Error('Synthetic private transport detail: body aborted')); resolve(); }, { once: true });
            reachedStall();
          });
          if (fault === 'body-disconnect') c.error(new TypeError('Synthetic private transport detail: truncated response'));
          else c.close();
          return;
        }
        delivered = true;
        c.enqueue(options.oversized ? new Uint8Array(1_000_001) : new TextEncoder().encode(key));
      } }) };
  };
  const instant = Date.parse(options.frozenAt ?? '2026-10-23T12:00:00.000Z');
  class FrozenDate extends Date { constructor(value?: string | number) { super(value ?? instant); } static now() { return instant; } }
  let expireNetwork: (() => void) | undefined;
  const stalled = networkFault?.kind === 'stalled-fetch' || networkFault?.kind === 'stalled-body';
  const sandbox = { window, document: profile(), location, URL, AbortController, Date: FrozenDate, TextEncoder, TextDecoder, Uint8Array, crypto: webcrypto, setTimeout: options.timeout ? (callback: () => void) => { queueMicrotask(callback); return 0; } : setTimeout, clearTimeout,
    fetch: fetcher, DOMParser: class { parseFromString(key: string) { return documents.get(key); } } };
  const execute = () => runInNewContext(`(${ACTIVITY_READER_SOURCE})('test-nonce',${JSON.stringify(expected)})`, sandbox) as Promise<void>;
  const inspect = (source: string, guard?: () => void) => runInNewContext(`(${ACTIVITY_SOURCE_INSPECTOR})(sourceDocument,source,guard)`,
    { ...sandbox, sourceDocument: doc(source === 'own-duties'), source, guard }) as Promise<ActivityProbeSource | null>;
  if (stalled) {
    sandbox.setTimeout = ((callback: () => void, delay: number) => {
      assert.equal(delay, 10000); expireNetwork = callback; return 0;
    }) as typeof setTimeout;
    sandbox.clearTimeout = (() => { expireNetwork = undefined; }) as typeof clearTimeout;
  }
  return { execute, paths, messages, window, sandbox, inspect, stalledResponse, expireNetwork: () => { assert.ok(expireNetwork); expireNetwork(); } };
}
function payload(sources: unknown[]) { return { kind: 'vf-activity-v1', nonce: 'test-nonce', sources }; }

test('bounded reader obtains fresh identity before and after two read-only views, exposing only counts and hashed configuration', async () => {
  const f = fixture(); await f.execute(); const result = decodeActivityProbe(f.messages[0]);
  assert.deepEqual(f.paths, ['/member/profile/viewprofile', '/member/profile/flightlog.php', '/member/profile/myservices.php', '/member/profile/viewprofile']);
  assert.equal(result.sources.length, 2);
  assert.deepEqual(result.sources[0]!.markers, { count: 20 });
  assert.deepEqual(result.sources[0]!.window, { from: '2026-01-01', to: '2026-12-31' });
  assert.equal(result.sources[0]!.participation, 'Pilot oder Fluglehrer');
  assert.deepEqual(result.sources[1]!.markers, { count: 0 });
  assert.equal(result.sources[1]!.window, undefined);
  assert.equal(f.window.__moflightActivityAbort, undefined);
  const encoded = JSON.stringify(result); assert.ok(!encoded.includes('Synthetic')); assert.ok(!encoded.includes('accountNumber'));
});

test('count changes retain comparable configuration, older details are ignored, filters/order/schema/role/window changes partition evidence', async () => {
  async function source(options: FixtureOptions = {}) { const f = fixture(options); await f.execute(); return decodeActivityProbe(f.messages[0]).sources[0]!; }
  const original = await source();
  const count = await source({ count: 21 }); assert.equal(count.configuration, original.configuration); assert.equal(count.markers.count, 21);
  assert.deepEqual(await source({ detail: 'Edited old synthetic detail' }), original);
  for (const options of [{ filter: 'Synthetic filter' }, { role: 'Pilot' }, { period: 'ab 01.02.2026 bis 31.12.2026' }, { sort: 'icon-sort-numeric-down' }]) {
    assert.notEqual((await source(options)).configuration, original.configuration);
  }
});

test('missing count footer never falls back to DOM row count, and unsupported views remain unavailable', async () => {
  for (const options of [{ footer: 'Seite 1' }, { layout: true }, { header: 'Changed date' }, { badFilter: true }, { role: 'Everyone' }, { period: 'ab 31.02.2026 bis 31.12.2026' }]) {
    const f = fixture(options); await f.execute(); const result = decodeActivityProbe(f.messages[0]);
    assert.ok(!result.sources.some(s => s.source === 'flights'));
  }
  const f = fixture({ emptyOwnRows: true }); await f.execute();
  assert.ok(!decodeActivityProbe(f.messages[0]).sources.some(s => s.source === 'own-duties'));
});

test('auth/identity/URL/size/cancellation failures reject the complete observation and release ownership', async () => {
  for (const options of [{ login: true }, { foreignAfter: true }, { oversized: true }, { redirect: true }, { cancelAt: 2 }, { changedUrl: true }, { timeout: true }]) {
    const f = fixture(options); await f.execute(); assert.throws(() => decodeActivityProbe(f.messages[0]));
    assert.equal(f.window.__moflightActivityAbort, undefined);
    assert.ok(f.paths.length <= 4);
  }
});

for (const kind of ['offline', 'body-disconnect', 'non-html', 401, 403, 429, 500, 503] as const) {
  test(`network fault ${kind} rejects incomplete activity evidence at every request stage; a fresh request recovers`, async () => {
    for (const at of [1, 2, 3, 4]) {
      // One injected fault, including failure of the final identity check after
      // both source pages have arrived. Reuse this renderer for the next attempt.
      const f = fixture({}, { at, kind });
      await f.execute();
      assert.equal(f.messages.length, 1);
      assert.throws(() => decodeActivityProbe(f.messages[0]));
      assert.equal('sources' in (f.messages[0] as object), false, 'Partial observations must not escape');
      assert.ok(!JSON.stringify(f.messages[0]).includes('Synthetic private transport detail'));
      assert.equal(f.paths.length, at, 'No automatic retry or further source request after failure');
      assert.equal(f.window.__moflightActivityAbort, undefined, 'Failure releases the renderer reservation');

      await f.execute();
      assert.equal(f.messages.length, 2);
      assert.equal(f.paths.length, at + 4, 'Explicit recovery performs all four guarded requests again');
      const recovered = decodeActivityProbe(f.messages[1]);
      assert.deepEqual(recovered.sources.map(s => [s.source, s.markers.count]), [['flights', 20], ['own-duties', 0]]);
      assert.equal(f.window.__moflightActivityAbort, undefined);
    }
  });
}

for (const kind of ['stalled-fetch', 'stalled-body'] as const) {
  test(`${kind} times out and releases ownership at every request stage, then allows recovery`, { timeout: 5000 }, async () => {
    for (const at of [1, 2, 3, 4]) {
      const f = fixture({}, { at, kind });
      const pending = f.execute();
      await f.stalledResponse;
      assert.equal(f.paths.length, at);
      assert.equal(f.messages.length, 0, 'A pending response cannot report success');
      f.expireNetwork();
      await pending;
      assert.equal(f.messages.length, 1);
      assert.throws(() => decodeActivityProbe(f.messages[0]));
      assert.ok(!JSON.stringify(f.messages[0]).includes('Synthetic private transport detail'));
      assert.equal(f.window.__moflightActivityAbort, undefined);
      await f.execute();
      assert.equal(decodeActivityProbe(f.messages[1]).sources.length, 2);
      assert.equal(f.paths.length, at + 4);
    }
  });
}

test('concurrent injection cannot replace a running cancellation owner', async () => {
  const f = fixture(); const owner = () => {}; f.window.__moflightActivityAbort = owner;
  await f.execute(); assert.equal(f.window.__moflightActivityAbort, owner); assert.deepEqual(f.paths, []);
  assert.throws(() => decodeActivityProbe(f.messages[0]));
});

test('standalone inspector returns the same metadata from the actual capture DOM without network access', async () => {
  const f = fixture({ layoutRow: true });
  const duty = await f.inspect('own-duties'); assert.equal(duty?.markers.count, 0);
  const flight = await f.inspect('flights'); assert.equal(flight?.markers.count, 20);
  assert.deepEqual(f.paths, [], 'standalone metadata inspection must not request another page');
  assert.equal(await f.inspect('club-duties'), null);
  await assert.rejects(f.inspect('own-duties', () => { throw Error('cancelled'); }));
  await f.execute();
  assert.deepEqual(decodeActivityProbe(payload([duty!, flight!])), JSON.parse(JSON.stringify({ sources: [duty, flight] })));
  assert.deepEqual(decodeActivityProbe(f.messages[0]).sources, JSON.parse(JSON.stringify([flight, duty])));
});

test('provider-local day partitions relative and duty scopes while absolute windows remain stable', async () => {
  // Berlin midnight occurs before UTC midnight and need not match the device day.
  const before = fixture({ period: 'Das letzte Jahr', frozenAt: '2026-10-23T21:59:59.000Z' });
  const after = fixture({ period: 'Das letzte Jahr', frozenAt: '2026-10-23T22:00:00.000Z' });
  for (const source of ['flights', 'own-duties']) {
    assert.notEqual((await before.inspect(source))?.configuration, (await after.inspect(source))?.configuration);
  }
  const absoluteBefore = fixture({ frozenAt: '2026-10-23T21:59:59.000Z' });
  const absoluteAfter = fixture({ frozenAt: '2026-10-23T22:00:00.000Z' });
  assert.equal((await absoluteBefore.inspect('flights'))?.configuration, (await absoluteAfter.inspect('flights'))?.configuration);
});

test('runtime decoder rejects malformed, duplicate, oversharing or fabricated marker payloads', () => {
  const source = { source: 'flights', configuration: 'activity-v1:sha256:' + 'a'.repeat(64), markers: { count: 1 } };
  assert.deepEqual(decodeActivityProbe(payload([source])), { sources: [source] });
  for (const bad of [null, {}, { ...payload([]), error: 'private text' }, payload([source, source]),
    payload([{ ...source, configuration: 'raw private config' }]), payload([{ ...source, markers: { count: -1 } }]),
    payload([{ ...source, markers: { count: 1.5 } }]), payload([{ ...source, markers: { count: 0, newest: 'private record' } }]),
    payload([{ ...source, window: { from: '2026-02-31', to: '2026-12-31' } }]),
    payload([{ ...source, participation: 'Unknown role' }])]) assert.throws(() => decodeActivityProbe(bad));
  assert.throws(() => activityProbeScript('bad nonce', expected));
  assert.match(activityProbeScript('valid', expected), /vf-activity-v1/);
});

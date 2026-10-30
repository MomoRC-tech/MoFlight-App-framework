import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { DetailHttpTrial, summarizeDetailHttpEvidence, type DetailHttpEvidence, type DetailHttpState } from '../../apps/platform-lab/src/vereinsflieger/detail-http-trial.ts';
import { PROFILE_URL, type ObservedContext } from '../../apps/platform-lab/src/vereinsflieger/context.ts';
import { compareDetailReads, decodeHttpDetail, detailHttpScript } from '../../apps/platform-lab/src/vereinsflieger/detail-http-poc.ts';
import { decodeDetail } from '../../apps/platform-lab/src/vereinsflieger/details.ts';

const context: ObservedContext = { accountNumber: '100', clubLabel: 'Synthetic club', clubIdentity: 'display-label-only', verification: 'observed-profile-number' };
const detailUrl = 'https://vereinsflieger.de/member/profile/viewflight.php?flid=123';
const at = '2026-10-30T12:00:00.000Z';
const result = { url: detailUrl, fields: [
  { section: 'Allgemeine Daten', position: 1, label: 'Eintrag', raw: '123' },
  { section: 'Flugdaten', position: 3, label: 'CallSign', raw: 'D-TEST' },
  { section: 'Flugdaten', position: 4, label: 'Datum', raw: '01.01.2026' },
  { section: 'Flugdaten', position: 5, label: 'Flugzeit', raw: '00:30' },
] };
const http = { context, detailUrl, result, detailMs: 20, totalMs: 80 };
class Harness {
  id = 0; now = Date.parse(at); active = true; currentUrl = PROFILE_URL;
  scripts: string[] = []; events: string[] = []; saves: DetailHttpEvidence[] = [];
  timers: { run(): void; cleared: boolean }[] = [];
  state: DetailHttpState = { phase: 'idle', message: '' };
  failSave = false;
  trial = new DetailHttpTrial({ uuid: () => 'n-' + ++this.id, now: () => this.now, active: () => this.active,
    navigate: url => { this.currentUrl = url; this.events.push('navigate'); }, inject: script => this.scripts.push(script),
    revoke: () => this.events.push('revoke'), changed: state => { this.state = state; },
    save: async evidence => { this.events.push('save'); if (this.failSave) throw Error('synthetic'); this.saves.push(evidence); },
    schedule: run => { const timer = { run, cleared: false }; this.timers.push(timer); return timer as unknown as ReturnType<typeof setTimeout>; },
    clear: timer => { (timer as unknown as { cleared: boolean }).cleared = true; },
  }, context);
  receive(kind: string, n: number, payload: Record<string, unknown>, url = this.currentUrl, sender = url, document = url) {
    this.trial.receive(sender, document, JSON.stringify({ kind, nonce: 'n-' + n, url, ...payload }));
  }
  begin() { this.trial.start(); this.trial.loaded(PROFILE_URL); this.receive('vf-context-v1', 2, { context }); this.trial.confirm(); }
  fetched() { this.receive('vf-detail-http-v1', 3, http); }
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

test('one detail comparison requires explicit confirmation and a final same-account proof', async () => {
  const h = new Harness(); h.trial.start(); h.trial.loaded(PROFILE_URL);
  assert.equal(h.scripts.length, 1); h.receive('vf-context-v1', 2, { context });
  assert.equal(h.state.phase, 'confirm'); assert.equal(h.scripts.length, 1);
  h.trial.confirm(); h.fetched(); h.now += 150; h.trial.loaded(detailUrl);
  h.receive('vf-detail-navigation-v1', 4, { result }); assert.equal(h.saves.length, 0);
  h.trial.loaded(PROFILE_URL); h.receive('vf-context-v1', 5, { context }); await flush();
  assert.equal(h.state.phase, 'complete'); assert.equal(h.saves[0]?.comparison?.equal, true);
  assert.equal(h.saves[0]?.navigationMs, 150); assert.equal(h.saves[0]?.http?.observation.costs, 'not-captured');
  assert.ok(h.events.lastIndexOf('revoke') < h.events.lastIndexOf('save'));
});
test('foreign accounts and changed club labels cannot confirm or complete a trial', () => {
  for (const foreign of [{ ...context, accountNumber: '200' }, { ...context, clubLabel: 'Other club' }]) {
    const h = new Harness(); h.trial.start(); h.receive('vf-context-v1', 2, { context: foreign }); assert.equal(h.state.phase, 'stopped');
    const final = new Harness(); final.begin(); final.fetched(); final.receive('vf-detail-navigation-v1', 4, { result });
    final.receive('vf-context-v1', 5, { context: foreign }); assert.equal(final.state.phase, 'stopped'); assert.equal(final.saves[0]?.comparison, undefined);
  }
});
test('nested protected-profile failures retain fixed reasons and give sign-in recovery without reading HTTP details', () => {
  for (const reason of ['session-required', 'profile-number-unavailable', 'profile-club-unavailable']) {
    const h = new Harness(); h.trial.start(); h.trial.loaded(PROFILE_URL);
    h.receive('vf-context-v1', 2, { context: { error: reason, privateValue: 'never-display-this' } });
    assert.equal(h.state.phase, 'stopped');
    assert.deepEqual(h.saves[0]?.failure, { stage: 'profile', reason });
    assert.equal(h.saves[0]?.http, undefined);
    assert.equal(h.scripts.length, 1, 'only the profile reader was injected');
    assert.ok(!h.state.message.includes('never-display-this'));
    if (reason === 'session-required') { assert.match(h.state.message, /Zurück.*Sync.*anmelden/); assert.ok(!h.state.message.includes('invalid-response')); }
    const final = new Harness(); final.begin(); final.fetched(); final.receive('vf-detail-navigation-v1', 4, { result });
    final.receive('vf-context-v1', 5, { context: { error: reason } });
    assert.equal(final.state.phase, 'stopped'); assert.equal(final.saves[0]?.outcome, 'stopped');
    assert.deepEqual(final.saves[0]?.failure, { stage: 'verify', reason });
    assert.equal(final.saves[0]?.comparison, undefined); assert.equal(final.saves[0]?.http?.observation.sourceFlightId, '123');
  }
});
test('unknown nested error text stays private and a signed-out attempt can retry with a fresh account proof', () => {
  const unknown = new Harness(); unknown.trial.start(); unknown.receive('vf-context-v1', 2, { context: { error: 'private-provider-text' } });
  assert.equal(unknown.saves[0]?.failure?.reason, 'invalid-response'); assert.ok(!unknown.state.message.includes('private-provider-text'));
  const h = new Harness(); h.trial.start(); h.receive('vf-context-v1', 2, { context: { error: 'session-required' } });
  h.trial.start(); h.receive('vf-context-v1', 2, { context }); assert.equal(h.state.phase, 'running', 'old response cannot confirm retry');
  h.receive('vf-context-v1', 4, { context }); assert.equal(h.state.phase, 'confirm');
});
test('wrong nonce, document, origin, bridge kind and malformed JSON do not advance the job', () => {
  const h = new Harness(); h.begin();
  h.receive('vf-detail-http-v1', 99, http); h.receive('vf-context-v1', 3, http);
  h.receive('vf-detail-http-v1', 3, http, PROFILE_URL, 'https://foreign.invalid/', PROFILE_URL);
  h.receive('vf-detail-http-v1', 3, http, PROFILE_URL, PROFILE_URL, detailUrl);
  h.trial.receive(PROFILE_URL, PROFILE_URL, '{');
  assert.equal(h.state.phase, 'running'); assert.equal(h.currentUrl, PROFILE_URL); assert.equal(h.saves.length, 0);
  h.receive('vf-detail-http-v1', 3, http, PROFILE_URL, 'https://vereinsflieger.de/'); assert.equal(h.currentUrl, detailUrl);
});
test('background cancellation revokes before save and rejects late replies; retry has a fresh nonce', () => {
  const h = new Harness(); h.begin(); h.active = false; h.trial.stop('background');
  assert.equal(h.state.phase, 'stopped'); assert.equal(h.saves.length, 1);
  assert.deepEqual(h.events.slice(-2), ['revoke', 'save']);
  h.receive('vf-detail-http-v1', 3, http); assert.equal(h.saves.length, 1);
  h.active = true; h.trial.start(); assert.equal(h.id, 5);
  h.receive('vf-detail-http-v1', 3, http); assert.equal(h.state.phase, 'running');
});
test('timeout, failed navigation and missing anchors stop without replacing earlier evidence', () => {
  for (const fail of ['timeout', 'login', 'anchors']) {
    const h = new Harness(); h.begin(); h.fetched();
    if (fail === 'timeout') h.timers.at(-1)!.run();
    if (fail === 'login') h.trial.loaded('https://vereinsflieger.de/');
    if (fail === 'anchors') h.receive('vf-detail-navigation-v1', 4, { result: { ...result, fields: [] } });
    assert.equal(h.state.phase, 'stopped'); assert.equal(h.saves[0]?.http?.observation.sourceFlightId, '123');
    assert.equal(h.saves[0]?.comparison, undefined);
  }
});
test('failed evidence writes are visible; stale completions cannot overwrite a new run', async () => {
  const h = new Harness(); h.failSave = true; h.begin(); h.trial.stop(); await flush();
  assert.match(h.state.message, /nicht gespeichert/);
  const next = new Harness(); next.begin(); next.trial.stop(); next.trial.start(); await flush();
  assert.equal(next.state.phase, 'running');
});
test('sanitized native diagnostics contain fixed failure stages and timings, never private context or fields', () => {
  const h = new Harness(); h.begin(); h.now += 40;
  h.receive('vf-detail-http-v1', 3, { error: 'list-unsupported', listShape: { rows: 25, username: 'private-credential', columns: 'private-column' } });
  const summary = summarizeDetailHttpEvidence(h.saves[0]!);
  assert.deepEqual(summary.failure, { stage: 'http', reason: 'list-unsupported' });
  assert.equal(summary.stages.http, 40);
  assert.equal(summary.contextVerified, true);
  assert.deepEqual(summary.listShape, { rows: 25 });
  const text = JSON.stringify(summary);
  for (const privateValue of [context.accountNumber, context.clubLabel, detailUrl, 'D-TEST']) assert.ok(!text.includes(privateValue));
  const raw = new Harness(); raw.begin(); raw.fetched(); raw.trial.stop();
  assert.equal(JSON.stringify(summarizeDetailHttpEvidence(raw.saves[0]!)).includes('D-TEST'), false);
});
test('decoder rejects foreign URLs/accounts, malformed durations and mismatched IDs', () => {
  for (const changed of [{ context: { ...context, accountNumber: '200' } }, { detailUrl: detailUrl.replace('123', '999') },
    { detailUrl: detailUrl.replace('vereinsflieger.de', 'foreign.invalid') }, { detailMs: NaN }, { totalMs: 10000 }, { totalMs: -1 }, { error: 'session-required' }]) {
    assert.throws(() => decodeHttpDetail({ ...http, ...changed }, context, at));
  }
  assert.throws(() => detailHttpScript('bad nonce', context));
});
test('comparison preserves exact whitespace differences and missing/changed fields', () => {
  const a = decodeDetail(result, detailUrl, at), b = structuredClone(a); b.fields[1]!.raw = ' D-TEST\n';
  assert.deepEqual(compareDetailReads(a, b), { fields: 4, exact: 3, normalized: 4, equal: false });
  b.fields.pop(); assert.equal(compareDetailReads(a, b).normalized, 3);
  b.sourceFlightId = '999'; assert.throws(() => compareDetailReads(a, b));
});

// Fast synthetic DOM contracts; the Android fixture separately checks real DOMParser/Response streams.
function cell(textContent: string) { return { textContent, querySelector: () => null }; }
function profile(account = '100') { return { querySelector: () => null, querySelectorAll: (selector: string) => selector.includes('table.') ? [{ cells: [cell('Benutzernummer'), cell(account)] }] : [{ textContent: 'Synthetic club', getAttribute: () => '/member/community/main' }] }; }
const link = { getAttribute: () => '/member/profile/viewflight.php?flid=123' };
const header = { cells: ['Datum', 'Lfz.', 'Start', 'Landung', 'Flugzeit'].map(cell), parentElement: { tagName: 'THEAD' }, querySelector: () => null };
const row = { cells: ['01.01.2026', 'D-TEST', '10:00', '10:30', '00:30'].map(cell), parentElement: { tagName: 'TBODY' }, querySelector: () => ({}), querySelectorAll: () => [link] };
const list = { querySelector: () => null, querySelectorAll: () => [{ rows: [header, row] }] };
test('HTTP script uses only fresh observed IDs and GET policy; login, context and response failures stop', async () => {
  for (const scenario of ['ok', 'relative-link', 'larger-list', 'oversized-list', 'foreign-before', 'foreign-after', 'login', 'network', 'mime', 'oversize', 'redirect', 'cancel', 'deadline']) {
    let reply: Record<string, unknown> | null = null, profiles = 0; const urls: string[] = [], timers: (() => void)[] = [];
    const window: Record<string, unknown> = { ReactNativeWebView: { postMessage: (s: string) => { reply = JSON.parse(s); } } }; window.top = window;
    const sandbox = { window, document: profile(), location: new URL(PROFILE_URL), URL, AbortController, TextDecoder, Uint8Array, performance: { now: () => 1 },
      setTimeout: (fn: () => void) => { timers.push(fn); return 1; }, clearTimeout: () => {},
      DOMParser: class { parseFromString(value: string) {
        if (value !== 'list') return profile(value === 'foreign' ? '200' : '100');
        const observed = { ...row, querySelectorAll: () => [{ getAttribute: () => scenario === 'relative-link' ? 'viewflight.php?flid=123' : link.getAttribute() }] };
        return { ...list, querySelectorAll: () => [{ rows: [header, ...Array(scenario === 'larger-list' ? 25 : scenario === 'oversized-list' ? 2001 : 1).fill(observed)] }] };
      } },
      fetch: async (url: string, options: RequestInit) => {
        urls.push(url); assert.equal(options.method, 'GET'); assert.equal(options.credentials, 'same-origin'); assert.equal(options.redirect, 'error');
        if (scenario === 'network') throw Error('synthetic');
        if (scenario === 'cancel' || scenario === 'deadline') { if (scenario === 'deadline') timers[0]!(); else (window.__moflightDetailHttpAbort as () => void)(); throw Error('synthetic'); }
        let value = url.includes('flightlog') ? 'list' : url.includes('viewflight') ? 'detail' : 'profile';
        if (value === 'profile') { profiles++; if (scenario === 'foreign-before' || scenario === 'foreign-after' && profiles === 2) value = 'foreign'; }
        const response = new Response(scenario === 'oversize' ? 'x'.repeat(1000001) : value, { headers: { 'content-type': scenario === 'mime' ? 'application/json' : 'text/html' } });
        Object.defineProperty(response, 'url', { value: scenario === 'redirect' ? 'https://vereinsflieger.de/' : url });
        return response;
      },
    };
    if (scenario === 'login') sandbox.document.querySelector = () => ({}) as never;
    // Replace only the reader, whose original DOM contract has its own tests.
    const script = detailHttpScript('synthetic', context).replace(/function\(document,url,allowed\)\{const location=[\s\S]*\}\);true;$/, 'function(){return '+JSON.stringify(result)+';});');
    await runInNewContext(script.replace(/;true;$/, ''), sandbox);
    const received = reply as unknown as Record<string, unknown>;
    if (scenario === 'ok' || scenario === 'relative-link' || scenario === 'larger-list') { assert.equal(received.detailUrl, detailUrl); assert.equal(urls.length, 4); }
    else assert.ok(received.error, scenario);
    if (scenario === 'foreign-before' || scenario === 'login') assert.equal(urls.some(u => u.includes('viewflight')), false);
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { decodeProbe, flightUrl, FLIGHT_URL, LOGIN_URL, probeScript, providerUrl, REQUIRED_HEADERS } from '../../apps/platform-lab/src/vereinsflieger/probe.ts';

const nonce = 'test-request-1', at = '2026-10-10T08:00:00.000Z';
const headers = ['', ...REQUIRED_HEADERS, 'Bemerkung'];
const values = headers.map(h => h === 'Datum' ? '10.10.2026' : h === 'PIC' ? 'Example PIC' : h === 'Begleiter/FI' ? 'Example companion' : h === 'Flugzeit' ? '00:12' : h === 'Lfz.' ? 'D-EX01' : '');
function message(overrides = {}) { return JSON.stringify({ kind: 'vf-probe-v1', nonce, url: FLIGHT_URL, headers, rows: [{ values, sourceFlightId: '12345' }], ...overrides }); }
test('exact provider URL validation blocks credentials, suffix hosts, HTTP and native schemes', () => {
  assert.ok(providerUrl(LOGIN_URL)); assert.ok(flightUrl(FLIGHT_URL + '?view=1'));
  for (const url of ['http://vereinsflieger.de/', 'https://vereinsflieger.de.evil.test/', 'https://evil.test/vereinsflieger.de', 'https://user:pw@vereinsflieger.de/', 'file:///member/profile/flightlog.php', 'javascript:alert(1)', 'https://vereinsflieger.de:444/']) assert.equal(providerUrl(url), false, url);
  assert.equal(flightUrl(LOGIN_URL), false);
});
test('capture preserves independent provider crew fields and labels unverified identity/time/coverage', () => {
  const s = decodeProbe(message(), FLIGHT_URL, nonce, at);
  assert.equal(s.rows[0]!.values[s.headers.indexOf('PIC')], 'Example PIC');
  assert.equal(s.rows[0]!.values[s.headers.indexOf('Begleiter/FI')], 'Example companion');
  assert.equal(s.sourceIdentity, 'unverified'); assert.equal(s.timeBasis, 'unknown'); assert.equal(s.coverage, 'visible-personal-list-only');
  assert.equal(s.rows[0]!.sourceFlightId, '12345');
});
test('stale response, login page, origin mismatch, changed schema and excessive fields fail closed', () => {
  for (const [data, url] of [[message({ nonce: 'old' }), FLIGHT_URL], [message(), LOGIN_URL], [message({ url: 'https://www.vereinsflieger.de/member/profile/flightlog.php' }), FLIGHT_URL], [message({ headers: ['Date'] }), FLIGHT_URL], [message({ headers: [...headers, 'PIC'] }), FLIGHT_URL], [message({ rows: [{ values: [...values, 'extra'], sourceFlightId: null }] }), FLIGHT_URL], [message({ rows: [{ values: values.map((v, i) => i === 0 ? 'x'.repeat(513) : v), sourceFlightId: null }] }), FLIGHT_URL], [message({ rows: [{ values, sourceFlightId: 'not-an-id' }] }), FLIGHT_URL]]) assert.throws(() => decodeProbe(data!, url!, nonce, at));
  assert.throws(() => decodeProbe('x'.repeat(200_001), FLIGHT_URL, nonce, at));
});
test('empty, oversized or error results cannot become successful empty imports', () => {
  for (const override of [{ rows: [] }, { rows: Array.from({ length: 21 }, () => ({ values, sourceFlightId: null })) }, { error: 'table-missing' }]) assert.throws(() => decodeProbe(message(override), FLIGHT_URL, nonce, at));
});
test('Android origin-only bridge requires the independently observed flight page and matching origin/nonce', () => {
  assert.equal(decodeProbe(message(), 'https://vereinsflieger.de', nonce, at, FLIGHT_URL).rows.length, 1);
  assert.equal(decodeProbe(message(), LOGIN_URL, nonce, at, FLIGHT_URL).rows.length, 1);
  for (const [sender, document] of [[LOGIN_URL, LOGIN_URL], [LOGIN_URL, 'https://vereinsflieger.de/member/other.php'], ['https://evil.test/', FLIGHT_URL], ['https://www.vereinsflieger.de/', FLIGHT_URL], [LOGIN_URL + '?page=flight', FLIGHT_URL], ['https://vereinsflieger.de/member/other.php', FLIGHT_URL]]) assert.throws(() => decodeProbe(message(), sender!, nonce, at, document!));
  assert.throws(() => decodeProbe(message({ nonce: 'old' }), LOGIN_URL, nonce, at, FLIGHT_URL));
  assert.throws(() => decodeProbe(message({ url: LOGIN_URL }), LOGIN_URL, nonce, at, FLIGHT_URL));
  assert.throws(() => decodeProbe(message(), LOGIN_URL, nonce, at));
});
function runReader(url: string, changed = false, iframe = false) {
  const messages: string[] = []; let reads = 0;
  const cell = (s: string) => ({ innerText: s });
  const header = { cells: (changed ? ['Changed'] : headers).map(cell), parentElement: { tagName: 'THEAD' }, querySelector: () => null };
  const row = { cells: values.map(cell), parentElement: { tagName: 'TBODY' }, querySelector: () => ({}), querySelectorAll: () => [{ getAttribute: () => '/member/profile/detail.php?flid=12345' }] };
  const window: Record<string, unknown> = { ReactNativeWebView: { postMessage: (s: string) => messages.push(s) } }; window.top = iframe ? {} : window;
  const u = new URL(url);
  const document = { getElementById: (id: string) => { reads++; assert.equal(id, 'tablelist_20'); return { rows: [header, row] }; } };
  runInNewContext(probeScript(nonce), { window, document, location: { href: url, hostname: u.hostname, pathname: u.pathname, protocol: u.protocol, origin: u.origin }, URL });
  return { messages, reads };
}
test('browser reader runs as standalone JavaScript and returns only bounded personal table values', () => {
  const r = runReader(FLIGHT_URL); assert.equal(r.reads, 1); assert.equal(r.messages.length, 1);
  const s = decodeProbe(r.messages[0]!, FLIGHT_URL, nonce, at); assert.deepEqual(s.rows[0]!.values, values);
});
test('reader never inspects login, unrelated document or iframe; changed columns produce explicit error', () => {
  for (const url of [LOGIN_URL, 'https://evil.test/member/profile/flightlog.php']) assert.deepEqual(runReader(url), { messages: [], reads: 0 });
  assert.deepEqual(runReader(FLIGHT_URL, false, true), { messages: [], reads: 0 });
  const r = runReader(FLIGHT_URL, true); assert.throws(() => decodeProbe(r.messages[0]!, FLIGHT_URL, nonce, at));
});

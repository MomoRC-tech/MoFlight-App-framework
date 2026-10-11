import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { decodeProbe, flightUrl, FLIGHT_URL, LOGIN_URL, probeScript, providerUrl, REQUIRED_HEADERS } from '../../apps/platform-lab/src/vereinsflieger/probe.ts';
import { inspectFields } from '../../apps/platform-lab/src/vereinsflieger/fields.ts';

const nonce = 'test-request-1', at = '2026-10-10T08:00:00.000Z';
const headers = ['', ...REQUIRED_HEADERS, 'Pilot', 'PIC', 'Begleiter/FI', 'Bemerkung'];
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
test('reader errors expose only allowlisted structural reasons and known missing column labels', () => {
  assert.throws(() => decodeProbe(message({ error: 'header-mismatch', missing: ['Datum', 'private-value'] }), FLIGHT_URL, nonce, at), /header-mismatch; missing: Datum\)/);
  assert.throws(() => decodeProbe(message({ error: 'private-value', missing: 'private-value' }), FLIGHT_URL, nonce, at), /unsupported-response\)/);
});
function runReader(url: string, changed = false, iframe = false, options: { hiddenHeader?: boolean; layout?: boolean; shortRow?: boolean; rowCount?: number; headers?: string[]; values?: string[] } = {}) {
  const messages: string[] = []; let reads = 0;
  const cell = (s: string) => ({ innerText: s });
  const header = { cells: (changed ? ['Changed'] : options.headers ?? headers).map(s => ({ innerText: options.hiddenHeader ? '' : s, textContent: s })), parentElement: { tagName: 'THEAD' }, querySelector: () => null };
  const row = { cells: (options.shortRow ? values.slice(1) : options.values ?? values).map(cell), parentElement: { tagName: 'TBODY' }, querySelector: () => ({}), querySelectorAll: () => [{ getAttribute: () => '/member/profile/detail.php?flid=12345' }] };
  const layout = { cells: [{ innerText: 'Synthetic list layout', colSpan: 99 }], parentElement: { tagName: 'TBODY' }, querySelector: () => ({}) };
  const window: Record<string, unknown> = { ReactNativeWebView: { postMessage: (s: string) => messages.push(s) } }; window.top = iframe ? {} : window;
  const u = new URL(url);
  const document = { getElementById: (id: string) => { reads++; assert.equal(id, 'tablelist_20'); return { rows: [header, ...Array.from({ length: options.rowCount ?? 1 }, () => row), ...(options.layout ? [layout] : [])] }; } };
  runInNewContext(probeScript(nonce), { window, document, location: { href: url, hostname: u.hostname, pathname: u.pathname, protocol: u.protocol, origin: u.origin }, URL });
  return { messages, reads };
}
test('browser reader runs as standalone JavaScript and returns only bounded personal table values', () => {
  const r = runReader(FLIGHT_URL); assert.equal(r.reads, 1); assert.equal(r.messages.length, 1);
  const s = decodeProbe(r.messages[0]!, FLIGHT_URL, nonce, at); assert.deepEqual(s.rows[0]!.values, values);
});
test('full-width layout rows do not count as flights; malformed and oversized flight lists fail closed', () => {
  const r = runReader(FLIGHT_URL, false, false, { layout: true, rowCount: 20 });
  assert.equal(decodeProbe(r.messages[0]!, FLIGHT_URL, nonce, at).rows.length, 20);
  for (const options of [{ shortRow: true }, { rowCount: 21, layout: true }]) {
    const rejected = runReader(FLIGHT_URL, false, false, options);
    assert.throws(() => decodeProbe(rejected.messages[0]!, FLIGHT_URL, nonce, at), /row-shape/);
  }
});
test('hidden original heading retains exact labels without reading hidden body text', () => {
  const r = runReader(FLIGHT_URL, false, false, { hiddenHeader: true });
  assert.deepEqual(decodeProbe(r.messages[0]!, FLIGHT_URL, nonce, at).headers, headers);
});
test('reader never inspects login, unrelated document or iframe; changed columns produce explicit error', () => {
  for (const url of [LOGIN_URL, 'https://evil.test/member/profile/flightlog.php']) assert.deepEqual(runReader(url), { messages: [], reads: 0 });
  assert.deepEqual(runReader(FLIGHT_URL, false, true), { messages: [], reads: 0 });
  const r = runReader(FLIGHT_URL, true); assert.throws(() => decodeProbe(r.messages[0]!, FLIGHT_URL, nonce, at));
});

// Observed default labels; all values below are invented, never copied from a pilot.
const defaultHeaders = ['', 'Datum', 'Lfz.', 'Pilot', 'Begleiter/FI', 'Start', 'Landung', 'Flugzeit', 'Startort', 'Landeort', 'Landungen', 'S.-Art', 'Flugart', 'Abr.', 'Verein', 'Bemerkung'];
const defaultValues = defaultHeaders.map(h => ({ Datum: '11.10.2026', 'Lfz.': 'D-TEST', Pilot: 'Synthetic student', Start: '10:00', Landung: '10:07', Flugzeit: '7', Landungen: '1' }[h] ?? ''));

test('standalone reader accepts observed default configuration without model/PIC and retains unknowns', () => {
  const r = runReader(FLIGHT_URL, false, false, { headers: defaultHeaders, values: defaultValues, hiddenHeader: true, layout: true });
  const snapshot = decodeProbe(r.messages[0]!, FLIGHT_URL, nonce, at);
  const fields = inspectFields(snapshot, snapshot.rows[0]!);
  assert.deepEqual(snapshot.headers, defaultHeaders);
  assert.equal(fields.model.state, 'not-captured'); assert.equal(fields.pic.state, 'not-captured');
  assert.equal(fields.aircraftType.state, 'not-captured'); assert.equal(fields.companion.state, 'blank');
  assert.deepEqual(fields.pilot, { state: 'value', label: 'Pilot', raw: 'Synthetic student' });
  assert.equal(snapshot.coverage, 'visible-personal-list-only'); assert.equal(snapshot.timeBasis, 'unknown');
});

test('reordered optional columns preserve distinct reported times, crew and duplicate evidence', () => {
  const originalHeaders = [...defaultHeaders, 'PIC', 'Dual-Time', 'PIC-Time', 'FI-Time', 'Duplikat', 'Blockzeit in Minuten', 'Luftfahrzeugart'];
  const originalValues = [...defaultValues, 'Synthetic instructor', '7', '0', '', 'Ja', '12', 'Reisemotorsegler'];
  const reorderedHeaders = [...originalHeaders].reverse(), reorderedValues = [...originalValues].reverse();
  const r = runReader(FLIGHT_URL, false, false, { headers: reorderedHeaders, values: reorderedValues });
  const snapshot = decodeProbe(r.messages[0]!, FLIGHT_URL, nonce, at);
  const mapped = inspectFields(snapshot, snapshot.rows[0]!);
  assert.deepEqual(mapped, inspectFields({ headers: originalHeaders }, { values: originalValues, sourceFlightId: '12345' }));
  assert.deepEqual(mapped.picTime, { state: 'value', label: 'PIC-Time', raw: '0' });
  assert.equal(mapped.instructorTime.state, 'blank');
  assert.deepEqual(mapped.flightDuration, { state: 'value', label: 'Flugzeit', raw: '7' });
  assert.deepEqual(mapped.blockMinutes, { state: 'value', label: 'Blockzeit in Minuten', raw: '12' });
  assert.deepEqual(mapped.duplicate, { state: 'value', label: 'Duplikat', raw: 'Ja' });
});

test('raw inspection preserves unresolved text and does not confuse whitespace, zero and absent columns', () => {
  const snapshot = { headers: ['Flugzeit', 'Motorzeit', 'PIC-Time', 'Landungen', 'Future provider field'] };
  const row = { values: ['corrected / unclear', '  ', '0', '3', 'keep original'], sourceFlightId: null };
  const before = JSON.stringify({ snapshot, row });
  const fields = inspectFields(snapshot, row);
  assert.deepEqual(fields.flightDuration, { state: 'value', label: 'Flugzeit', raw: 'corrected / unclear' });
  assert.deepEqual(fields.engineDuration, { state: 'blank', label: 'Motorzeit', raw: '  ' });
  assert.equal(fields.offBlock.state, 'not-captured');
  assert.deepEqual(fields.picTime, { state: 'value', label: 'PIC-Time', raw: '0' });
  assert.deepEqual(fields.landings, { state: 'value', label: 'Landungen', raw: '3' });
  assert.equal(JSON.stringify({ snapshot, row }), before);
});

test('ambiguous optional columns and lost cell positions cannot produce field associations', () => {
  assert.throws(() => inspectFields({ headers: ['PIC', 'PIC'] }, { values: ['A', 'B'], sourceFlightId: null }), /Ambiguous/);
  assert.throws(() => inspectFields({ headers: ['Pilot', 'PIC'] }, { values: ['A'], sourceFlightId: null }), /Ambiguous/);
});

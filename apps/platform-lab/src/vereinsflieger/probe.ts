// Read-only access probe. Raw provider fields are not yet canonical logbook flights.
export const LOGIN_URL = 'https://vereinsflieger.de/';
export const FLIGHT_URL = 'https://vereinsflieger.de/member/profile/flightlog.php';
export const REQUIRED_HEADERS = ['Datum', 'Lfz.-Muster', 'Lfz.', 'Pilot', 'PIC', 'Begleiter/FI', 'S.-Art', 'Flugart', 'Startort', 'Landeort', 'Start', 'Landung', 'Flugzeit'];
export const MAX_ROWS = 20;
export interface ProbeRow { values: string[]; sourceFlightId: string | null }
export interface ProbeSnapshot {
  captureId: string; retrievedAt: string; headers: string[]; rows: ProbeRow[];
  sourceIdentity: 'unverified'; coverage: 'visible-personal-list-only'; timeBasis: 'unknown';
}
export function providerUrl(value: string): boolean {
  try { const u = new URL(value); return u.protocol === 'https:' && ['vereinsflieger.de', 'www.vereinsflieger.de'].includes(u.hostname) && !u.username && !u.password && !u.port; }
  catch { return false; }
}
export function flightUrl(value: string): boolean {
  return providerUrl(value) && new URL(value).pathname === '/member/profile/flightlog.php';
}
export function decodeProbe(data: string, nativeUrl: string, nonce: string, retrievedAt: string): ProbeSnapshot {
  if (!flightUrl(nativeUrl) || data.length > 200_000) throw new Error('Rejected source page or oversized response.');
  const v: unknown = JSON.parse(data);
  if (!v || typeof v !== 'object') throw new Error('Invalid flight response.');
  const m = v as Record<string, unknown>;
  if (m.kind !== 'vf-probe-v1' || m.nonce !== nonce || typeof m.url !== 'string' || !flightUrl(m.url) || new URL(m.url).origin !== new URL(nativeUrl).origin) throw new Error('Rejected stale or unrelated response.');
  if (m.error) throw new Error('The personal flight table could not be read. Previous captures are preserved; sign in and check the default personal-list columns.');
  if (!Array.isArray(m.headers) || m.headers.length < REQUIRED_HEADERS.length || m.headers.length > 32 || !m.headers.every(h => typeof h === 'string' && h.length <= 80)) throw new Error('Unsupported flight table columns.');
  const headers = m.headers as string[];
  if (REQUIRED_HEADERS.some(h => !headers.includes(h)) || new Set(headers.filter(Boolean)).size !== headers.filter(Boolean).length) throw new Error('Required flight columns are missing or duplicated.');
  if (!Array.isArray(m.rows) || !m.rows.length || m.rows.length > MAX_ROWS) throw new Error('Expected a nonempty bounded personal list; no capture saved.');
  const rows: ProbeRow[] = m.rows.map((r: unknown) => {
    if (!r || typeof r !== 'object') throw new Error('Invalid flight row.');
    const row = r as Record<string, unknown>;
    if (!Array.isArray(row.values) || row.values.length !== headers.length || !row.values.every(x => typeof x === 'string' && x.length <= 512)) throw new Error('Changed or oversized flight row.');
    if (row.sourceFlightId !== null && (typeof row.sourceFlightId !== 'string' || !/^\d{1,20}$/.test(row.sourceFlightId))) throw new Error('Unsupported source reference.');
    const values = row.values as string[], date = values[headers.indexOf('Datum')]!;
    if (!/^(\d{1,2}\.\d{1,2}\.\d{4}|\d{4}-\d{2}-\d{2})$/.test(date)) throw new Error('Unsupported provider date format.');
    return { values, sourceFlightId: row.sourceFlightId as string | null };
  });
  return { captureId: nonce, retrievedAt, headers, rows, sourceIdentity: 'unverified', coverage: 'visible-personal-list-only', timeBasis: 'unknown' };
}
// Plain JavaScript source avoids bundler-dependent function.toString helpers.
// This reader executes in the inspected flight document only. No form,
// password, cookie, storage, fetch hook or arbitrary native command is accessed.
const readerSource = String.raw`function(nonce, required, limit) {
  if (window.top !== window || location.protocol !== 'https:' || !['vereinsflieger.de', 'www.vereinsflieger.de'].includes(location.hostname) || location.pathname !== '/member/profile/flightlog.php') return;
  const bridge = window.ReactNativeWebView;
  if (!bridge) return;
  const send = payload => bridge.postMessage(JSON.stringify({ kind: 'vf-probe-v1', nonce, url: location.href, ...payload }));
  const table = document.getElementById('tablelist_20');
  if (!table || !table.rows) { send({ error: 'table-missing' }); return; }
  const text = cell => (cell.innerText ?? '').replace(/\s+/g, ' ').trim();
  const headerRow = Array.from(table.rows).find(row => required.every(h => Array.from(row.cells).some(c => text(c) === h)));
  if (!headerRow) { send({ error: 'header-mismatch' }); return; }
  const headers = Array.from(headerRow.cells).map(text);
  const body = Array.from(table.rows).filter(row => row !== headerRow && row.parentElement?.tagName !== 'THEAD' && row.parentElement?.tagName !== 'TFOOT' && row.querySelector('td'));
  if (!body.length || body.length > limit || body.some(r => r.cells.length !== headers.length)) { send({ error: 'row-shape' }); return; }
  const rows = body.map(row => {
    let sourceFlightId = null;
    for (const link of Array.from(row.querySelectorAll('a[href]'))) {
      const u = new URL(link.getAttribute('href'), location.href);
      const id = u.searchParams.get('flid');
      if (u.origin === location.origin && id && /^\d{1,20}$/.test(id)) { sourceFlightId = id; break; }
    }
    return { values: Array.from(row.cells).map(text), sourceFlightId };
  });
  if (headers.some(h => h.length > 80) || rows.some(r => r.values.some(v => v.length > 512))) { send({ error: 'field-limit' }); return; }
  send({ headers, rows });
}`;
export function probeScript(nonce: string): string {
  return `(${readerSource})(${JSON.stringify(nonce)},${JSON.stringify(REQUIRED_HEADERS)},${MAX_ROWS});true;`;
}

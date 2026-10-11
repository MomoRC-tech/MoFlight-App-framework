// Read-only access probe. Raw provider fields are not yet canonical logbook flights.
export const LOGIN_URL = 'https://vereinsflieger.de/';
export const FLIGHT_URL = 'https://vereinsflieger.de/member/profile/flightlog.php';
// These anchors identify the bounded personal table, not a complete flight.
// Optional model/PIC/class/role-time columns must not block the observed default view.
export const REQUIRED_HEADERS = ['Datum', 'Lfz.', 'Start', 'Landung', 'Flugzeit'];
export const MAX_ROWS = 20;
export interface ProbeRow { values: string[]; sourceFlightId: string | null }
export interface ProbeSnapshot {
  captureId: string; retrievedAt: string; headers: string[]; rows: ProbeRow[];
  sourceIdentity: 'unverified'; coverage: 'visible-personal-list-only' | 'complete-requested-list'; timeBasis: 'unknown';
  exportContext?: { from: string; to: string; preset: string; participation: 'Pilot oder Fluglehrer'; accountLabel: string; recordCount: number; pageCount: number; columnIds: string[]; adapterVersion: 1 };
}
export function validateCapture(value: unknown): ProbeSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid saved capture.');
  const s = value as Record<string, unknown>;
  if (typeof s.captureId !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(s.captureId) ||
      typeof s.retrievedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(s.retrievedAt) ||
      !Number.isFinite(Date.parse(s.retrievedAt)) || new Date(s.retrievedAt).toISOString() !== s.retrievedAt ||
      s.sourceIdentity !== 'unverified' || !['visible-personal-list-only', 'complete-requested-list'].includes(String(s.coverage)) || s.timeBasis !== 'unknown') throw new Error('Unsupported saved capture metadata.');
  if (s.coverage === 'complete-requested-list') {
    const context = s.exportContext as ProbeSnapshot['exportContext'];
    const validDate = (d: unknown): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d;
    if (!context || !validDate(context.from) || !validDate(context.to) || context.from > context.to ||
        !['MoFlight App export filter', 'Flugbuch Export', 'Flugbuch export'].includes(context.preset) || context.participation !== 'Pilot oder Fluglehrer' ||
        typeof context.accountLabel !== 'string' || !context.accountLabel.trim() || context.accountLabel.length > 200 || context.adapterVersion !== 1 ||
        !Number.isSafeInteger(context.recordCount) || context.recordCount < 0 || context.recordCount > 20_000 ||
        !Number.isSafeInteger(context.pageCount) || context.pageCount < Math.max(1, Math.ceil(context.recordCount / 1000)) || context.pageCount > Math.max(1, context.recordCount)) throw new Error('Invalid saved export scope.');
    if (!Array.isArray(s.headers) || s.headers.length < 6 || s.headers.length > 128 || !s.headers.every(h => typeof h === 'string' && h.length <= 100)) throw new Error('Invalid saved export headers.');
    const headers = s.headers as string[];
    if (REQUIRED_HEADERS.some(h => !headers.includes(h)) || new Set(headers.filter(Boolean)).size !== headers.filter(Boolean).length ||
        !Array.isArray(context.columnIds) || context.columnIds.length !== headers.length || !context.columnIds.every(id => typeof id === 'string' && /^\d{1,4}$/.test(id)) || new Set(context.columnIds).size !== context.columnIds.length ||
        !Array.isArray(s.rows) || s.rows.length !== context.recordCount) throw new Error('Invalid saved export shape.');
    const ids = new Set<string>();
    const rows = s.rows.map(value => {
      const row = value as ProbeRow;
      if (!row || !Array.isArray(row.values) || row.values.length !== headers.length || !row.values.every(v => typeof v === 'string' && v.length <= 4096) || typeof row.sourceFlightId !== 'string' || !/^\d{1,20}$/.test(row.sourceFlightId) || ids.has(row.sourceFlightId)) throw new Error('Invalid saved export row.');
      const rawDate = row.values[headers.indexOf('Datum')]!, match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(rawDate);
      const date = match ? `${match[3]}-${match[2]}-${match[1]}` : rawDate;
      if (!validDate(date) || date < context.from || date > context.to) throw new Error('Invalid saved export date.');
      ids.add(row.sourceFlightId); return { values: [...row.values], sourceFlightId: row.sourceFlightId };
    });
    const result: ProbeSnapshot = { captureId: s.captureId, retrievedAt: s.retrievedAt, headers: [...headers], rows, sourceIdentity: 'unverified', coverage: 'complete-requested-list', timeBasis: 'unknown', exportContext: { from: context.from, to: context.to, preset: context.preset, participation: context.participation, accountLabel: context.accountLabel, recordCount: context.recordCount, pageCount: context.pageCount, columnIds: [...context.columnIds], adapterVersion: 1 } };
    if (JSON.stringify(result).length > 20_000_000) throw new Error('Oversized saved export.');
    return result;
  }
  // Reuse the live table contract; persisted JSON is also untrusted input.
  return decodeProbe(JSON.stringify({ kind: 'vf-probe-v1', nonce: s.captureId, url: FLIGHT_URL, headers: s.headers, rows: s.rows }), FLIGHT_URL, s.captureId, s.retrievedAt);
}
export function providerUrl(value: string): boolean {
  try { const u = new URL(value); return u.protocol === 'https:' && ['vereinsflieger.de', 'www.vereinsflieger.de'].includes(u.hostname) && !u.username && !u.password && !u.port; }
  catch { return false; }
}
export function flightUrl(value: string): boolean {
  return providerUrl(value) && new URL(value).pathname === '/member/profile/flightlog.php';
}
// Modern Android WebMessageListener supplies the sender origin, whereas the
// fallback Android bridge and iOS supply a document URL. Keep the independently
// observed top-level flight document mandatory in both cases.
export function bridgeSource(source: string, documentUrl: string): boolean {
  if (!flightUrl(documentUrl) || !providerUrl(source)) return false;
  const sender = new URL(source), document = new URL(documentUrl);
  return sender.origin === document.origin && (flightUrl(source) || (sender.pathname === '/' && !sender.search && !sender.hash));
}
export function decodeProbe(data: string, nativeUrl: string, nonce: string, retrievedAt: string, documentUrl = nativeUrl): ProbeSnapshot {
  if (!bridgeSource(nativeUrl, documentUrl) || data.length > 200_000) throw new Error('Rejected source page or oversized response.');
  const v: unknown = JSON.parse(data);
  if (!v || typeof v !== 'object') throw new Error('Invalid flight response.');
  const m = v as Record<string, unknown>;
  if (m.kind !== 'vf-probe-v1' || m.nonce !== nonce || typeof m.url !== 'string' || !flightUrl(m.url) || new URL(m.url).origin !== new URL(nativeUrl).origin) throw new Error('Rejected stale or unrelated response.');
  if (m.error) {
    const reason = ['table-missing', 'header-mismatch', 'row-shape', 'field-limit'].includes(String(m.error)) ? String(m.error) : 'unsupported-response';
    const suppliedMissing = m.missing;
    const missing = Array.isArray(suppliedMissing) ? REQUIRED_HEADERS.filter(h => suppliedMissing.includes(h)) : [];
    const shape = typeof m.shape === 'string' && /^[0-9a-z ,:;|=-]{1,300}$/.test(m.shape) ? '; ' + m.shape : '';
    throw new Error(`The personal flight table could not be read (${reason}${missing.length ? '; missing: ' + missing.join(', ') : ''}${shape}). Previous captures are preserved.`);
  }
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
  const heading = cell => (cell.textContent ?? cell.innerText ?? '').replace(/\s+/g, ' ').trim();
  const matches = row => required.every(h => Array.from(row.cells).some(c => heading(c) === h));
  const headerRow = Array.from(table.rows).find(matches);
  if (!headerRow) {
    const cells = Array.from(table.rows).filter(r => r.parentElement?.tagName === 'THEAD').flatMap(r => Array.from(r.cells)).map(heading);
    send({ error: 'header-mismatch', missing: required.filter(h => !cells.includes(h)) }); return;
  }
  const headers = Array.from(headerRow.cells).map(heading);
  // The observed list has a one-cell, colspan=99 layout row. It cannot be a
  // column-aligned flight row. All remaining rows still require exact widths.
  const body = Array.from(table.rows).filter(row => row !== headerRow && row.parentElement?.tagName !== 'THEAD' && row.parentElement?.tagName !== 'TFOOT' && row.querySelector('td') && !(row.cells.length === 1 && row.cells[0].colSpan >= headers.length));
  if (!body.length || body.length > limit || body.some(r => r.cells.length !== headers.length)) {
    const widths = Array.from(new Set(body.map(r => r.cells.length))).join(',');
    const spans = body.filter(r => Array.from(r.cells).some(c => c.colSpan > 1)).map(r => Array.from(r.cells).map(c => c.colSpan).join(',')).slice(0,3).join('|');
    send({ error: 'row-shape', shape: 'columns=' + headers.length + '; rows=' + body.length + '; widths=' + widths + '; spans=' + spans }); return;
  }
  const rows = body.map(row => {
    let sourceFlightId = null;
    for (const link of Array.from(row.querySelectorAll('a[href]'))) {
      const u = new URL(link.getAttribute('href'), location.href);
      const id = u.searchParams.get('flid');
      if (u.origin === location.origin && u.pathname === '/member/profile/viewflight.php' && Array.from(u.searchParams.keys()).length === 1 && !u.hash && id && /^\d{1,20}$/.test(id)) { sourceFlightId = id; break; }
    }
    return { values: Array.from(row.cells).map(text), sourceFlightId };
  });
  if (headers.some(h => h.length > 80) || rows.some(r => r.values.some(v => v.length > 512))) { send({ error: 'field-limit' }); return; }
  send({ headers, rows });
}`;
export function probeScript(nonce: string): string {
  return `(${readerSource})(${JSON.stringify(nonce)},${JSON.stringify(REQUIRED_HEADERS)},${MAX_ROWS});true;`;
}

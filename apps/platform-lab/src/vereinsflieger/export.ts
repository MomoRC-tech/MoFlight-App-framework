import { bridgeSource, flightUrl, REQUIRED_HEADERS, type ProbeRow, type ProbeSnapshot } from './probe';

export const EXPORT_PRESET = 'MoFlight App export filter';
export const PARTICIPATION = 'Pilot oder Fluglehrer';
export const EXPORT_PHASES = ['preset', 'columns', 'clear', 'save', 'participation', 'period', 'read'] as const;
export type ExportPhase = typeof EXPORT_PHASES[number];
export interface ExportRequest { from: string; to: string }
export interface ExportPage {
  headers: string[]; rows: ProbeRow[]; first: number; last: number; total: number;
  accountLabel: string; preset: string; columnIds: string[]; nextUrl: string | null;
}
export interface ExportRun {
  request: ExportRequest; phase: ExportPhase; preset: string | null; accountLabel: string | null;
  pages: ExportPage[]; steps: number; commands: number; seenFlightIds: Set<string>; sizeChars: number;
}
function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function beginExport(request: ExportRequest): ExportRun {
  if (!validDate(request.from) || !validDate(request.to) || request.from > request.to) throw new Error('Use valid inclusive dates in YYYY-MM-DD order.');
  return { request: { ...request }, phase: 'preset', preset: null, accountLabel: null, pages: [], steps: 0, commands: 0, seenFlightIds: new Set(), sizeChars: 0 };
}
export function calendarYearRequest(now = new Date()): ExportRequest {
  const year = now.getFullYear(); return { from: `${year}-01-01`, to: `${year}-12-31` };
}
export function providerDate(iso: string): string { const [year, month, day] = iso.split('-'); return `${day}.${month}.${year}`; }
function dateFromProvider(value: string): string {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : value;
}
function nextPageUrl(value: unknown, origin: string, page: number): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !flightUrl(value)) throw new Error('Invalid pagination link.');
  const u = new URL(value);
  if (u.origin !== origin || u.hash || [...u.searchParams.keys()].some(k => k !== 'page') || u.searchParams.getAll('page').length !== 1 || u.searchParams.get('page') !== String(page)) throw new Error('Unexpected pagination target.');
  return value;
}
// This decoder handles only responses to the current page-scoped native command.
// No raw payload, URL parameters or provider exception text is shown in errors.
export function acceptExportMessage(run: ExportRun, data: string, sender: string, documentUrl: string, token: string): { nextUrl?: string; complete?: ProbeSnapshot } {
  if (!bridgeSource(sender, documentUrl) || data.length > 2_000_000) throw new Error('Rejected export source or oversized page.');
  let m: Record<string, unknown>;
  try { m = JSON.parse(data) as Record<string, unknown>; } catch { throw new Error('Invalid export response.'); }
  if (!m || m.kind !== 'vf-export-v1' || m.token !== token || m.phase !== run.phase || typeof m.url !== 'string' || !flightUrl(m.url) || new URL(m.url).origin !== new URL(documentUrl).origin) throw new Error('Rejected stale export response.');
  if (m.error) throw new Error('Provider export configuration or page changed. Previous captures preserved.');
  if (typeof m.accountLabel !== 'string' || !m.accountLabel.trim() || m.accountLabel.length > 200) throw new Error('Signed-in account context unavailable.');
  if (run.accountLabel !== null && run.accountLabel !== m.accountLabel) throw new Error('Provider account changed during retrieval.');
  run.accountLabel = m.accountLabel;
  if (typeof m.preset !== 'string' || ![EXPORT_PRESET, 'Flugbuch Export', 'Flugbuch export'].includes(m.preset)) throw new Error('Export preset was not verified.');
  if (run.preset !== null && run.preset !== m.preset) throw new Error('Export preset changed during retrieval.');
  run.preset = m.preset;
  if (++run.steps > 4100) throw new Error('Export navigation limit reached. Narrow the date period.');
  if (m.status === 'next' && run.phase !== 'read') {
    run.phase = EXPORT_PHASES[EXPORT_PHASES.indexOf(run.phase) + 1]!; return {};
  }
  if (run.phase !== 'read' || m.status !== 'page' || m.period !== `ab ${providerDate(run.request.from)} bis ${providerDate(run.request.to)}` || m.participation !== PARTICIPATION || m.filtersClear !== true || m.allColumns !== true) throw new Error('Export scope was not verified.');
  if (!Array.isArray(m.headers) || m.headers.length < 6 || m.headers.length > 128 || !m.headers.every(h => typeof h === 'string' && h.length <= 100)) throw new Error('Unsupported export columns.');
  const headers = m.headers as string[];
  if (REQUIRED_HEADERS.some(h => !headers.includes(h)) || new Set(headers.filter(Boolean)).size !== headers.filter(Boolean).length) throw new Error('Unsupported export columns.');
  if (!Array.isArray(m.columnIds) || m.columnIds.length !== headers.length || !m.columnIds.every(x => typeof x === 'string' && /^\d{1,4}$/.test(x)) || new Set(m.columnIds).size !== m.columnIds.length) throw new Error('Ambiguous export column configuration.');
  if (!Array.isArray(m.rows) || m.rows.length > 1000 || ![m.first, m.last, m.total].every(n => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 && n <= 20_000)) throw new Error('Unsupported export page range.');
  const first = m.first as number, last = m.last as number, total = m.total as number;
  const previous = run.pages.at(-1);
  if (total === 0 ? first !== 0 || last !== 0 || m.rows.length !== 0 || !!previous : first !== (previous ? previous.last + 1 : 1) || last < first || last > total || last - first + 1 !== m.rows.length) throw new Error('Incomplete or repeated export page.');
  if (previous && (previous.total !== total || JSON.stringify(previous.headers) !== JSON.stringify(headers) || JSON.stringify(previous.columnIds) !== JSON.stringify(m.columnIds))) throw new Error('Export changed between pages.');
  const rows: ProbeRow[] = m.rows.map(value => {
    const r = value as ProbeRow;
    if (!r || !Array.isArray(r.values) || r.values.length !== headers.length || !r.values.every(v => typeof v === 'string' && v.length <= 4096) || typeof r.sourceFlightId !== 'string' || !/^\d{1,20}$/.test(r.sourceFlightId)) throw new Error('Invalid export flight row.');
    const date = dateFromProvider(r.values[headers.indexOf('Datum')]!);
    if (!validDate(date) || date < run.request.from || date > run.request.to) throw new Error('Flight outside the requested period.');
    return { values: [...r.values], sourceFlightId: r.sourceFlightId };
  });
  const ids = new Set<string>();
  for (const row of rows) { const id = row.sourceFlightId!; if (run.seenFlightIds.has(id) || ids.has(id)) throw new Error('Repeated flight reference across export rows.'); ids.add(id); }
  const nextUrl = nextPageUrl(m.nextUrl, new URL(documentUrl).origin, run.pages.length + 2);
  if ((last < total) !== (nextUrl !== null)) throw new Error('Pagination does not cover the reported record count.');
  const page: ExportPage = { headers, rows, first, last, total, accountLabel: run.accountLabel, preset: run.preset, columnIds: m.columnIds as string[], nextUrl };
  const pageSize = JSON.stringify(page).length;
  if (run.sizeChars + pageSize > 20_000_000) throw new Error('Export storage limit reached. Narrow the date period.');
  for (const id of ids) run.seenFlightIds.add(id);
  run.sizeChars += pageSize;
  run.pages.push(page);
  if (nextUrl) return { nextUrl };
  return { complete: { captureId: token, retrievedAt: new Date().toISOString(), headers, rows: run.pages.flatMap(p => p.rows), coverage: 'complete-requested-list', sourceIdentity: 'unverified', timeBasis: 'unknown', exportContext: { ...run.request, preset: run.preset, participation: PARTICIPATION, accountLabel: run.accountLabel, recordCount: total, pageCount: run.pages.length, columnIds: page.columnIds, adapterVersion: 1 } } };
}

// Standalone browser code: use the provider's observed DOM controls/submit handlers,
// never its private runtime objects, cookies, passwords or signed endpoint templates.
const driver = String.raw`function(token, phase, request, wantedPreset) {
  if (window.top !== window || location.protocol !== 'https:' || !['vereinsflieger.de','www.vereinsflieger.de'].includes(location.hostname) || location.pathname !== '/member/profile/flightlog.php') return;
  const bridge = window.ReactNativeWebView; if (!bridge) return;
  const clean = e => (e?.textContent || '').replace(/\s+/g,' ').trim();
  const q = s => document.querySelector(s);
  const all = s => Array.from(document.querySelectorAll(s));
  const quick = q('form[name="frm_tablelist_quickconfig"]');
  const select = quick?.querySelector('select[name="lst_configavailable"]');
  const options = select ? Array.from(select.options).filter(o => !o.disabled && !o.hidden) : [];
  const preset = wantedPreset || ['MoFlight App export filter','Flugbuch Export','Flugbuch export'].find(name => options.some(o => o.text === name)) || 'MoFlight App export filter';
  const account = q('#divpageheadermenu');
  const accountLabel = clean(account?.children[1]).replace(/^VEREINSFLIEGER\.DE\s*/, '').trim();
  const send = payload => bridge.postMessage(JSON.stringify({kind:'vf-export-v1',token,phase,url:location.href,preset,accountLabel,...payload}));
  const fail = () => send({error:'unsupported-provider-state'});
  const next = () => send({status:'next'});
  const click = e => { if (!e || e.disabled) throw new Error(); e.click(); };
  const safeForm = form => {
    if (!form || form.method.toLowerCase() !== 'post') throw new Error();
    const u = new URL(form.getAttribute('action') || location.href,location.href);
    if (u.origin !== location.origin || u.pathname !== location.pathname) throw new Error();
  };
  const columnLists = () => ({visible:all('#LST_VISIBLE > li'),available:all('#LST_AVAILABLE > li')});
  const presentation = e => ['150','151'].includes(e.getAttribute('value'));
  const filtersClear = () => {
    const form = q('#frmfilter'); if (!form) return false;
    const text = Array.from(form.querySelectorAll('input[type="text"]'));
    const boxes = Array.from(form.querySelectorAll('input[type="checkbox"]'));
    return text.every(e => !e.value.trim()) && boxes.every(e => e.checked) && all('#tablelist_20 thead .icon-filter').every(e => !clean(e));
  };
  try {
    if (!select || !accountLabel || !q('#tablelist_20')) throw new Error();
    if (phase === 'preset') {
      const found = options.find(o => o.text === preset);
      if (!found && clean(select.selectedOptions[0]) !== 'Konfiguration laden') {
        // Leave the verified user backup before changing any settings. The
        // provider remembers filter/date/sort changes under the active preset.
        const reset = options.find(o => o.value === '-1'); if (!reset) throw new Error();
        safeForm(quick); select.selectedIndex = Array.from(select.options).indexOf(reset); select.dispatchEvent(new Event('change',{bubbles:true})); return;
      }
      if (!found || clean(select.selectedOptions[0]) === preset) { next(); return; }
      safeForm(quick); select.value = found.value; select.dispatchEvent(new Event('change',{bubbles:true})); return;
    }
    const lists = columnLists();
    if (!lists.visible.length || lists.visible.length + lists.available.length > 128) throw new Error();
    if (phase === 'columns') {
      const add = lists.available.filter(e => !presentation(e)); const remove = lists.visible.filter(presentation);
      if (!add.length && !remove.length) { next(); return; }
      click(q('a[title="Liste konfigurieren"]')); click(q('#tableconfigtab_li_1'));
      for (const e of remove) { click(e); click(q('#btn_moveleft')); }
      for (const e of add) { click(e); click(q('#btn_moveright')); }
      const form = q('#lst_configure_visible')?.form; safeForm(form);
      click(form.querySelector('button[name="btnsubmit"][value="save"]')); return;
    }
    if (phase === 'clear') {
      if (filtersClear()) { next(); return; }
      const form = q('#frmfilter'); safeForm(form);
      for (const e of form.querySelectorAll('input[type="text"]')) e.value = '';
      for (const e of form.querySelectorAll('input[type="checkbox"]')) e.checked = true;
      click(form.querySelector('input[name="xsubmit"]')); return;
    }
    if (phase === 'save') {
      if (options.some(o => o.text === preset)) { next(); return; }
      if (preset !== 'MoFlight App export filter') throw new Error();
      click(q('a[title="Liste konfigurieren"]')); click(q('#tableconfigtab_li_2'));
      const input = q('#userlist_name'); const form = input?.form; safeForm(form);
      input.value = preset; input.dispatchEvent(new Event('keyup',{bubbles:true})); input.dispatchEvent(new Event('blur',{bubbles:true}));
      click(q('#btn_userlist_add')); return;
    }
    if (phase === 'participation') {
      if (clean(q('#globalfilter2')) === 'Pilot oder Fluglehrer') { next(); return; }
      const link = all('#menu_globalfilter2 a').find(e => clean(e) === 'Pilot oder Fluglehrer');
      const u = new URL(link?.getAttribute('href') || '',location.href);
      if (u.origin !== location.origin || u.pathname !== location.pathname) throw new Error(); click(link); return;
    }
    const german = iso => iso.split('-').reverse().join('.');
    const period = 'ab '+german(request.from)+' bis '+german(request.to);
    if (phase === 'period') {
      if (clean(q('#globalfilter')) === period) { next(); return; }
      const start = q('#startdate'), end = q('#enddate'), range = q('#daterange'), form = start?.form;
      safeForm(form); if (!end || end.form !== form || !range || range.form !== form) throw new Error();
      start.value = german(request.from); end.value = german(request.to); range.value = 'date';
      range.dispatchEvent(new Event('change',{bubbles:true})); click(form.querySelector('input[type="submit"]')); return;
    }
    if (phase !== 'read' || clean(select.selectedOptions[0]) !== preset) throw new Error();
    const table = q('#tablelist_20'), head = Array.from(table.rows).find(r => r.parentElement.tagName === 'THEAD' && Array.from(r.cells).some(c => clean(c) === 'Datum'));
    if (!head) throw new Error();
    const headers = Array.from(head.cells).map(clean);
    const rows = [];
    for (const row of Array.from(table.rows)) {
      if (row.parentElement.tagName === 'THEAD' || row.parentElement.tagName === 'TFOOT' || row === head) continue;
      if (row.cells.length === 1 && row.cells[0].colSpan >= headers.length) {
        if (/^row\d+$/.test(row.id)) throw new Error(); continue;
      }
      if (row.cells.length !== headers.length || !/^row\d+$/.test(row.id)) throw new Error();
      const rowId = row.id.slice(3); const ids = new Set();
      for (const link of row.querySelectorAll('a[href]')) {
        const u = new URL(link.getAttribute('href'),location.href);
        if (u.origin === location.origin && ['/member/profile/viewflight.php','/member/profile/editflight.php'].includes(u.pathname) && u.searchParams.has('flid')) ids.add(u.searchParams.get('flid'));
      }
      if (ids.size > 1 || (ids.size === 1 && !ids.has(rowId))) throw new Error();
      rows.push({sourceFlightId:rowId,values:Array.from(row.cells).map(c => (c.innerText || '').replace(/\s+/g,' ').trim())});
    }
    const footer = all('td.footer.f1').map(clean).find(t => /^Datensatz /.test(t));
    const match = /^Datensatz (\d+) bis (\d+) von (\d+)$/.exec(footer || '');
    const empty = rows.length === 0 && /Es wurden keine Daten gefunden/.test(clean(table));
    if (!match && !empty) throw new Error();
    const first = match ? Number(match[1]) : 0, last = match ? Number(match[2]) : 0, total = match ? Number(match[3]) : 0;
    const page = Number(new URL(location.href).searchParams.get('page') || '1');
    const nextLink = all('a.pagebrowser').find(e => clean(e) === String(page+1));
    const configured = columnLists();
    send({status:'page',headers,rows,first,last,total,period:clean(q('#globalfilter')),participation:clean(q('#globalfilter2')),filtersClear:filtersClear(),allColumns:configured.available.every(presentation) && !configured.visible.some(presentation) && configured.visible.length === headers.length && configured.visible.every((e,i) => (clean(e) === '[leer]' ? '' : clean(e).replace(/\s*\(Bezahlt\)/,'(Bezahlt)')) === headers[i].replace(/\s*\(Bezahlt\)/,'(Bezahlt)')),columnIds:configured.visible.map(e=>e.getAttribute('value')),nextUrl:last<total && nextLink ? new URL(nextLink.getAttribute('href'),location.href).href:null});
  } catch { fail(); }
}`;
export function exportScript(token: string, run: ExportRun): string {
  return `(${driver})(${JSON.stringify(token)},${JSON.stringify(run.phase)},${JSON.stringify(run.request)},${JSON.stringify(run.preset)});true;`;
}

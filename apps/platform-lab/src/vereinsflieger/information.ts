import { providerUrl } from './probe';

/** Source observations only. No canonical flights, credits or stable-identity attestation. */
export const INFORMATION_TYPES = {
  'work-hours': { title: 'Arbeitsstunden', required: ['date', 'activity', 'hours', 'status'], fields: { date: ['Datum'], activity: ['Tätigkeit'], hours: ['Stunden'], category: ['Kategorie'], status: ['Status'] } },
  'work-summary': { title: 'Arbeitsstunden · Jahresübersicht', required: ['period', 'obligation', 'performed', 'hours'], fields: { period: ['Zeitraum'], obligation: ['Pflicht'], performed: ['Geleistet'], hours: ['Geleistet Stunden'] } },
  duties: { title: 'Dienste', required: ['duty', 'period', 'people'], fields: { duty: ['Dienst'], exchange: ['Diensttausch'], period: ['Zeitraum'], people: ['Person(en)'], plan: ['Dienstplan von'] } },
  invoices: { title: 'Abrechnungen', required: ['number', 'date', 'title', 'amount'], fields: { number: ['Nr.'], date: ['Rechnungsdatum'], title: ['Titel'], delivery: ['Versendeart', 'Versandart'], sent: ['Versendet'], amount: ['Betrag (EUR)'], directDebit: ['Lastschrift'] } },
  ledger: { title: 'Mitgliedskonto', required: ['date', 'booking', 'information', 'value', 'balance'], fields: { date: ['Datum'], booking: ['BuchungsNr.', 'Buchungsnr.'], invoice: ['Abrechnung'], information: ['Informationen'], value: ['Wert (EUR)'], balance: ['Saldo (EUR)'] } },
  tasks: { title: 'Eigene offene Aufgaben', required: ['title', 'due', 'status'], fields: { title: ['Titel'], due: ['Zu erledigen bis'], days: ['Anzahl Tage'], status: ['Status'], priority: ['Priorität'] } },
  medical: { title: 'Medical · Quellenangaben', required: ['kind', 'expiry'], fields: { kind: ['Medical-Art'], expiry: ['Gültig bis · Originaltext'] } },
  enrolments: { title: 'Ausbildung · Übersicht', required: ['syllabus', 'begun', 'ended'], fields: { syllabus: ['Lehrplan'], begun: ['Begonnen am'], ended: ['Beendet am'], reported: ['Gemeldet Verband', 'Gemeldet an Verband'], practical: ['Fortschritt (Praxis)'], theory: ['Fortschritt (Theorie)'] } },
  practical: { title: 'Praktische Ausbildung', required: ['number', 'status', 'objective', 'landings', 'block'], fields: { number: ['No', 'No.'], status: ['Status'], objective: ['Lernziel'], instructorBegun: ['Fluglehrer (Begonnen)'], begun: ['Begonnen am'], instructorEnded: ['Fluglehrer (Beendet)'], ended: ['Beendet am'], landings: ['Landungen'], block: ['Blockzeit'] } },
  theory: { title: 'Theoretische Ausbildung', required: ['number', 'status', 'objective'], fields: { number: ['No', 'No.'], status: ['Status'], objective: ['Lernziel'], instructorBegun: ['Fluglehrer (Begonnen)'], begun: ['Begonnen am'], instructorEnded: ['Fluglehrer (Beendet)'], ended: ['Beendet am'], duration: ['Dauer', 'Zeit'] } },
} as const;
export type InformationCategory = keyof typeof INFORMATION_TYPES;
export const informationCategories = Object.keys(INFORMATION_TYPES) as InformationCategory[];
export interface InformationPage {
  category: InformationCategory; path: string;
  columns: { key: string; label: string; index: number }[];
  rows: { position: number; values: string[] }[];
  filters: string[];
  empty: boolean;
  coverage: { kind: 'visible-page'; truncated: boolean; pagination: 'unverified' };
}
export interface InformationCapture extends InformationPage {
  version: 1; id: string; retrievedAt: string; owner: string; connectionId: string;
  sourceIdentity: 'provisional-observed-profile';
}
export const normalizedLabel = (s: string) => s.replace(/\s+/g, ' ').trim();
/** Bounded local development evidence for unsupported source selection. */
export function informationRouteShape(value: string) {
  if (!providerUrl(value)) return null;
  const u = new URL(value);
  return { path: u.pathname.slice(0, 160).replace(/\d+/g, '#'), queryKeys: [...new Set(u.searchParams.keys())].slice(0, 24).map(k => /^[a-z_]{1,40}$/i.test(k) ? k : '(other)') };
}
export function informationUrl(value: string): boolean {
  if (!providerUrl(value)) return false;
  const u = new URL(value);
  // Observed own-account navigation, 19 October 2026. caid remains an opaque
  // source selector, not an attested owner ID. Never allow it on another route.
  // Path-only is needed to validate persisted captures, which omit query values.
  if (u.pathname === '/member/profile/account.php') return !u.hash &&
    (!u.search || u.searchParams.size === 1 && u.searchParams.has('caid'));
  if (u.pathname === '/member/community/tasklist/tasklist') return !u.hash &&
    (!u.search || u.searchParams.size === 1 && u.searchParams.has('gselect'));
  return !u.hash && u.pathname.startsWith('/member/') &&
    !/(?:logout|password|download|print|delete|remove|save|upload|config)/i.test(u.pathname) &&
    (!/\/edit/i.test(u.pathname) || /^\/member\/profile\/usereducation\/editelid[pt]$/.test(u.pathname)) &&
    [...u.searchParams.keys()].every(k => /^(?:year|y|page|p|start|offset|limit|sort|dir|period|filter|view|ueid|id|status|type|plan|from|to)$/.test(k));
}
export function informationCategoryUrl(category: InformationCategory, url: string) {
  if (!informationUrl(url)) return false;
  const path = new URL(url).pathname.replace(/\/$/, '');
  const known: Partial<Record<InformationCategory, readonly string[]>> = {
    ledger: ['/member/profile/account.php'],
    tasks: ['/member/community/tasklist/tasklist'],
    medical: ['/member/profile/viewprofile'], 'work-summary': ['/member/profile/viewprofile'],
    duties: ['/member/profile/myservices.php', '/member/profile/allservicelist.php', '/member/community/serviceshedulelist.php'],
    enrolments: ['/member/profile/usereducation'], practical: ['/member/profile/usereducation/editelidp'], theory: ['/member/profile/usereducation/editelidt'],
  };
  return !known[category] || known[category]!.includes(path);
}
function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('Invalid information object');
  return v as Record<string, unknown>;
}
function exact(v: Record<string, unknown>, keys: string[]) {
  if (Object.keys(v).some(k => !keys.includes(k)) || keys.some(k => !Object.hasOwn(v, k))) throw new Error('Unsupported information fields');
}
export function validateInformationPage(input: unknown): InformationPage {
  const p = object(input); exact(p, ['category', 'path', 'columns', 'rows', 'filters', 'empty', 'coverage']);
  if (typeof p.category !== 'string' || !Object.hasOwn(INFORMATION_TYPES, p.category)) throw new Error('Unsupported information category');
  const category = p.category as InformationCategory, config = INFORMATION_TYPES[category];
  if (typeof p.path !== 'string' || p.path.includes('?') || !informationCategoryUrl(category, 'https://vereinsflieger.de' + p.path) || !Array.isArray(p.columns) || !p.columns.length || p.columns.length > 16) throw new Error('Invalid information source');
  const fields = config.fields as Record<string, readonly string[]>;
  const keys = new Set<string>(); let lastIndex = -1;
  const columns = p.columns.map(value => {
    const c = object(value); exact(c, ['key', 'label', 'index']);
    if (typeof c.key !== 'string' || !Object.hasOwn(fields, c.key) || keys.has(c.key) || typeof c.label !== 'string' || c.label.length > 256 || !fields[c.key]!.includes(normalizedLabel(c.label)) || typeof c.index !== 'number' || !Number.isSafeInteger(c.index) || c.index <= lastIndex || c.index > 127) throw new Error('Invalid information column');
    keys.add(c.key); lastIndex = c.index; return { key: c.key, label: c.label, index: c.index };
  });
  if (config.required.some(k => !keys.has(k)) || !Array.isArray(p.rows) || p.rows.length > 20 || typeof p.empty !== 'boolean' || p.empty !== !p.rows.length) throw new Error('Missing information anchors');
  let lastPosition = -1;
  const rows = p.rows.map(value => {
    const r = object(value); exact(r, ['position', 'values']);
    if (typeof r.position !== 'number' || !Number.isSafeInteger(r.position) || r.position <= lastPosition || r.position > 100_000 || !Array.isArray(r.values) || r.values.length !== columns.length || r.values.some(s => typeof s !== 'string' || s.length > 8192)) throw new Error('Invalid information row');
    lastPosition = r.position; return { position: r.position, values: [...r.values] as string[] };
  });
  if (!Array.isArray(p.filters) || p.filters.length > 8 || p.filters.some(s => typeof s !== 'string' || !/^(?:\d{4}|Jahr \d{4}|Aktuelle und anstehende Dienste|Alle Dienste|Alle anstehenden Dienste|Meine nicht beendeten Aufgaben)$/.test(s))) throw new Error('Invalid information filter');
  if (category === 'tasks' && (p.filters.length !== 1 || p.filters[0] !== 'Meine nicht beendeten Aufgaben')) throw new Error('Unverified own task scope');
  const c = object(p.coverage); exact(c, ['kind', 'truncated', 'pagination']);
  if (c.kind !== 'visible-page' || typeof c.truncated !== 'boolean' || c.pagination !== 'unverified') throw new Error('Unsupported information coverage');
  return { category, path: p.path, columns, rows, filters: [...p.filters] as string[], empty: p.empty, coverage: { kind: 'visible-page', truncated: c.truncated, pagination: 'unverified' } };
}
export function validateInformationCapture(input: unknown): InformationCapture {
  const p = object(input); exact(p, ['version', 'id', 'retrievedAt', 'owner', 'connectionId', 'sourceIdentity', 'category', 'path', 'columns', 'rows', 'filters', 'empty', 'coverage']);
  if (p.version !== 1 || p.sourceIdentity !== 'provisional-observed-profile' || ['id', 'owner', 'connectionId'].some(k => typeof p[k] !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(p[k] as string)) || typeof p.retrievedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(p.retrievedAt) || !Number.isFinite(Date.parse(p.retrievedAt)) || new Date(p.retrievedAt).toISOString() !== p.retrievedAt) throw new Error('Invalid information identity');
  const { version: _version, id: _id, retrievedAt: _time, owner: _owner, connectionId: _connection, sourceIdentity: _identity, ...page } = p;
  return { ...validateInformationPage(page), version: 1, id: p.id as string, retrievedAt: p.retrievedAt, owner: p.owner as string, connectionId: p.connectionId as string, sourceIdentity: 'provisional-observed-profile' };
}

// Explicit read only: no requests, navigation, form values, document downloads,
// cookies, storage, full-page HTML/text or unknown columns. Limits are page bounds.
export const INFORMATION_READER_SOURCE = String.raw`(category, config) => {
  const norm = s => String(s || '').replace(/\s+/g,' ').trim();
  const u = new URL(location.href);
  if (window.top !== window || u.protocol !== 'https:' || !['vereinsflieger.de','www.vereinsflieger.de'].includes(u.hostname) || !u.pathname.startsWith('/member/') || u.username || u.password || u.port || u.hash || document.querySelector('input[name="pwinput"]')) return {error:'source-unavailable'};
  // Native source diagnostic identified the selected-filter label exactly.
  const taskFilter = category === 'tasks' ? norm(document.getElementById?.('globalfiltertime')?.innerText) : '';
  if (category === 'tasks' && taskFilter !== 'Meine nicht beendeten Aufgaben') return {error:'task-scope-unverified'};
  const columnsFor = cells => {
    const cols = []; const seen = new Set();
    for (let index=0;index<cells.length;index++) {
      const label = cells[index].textContent || '';
      for (const [key, names] of Object.entries(config.fields)) if (names.includes(norm(label))) {
        if (seen.has(key)) throw new Error('duplicate-column');
        seen.add(key); cols.push({key,label,index});
      }
    }
    return config.required.every(k=>seen.has(k)) ? cols : null;
  };
  let columns, rows=[], empty=false, truncated=false;
  if (category === 'medical') {
    const candidates=[];
    for (const table of document.querySelectorAll('table')) {
      let active=false; const selected=[];
      for (const row of Array.from(table.rows || [])) {
        const cells=Array.from(row.cells); const label=norm(cells[0]?.textContent);
        if (label==='Medical') {active=true;continue;}
        if (active && (cells.some(c=>c.querySelector('table')) || label==='Dokumente' || row.querySelector('th'))) {active=false;continue;}
        if (active && ['Klasse 1','Klasse 2','LAPL'].includes(label)) {
          if(cells.length!==2) return {error:'row-shape'};
          selected.push({position:selected.length,values:[cells[0].textContent || '',cells[1].innerText ?? cells[1].textContent ?? '']});
        }
      }
      if(selected.length) candidates.push(selected);
    }
    if(candidates.length!==1) return {error:'medical-source-unverified'};
    rows=candidates[0]; columns=[{key:'kind',label:'Medical-Art',index:0},{key:'expiry',label:'Gültig bis · Originaltext',index:1}];
  } else {
    const candidates=[];
    for(const table of document.querySelectorAll('table')) {
      const all=Array.from(table.rows || []);
      for(let i=0;i<Math.min(all.length,12);i++) {
        const cells=Array.from(all[i].cells);
        if(cells.some(c=>c.querySelector('table'))) continue;
        let cols; try { cols=columnsFor(cells); } catch { return {error:'duplicate-column'}; }
        if(cols) candidates.push({table,all,header:i,width:cells.length,cols});
      }
    }
    if(candidates.length!==1) return {error:'source-table-unverified',shape:Array.from(document.querySelectorAll('table')).slice(0,12).map(t=>Array.from(t.rows || []).slice(0,6).map(r=>r.cells.length).join(',')).join(';').slice(0,240)};
    const t=candidates[0]; columns=t.cols;
    if(t.all.length>10000) return {error:'source-limit'};
    for(let i=t.header+1;i<t.all.length;i++) {
      const cells=Array.from(t.all[i].cells);
      const first=norm(cells[0]?.textContent);
      if(cells.length===1 && /^(?:Es wurden keine (?:passenden )?Daten gefunden!)$/.test(first)) {empty=true;continue;}
      if(cells.some(c=>c.querySelector('th')) || t.all[i].querySelector('th')) continue;
      // The observed duty Person(en) cell contains a nested assignee table.
      // Keep that allowlisted cell as one raw value; never flatten its rows.
      if(columns.some(c=>cells[c.index]?.querySelector('table') && !(category==='duties' && c.key==='people'))) return {error:'nested-source-row'};
      // Explicit totals stay out of source records; never count them as hours/costs.
      if(cells.some(c=>/^Gesamt\b/.test(norm(c.textContent)))) continue;
      if(cells.length!==t.width || cells.some(c=>(c.colSpan || 1)!==1 || (c.rowSpan || 1)!==1)) return {error:'row-shape'};
      if(rows.length===20) {truncated=true;break;}
      rows.push({position:i,values:columns.map(c=>cells[c.index].innerText ?? cells[c.index].textContent ?? '')});
    }
    if(category==='tasks' && !rows.length && !empty && t.header===0 && t.all.length===1) {
      // Observed 19 October: this list's empty message is in its paired footer,
      // outside the header table. A marker elsewhere never establishes empty.
      const parent=t.table.parentElement, footer=t.table.nextElementSibling;
      const cells=Array.from(footer?.rows?.[0]?.cells || []);
      if(/^tablelist_\d+$/.test(t.table.id || '') && parent?.tagName==='DIV' && /^div\d+$/.test(parent.id || '') && parent.children.length===2 && parent.children[0]===t.table && parent.children[1]===footer && footer?.tagName==='TABLE' && footer.rows.length===1 && cells.length===2 && norm(cells[0].innerText)==='Es wurden keine passenden Daten gefunden!' && !norm(cells[1].innerText) && cells.every(c=>(c.colSpan || 1)===1 && (c.rowSpan || 1)===1 && !c.querySelector('table,input,button,select'))) empty=true;
    }
    if(!rows.length && !empty) return {error:'empty-scope-unverified'};
    if(rows.length && empty) return {error:'conflicting-empty-state'};
  }
  const filters=taskFilter ? [taskFilter] : [];
  for(const s of document.querySelectorAll('select')) {
    const text=norm(s.selectedOptions?.[0]?.textContent);
    if(/^(?:\d{4}|Jahr \d{4}|Aktuelle und anstehende Dienste|Alle Dienste|Alle anstehenden Dienste)$/.test(text) && !filters.includes(text)) filters.push(text);
  }
  const displayedFilter=norm(document.getElementById?.('globalfilter')?.innerText);
  if(/^(?:\d{4}|Jahr \d{4}|Aktuelle und anstehende Dienste|Alle Dienste|Alle anstehenden Dienste)$/.test(displayedFilter) && !filters.includes(displayedFilter)) filters.push(displayedFilter);
  return {category,path:u.pathname,columns,rows,filters,empty:!rows.length,coverage:{kind:'visible-page',truncated,pagination:'unverified'}};
}`;
export function informationScript(category: InformationCategory, nonce: string) {
  return `try { window.ReactNativeWebView?.postMessage(JSON.stringify({kind:'vf-information-v1',nonce:${JSON.stringify(nonce)},url:location.href,page:(${INFORMATION_READER_SOURCE})(${JSON.stringify(category)},${JSON.stringify(INFORMATION_TYPES[category])})})); } catch { window.ReactNativeWebView?.postMessage(JSON.stringify({kind:'vf-information-v1',nonce:${JSON.stringify(nonce)},url:location.href,page:{error:'unsupported-source'}})); } true;`;
}

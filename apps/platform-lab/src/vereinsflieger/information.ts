import { providerUrl } from './probe';

/** Source observations only. No canonical flights, credits or stable-identity attestation. */
export const INFORMATION_TYPES = {
  'work-hours': { title: 'Arbeitsstunden', required: ['date', 'activity', 'hours', 'status'], fields: { date: ['Datum'], activity: ['Tätigkeit'], hours: ['Stunden'], category: ['Kategorie'], status: ['Status'] } },
  'work-summary': { title: 'Arbeitsstunden · Jahresübersicht', required: ['period', 'obligation', 'performed', 'hours'], fields: { period: ['Zeitraum'], obligation: ['Pflicht'], performed: ['Geleistet'], hours: ['Geleistet Stunden'] } },
  duties: { title: 'Dienste', required: ['duty', 'period', 'people'], fields: { duty: ['Dienst'], exchange: ['Diensttausch'], period: ['Zeitraum'], people: ['Person(en)'], plan: ['Dienstplan von'] } },
  invoices: { title: 'Abrechnungen', required: ['number', 'date', 'title', 'amount'], fields: { number: ['Nr.'], date: ['Rechnungsdatum'], title: ['Titel'], delivery: ['Versendeart', 'Versandart'], sent: ['Versendet'], amount: ['Betrag (EUR)'], directDebit: ['Lastschrift'] } },
  ledger: { title: 'Mitgliedskonto', required: ['date', 'booking', 'information', 'value', 'balance'], fields: { date: ['Datum'], booking: ['BuchungsNr.', 'Buchungsnr.'], invoice: ['Abrechnung'], information: ['Informationen'], value: ['Wert (EUR)'], balance: ['Saldo (EUR)'] } },
  tasks: { title: 'Eigene offene Aufgaben', required: ['title', 'due', 'status'], fields: { title: ['Titel'], due: ['Zu erledigen bis'], days: ['Anzahl Tage'], status: ['Status'], priority: ['Priorität'] } },
  'document-notices': { title: 'Dokumentenhinweise', required: ['notice'], fields: { notice: ['Hinweis · Originaltext'] } },
  news: { title: 'News · Übersicht', required: ['notice'], fields: { notice: ['Hinweis · Originaltext'] } },
  'own-reservations': { title: 'Eigene Reservierungen · Übersicht', required: ['notice'], fields: { notice: ['Hinweis · Originaltext'] } },
  events: { title: 'Termine · Quellenliste', required: ['date', 'time', 'kind', 'info'], fields: { date: ['Datum'], time: ['Zeit'], kind: ['Kategorie'], info: ['Info · Titel/Ort'] } },
  'own-profile': { title: 'Profil · Grunddaten', required: ['field', 'value'], fields: { field: ['Profilfeld'], value: ['Originaltext'] } },
  'licence-metadata': { title: 'Lizenzen · Quellenangaben', required: ['kind', 'field', 'value'], fields: { kind: ['Lizenzgruppe'], field: ['Quellenfeld'], value: ['Originaltext'] } },
  medical: { title: 'Medical · Quellenangaben', required: ['kind', 'expiry'], fields: { kind: ['Medical-Art'], expiry: ['Gültig bis · Originaltext'] } },
  'training-summary': { title: 'Ausbildungsstand · Zusammenfassung', required: ['group', 'field', 'unit', 'value'], fields: { group: ['Ausbildungsbereich'], field: ['Quellenfeld'], unit: ['Quelleneinheit'], value: ['Originaltext'] } },
  enrolments: { title: 'Ausbildung · Übersicht', required: ['syllabus', 'begun', 'ended'], fields: { syllabus: ['Lehrplan'], begun: ['Begonnen am'], ended: ['Beendet am'], reported: ['Gemeldet Verband', 'Gemeldet an Verband'], practical: ['Fortschritt (Praxis)'], theory: ['Fortschritt (Theorie)'] } },
  practical: { title: 'Praktische Ausbildung', required: ['number', 'status', 'objective', 'landings', 'block'], fields: { number: ['No', 'No.'], status: ['Status'], objective: ['Lernziel'], instructorBegun: ['Fluglehrer (Begonnen)'], begun: ['Begonnen am'], instructorEnded: ['Fluglehrer (Beendet)'], ended: ['Beendet am'], landings: ['Landungen'], block: ['Blockzeit'] } },
  theory: { title: 'Theoretische Ausbildung', required: ['number', 'status', 'objective'], fields: { number: ['No', 'No.'], status: ['Status'], objective: ['Lernziel'], instructorBegun: ['Fluglehrer (Begonnen)'], begun: ['Begonnen am'], instructorEnded: ['Fluglehrer (Beendet)'], ended: ['Beendet am'], duration: ['Dauer', 'Zeit'] } },
} as const;
export type InformationCategory = keyof typeof INFORMATION_TYPES;
export const informationCategories = Object.keys(INFORMATION_TYPES) as InformationCategory[];
/** Loaded-page bounds; neither a provider-page count nor a completeness claim. */
export const informationRowLimit = (category: InformationCategory) => category === 'practical' ? 100 : 20;
const trainingGroups = ['Praktische Ausbildung', 'Theoretische Ausbildung'] as const;
const trainingCountFields = ['Lernziele beendet', 'Lernziele begonnen', 'Lernziele nicht begonnen'] as const;
export const eventViews = ['1 Tag', '1 Woche', '2 Wochen', '3 Wochen', '4 Wochen', '3 Monate', '6 Monate', '1 Jahr'] as const;
function sourceDate(value: string) {
  if (!/^\d{2}\.\d{2}\.(?:19|20|21)\d{2}$/.test(value)) return false;
  const [day, month, year] = value.split('.').map(Number);
  const d = new Date(Date.UTC(year!, month! - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month! - 1 && d.getUTCDate() === day;
}
function eventInfo(value: string) {
  const lines = value.split(/\r?\n/).map(normalizedLabel).filter(Boolean);
  return lines.length >= 1 && lines.length <= 2 && !/^Ort:/.test(lines[0]!) && lines[0]!.length <= 1024 && (lines.length === 1 || /^Ort:\s+\S/.test(lines[1]!) && lines[1]!.length <= 512);
}
export function eventSelectionFilters(input: unknown): string[] {
  const p = object(input); exact(p, ['date', 'view']);
  if (typeof p.date !== 'string' || !sourceDate(p.date) || typeof p.view !== 'string' || !(eventViews as readonly string[]).includes(p.view)) throw new Error('Unverified event selection');
  return ['Quellkategorie: Termine', 'Ab ' + p.date, 'Ansicht: ' + p.view];
}
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
export interface InformationHistory {
  category: InformationCategory; index: number; total: number; capture: InformationCapture | null;
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
  if (u.pathname === '/member/profile/usereducation/summaryueid') return !u.hash &&
    (!u.search || u.searchParams.size === 1 && u.searchParams.has('ueid'));
  if (u.pathname === '/member/overview/overview') return !u.hash && !u.search;
  if (u.pathname === '/member/community/appointment/') return !u.hash &&
    (!u.search || u.searchParams.size === 1 && (u.searchParams.has('weekCount') || u.searchParams.has('date')));
  return !u.hash && u.pathname.startsWith('/member/') &&
    !/(?:logout|password|download|print|delete|remove|save|upload|config)/i.test(u.pathname) &&
    (!/\/edit/i.test(u.pathname) || /^\/member\/profile\/usereducation\/editelid[pt]$/.test(u.pathname)) &&
    [...u.searchParams.keys()].every(k => /^(?:year|y|page|p|start|offset|limit|sort|dir|period|filter|view|ueid|id|status|type|plan|from|to)$/.test(k));
}
export function informationCategoryUrl(category: InformationCategory, url: string) {
  if (!informationUrl(url)) return false;
  if (['own-profile', 'licence-metadata'].includes(category) && new URL(url).search) return false;
  const rawPath = new URL(url).pathname;
  const path = ['ledger', 'tasks', 'document-notices', 'news', 'own-reservations', 'own-profile', 'licence-metadata', 'events', 'training-summary'].includes(category) ? rawPath : rawPath.replace(/\/$/, '');
  const known: Partial<Record<InformationCategory, readonly string[]>> = {
    'training-summary': ['/member/profile/usereducation/summaryueid'],
    ledger: ['/member/profile/account.php'],
    tasks: ['/member/community/tasklist/tasklist'],
    events: ['/member/community/appointment/'],
    'document-notices': ['/member/overview/overview'], news: ['/member/overview/overview'], 'own-reservations': ['/member/overview/overview'],
    medical: ['/member/profile/viewprofile'], 'work-summary': ['/member/profile/viewprofile'],
    'own-profile': ['/member/profile/viewprofile'],
    'licence-metadata': ['/member/profile/viewprofile'],
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
  if (config.required.some(k => !keys.has(k)) || !Array.isArray(p.rows) || p.rows.length > informationRowLimit(category) || typeof p.empty !== 'boolean' || p.empty !== !p.rows.length) throw new Error('Missing information anchors');
  if ((category === 'news' || category === 'own-reservations') && !p.empty || category === 'document-notices' && p.empty) throw new Error('Unsupported overview state');
  if (category === 'events' && p.empty) throw new Error('Unverified empty event source');
  let lastPosition = -1;
  const rows = p.rows.map(value => {
    const r = object(value); exact(r, ['position', 'values']);
    if (typeof r.position !== 'number' || !Number.isSafeInteger(r.position) || r.position <= lastPosition || r.position > 100_000 || !Array.isArray(r.values) || r.values.length !== columns.length || r.values.some(s => typeof s !== 'string' || s.length > 8192)) throw new Error('Invalid information row');
    lastPosition = r.position; return { position: r.position, values: [...r.values] as string[] };
  });
  if (category === 'own-profile' && (columns[0]?.key !== 'field' || columns[1]?.key !== 'value' || rows.length !== 3 || new Set(rows.map(r => normalizedLabel(r.values[0]!))).size !== 3 || rows.some(r => !['Vorname', 'Nachname', 'Benutzernummer'].includes(normalizedLabel(r.values[0]!))))) throw new Error('Unsupported profile fields');
  if (category === 'licence-metadata') {
    if (columns.map(c => c.key).join(',') !== 'kind,field,value' || !rows.length) throw new Error('Unsupported licence fields');
    const groups = new Map<string, Set<string>>();
    for (const r of rows) {
      const kind = normalizedLabel(r.values[0]!), field = normalizedLabel(r.values[1]!);
      if (!kind || kind.length > 200 || !['Lizenz', 'Klassenberechtigung (Segelflugzeuge)'].includes(field)) throw new Error('Unsupported licence field');
      const fields = groups.get(kind) ?? new Set<string>();
      if (fields.has(field)) throw new Error('Duplicate licence field'); fields.add(field); groups.set(kind, fields);
    }
    if ([...groups.values()].some(fields => fields.size !== 2)) throw new Error('Incomplete licence group');
  }
  if (category === 'training-summary') {
    if (columns.map(c => c.key).join(',') !== 'group,field,unit,value' || rows.length !== 7) throw new Error('Unsupported training summary fields');
    const seen = new Set<string>();
    for (const r of rows) {
      const [group, field, unit] = r.values.map(normalizedLabel);
      const count = (trainingCountFields as readonly string[]).includes(field!);
      if (!(trainingGroups as readonly string[]).includes(group!) || !(count && unit === 'Anzahl' || group === trainingGroups[1] && field === 'Theoriestunden' && unit === 'Zeit')) throw new Error('Unsupported training summary field');
      const key = group + ':' + field;
      if (seen.has(key)) throw new Error('Duplicate training summary field');
      seen.add(key);
    }
  }
  if (category === 'events') {
    if (columns.map(c => c.key).join(',') !== 'date,time,kind,info' || rows.some(r => !sourceDate(r.values[0]!) || normalizedLabel(r.values[2]!) !== 'Termine' || !normalizedLabel(r.values[1]!) || !eventInfo(r.values[3]!)) || !Array.isArray(p.filters) || p.filters.length !== 3 || typeof p.filters[1] !== 'string' || typeof p.filters[2] !== 'string' || p.filters[0] !== 'Quellkategorie: Termine' || !p.filters[1].startsWith('Ab ') || !p.filters[2].startsWith('Ansicht: ')) throw new Error('Unverified event scope');
    eventSelectionFilters({ date: p.filters[1].slice(3), view: p.filters[2].slice(9) });
  } else if (!Array.isArray(p.filters) || p.filters.length > 8 || p.filters.some(s => typeof s !== 'string' || !/^(?:\d{4}|Jahr \d{4}|Aktuelle und anstehende Dienste|Alle Dienste|Alle anstehenden Dienste|Meine nicht beendeten Aufgaben)$/.test(s))) throw new Error('Invalid information filter');
  if (category === 'training-summary' && p.filters.length) throw new Error('Unsupported training summary filter');
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

/** The sole form-value exception: the evidenced calendar date control only. */
export const EVENT_SELECTION_READER_SOURCE = String.raw`() => {
  const u=new URL(location.href), norm=s=>String(s || '').replace(/\s+/g,' ').trim();
  if(window.top!==window || u.protocol!=='https:' || !['vereinsflieger.de','www.vereinsflieger.de'].includes(u.hostname) || u.pathname!=='/member/community/appointment/' || u.username || u.password || u.port || u.hash || document.querySelector('input[name="pwinput"]')) return null;
  const date=document.getElementById?.('frm_datefrom'), selects=Array.from(document.querySelectorAll('select'));
  if(document.querySelectorAll('#frm_datefrom').length!==1 || date?.tagName!=='INPUT' || date.type!=='text' || !/^\d{2}\.\d{2}\.\d{4}$/.test(date.value) || selects.length!==1) return null;
  const s=selects[0], labels=Array.from(s.options || []).map(o=>norm(o.textContent));
  if(labels.join('|')!=='1 Tag|1 Woche|2 Wochen|3 Wochen|4 Wochen|3 Monate|6 Monate|1 Jahr' || s.selectedOptions?.length!==1) return null;
  const view=norm(s.selectedOptions[0].textContent);
  return labels.includes(view) ? {date:date.value,view} : null;
}`;
export function informationSelectionScript(nonce: string) {
  return `try { window.ReactNativeWebView?.postMessage(JSON.stringify({kind:'vf-information-selection-v1',nonce:${JSON.stringify(nonce)},url:location.href,selection:(${EVENT_SELECTION_READER_SOURCE})()})); } catch { window.ReactNativeWebView?.postMessage(JSON.stringify({kind:'vf-information-selection-v1',nonce:${JSON.stringify(nonce)},url:location.href,selection:null})); } true;`;
}

// Explicit read only: no requests, navigation, other form values, document downloads,
// cookies, storage, full-page HTML/text or unknown columns. Limits are page bounds.
export const INFORMATION_READER_SOURCE = String.raw`(category, config) => {
  const norm = s => String(s || '').replace(/\s+/g,' ').trim();
  const rowLimit = category === 'practical' ? ${informationRowLimit('practical')} : ${informationRowLimit('work-hours')};
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
  let columns, rows=[], empty=false, truncated=false, eventFilters=[];
  if(category==='training-summary') {
    if(u.pathname!=='/member/profile/usereducation/summaryueid' || u.search && !(u.searchParams.size===1 && u.searchParams.has('ueid'))) return {error:'source-unavailable'};
    const unsupported=()=>({error:'training-summary-unverified'});
    const labels=${JSON.stringify(trainingCountFields)};
    const plain=(cells,width)=>cells.length===width && cells.every(c=>c.tagName==='TD' && (c.colSpan || 1)===1 && (c.rowSpan || 1)===1 && c.children.length===0);
    for(const [id,caption] of [['practise',${JSON.stringify(trainingGroups[0])}],['theory',${JSON.stringify(trainingGroups[1])}]]) {
      // Establish exact owned sections before touching their text. Person,
      // progresschecks, flights and unrelated private sections are never read.
      const section=document.getElementById?.(id),content=document.getElementById?.(id+'_content'),head=section?.children?.[0];
      if(document.querySelectorAll('#'+id).length!==1 || document.querySelectorAll('#'+id+'_content').length!==1 || section?.tagName!=='DIV' || section.children.length!==2 || head?.tagName!=='DIV' || !head.classList.contains('box-header') || norm(head.querySelector('span')?.innerText)!==caption || content?.tagName!=='DIV' || content.parentElement!==section || section.children[1]!==content || content.children.length!==1 || content.children[0].tagName!=='TABLE' || content.querySelectorAll('table').length!==1) return unsupported();
      const all=Array.from(content.children[0].rows || []),cells=all.map(r=>Array.from(r.cells));
      if(all.length!==(id==='practise'?5:7) || !plain(cells[0],2) || norm(cells[0][0].innerText) || norm(cells[0][1].innerText)!=='Anzahl') return unsupported();
      for(let i=1;i<=3;i++) {
        const c=cells[i];
        if(!plain(c,2) || norm(c[0].innerText)!==labels[i-1]) return unsupported();
        rows.push({position:rows.length,values:[head.querySelector('span').innerText,c[0].innerText,cells[0][1].innerText,c[1].innerText]});
      }
      const graphic=cells[4];
      // Validate the observed blank graphic boundary, without reading any
      // style/class/attribute or translating its appearance into a status.
      if(graphic.length!==1 || graphic[0].colSpan!==2 || (graphic[0].rowSpan || 1)!==1 || norm(graphic[0].innerText) || graphic[0].children.length!==1 || graphic[0].children[0].tagName!=='DIV' || graphic[0].querySelector('a,table,input,button,select,textarea,iframe,object,embed')) return unsupported();
      if(id==='theory') {
        if(!plain(cells[5],2) || norm(cells[5][0].innerText) || norm(cells[5][1].innerText)!=='Zeit' || !plain(cells[6],2) || norm(cells[6][0].innerText)!=='Theoriestunden') return unsupported();
        rows.push({position:rows.length,values:[head.querySelector('span').innerText,cells[6][0].innerText,cells[5][1].innerText,cells[6][1].innerText]});
      }
    }
    columns=[{key:'group',label:'Ausbildungsbereich',index:0},{key:'field',label:'Quellenfeld',index:1},{key:'unit',label:'Quelleneinheit',index:2},{key:'value',label:'Originaltext',index:3}];
  } else if(category==='events') {
    const unsupported=(...shape)=>({error:'event-source-unverified',shape:shape.join(',')});
    const selection=(${EVENT_SELECTION_READER_SOURCE})();
    if(!selection) return {error:'event-selection-unverified'};
    eventFilters=['Quellkategorie: Termine','Ab '+selection.date,'Ansicht: '+selection.view];
    const tables=Array.from(document.querySelectorAll('table[id^="tablelist_"]'));
    if(tables.length!==1 || !/^tablelist_\d+$/.test(tables[0].id || '')) return unsupported(1,tables.length);
    const all=Array.from(tables[0].rows || []), header=Array.from(all[0]?.cells || []);
    if(!all.length || all.length>10000 || header.length!==6 || header.map(c=>norm(c.innerText)).join('|')!=='|Tag|Datum|Zeit|Kategorie|Info') return unsupported(2,all.length,header.length);
    columns=[{key:'date',label:'Datum',index:2},{key:'time',label:'Zeit',index:3},{key:'kind',label:'Kategorie',index:4},{key:'info',label:'Info · Titel/Ort',index:5}];
    let date='';
    for(let i=1;i<all.length;i++) {
      const cells=Array.from(all[i].cells);
      if(cells.length!==6 || cells.some(c=>(c.colSpan || 1)!==1 || (c.rowSpan || 1)!==1)) return {error:'row-shape'};
      const shownDate=norm(cells[2].innerText);
      if(shownDate) {if(!/^\d{2}\.\d{2}\.\d{4}$/.test(shownDate)) return unsupported(3,shownDate.length);date=shownDate;}
      // Establish category BEFORE reading Info or time. Other calendar kinds
      // can contain third-party names, reservations and aircraft lock notes.
      if(norm(cells[4].innerText)!=='Termine') continue;
      if(!date || [cells[3],cells[4],cells[5]].some(c=>c.querySelector('table,input,button,select,textarea,iframe,object,embed'))) return unsupported(4,date?1:0);
      if(rows.length===20) {truncated=true;break;}
      const time=cells[3].innerText || '', info=cells[5].innerText || '';
      const lines=info.split(/\r?\n/).filter(s=>norm(s));
      const hasLocation=lines.length>1 && /^Ort:\s+\S/.test(norm(lines[1]));
      if(!norm(time) || !lines.length || /^Ort:/.test(norm(lines[0])) || norm(lines[0]).length>1024 || hasLocation && norm(lines[1]).length>512) return unsupported(5,norm(time)?1:0,lines.length,hasLocation?1:0);
      // Info also contains descriptions/other uncontracted text. Project only
      // the evidenced title and immediate optional Ort line, never later text.
      rows.push({position:i,values:[date,time,cells[4].innerText,lines.slice(0,hasLocation?2:1).join('\n')]});
    }
    if(!rows.length) return {error:'empty-scope-unverified'};
  } else if (category === 'document-notices' || category === 'news' || category === 'own-reservations') {
    const id=category==='news' ? 'news' : category==='own-reservations' ? 'my_reservation' : 'docs', caption=category==='news' ? 'News' : category==='own-reservations' ? 'Meine Reservierungen' : 'Dokumente';
    const section=document.getElementById?.(id), content=document.getElementById?.(id+'_content');
    const head=section?.children?.[0];
    if(document.querySelectorAll('#'+id).length!==1 || document.querySelectorAll('#'+id+'_content').length!==1 || section?.tagName!=='DIV' || section.children.length!==2 || head?.tagName!=='DIV' || !head.classList.contains('box-header') || norm(head.querySelector('span')?.innerText)!==caption || content?.tagName!=='DIV' || content.parentElement!==section || section.children[1]!==content) return {error:'notice-source-unverified'};
    const tables=Array.from(content.querySelectorAll('table'));
    if(tables.length!==1) return {error:'notice-source-unverified'};
    const all=Array.from(tables[0].rows || []);
    columns=[{key:'notice',label:'Hinweis · Originaltext',index:0}];
    if(category!=='document-notices') {
      const cells=Array.from(all[0]?.cells || []);
      if(all.length!==1 || cells.length!==2 || norm(cells[0].innerText) || norm(cells[1].innerText)!=='Es wurden keine Daten gefunden!' || cells.some(c=>(c.colSpan || 1)!==1 || (c.rowSpan || 1)!==1 || c.querySelector('table,input,button,select,textarea,iframe,object,embed'))) return {error:'notice-source-unverified'};
      empty=true;
    } else {
      if(!all.length || all.length>10000) return {error:'notice-source-unverified'};
      for(let i=0;i<all.length;i++) {
        const cells=Array.from(all[i].cells), c=cells[0];
        if(cells.length!==1 || (c.colSpan || 1)!==1 || (c.rowSpan || 1)!==1) return {error:'row-shape'};
        const nodes=Array.from(c.childNodes || []), elements=nodes.filter(n=>n.nodeType===1);
        if(elements.length!==1 || elements[0].tagName!=='A' || !elements[0].classList.contains('icon-download') || nodes.some(n=>![1,3].includes(n.nodeType))) return {error:'notice-source-unverified'};
        // The visible title is the link label; the date is a separate text
        // suffix. Read display text only, never URLs/actions or document data.
        const title=elements[0].innerText ?? elements[0].textContent ?? '';
        const suffix=nodes.filter(n=>n.nodeType===3).map(n=>n.textContent || '').join('');
        if(!norm(title) || !/\d{2}\.\d{2}\.\d{4}/.test(suffix)) return {error:'notice-source-unverified'};
        const value=nodes.map(n=>n.nodeType===3 ? n.textContent || '' : title).join('');
        if(rows.length===20) {truncated=true;break;}
        rows.push({position:i,values:[value]});
      }
    }
  } else if (category === 'licence-metadata') {
    const candidates=[];
    for(const table of document.querySelectorAll('table')) {
      const all=Array.from(table.rows || []);if(all.length>2000) return {error:'source-limit'};
      let active=false, finished=false, kind='';const selected=[];
      for(let i=0;i<all.length;i++) {
        const cells=Array.from(all[i].cells);
        if(cells.some(c=>c.querySelector('table'))) {if(active) return {error:'licence-source-unverified'};continue;}
        const label=norm(cells[0]?.textContent);
        if(/^Lizenzen\s*\/\s*Berechtigungen$/.test(label) && cells.length===1 && cells[0].colSpan===3) {if(active) return {error:'licence-source-unverified'};active=true;continue;}
        if(!active) continue;
        if(label==='Medical' && cells.length===1 && cells[0].colSpan===3) {finished=true;break;}
        if(cells.length===1 && cells[0].colSpan===3) {
          if(!label) continue;
          if(!cells[0].querySelector('b')) return {error:'licence-source-unverified'};
          kind=cells[0].textContent || '';continue;
        }
        if(!kind || cells.length!==2 || cells[0].colSpan!==1 || cells[1].colSpan!==2 || cells.some(c=>(c.rowSpan || 1)!==1 || c.querySelector('a,input,button,select,textarea,table,iframe,object,embed')) || !['Lizenz','Klassenberechtigung (Segelflugzeuge)'].includes(label)) return {error:'licence-source-unverified'};
        if(selected.length===20) return {error:'source-limit'};
        selected.push({position:i,values:[kind,cells[0].textContent || '',cells[1].innerText ?? cells[1].textContent ?? '']});
      }
      if(active) {if(!finished || !selected.length) return {error:'licence-source-unverified'};candidates.push(selected);}
    }
    if(candidates.length!==1) return {error:'licence-source-unverified'};
    rows=candidates[0];columns=[{key:'kind',label:'Lizenzgruppe',index:0},{key:'field',label:'Quellenfeld',index:1},{key:'value',label:'Originaltext',index:2}];
  } else if (category === 'own-profile') {
    const candidates=[];
    for(const table of document.querySelectorAll('table')) {
      const all=Array.from(table.rows || []);if(all.length>2000) return {error:'source-limit'};
      let active=false;const selected=[];
      for(let i=0;i<all.length;i++) {
        const cells=Array.from(all[i].cells);
        if(cells.some(c=>c.querySelector('table'))) {active=false;continue;}
        const label=norm(cells[0]?.textContent);
        if(cells.length===1 && (cells[0].colSpan || 1)>1) {active=label==='Allgemeine Daten' && cells[0].colSpan===2;continue;}
        if(active && ['Vorname','Nachname','Benutzernummer'].includes(label)) {
          if(cells.length!==2 || cells.some(c=>(c.colSpan || 1)!==1 || (c.rowSpan || 1)!==1)) return {error:'row-shape'};
          selected.push({position:i,values:[cells[0].textContent || '',cells[1].innerText ?? cells[1].textContent ?? '']});
        }
      }
      if(selected.length) candidates.push(selected);
    }
    if(candidates.length!==1 || candidates[0].length!==3 || new Set(candidates[0].map(r=>norm(r.values[0]))).size!==3) return {error:'profile-source-unverified'};
    rows=candidates[0];columns=[{key:'field',label:'Profilfeld',index:0},{key:'value',label:'Originaltext',index:1}];
  } else if (category === 'medical') {
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
      if(rows.length===rowLimit) {truncated=true;break;}
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
  const filters=category==='events' ? eventFilters : taskFilter ? [taskFilter] : [];
  for(const s of ['own-profile','licence-metadata','events','training-summary'].includes(category) ? [] : document.querySelectorAll('select')) {
    const text=norm(s.selectedOptions?.[0]?.textContent);
    if(/^(?:\d{4}|Jahr \d{4}|Aktuelle und anstehende Dienste|Alle Dienste|Alle anstehenden Dienste)$/.test(text) && !filters.includes(text)) filters.push(text);
  }
  const displayedFilter=['own-profile','licence-metadata','events','training-summary'].includes(category) ? '' : norm(document.getElementById?.('globalfilter')?.innerText);
  if(/^(?:\d{4}|Jahr \d{4}|Aktuelle und anstehende Dienste|Alle Dienste|Alle anstehenden Dienste)$/.test(displayedFilter) && !filters.includes(displayedFilter)) filters.push(displayedFilter);
  return {category,path:u.pathname,columns,rows,filters,empty:!rows.length,coverage:{kind:'visible-page',truncated,pagination:'unverified'}};
}`;
export function informationScript(category: InformationCategory, nonce: string) {
  return `try { window.ReactNativeWebView?.postMessage(JSON.stringify({kind:'vf-information-v1',nonce:${JSON.stringify(nonce)},url:location.href,page:(${INFORMATION_READER_SOURCE})(${JSON.stringify(category)},${JSON.stringify(INFORMATION_TYPES[category])})})); } catch { window.ReactNativeWebView?.postMessage(JSON.stringify({kind:'vf-information-v1',nonce:${JSON.stringify(nonce)},url:location.href,page:{error:'unsupported-source'}})); } true;`;
}

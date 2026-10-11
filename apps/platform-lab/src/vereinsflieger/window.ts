import { canonical } from '@moflight/flight-logbook';
import type { Connection } from '@moflight/local-data';
import { flightUrl, REQUIRED_HEADERS } from './probe';
import { scopedBridge, sameContext, validateContext, type ObservedContext } from './context';
import { detailReference } from './details';

export interface WindowScope { from: string; through: string; participation: 'pilot-or-companion' }
export interface WindowRow { domId: string; detailUrl: string | null; values: string[] }
export interface WindowPage {
  url: string; observedAt: string; scope: WindowScope; headers: string[]; rows: WindowRow[];
  page: number; first: number; last: number; total: number; next: string | null;
  emptyEvidence: boolean; filtersClear: true;
}
export interface WindowRun {
  version: 1; id: string; revision: number; context: ObservedContext; pages: WindowPage[];
  sourceIdentity: 'unverified'; timeBasis: 'unknown'; updatedAt: string;
}
export const WINDOW_RECORD_LIMIT = 1000, WINDOW_PAGE_LIMIT = 100;
export function dateKey(text: string): string {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text);
  if (!m) throw new Error('Unsupported calendar date');
  const key = `${m[3]}-${m[2]}-${m[1]}`;
  if (!isoDate(key)) throw new Error('Invalid calendar date');
  return key;
}
function isoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(d.valueOf()) && d.toISOString().slice(0, 10) === value;
}
export function validateScope(value: unknown): WindowScope {
  if (!value || typeof value !== 'object') throw new Error('Missing dated window');
  const s = value as WindowScope;
  if (!isoDate(s.from) || !isoDate(s.through) || s.from > s.through || s.participation !== 'pilot-or-companion') throw new Error('Unsupported dated window');
  return { from: s.from, through: s.through, participation: s.participation };
}
export function pagingReference(value: string, base: string, page: number): boolean {
  try {
    const u = new URL(value), b = new URL(base);
    return flightUrl(value) && u.origin === b.origin && !u.hash && [...u.searchParams.keys()].length === 1 &&
      u.searchParams.get('page') === String(page) && Number.isSafeInteger(page) && page > 0;
  } catch { return false; }
}
export function validateWindowPage(value: unknown): WindowPage {
  if (!value || typeof value !== 'object') throw new Error('Invalid window page');
  const p = value as WindowPage, scope = validateScope(p.scope);
  timestamp(p.observedAt);
  if (typeof p.url !== 'string' || !flightUrl(p.url) || new URL(p.url).hash || p.filtersClear !== true || typeof p.emptyEvidence !== 'boolean') throw new Error('Unsupported window context');
  if (!Array.isArray(p.headers) || p.headers.length > 32 || !p.headers.every(h => typeof h === 'string' && h.length <= 80) || REQUIRED_HEADERS.some(h => !p.headers.includes(h)) || new Set(p.headers.filter(Boolean)).size !== p.headers.filter(Boolean).length) throw new Error('Unsupported window columns');
  if (![p.page,p.first,p.last,p.total].every(Number.isSafeInteger) || p.page < 1 || p.page > 100_000 || p.total < 0 || p.total > 1_000_000) throw new Error('Invalid record positions');
  if (!Array.isArray(p.rows) || p.rows.length > 200) throw new Error('Window page exceeds bounded reader');
  if (!p.total) {
    if (!p.emptyEvidence || p.rows.length || p.page !== 1 || p.first !== 0 || p.last !== 0 || p.next !== null) throw new Error('Empty window lacks explicit evidence');
  } else if (p.emptyEvidence || p.first < 1 || p.last < p.first || p.last > p.total || p.rows.length !== p.last - p.first + 1 || !p.rows.length ||
    (p.last < p.total ? typeof p.next !== 'string' || !pagingReference(p.next,p.url,p.page + 1) : p.next !== null)) throw new Error('Incomplete window positions or next link');
  const seen = new Set<string>();
  const rows = p.rows.map(r => {
    if (!r || typeof r.domId !== 'string' || !/^row\d{1,20}$/.test(r.domId) || seen.has(r.domId)) throw new Error('Missing or repeated observed row identity');
    seen.add(r.domId);
    if (!Array.isArray(r.values) || r.values.length !== p.headers.length || !r.values.every(v => typeof v === 'string' && v.length <= 512)) throw new Error('Invalid window row fields');
    const day = dateKey(r.values[p.headers.indexOf('Datum')]!);
    if (day < scope.from || day > scope.through) throw new Error('Row outside selected window');
    if (r.detailUrl !== null && (typeof r.detailUrl !== 'string' || new URL(r.detailUrl).origin !== new URL(p.url).origin || detailReference(r.detailUrl) !== r.domId.slice(3))) throw new Error('Detail link differs from observed row');
    return { domId: r.domId, detailUrl: r.detailUrl, values: [...r.values] };
  });
  return { url:p.url,observedAt:p.observedAt,scope,headers:[...p.headers],rows,page:p.page,first:p.first,last:p.last,total:p.total,next:p.next,emptyEvidence:p.emptyEvidence,filtersClear:true };
}
export function decodeWindow(data: string, sender: string, document: string, nonce: string, at: string): WindowPage {
  if (data.length > 4_000_000 || !scopedBridge(sender,document,document) || !flightUrl(document)) throw new Error('Rejected window bridge');
  const m = JSON.parse(data);
  if (!m || m.kind !== 'vf-window-v1' || m.nonce !== nonce || m.url !== document || m.error) throw new Error('Incomplete or unsupported dated window; previous evidence retained');
  return validateWindowPage({...m.page,observedAt:at});
}
function timestamp(at: string) { if (typeof at !== 'string' || !Number.isFinite(Date.parse(at)) || new Date(at).toISOString() !== at) throw new Error('Invalid observation timestamp'); }
export function createWindow(id: string, context: ObservedContext, value: WindowPage, at: string): WindowRun {
  const page=validateWindowPage(value); timestamp(at);
  if (!/^[a-zA-Z0-9-]{1,100}$/.test(id) || page.observedAt!==at || page.page !== 1 || page.first !== (page.total ? 1 : 0)) throw new Error('Capture must begin at the first observed page');
  return {version:1,id,revision:1,context:validateContext(context),pages:[page],sourceIdentity:'unverified',timeBasis:'unknown',updatedAt:at};
}
function advance(r: WindowRun, page: WindowPage, at: string): WindowRun {
  const last=r.pages.at(-1)!; timestamp(at);
  if (progress(r).state !== 'partial' || page.observedAt!==at || page.url !== last.next || page.page !== last.page+1 || page.first !== last.last+1 || page.total !== last.total || canonical(page.scope)!==canonical(last.scope) || canonical(page.headers)!==canonical(last.headers)) throw new Error('Window scope, ordering or record count changed');
  const ids=new Set(r.pages.flatMap(p=>p.rows.map(row=>row.domId)));
  if (page.rows.some(row=>ids.has(row.domId)) || ids.size+page.rows.length>WINDOW_RECORD_LIMIT) throw new Error('Repeated row or bounded record limit');
  return {...r,revision:r.revision+1,pages:[...r.pages,page],updatedAt:at};
}
export function appendWindow(value: WindowRun, context: ObservedContext, page: WindowPage, at: string): WindowRun {
  const r=validateWindow(value); if(!sameContext(r.context,validateContext(context)))throw new Error('Account or club context changed');
  return advance(r,validateWindowPage(page),at);
}
export function validateWindow(value: unknown): WindowRun {
  if (!value || typeof value !== 'object') throw new Error('Invalid window checkpoint');
  const v=value as WindowRun;
  if(v.version!==1 || v.sourceIdentity!=='unverified' || v.timeBasis!=='unknown' || !Array.isArray(v.pages) || !v.pages.length || v.pages.length>WINDOW_PAGE_LIMIT || v.revision!==v.pages.length)throw new Error('Unsupported window checkpoint');
  let r=createWindow(v.id,v.context,v.pages[0]!,v.pages[0]!.observedAt);
  for(const page of v.pages.slice(1))r=advance(r,validateWindowPage(page),page.observedAt);
  if(r.updatedAt!==v.updatedAt)throw new Error('Window observation timestamp mismatch');
  return r;
}
function progress(r: WindowRun) {
  const last=r.pages.at(-1)!, rows=r.pages.flatMap(p=>p.rows);
  return { state: last.last===last.total ? 'complete-observed-window' as const : rows.length>=WINDOW_RECORD_LIMIT || r.pages.length>=WINDOW_PAGE_LIMIT ? 'bounded-limit' as const : 'partial' as const,
    records:rows.length,total:last.total,detailLinks:rows.filter(row=>row.detailUrl!==null).length,detailGaps:rows.filter(row=>row.detailUrl===null).length };
}
export function windowProgress(value: WindowRun) { return progress(validateWindow(value)); }
// Resume rechecks the last committed page through its observed URL. No guessed IDs.
export function resumeWindow(value: WindowRun, context: ObservedContext, fresh: WindowPage): string | null {
  const r=validateWindow(value), page=validateWindowPage(fresh);
  const evidence=(p:WindowPage)=>{const {observedAt,...rest}=p;return canonical(rest);};
  if(!sameContext(r.context,validateContext(context)) || evidence(page)!==evidence(r.pages.at(-1)!))throw new Error('Checkpoint page or context changed; start a separate window');
  return progress(r).state==='partial' ? page.next : null;
}
export const WINDOW_SCHEMA='CREATE TABLE IF NOT EXISTS capture_windows(id TEXT NOT NULL,revision INTEGER NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(id,revision));';
export async function persistWindow(db: Connection, value: WindowRun) {
  const r=validateWindow(value), bytes=canonical(r), old=await db.first<{revision:number;payload:string}>('SELECT revision,payload FROM capture_windows WHERE id=? ORDER BY revision DESC LIMIT 1',r.id);
  if(old?.revision===r.revision&&old.payload===bytes)return;
  if(r.revision!==(old?.revision??0)+1)throw new Error('Stale window checkpoint');
  if(old){const previous=validateWindow(JSON.parse(old.payload));if(canonical(previous.context)!==canonical(r.context)||canonical(previous.pages)!==canonical(r.pages.slice(0,-1)))throw new Error('Earlier window evidence cannot be replaced');}
  await db.run('INSERT INTO capture_windows SELECT ?,?,? WHERE coalesce((SELECT max(revision) FROM capture_windows WHERE id=?),0)=?',r.id,r.revision,bytes,r.id,r.revision-1);
  const stored=await db.first<{payload:string}>('SELECT payload FROM capture_windows WHERE id=? AND revision=?',r.id,r.revision);if(stored?.payload!==bytes)throw new Error('Window checkpoint conflict');
}
export async function latestWindow(db: Connection): Promise<WindowRun|null> {
  const row=await db.first<{id:string;revision:number;payload:string}>('SELECT id,revision,payload FROM capture_windows ORDER BY rowid DESC LIMIT 1');if(!row)return null;
  const r=validateWindow(JSON.parse(row.payload));if(r.id!==row.id||r.revision!==row.revision)throw new Error('Window checkpoint identity mismatch');return r;
}

// DOM anchors observed on 2026-10-11. Preserve every displayed record, including
// rows without links. A DOM row ID is evidence, not permission to visit a detail.
export const WINDOW_READER_SOURCE=String.raw`() => {
  const fail=()=>({error:'unsupported-window'});
  if(window.top!==window||document.readyState!=='complete'||location.protocol!=='https:'||!['vereinsflieger.de','www.vereinsflieger.de'].includes(location.hostname)||location.pathname!=='/member/profile/flightlog.php')return fail();
  const text=e=>(e?.innerText??'').replace(/\s+/g,' ').trim();
  const tables=document.querySelectorAll('#tablelist_20'), ranges=document.querySelectorAll('#globalfilter'), roles=document.querySelectorAll('#globalfilter2'), footers=document.querySelectorAll('.footer.f1'), filters=document.querySelectorAll('#frmfilter');
  if(tables.length!==1||ranges.length!==1||roles.length!==1||footers.length!==1||filters.length!==1)return fail();
  const range=text(ranges[0]).match(/^ab (\d{2}\.\d{2}\.\d{4}) bis (\d{2}\.\d{2}\.\d{4})$/);
  if(!range||text(roles[0])!=='Pilot oder Begleiter'||Array.from(filters[0].querySelectorAll('input[type="text"]')).some(i=>i.value.trim())||Array.from(filters[0].querySelectorAll('input[type="checkbox"]')).filter(i=>/_all$/.test(i.name)).some(i=>!i.checked))return fail();
  const key=s=>s.slice(6)+'-'+s.slice(3,5)+'-'+s.slice(0,2);
  const table=tables[0], heads=Array.from(table.rows).filter(r=>Array.from(r.cells).some(c=>c.tagName==='TH'));
  if(heads.length!==1)return fail();
  const headers=Array.from(heads[0].cells).map(c=>(c.textContent??'').replace(/\s+/g,' ').trim());
  const body=Array.from(table.rows).filter(r=>r.classList.contains('selectable'));
  if(body.length>200||body.some(r=>r.cells.length!==headers.length))return fail();
  const rows=body.map(r=>{const links=Array.from(r.querySelectorAll('a[href]')).map(a=>new URL(a.getAttribute('href'),location.href)).filter(u=>u.origin===location.origin&&u.pathname==='/member/profile/viewflight.php'&&!u.hash&&Array.from(u.searchParams.keys()).length===1&&/^\d{1,20}$/.test(u.searchParams.get('flid')??''));return {domId:r.id,detailUrl:links.length===1?links[0].href:null,values:Array.from(r.cells).map(text),ambiguous:links.length>1};});
  if(rows.some(r=>r.ambiguous))return fail();
  const footer=text(footers[0]), pagers=document.querySelectorAll('.footer.f2 span.pagebrowser');
  let page=1,first=0,last=0,total=0,emptyEvidence=false,next=null;
  const all=footer.match(/^(\d+) Datensätze$/), part=footer.match(/^Datensatz (\d+) bis (\d+) von (\d+)$/);
  if(footer==='Es wurden keine passenden Daten gefunden!'){emptyEvidence=true;if(rows.length||pagers.length)return fail();}
  else if(all){total=Number(all[1]);first=1;last=total;if(pagers.length)return fail();}
  else if(part){if(pagers.length!==1)return fail();page=Number(text(pagers[0]));first=Number(part[1]);last=Number(part[2]);total=Number(part[3]);if(last<total){const candidates=Array.from(document.querySelectorAll('.footer.f2 a.pagebrowser[href]')).filter(a=>text(a)===String(page+1));if(candidates.length!==1)return fail();next=new URL(candidates[0].getAttribute('href'),location.href).href;}}
  else return fail();
  return {page:{url:location.href,scope:{from:key(range[1]),through:key(range[2]),participation:'pilot-or-companion'},headers,rows:rows.map(({ambiguous,...r})=>r),page,first,last,total,next,emptyEvidence,filtersClear:true}};
}`;
export function windowScript(nonce: string) { return `window.ReactNativeWebView?.postMessage(JSON.stringify({kind:'vf-window-v1',nonce:${JSON.stringify(nonce)},url:location.href,...(${WINDOW_READER_SOURCE})()}));true;`; }

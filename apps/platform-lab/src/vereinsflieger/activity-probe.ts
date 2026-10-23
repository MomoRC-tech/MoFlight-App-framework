import type { ActivityMarkers } from '../mobile/activity-signal';
import { validateContext, type ObservedContext } from './context';

export interface ActivityProbeSource {
  source: 'flights' | 'own-duties' | 'club-duties';
  configuration: string;
  markers: ActivityMarkers;
  window?: { from: string; to: string };
  participation?: string;
}
export interface ActivityProbeResult { sources: ActivityProbeSource[] }

const validDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
/** The caller separately validates nonce and native sender/document URL. */
export function decodeActivityProbe(value: unknown): ActivityProbeResult {
  const m = value as Record<string, unknown> | null;
  if (!m || typeof m !== 'object' || Array.isArray(m) || m.kind !== 'vf-activity-v1' ||
      typeof m.nonce !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(m.nonce) || m.error !== undefined ||
      !Array.isArray(m.sources) || m.sources.length > 3) throw new Error('Activity observation unavailable.');
  const seen = new Set<string>();
  const sources = m.sources.map(value => {
    const s = value as ActivityProbeSource;
    if (!s || !['flights', 'own-duties', 'club-duties'].includes(s.source) || seen.has(s.source) ||
        typeof s.configuration !== 'string' || !/^activity-v1:sha256:[a-f0-9]{64}$/.test(s.configuration) ||
        !s.markers || !Number.isSafeInteger(s.markers.count) || s.markers.count! < 0 || s.markers.count! > 10_000_000 ||
        Object.keys(s.markers).some(k => k !== 'count') ||
        s.window !== undefined && (!validDate(s.window.from) || !validDate(s.window.to) || s.window.from > s.window.to) ||
        s.participation !== undefined && !['Pilot', 'Pilot oder Fluglehrer', 'Fluglehrer', 'Begleiter', 'Pilot oder Begleiter', 'Meine Dienste'].includes(s.participation)) throw new Error('Unsupported activity evidence.');
    seen.add(s.source);
    return { source: s.source, configuration: s.configuration, markers: { count: s.markers.count! },
      ...(s.window ? { window: { ...s.window } } : {}), ...(s.participation ? { participation: s.participation } : {}) };
  });
  return { sources };
}

/** Shared read-only DOM inspector. Caller supplies the authenticated source DOM and
 * optional cancellation guard. Returns metadata or null; performs no requests.
 * Calendar-day partitioning uses the German provider's local timezone, independent
 * of the device timezone. Absolute validated scopes retain stable configurations. */
export const ACTIVITY_SOURCE_INSPECTOR = String.raw`async function(d,source,guard=()=>{}) {
  const clean=e=>(e?.textContent||'').replace(/\s+/g,' ').trim();
  const all=(d,s)=>Array.from(d.querySelectorAll(s));
  const providerDay=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const date=s=>{const m=/^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s);if(!m)return null;const v=m[3]+'-'+m[2]+'-'+m[1];return Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v?v:null;};
  guard();
  if(!['flights','own-duties'].includes(source)||d.querySelector('input#pwinput[name="pwinput"]'))return null;
    const flight=source==='flights',id=flight?'tablelist_20':'tablelist_32';
    const tables=all(d,'table#'+id);if(tables.length!==1)return null;const t=tables[0];
    if(t.rows.length>2000)return null;
    const heads=all(t,'thead tr').filter(r=>Array.from(r.cells).some(c=>clean(c)===(flight?'Datum':'Dienst')));
    if(heads.length!==1)return null;const headers=Array.from(heads[0].cells).map(clean);
    const required=flight?['Datum','Lfz.','Start','Landung','Flugzeit']:['Dienst','Diensttausch','Zeitraum','Person(en)','Dienstplan von'];
    if(required.some(h=>!headers.includes(h))||headers.length>128)return null;
    const body=Array.from(t.rows).filter(r=>r!==heads[0]&&r.parentElement?.tagName!=='THEAD'&&r.parentElement?.tagName!=='TFOOT'&&r.querySelector('td')&&!(r.cells.length===1&&r.cells[0].colSpan>=headers.length));
    const footer=clean(t.nextElementSibling);let count;
    const match=/^(\d{1,3}(?:\.\d{3})*|\d+) Datensätze(?:$|\s)/.exec(footer);
    if(match)count=Number(match[1].replace(/\./g,''));
    else if(!flight&&footer.startsWith('Es wurden keine passenden Daten gefunden!')&&body.length===0)count=0;
    else return null;
    if(!Number.isSafeInteger(count)||count<0||count>10000000||count<body.length||body.some(r=>r.cells.length!==headers.length))return null;
    const f=d.querySelector('#frmfilter');if(!f)return null;
    const controls=Array.from(f.elements).filter(e=>['text','checkbox','select-one'].includes(e.type));
    if(!controls.length||controls.length>500||controls.some(e=>!/^((op_)?col\d{1,4}|col\d{1,4}_(all|\d{1,4}))$/.test(e.name)||String(e.value).length>512)||new Set(controls.map(e=>e.name)).size!==controls.length)return null;
    const filters=controls.map(e=>({name:e.name,type:e.type,value:e.value,checked:!!e.checked})).sort((a,b)=>a.name.localeCompare(b.name));
    const columns=all(d,'#LST_VISIBLE > li').map(e=>e.getAttribute('value'));
    if(columns.length!==headers.length||columns.some(c=>!/^\d{1,4}$/.test(c))||new Set(columns).size!==columns.length)return null;
    const sort=Array.from(heads[0].cells).flatMap((h,i)=>all(h,'[class*="icon-sort-"]').map(e=>({column:columns[i],icon:Array.from(e.classList).find(c=>/^icon-sort-[a-z-]+$/.test(c))})));
    if(sort.some(s=>!s.icon))return null;
    let period,participation,window;
    if(flight){
      period=clean(d.querySelector('#globalfilter'));participation=clean(d.querySelector('#globalfilter2'));
      if(!period||period.length>100||!['Pilot','Pilot oder Fluglehrer','Fluglehrer','Begleiter','Pilot oder Begleiter'].includes(participation))return null;
      const bounds=/^ab (\d{2}\.\d{2}\.\d{4}) bis (\d{2}\.\d{2}\.\d{4})$/.exec(period);
      if(bounds){const from=date(bounds[1]),to=date(bounds[2]);if(!from||!to||from>to)return null;window={from,to};}
    }else{
      const scopes=all(d,'select').filter(e=>!e.name&&!e.id);
      if(scopes.length!==1||scopes[0].selectedOptions.length!==1||clean(scopes[0].selectedOptions[0])!=='Meine Dienste')return null;
      period={label:'Meine Dienste',value:scopes[0].value};participation='Meine Dienste';
    }
    const asOfDay=window?undefined:providerDay();
    const config=JSON.stringify({version:1,source,headers,columns,filters,sort,period,participation,window,asOfDay,marker:'matching-view-footer-count'});
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(config)))).map(b=>b.toString(16).padStart(2,'0')).join('');guard();
    if(asOfDay&&providerDay()!==asOfDay)return null;
    return {source,configuration:'activity-v1:sha256:'+hash,markers:{count},...(window?{window}:{}),participation};
}`;

// Plain JS is intentional: execution in WebView must not depend on bundler helpers.
// All parsing is in inert fetched documents; no provider controls are changed.
export const ACTIVITY_READER_SOURCE = String.raw`async function(nonce, expected) {
  const originalUrl=location.href, origin=location.origin;
  if(window.top!==window || location.protocol!=='https:' || !['vereinsflieger.de','www.vereinsflieger.de'].includes(location.hostname) || location.port || location.pathname!=='/member/profile/viewprofile' || location.search || location.hash) return;
  const send=p=>window.ReactNativeWebView?.postMessage(JSON.stringify({kind:'vf-activity-v1',nonce,...p}));
  if(window.__moflightActivityAbort){send({error:'busy'});return;}
  const controller=new AbortController(), started=Date.now();
  const cancel=()=>controller.abort();window.__moflightActivityAbort=cancel;
  const timer=setTimeout(cancel,10000);
  const guard=()=>{if(controller.signal.aborted || Date.now()-started>=10000 || location.href!==originalUrl || window.__moflightActivityAbort!==cancel)throw Error('unavailable');};
  const clean=e=>(e?.textContent||'').replace(/\s+/g,' ').trim();
  const all=(d,s)=>Array.from(d.querySelectorAll(s));
  const context=d=>{
    if(d.querySelector('input#pwinput[name="pwinput"]'))throw Error('unavailable');
    const rows=all(d,'table.tablelist.alternative tr').filter(r=>clean(r.cells[0])==='Benutzernummer');
    const clubs=all(d,'#topnavi a[href]').filter(a=>{const u=new URL(a.getAttribute('href'),origin);return u.origin===origin&&u.pathname==='/member/community/main'&&!u.search&&!u.hash;});
    if(rows.length!==1 || rows[0].cells.length!==2 || clubs.length!==1 || clean(rows[0].cells[1])!==expected.accountNumber || clean(clubs[0])!==expected.clubLabel)throw Error('unavailable');
  };
  const get=async path=>{
    guard();const response=await fetch(origin+path,{method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error',signal:controller.signal});guard();
    const u=new URL(response.url),type=response.headers.get('content-type')||'';
    if(!response.ok || u.origin!==origin || u.pathname!==path || u.search || u.hash || !/^text\/html(?:;|$)/i.test(type) || !response.body)throw Error('unavailable');
    const reader=response.body.getReader(),chunks=[];let size=0;
    try {while(true){const {done,value}=await reader.read();guard();if(done)break;size+=value.byteLength;if(size>1000000){cancel();throw Error('unavailable');}chunks.push(value);}}
    finally {reader.releaseLock();}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    const charset=type.match(/charset\s*=\s*["']?([^\s;"']+)/i)?.[1]||'utf-8';
    if(!['utf-8','utf8','iso-8859-1','windows-1252'].includes(charset.toLowerCase()))throw Error('unavailable');
    const d=new DOMParser().parseFromString(new TextDecoder(charset).decode(bytes),'text/html');
    if(d.querySelector('input#pwinput[name="pwinput"]'))throw Error('unavailable');guard();return d;
  };
  const inspect=(${ACTIVITY_SOURCE_INSPECTOR});
  try{
    guard();context(document);context(await get('/member/profile/viewprofile'));
    const sources=[];
    for(const [path,source] of [['/member/profile/flightlog.php','flights'],['/member/profile/myservices.php','own-duties']]){
      const result=await inspect(await get(path),source,guard);guard();if(result)sources.push(result);
    }
    context(await get('/member/profile/viewprofile'));context(document);guard();send({sources});
  }catch{send({error:'unavailable'});}
  finally{clearTimeout(timer);controller.abort();if(window.__moflightActivityAbort===cancel)delete window.__moflightActivityAbort;}
}`;

export function activityProbeScript(nonce: string, expected: ObservedContext): string {
  if (!/^[a-zA-Z0-9-]{1,100}$/.test(nonce)) throw new Error('Invalid activity nonce.');
  return `(${ACTIVITY_READER_SOURCE})(${JSON.stringify(nonce)},${JSON.stringify(validateContext(expected))});true;`;
}

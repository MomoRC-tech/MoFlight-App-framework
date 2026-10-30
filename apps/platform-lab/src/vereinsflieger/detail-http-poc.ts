import { PROFILE_URL, validateContext, type ObservedContext } from './context';
import { DETAIL_LABELS, DETAIL_READER_SOURCE, decodeDetail, detailReference, type DetailObservation } from './details';
import { REQUIRED_HEADERS } from './probe';

/** Development only. Cookies remain in the existing WebView store. No API Anything
 * runtime, guessed reference, form submission or production library write. */
export const DETAIL_HTTP_SOURCE = String.raw`async function(nonce,expected,allowed,headers,readDetail) {
  const original=location.href,origin=location.origin;
  if(window.top!==window || original!==origin+'/member/profile/viewprofile' || location.protocol!=='https:' || !['vereinsflieger.de','www.vereinsflieger.de'].includes(location.hostname) || location.port)return;
  const send=p=>window.ReactNativeWebView?.postMessage(JSON.stringify({kind:'vf-detail-http-v1',nonce,url:original,...p}));
  if(window.__moflightDetailHttpAbort){send({error:'busy'});return;}
  const controller=new AbortController(),started=performance.now(),cancel=()=>controller.abort();
  window.__moflightDetailHttpAbort=cancel;const timer=setTimeout(cancel,10000);
  const guard=()=>{if(controller.signal.aborted||performance.now()-started>=10000||location.href!==original||window.__moflightDetailHttpAbort!==cancel)throw Error('cancelled');};
  const clean=e=>(e?.textContent||'').replace(/\s+/g,' ').trim();
  const all=(d,s)=>Array.from(d.querySelectorAll(s));
  const context=d=>{
    if(d.querySelector('input#pwinput[name="pwinput"]'))throw Error('session-required');
    const rows=all(d,'table.tablelist.alternative tr').filter(r=>clean(r.cells[0])==='Benutzernummer');
    const clubs=all(d,'#topnavi a[href]').filter(a=>{const u=new URL(a.getAttribute('href'),origin);return u.origin===origin&&u.pathname==='/member/community/main'&&!u.search&&!u.hash;});
    if(rows.length!==1||rows[0].cells.length!==2||clubs.length!==1||clean(rows[0].cells[1])!==expected.accountNumber||clean(clubs[0])!==expected.clubLabel)throw Error('context-changed');
  };
  const get=async path=>{
    guard();const response=await fetch(origin+path,{method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error',signal:controller.signal});guard();
    const u=new URL(response.url),type=response.headers.get('content-type')||'';
    if(!response.ok||response.redirected||u.href!==origin+path||!/^text\/html(?:;|$)/i.test(type)||!response.body)throw Error('response-rejected');
    const reader=response.body.getReader(),chunks=[];let size=0;
    try{while(true){const {done,value}=await reader.read();guard();if(done)break;size+=value.byteLength;if(size>1000000){cancel();throw Error('response-rejected');}chunks.push(value);}}finally{reader.releaseLock();}
    const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.byteLength;}
    const charset=type.match(/charset\s*=\s*["']?([^\s;"']+)/i)?.[1]||'utf-8';
    if(!['utf-8','utf8','iso-8859-1','windows-1252'].includes(charset.toLowerCase()))throw Error('response-rejected');
    const d=new DOMParser().parseFromString(new TextDecoder(charset).decode(bytes),'text/html');
    if(d.querySelector('input#pwinput[name="pwinput"]'))throw Error('session-required');guard();return d;
  };
  let listShape;
  try{
    context(document);context(await get('/member/profile/viewprofile'));
    const list=await get('/member/profile/flightlog.php'),tables=all(list,'table#tablelist_20');
    listShape={tables:tables.length};if(tables.length!==1)throw Error('list-unsupported');
    const t=tables[0],heads=Array.from(t.rows).filter(r=>headers.every(h=>Array.from(r.cells).some(c=>clean(c)===h)));
    listShape.headerMatches=heads.length;if(heads.length!==1)throw Error('list-unsupported');
    const width=heads[0].cells.length,rows=Array.from(t.rows).filter(r=>r!==heads[0]&&r.parentElement?.tagName!=='THEAD'&&r.parentElement?.tagName!=='TFOOT'&&r.querySelector('td')&&!(r.cells.length===1&&r.cells[0].colSpan>=width));
    listShape.rows=rows.length;listShape.columns=width;listShape.invalidRows=rows.filter(r=>r.cells.length!==width).length;
    if(!rows.length||rows.length>2000||listShape.invalidRows)throw Error('list-unsupported');
    const links=rows.flatMap(r=>all(r,'a[href]')).map(a=>new URL(a.getAttribute('href'),origin));
    const ref=links.find(u=>u.origin===origin&&u.pathname==='/member/profile/viewflight.php'&&!u.hash&&Array.from(u.searchParams.keys()).length===1&&/^\d{1,20}$/.test(u.searchParams.get('flid')||''));
    if(!ref)throw Error('list-unsupported');
    const detailStarted=performance.now(),d=await get(ref.pathname+ref.search);
    const result=readDetail(d,ref.href,allowed);guard();const detailMs=performance.now()-detailStarted;
    context(await get('/member/profile/viewprofile'));context(document);guard();
    send({context:expected,detailUrl:ref.href,result,detailMs,totalMs:performance.now()-started,listShape});
  }catch(error){send({error:['session-required','context-changed','response-rejected','list-unsupported','cancelled'].includes(error.message)?error.message:'unavailable',...(listShape?{listShape}:{})});}
  finally{clearTimeout(timer);controller.abort();if(window.__moflightDetailHttpAbort===cancel)delete window.__moflightDetailHttpAbort;}
}`;

// Bind the original reader to an inert document; provider scripts are never run.
export const INERT_DETAIL_READER = `function(document,url,allowed){const location=new URL(url);return (${DETAIL_READER_SOURCE})(allowed);}`;
export function detailHttpScript(nonce: string, expected: ObservedContext) {
  if (!/^[a-zA-Z0-9-]{1,100}$/.test(nonce)) throw new Error('Invalid trial nonce.');
  return `(${DETAIL_HTTP_SOURCE})(${JSON.stringify(nonce)},${JSON.stringify(validateContext(expected))},${JSON.stringify(DETAIL_LABELS)},${JSON.stringify(REQUIRED_HEADERS)},${INERT_DETAIL_READER});true;`;
}
export interface HttpDetailRead { context: ObservedContext; detailUrl: string; observation: DetailObservation; detailMs: number; totalMs: number }
export function detailListShape(value: unknown): Partial<Record<'tables' | 'headerMatches' | 'rows' | 'columns' | 'invalidRows', number>> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return Object.fromEntries(['tables','headerMatches','rows','columns','invalidRows'].flatMap(key => {
    const number = (value as Record<string, unknown>)[key];
    return typeof number === 'number' && Number.isSafeInteger(number) && number >= 0 && number <= 100000 ? [[key, number]] : [];
  }));
}
export function decodeHttpDetail(value: unknown, expected: ObservedContext, at: string): HttpDetailRead {
  const p = value as Record<string, unknown>;
  const context = validateContext(p?.context);
  if (p.error || context.accountNumber !== expected.accountNumber || context.clubLabel !== expected.clubLabel ||
      typeof p.detailUrl !== 'string' || !detailReference(p.detailUrl) || new URL(p.detailUrl).origin !== new URL(PROFILE_URL).origin ||
      typeof p.detailMs !== 'number' || !Number.isFinite(p.detailMs) || p.detailMs < 0 ||
      typeof p.totalMs !== 'number' || !Number.isFinite(p.totalMs) || p.totalMs < p.detailMs || p.totalMs >= 10000) throw new Error('Rejected HTTP detail trial.');
  return { context, detailUrl: p.detailUrl, observation: decodeDetail(p.result, p.detailUrl, at), detailMs: p.detailMs, totalMs: p.totalMs };
}
export function compareDetailReads(http: DetailObservation, navigation: DetailObservation) {
  if (http.sourceFlightId !== navigation.sourceFlightId) throw new Error('Different detail references.');
  const fields = new Set([...http.fields, ...navigation.fields].map(f => f.section + ':' + f.label));
  const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
  let exact = 0, normalized = 0;
  for (const key of fields) {
    const a = http.fields.find(f => f.section + ':' + f.label === key), b = navigation.fields.find(f => f.section + ':' + f.label === key);
    if (a && b) { if (a.raw === b.raw) exact++; if (clean(a.raw) === clean(b.raw)) normalized++; }
  }
  return { fields: fields.size, exact, normalized, equal: fields.size > 0 && exact === fields.size };
}

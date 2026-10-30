import { sameContext, scopedBridge, validateContext, type ObservedContext } from './context';
import { EXPORT_DRIVER_SOURCE, EXPORT_ROWS_PER_PAGE, type ExportRun } from './export';
import { flightUrl } from './probe';

// Android candidate: delivered rollout is gated by the source-specific #112
// native/live evidence. Other platforms retain the existing DOM path.
export const HTTP_FLIGHT_READ_ENABLED = true;

export function exportReadTarget(anchor: string, target: string): string {
  if (!flightUrl(anchor) || !flightUrl(target)) throw new Error('Unsupported HTTP export target.');
  const a = new URL(anchor), t = new URL(target), keys = [...t.searchParams.keys()];
  if (a.hash || t.hash || a.origin !== t.origin || keys.length > 1 || keys.length === 1 &&
    (keys[0] !== 'page' || !/^[1-9]\d?$/.test(t.searchParams.get('page')!) || Number(t.searchParams.get('page')) > 40)) throw new Error('Unsupported HTTP export target.');
  return t.href;
}

// Fetched documents are inert. Read text with rendered whitespace separators and
// exclude non-visible executable/style/template content, without running it.
export const INERT_EXPORT_TEXT_SOURCE = String.raw`function(root) {
  const walk=n=>{
    if(n.nodeType===3)return n.nodeValue||'';
    if(n.nodeType!==1)return '';
    if(['SCRIPT','STYLE','TEMPLATE','NOSCRIPT'].includes(n.tagName)||n.hidden||n.style?.display==='none'||n.style?.visibility==='hidden')return '';
    if(n.tagName==='BR')return ' ';
    const value=Array.from(n.childNodes).map(walk).join('');
    return ['DIV','P','LI','UL','OL','TR','TABLE'].includes(n.tagName)?' '+value+' ':value;
  };return walk(root);
}`;
export const HTTP_EXPORT_READER_SOURCE = `function(document,url,token,request,accountLabel){const location=new URL(url);let payload;const window={ReactNativeWebView:{postMessage:s=>{payload=JSON.parse(s);}}};window.top=window;(${EXPORT_DRIVER_SOURCE})(token,'read',request,accountLabel,${EXPORT_ROWS_PER_PAGE});return payload;}`;

export const EXPORT_HTTP_SOURCE = String.raw`async function(token,expected,request,accountLabel,target,read,text) {
  const anchor=location.href,origin=location.origin;
  if(window.top!==window||location.protocol!=='https:'||!['vereinsflieger.de','www.vereinsflieger.de'].includes(location.hostname)||location.port||location.pathname!=='/member/profile/flightlog.php')return;
  const send=p=>window.ReactNativeWebView?.postMessage(JSON.stringify({kind:'vf-export-http-v1',token,url:anchor,target,...p}));
  if(window.__moflightExportHttpAbort){send({error:'busy'});return;}
  const controller=new AbortController(),cancel=()=>controller.abort(),started=Date.now();
  window.__moflightExportHttpAbort=cancel;const timer=setTimeout(cancel,20000);
  const guard=()=>{if(controller.signal.aborted||Date.now()-started>=20000||location.href!==anchor||window.__moflightExportHttpAbort!==cancel)throw Error('cancelled');};
  const clean=e=>(e?.textContent||'').replace(/\s+/g,' ').trim();
  const context=d=>{
    if(d.querySelector('input#pwinput[name="pwinput"]'))throw Error('session-required');
    const rows=Array.from(d.querySelectorAll('table.tablelist.alternative tr')).filter(r=>clean(r.cells[0])==='Benutzernummer');
    const clubs=Array.from(d.querySelectorAll('#topnavi a[href]')).filter(a=>{const u=new URL(a.getAttribute('href'),origin+'/member/profile/viewprofile');return u.origin===origin&&u.pathname==='/member/community/main'&&!u.search&&!u.hash;});
    if(rows.length!==1||rows[0].cells.length!==2||clubs.length!==1||clean(rows[0].cells[1])!==expected.accountNumber||clean(clubs[0])!==expected.clubLabel)throw Error('context-changed');
    return {...expected};
  };
  const get=async(url,limit)=>{
    guard();const r=await fetch(url,{method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error',signal:controller.signal});guard();
    const type=r.headers.get('content-type')||'';
    if(!r.ok||r.redirected||r.url!==url||!/^text\/html(?:;|$)/i.test(type)||!r.body)throw Error('unsupported');
    const reader=r.body.getReader(),chunks=[];let size=0;
    try{while(true){const {done,value}=await reader.read();guard();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw Error('unsupported');}chunks.push(value);}}finally{reader.releaseLock();}
    const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.byteLength;}
    const charset=type.match(/charset\s*=\s*["']?([^\s;"']+)/i)?.[1]||'utf-8';
    if(!['utf-8','utf8','iso-8859-1','windows-1252'].includes(charset.toLowerCase()))throw Error('unsupported');
    const d=new DOMParser().parseFromString(new TextDecoder(charset,{fatal:true}).decode(bytes),'text/html');
    if(d.querySelector('input#pwinput[name="pwinput"]'))throw Error('session-required');guard();return d;
  };
  let reply;
  try{
    const before=context(await get(origin+'/member/profile/viewprofile',1000000));let payload,unsupported=false;
    try{
      const d=await get(target,4000000);
      for(const e of d.querySelectorAll('*'))Object.defineProperty(e,'innerText',{get:()=>text(e)});
      payload=read(d,target,token,request,accountLabel);
      if(!payload||payload.error||JSON.stringify(payload).length>2000000)unsupported=true;
    }catch(error){if(['session-required','context-changed','cancelled'].includes(error.message))throw error;unsupported=true;}
    const after=context(await get(origin+'/member/profile/viewprofile',1000000));guard();
    reply={contextBefore:before,contextAfter:after,...(unsupported?{error:'unsupported',fallbackSafe:true}:{payload}),milliseconds:Date.now()-started};
  }catch(error){reply={error:['session-required','context-changed','cancelled','busy'].includes(error.message)?error.message:'unavailable',milliseconds:Math.max(0,Date.now()-started)};}
  finally{clearTimeout(timer);controller.abort();if(window.__moflightExportHttpAbort===cancel)delete window.__moflightExportHttpAbort;}
  if(location.href===anchor)send(reply);
}`;

export function exportHttpScript(token: string, run: ExportRun, expected: ObservedContext, anchor: string, target: string): string {
  if (!/^[a-zA-Z0-9-]{1,100}$/.test(token) || run.phase !== 'read') throw new Error('Invalid HTTP read command.');
  const safeTarget = exportReadTarget(anchor, target);
  return `(${EXPORT_HTTP_SOURCE})(${JSON.stringify(token)},${JSON.stringify(validateContext(expected))},${JSON.stringify(run.request)},${JSON.stringify(run.accountLabel)},${JSON.stringify(safeTarget)},${HTTP_EXPORT_READER_SOURCE},${INERT_EXPORT_TEXT_SOURCE});true;`;
}

export type HttpExportReply = { kind: 'page'; payload: string; milliseconds: number } | { kind: 'fallback'; milliseconds: number } | { kind: 'failed'; reason: 'session-required' | 'context-changed' | 'unavailable'; milliseconds?: number };
export function decodeHttpExportReply(raw: string, sender: string, document: string, pending: { token: string; anchor: string; target: string; expected: ObservedContext }): HttpExportReply | null {
  if (raw.length > 2100000 || !scopedBridge(sender, document, pending.anchor)) return null;
  let p: Record<string, unknown>;
  try { p = JSON.parse(raw); } catch { return null; }
  if (!p || p.kind !== 'vf-export-http-v1' || p.token !== pending.token || p.url !== pending.anchor || p.target !== pending.target) return null;
  const elapsed = typeof p.milliseconds === 'number' && Number.isFinite(p.milliseconds) && p.milliseconds >= 0 && p.milliseconds <= 30000 ? { milliseconds: p.milliseconds } : {};
  if (p.error !== undefined && p.error !== 'unsupported') return { kind: 'failed', reason: p.error === 'session-required' || p.error === 'context-changed' ? p.error : 'unavailable', ...elapsed };
  try {
    if (!sameContext(validateContext(p.contextBefore), pending.expected) || !sameContext(validateContext(p.contextAfter), pending.expected) ||
      typeof p.milliseconds !== 'number' || !Number.isFinite(p.milliseconds) || p.milliseconds < 0 || p.milliseconds >= 20000) throw Error();
    if (p.error === 'unsupported') return p.fallbackSafe === true ? { kind: 'fallback', milliseconds: p.milliseconds } : { kind: 'failed', reason: 'unavailable' };
    if (!p.payload || typeof p.payload !== 'object' || Array.isArray(p.payload)) throw Error();
    const payload = p.payload as Record<string, unknown>;
    if (payload.kind !== 'vf-export-v1' || payload.phase !== 'read' || payload.token !== pending.token || payload.url !== pending.target || payload.error) throw Error();
    return { kind: 'page', payload: JSON.stringify(payload), milliseconds: p.milliseconds };
  } catch { return { kind: 'failed', reason: 'context-changed', ...elapsed }; }
}

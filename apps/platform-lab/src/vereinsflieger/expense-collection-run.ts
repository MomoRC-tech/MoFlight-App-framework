import { canonical } from '@moflight/flight-logbook';
import { PROFILE_URL, scopedBridge } from './context';
import { FINANCIAL_PROFILE_READER_SOURCE, FinancialReadError, readFinancialProfile } from './expense-capture-run';
import { decodeFlightBillingObservation, FLIGHT_BILLING_READER_SOURCE, type FlightBillingObservation, type FlightBillingRead } from './expense-flight-billing';
import { validateFinancialObservationTarget, type FinancialObservationReceipt, type FinancialObservationStore } from './expense-observation-store';
import { validateFinancialEvidenceSnapshot, type FinancialEvidenceSnapshot, type FinancialEvidenceStore } from './expense-evidence-store';
import type { FinancialObservationTarget } from './expense-ledger-observation';
import { INERT_EXPORT_TEXT_SOURCE } from './export-http';
import type { DurableInvoiceBookingEvidence } from './expense-projection-adapter';
import { validateFinancialSourcePages } from './expense-projection-adapter';

/** Inert same-origin GETs only. The source selection is an independently
 * verified native own-library list; no source IDs are guessed or scraped from
 * another member. No provider filter/preset/record is modified, and invoice
 * print URLs are retained as identities without fetching documents. */
export const FINANCIAL_COLLECTION_SOURCE = String.raw`async function(expected,refs,nonce,readProfile,readBilling,text){
 const anchor=location.href,origin=location.origin;
 if(window.top!==window||anchor!==expected.profileUrl)return;
 const controller=new AbortController(),started=Date.now();let cancelled=false;
 const abort=()=>{cancelled=true;controller.abort();};window.__moflightFinancialAbort=abort;const timer=setTimeout(abort,240000);
 const guard=()=>{if(cancelled||location.href!==anchor||window.__moflightFinancialAbort!==abort)throw Error('cancelled');};
 const send=p=>{guard();window.ReactNativeWebView?.postMessage(JSON.stringify({kind:'vf-financial-collection-v1',nonce,url:anchor,...p}));};
 const clean=e=>text(e).replace(/\s+/g,' ').trim();
 const route=(href,path,key)=>{const u=new URL(href,origin+path);if(u.origin!==origin||u.protocol!=='https:'||u.username||u.password||u.hash||u.port||u.pathname!==path|| (key?[...u.searchParams.keys()].join(',')!==key||!/^\d{1,20}$/.test(u.searchParams.get(key)||''):u.search))throw Error('route');return u.href;};
 const get=async url=>{guard();const r=await fetch(url,{method:'GET',credentials:'same-origin',redirect:'error',cache:'no-store',signal:controller.signal});guard();const type=r.headers.get('content-type')||'';if(!r.ok||r.redirected||r.url!==url||!/^text\/html(?:;|$)/i.test(type)||!r.body)throw Error('source');const reader=r.body.getReader(),chunks=[];let n=0;try{while(true){const v=await reader.read();guard();if(v.done)break;n+=v.value.byteLength;if(n>1500000)throw Error('source');chunks.push(v.value);}}finally{reader.releaseLock();}const bytes=new Uint8Array(n);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.byteLength;}const charset=type.match(/charset\s*=\s*["']?([^\s;"']+)/i)?.[1]||'utf-8';if(!['utf-8','utf8','iso-8859-1','windows-1252'].includes(charset.toLowerCase()))throw Error('source');const d=new DOMParser().parseFromString(new TextDecoder(charset,{fatal:true}).decode(bytes),'text/html');if(d.querySelector('input#pwinput[name="pwinput"]'))throw Error('login');for(const e of d.querySelectorAll('*')){Object.defineProperty(e,'innerText',{get:()=>text(e).replace(/\s+/g,' ').trim()});e.getClientRects=()=>e.closest('[hidden]')||e.style.display==='none'?[]:[{}];}return d;};
 const profile=d=>{const p=readProfile(d,expected.profileUrl);if(p?.error==='sign-in-required')throw Error('login');if(!p||p.error||!p.context)throw Error('source');if(!Object.keys(expected.context).every(key=>p.context[key]===expected.context[key])||p.ownRecipientLabel!==expected.ownRecipientLabel)throw Error('context');return p;};
 const tableRows=(d,id,labels)=>{const t=d.querySelector('table#'+id);if(!t||t.rows.length>10002)throw Error('table');const heads=[...t.rows].filter(r=>labels.every(label=>[...r.cells].some(c=>clean(c)===label)));if(heads.length!==1)throw Error('headers');const head=heads[0],keys=Object.fromEntries(labels.map(label=>[label,[...head.cells].findIndex(c=>clean(c)===label)]));const width=head.cells.length;const all=[...t.rows].filter(r=>r!==head&&!r.closest('thead')&&!r.closest('tfoot')&&r.querySelector('td')&&r.cells.length===width&&[...r.cells].every(c=>c.colSpan===1&&c.rowSpan===1));const footer=[...d.querySelectorAll('table')].map(t=>clean(t)).find(s=>/^\d+ Datensätze$/.test(s));return {rows:all.slice(0,20),keys,truncated:all.length>20,reported:footer?Number(footer.split(' ')[0]):null};};
 try{
  if(document.readyState!=='complete')await new Promise(resolve=>window.addEventListener('load',resolve,{once:true}));guard();
  const before=profile(document);const ownLinks=[...document.querySelectorAll('a[href]')].map(a=>({label:clean(a),href:new URL(a.getAttribute('href'),anchor).href}));
  const summaryLink=ownLinks.find(a=>new URL(a.href).pathname==='/member/profile/userinvoice.php');if(!summaryLink)throw Error('invoices');const summaryUrl=route(summaryLink.href,'/member/profile/userinvoice.php');
  const accountLinks=[...new Map(ownLinks.filter(a=>new URL(a.href).pathname==='/member/profile/account.php').map(a=>[a.href,a])).values()];if(!accountLinks.length||accountLinks.length>10)throw Error('accounts');
  const invoiceDoc=await get(summaryUrl),invoiceTable=tableRows(invoiceDoc,'tablelist_38',['Nr.','Rechnungsdatum','Rechnungsempfänger','Titel','Betrag (EUR)']);
  const summary={evidenceRef:'summary',sourceUrl:summaryUrl,rows:invoiceTable.rows.map((r,position)=>{const k=invoiceTable.keys,c=r.cells,links=[...r.querySelectorAll('a[href]')].map(a=>new URL(a.getAttribute('href'),summaryUrl).href).filter(u=>new URL(u).pathname==='/member/profile/printuserinvoice.php');if(links.length!==1)throw Error('invoice-link');return {position,numberRaw:clean(c[k['Nr.']]),recipientRaw:clean(c[k['Rechnungsempfänger']]),url:route(links[0],'/member/profile/printuserinvoice.php','uiid'),dateRaw:clean(c[k['Rechnungsdatum']]),amountRaw:clean(c[k['Betrag (EUR)']]),titleRaw:clean(c[k['Titel']])};}),coverage:{kind:'visible-page',truncated:invoiceTable.truncated,pagination:'unverified'}};
  const ledgers=[];
  for(const link of accountLinks){const url=route(link.href,'/member/profile/account.php','caid'),d=await get(url);const heading=clean(d.querySelector('#globalfiltertime')?.parentElement);if(!heading.includes(expected.ownRecipientLabel)||!heading.includes(link.label))throw Error('account-heading');const t=tableRows(d,'tablelist_90',['Datum','BuchungsNr.','Abrechnung','Informationen','Wert (EUR)','Saldo (EUR)']);const labels=['Datum','BuchungsNr.','Abrechnung','Informationen','Wert (EUR)','Saldo (EUR)'];const keys=['date','booking','invoice','information','value','balance'];const columns=labels.map((label,index)=>({key:keys[index],label,index:t.keys[label]})).sort((a,b)=>a.index-b.index);const rows=t.rows.map((r,position)=>({position,values:columns.map(c=>clean(r.cells[c.index]))}));const invoiceLinks=t.rows.flatMap((r,rowPosition)=>[...r.cells[t.keys['Abrechnung']].querySelectorAll('a[href]')].map(a=>({rowPosition,url:route(new URL(a.getAttribute('href'),url).href,'/member/profile/printuserinvoice.php','uiid')})));
   ledgers.push({label:link.label,url,selector:new URL(url).searchParams.get('caid'),columns,rows,filters:[clean(d.querySelector('#globalfiltertime'))],reportedRowCount:t.reported,truncated:t.truncated||t.reported!==null&&t.reported>rows.length,invoiceLinks});}
  const billed=[],unknown=[];
  for(let i=0;i<refs.length;i++){guard();const sourceFlightRef=refs[i],url=origin+'/member/profile/viewflight.php?flid='+sourceFlightRef;
   try{const d=await get(url);const status=[...d.querySelectorAll('table.view tr')].filter(r=>clean(r.cells[0])==='Abgerechnet');if(status.length===1&&clean(status[0].cells[1])==='Nein')unknown.push({sourceFlightRef,reason:'unbilled'});else{const page=readBilling(d,url,{observedDetailUrl:url,clubLabel:expected.context.clubLabel,ownRecipientLabel:expected.ownRecipientLabel});if(page?.error)unknown.push({sourceFlightRef,reason:'unavailable'});else billed.push(page);}}
   catch(error){if(['login','context','cancelled'].includes(error.message))throw error;unknown.push({sourceFlightRef,reason:'unavailable'});}
   if((i+1)%5===0||i===refs.length-1)send({progress:{processed:i+1,total:refs.length,billed:billed.length}});
  }
  const after=profile(await get(expected.profileUrl));guard();const result={before,after,summary,ledgers,billed,unknown};if(JSON.stringify(result).length>4500000)throw Error('limit');send({result});
 }catch(error){try{send({error:error?.message==='login'?'sign-in-required':error?.message==='context'?'account-changed':'source-unavailable'});}catch{}}finally{clearTimeout(timer);abort();if(window.__moflightFinancialAbort===abort)delete window.__moflightFinancialAbort;}
}`;

const profileReader=`function(document,url){const location=new URL(url),window={};window.top=window;return (${FINANCIAL_PROFILE_READER_SOURCE})();}`;
const billingReader=`function(document,url,expected){const location=new URL(url),window={};window.top=window;return (${FLIGHT_BILLING_READER_SOURCE})(expected);}`;
type Profile={context:FinancialObservationTarget['scope']['context'];ownRecipientLabel:string};
function profile(value:unknown,target:FinancialObservationTarget):Profile{return readFinancialProfile(value,target.scope.context);}
export interface FinancialCollectionPages {
  summary:DurableInvoiceBookingEvidence['summary'];ledgers:DurableInvoiceBookingEvidence['ledgers'];
  billed:FlightBillingObservation[];unknown:FinancialEvidenceSnapshot['unknown'];retrievedAt:string;
}
export class FinancialCollectionRun {
  private stage:'before'|'collect'|'ready'|'saving'|'done'|'uncertain'|'failed'='before';
  private seen=false;private prepared=false;private before:Profile|null=null;private pages:FinancialCollectionPages|null=null;
  private saved:FinancialEvidenceSnapshot|null=null;
  readonly progress={processed:0,total:0,billed:0};
  private readonly identity:string;private readonly refs:string[];
  constructor(target:FinancialObservationTarget,readonly id:string,refs:readonly string[],private readonly ports:{prepare(gate:()=>Promise<void>):Promise<void>;hash(text:string):Promise<string>}){
    this.identity=canonical(validateFinancialObservationTarget(target));if(!/^[a-zA-Z0-9_-]{1,80}$/.test(id)||refs.length>500||new Set(refs).size!==refs.length||refs.some(ref=>!/^\d{1,20}$/.test(ref)))throw Error('Invalid financial source selection.');this.refs=[...refs];this.progress.total=refs.length;
  }
  get target(){return JSON.parse(this.identity) as FinancialObservationTarget;}get url(){return PROFILE_URL;}
  async prepare(gate:()=>Promise<void>){if(!this.prepared){await gate();await this.ports.prepare(gate);await gate();this.prepared=true;}}
  get script(){const nonce=this.id+'-'+this.stage;if(this.stage==='before')return `(()=>{let sent=false;const send=()=>{if(sent||document.readyState!=='complete')return;sent=true;window.ReactNativeWebView?.postMessage(JSON.stringify({kind:'vf-financial-collection-v1',nonce:${JSON.stringify(nonce)},url:location.href,profile:(${FINANCIAL_PROFILE_READER_SOURCE})()}));};if(document.readyState==='complete')send();else window.addEventListener('load',send,{once:true});})();true;`;
    if(this.stage!=='collect'||!this.before)throw Error('Financial collection is not reading.');
    return `(${FINANCIAL_COLLECTION_SOURCE})(${JSON.stringify({profileUrl:PROFILE_URL,context:this.target.scope.context,ownRecipientLabel:this.before.ownRecipientLabel})},${JSON.stringify(this.refs)},${JSON.stringify(nonce)},${profileReader},${billingReader},${INERT_EXPORT_TEXT_SOURCE});true;`;
  }
  observeNavigation(url:string){if(url===PROFILE_URL)this.seen=true;}
  accept(sender:string,documentUrl:string,input:unknown,selected:FinancialObservationTarget,at:string):'ignored'|'navigate'|'save'{
    if(canonical(validateFinancialObservationTarget(selected))!==this.identity)throw Error('Financial collection owner changed.');
    const p=input as Record<string,unknown>;if(!this.seen||!scopedBridge(sender,documentUrl,PROFILE_URL)||!p||p.kind!=='vf-financial-collection-v1'||p.nonce!==this.id+'-'+this.stage||p.url!==PROFILE_URL)return 'ignored';
    if(p.error){this.stage='failed';if(p.error==='sign-in-required'||p.error==='account-changed')throw new FinancialReadError(p.error);throw Error('Financial source unavailable.');}
    if(this.stage==='before'){this.before=profile(p.profile,this.target);this.stage='collect';this.seen=false;return 'navigate';}
    if(this.stage!=='collect'||!this.before)return 'ignored';
    if(p.progress){const v=p.progress as typeof this.progress;if(!Number.isSafeInteger(v.processed)||v.processed<0||v.processed>this.refs.length||v.total!==this.refs.length||!Number.isSafeInteger(v.billed)||v.billed<0||v.billed>v.processed)throw Error('Invalid financial progress.');Object.assign(this.progress,v);return 'ignored';}
    const r=p.result as {before:Profile;after:Profile;summary:DurableInvoiceBookingEvidence['summary'];ledgers:Record<string,unknown>[];billed:FlightBillingRead[];unknown:FinancialEvidenceSnapshot['unknown']};
    if(!r||canonical(profile(r.before,this.target))!==canonical(this.before)||canonical(profile(r.after,this.target))!==canonical(this.before)||!Array.isArray(r.billed)||!Array.isArray(r.unknown)||!Array.isArray(r.ledgers)||!r.ledgers.length||r.ledgers.length>10||r.billed.length+r.unknown.length!==this.refs.length)throw Error('Invalid financial source inventory.');
    const seen=new Set<string>();const billed=r.billed.map(read=>{if(!this.refs.includes(read.sourceFlightId)||seen.has(read.sourceFlightId))throw Error('Foreign or repeated financial source.');seen.add(read.sourceFlightId);return decodeFlightBillingObservation(read,{...this.target,ownRecipientLabel:this.before!.ownRecipientLabel,observedDetailUrl:PROFILE_URL.replace('viewprofile','viewflight.php?flid='+read.sourceFlightId)},this.target,r.before.context,r.after.context,at);});
    for(const v of r.unknown){if(!this.refs.includes(v.sourceFlightRef)||seen.has(v.sourceFlightRef)||!['unavailable','unbilled'].includes(v.reason))throw Error('Unknown financial source differs.');seen.add(v.sourceFlightRef);}
    const ledgers:FinancialEvidenceSnapshot['ledgers']=r.ledgers.map((item,index)=>({evidenceRef:`${this.id}-ledger-${index}`,invoiceLinks:item.invoiceLinks as {rowPosition:number;url:string}[],observation:{version:1,...this.target,contextBefore:r.before.context,contextAfter:r.after.context,sourceAccount:{label:item.label as string,selector:item.selector as string},ownNavigation:{label:item.label as string,url:item.url as string},pageAccountLabel:item.label as string,sourceUrl:item.url as string,reportedRowCount:item.reportedRowCount as number|null,capture:{version:1,id:`${this.id}-ledger-${index}`,retrievedAt:at,owner:this.target.scope.owner,connectionId:this.target.scope.connectionId,sourceIdentity:'provisional-observed-profile',category:'ledger',path:'/member/profile/account.php',columns:item.columns as {key:string;label:string;index:number}[],rows:item.rows as {position:number;values:string[]}[],filters:item.filters as string[],empty:!(item.rows as unknown[]).length,coverage:{kind:'visible-page',truncated:item.truncated as boolean,pagination:'unverified'}}}}));
    validateFinancialSourcePages({summary:r.summary,ledgers},this.before.ownRecipientLabel,this.target);
    this.pages={summary:{...r.summary,evidenceRef:this.id+'-summary'},ledgers,billed,unknown:JSON.parse(canonical(r.unknown)),retrievedAt:at};this.stage='ready';return 'save';
  }
  cancel(){if(this.stage==='saving'||this.stage==='done')return false;this.stage='failed';return true;}
  markSaveAcknowledgementUncertain(){this.stage='uncertain';}
  async save(store:FinancialObservationStore,current:()=>FinancialObservationTarget,gate:()=>Promise<void>):Promise<FinancialObservationReceipt>{
    if(!['ready','uncertain'].includes(this.stage)||!this.pages||!this.before||canonical(store.target)!==this.identity||canonical(current())!==this.identity)throw Error('Financial collection is not ready.');this.stage='saving';
    try{await gate();const sources:FinancialEvidenceSnapshot['sources']=[];
      for(const [index,value] of this.pages.billed.entries()){
        const prior=await store.assessFlight(value.source.sourceFlightId);if(prior.state==='history-limit')throw Error('Financial history needs explicit review.');let reuse:FinancialObservationReceipt|null=null;
        for(const id of prior.variants.flat()){const receipt=await store.find(id);if(receipt?.kind==='billed-flight'&&canonical((receipt.value as FlightBillingObservation).source)===canonical(value.source)){reuse=receipt;break;}}
        if(!reuse)await store.save(`${this.id}-bill-${index}`,'billed-flight',value);
        sources.push({sourceFlightRef:value.source.sourceFlightId,sourceHash:await this.ports.hash(canonical(value.source))});await gate();
      }
      let first:FinancialObservationReceipt|null=null;
      for(const [index,item] of this.pages.ledgers.entries()){const receipt=await store.save(index===0?this.id:`${this.id}-ledger-${index}`,'ledger',item.observation);first??=receipt;await gate();}
      this.saved=validateFinancialEvidenceSnapshot({version:1,id:this.id,target:this.target,retrievedAt:this.pages.retrievedAt,ownRecipientLabel:this.before.ownRecipientLabel,contextBefore:this.before.context,contextAfter:this.before.context,selection:{source:'verified-own-flight-library',sourceFlightRefs:[...this.refs]},sources,unknown:this.pages.unknown,summary:this.pages.summary,ledgers:this.pages.ledgers},this.target);
      if(!first)throw Error('Financial account source missing.');await gate();this.stage='done';return first;
    }catch(error){this.stage='uncertain';throw error;}
  }
  async saveEvidence(store:FinancialEvidenceStore,gate:()=>Promise<void>){if(!this.saved)throw Error('Financial raw receipts not saved.');await gate();await store.save(this.saved);await gate();}
}

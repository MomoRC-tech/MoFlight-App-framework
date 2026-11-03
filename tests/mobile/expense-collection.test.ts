import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FinancialCollectionCheckpoint } from '../../apps/platform-lab/src/vereinsflieger/expense-collection-checkpoint.ts';
import { canonical } from '../../packages/flight-logbook/src/index.ts';
import { FINANCIAL_COLLECTION_SOURCE, FinancialCollectionRun } from '../../apps/platform-lab/src/vereinsflieger/expense-collection-run.ts';
import { FinancialObservationStore } from '../../apps/platform-lab/src/vereinsflieger/expense-observation-store.ts';
import { FinancialEvidenceStore, financialProofsFor, type FinancialEvidenceSnapshot } from '../../apps/platform-lab/src/vereinsflieger/expense-evidence-store.ts';
import { projectCapturedFinancialArchive } from '../../apps/platform-lab/src/vereinsflieger/expense-projection-adapter.ts';
import { financialAnalysisView,expenseMoney } from '../../apps/platform-lab/src/mobile/financial-analysis-model.ts';
import { readCapturedFinancialSnapshot } from '../../apps/platform-lab/src/vereinsflieger/expense-projection-adapter.ts';
import { PROFILE_URL } from '../../apps/platform-lab/src/vereinsflieger/context.ts';
import { nodeDriver } from './sqlite-driver.ts';
import { evidenceBilled,evidenceSnapshot } from './fixtures/expense-evidence.ts';
import { financialTarget as target,financialProfile as profile,financialHash as hash,financialAt as at } from './fixtures/expense-capture.ts';
const gate=async()=>{};
const invoiceLabels=['Nr.','Rechnungsdatum','Rechnungsempfänger','Titel','Betrag (EUR)'];
const ledgerLabels=['Datum','BuchungsNr.','Abrechnung','Informationen','Wert (EUR)','Saldo (EUR)'];
function sourceLink(href:string,label:string){return {innerText:label,textContent:label,getAttribute:(name:string)=>name==='href'?href:null,querySelectorAll:()=>[]};}
function sourceCell(value:string,links:ReturnType<typeof sourceLink>[]=[]){return {innerText:value,textContent:value,colSpan:1,rowSpan:1,querySelectorAll:(selector:string)=>selector==='a[href]'?links:[]};}
function sourceRow(values:string[],header:boolean,linksByCell:Record<number,ReturnType<typeof sourceLink>[]>={}){
 const cells=values.map((value,index)=>sourceCell(value,linksByCell[index]??[]));
 return {cells,innerText:'',textContent:'',querySelector:(selector:string)=>selector==='td'&&!header?cells[0]:null,querySelectorAll:(selector:string)=>selector==='a[href]'?cells.flatMap(cell=>cell.querySelectorAll(selector)):[],closest:()=>null};
}
function collectionPage(url:string,recipient:string){
 const u=new URL(url);let table:unknown=null,filter:unknown=null;
 if(u.pathname==='/member/profile/userinvoice.php'){
  const row=sourceRow(['INV-1','01.05.2026',recipient,'Flight fee','15,00'],false,{3:[sourceLink('/member/profile/printuserinvoice.php?uiid=17','Invoice')]});
  table={rows:[sourceRow(invoiceLabels,true),row],innerText:'',textContent:''};
 }else if(u.pathname==='/member/profile/account.php'){
  table={rows:[sourceRow(ledgerLabels,true),sourceRow(['01.05.2026','1','','Flight fee','-15,00','0,00'],false)],innerText:'',textContent:''};
  filter={innerText:'All time',textContent:'All time',parentElement:{innerText:`${recipient} Main account`,textContent:`${recipient} Main account`}};
 }
 return {querySelector:(selector:string)=>selector==='table#tablelist_38'&&u.pathname==='/member/profile/userinvoice.php'||selector==='table#tablelist_90'&&u.pathname==='/member/profile/account.php'?table:selector==='#globalfiltertime'?filter:null,
  querySelectorAll:(selector:string)=>selector==='*'?[]:selector==='table'?table?[table]:[]:selector==='table.view tr'?[]:[],};
}
function sourceResponse(url:string,options:{ok?:boolean;body?:string}={}){
 const bytes=new TextEncoder().encode(options.body??url);let read=false;
 return {ok:options.ok??true,redirected:false,url,headers:{get:()=> 'text/html; charset=utf-8'},body:options.ok===false?null:{getReader:()=>({async read(){if(read)return{done:true};read=true;return{done:false,value:bytes};},releaseLock(){}})}};
}
function collectionSourceFixture(fetch:(url:string,init:{signal:AbortSignal})=>Promise<unknown>,readBilling?:(doc:unknown,url:string)=>unknown){
 const packets:string[]=[],window:{top:unknown;ReactNativeWebView:{postMessage:(value:string)=>void};__moflightFinancialAbort?:()=>void}={top:null,ReactNativeWebView:{postMessage:value=>packets.push(value)}};window.top=window;
 const recipient=profile().ownRecipientLabel,document={readyState:'complete',querySelectorAll:(selector:string)=>selector==='a[href]'?[sourceLink('/member/profile/userinvoice.php','Invoices'),sourceLink('/member/profile/account.php?caid=7','Main account')]:[]};
 class FixtureDOMParser{parseFromString(html:string){return collectionPage(html,recipient);}}
 const readProfile=()=>profile(),billing=readBilling??((_doc,url)=>({sourceFlightId:new URL(url).searchParams.get('flid')}));
 const collect=runInNewContext(`(${FINANCIAL_COLLECTION_SOURCE})`,{window,document,location:new URL(PROFILE_URL),URL,AbortController,setTimeout,clearTimeout,DOMParser:FixtureDOMParser,TextDecoder,Uint8Array,fetch});
 return {packets,window,collect,expected:{profileUrl:PROFILE_URL,context:target.scope.context,ownRecipientLabel:recipient},readProfile,billing};
}
function runCollectionSource(fixture:ReturnType<typeof collectionSourceFixture>,refs:string[],nonce='synthetic-source'){
 return fixture.collect(fixture.expected,refs,nonce,fixture.readProfile,fixture.billing,(value:{innerText?:string;textContent?:string})=>value.innerText??value.textContent??'');
}
async function waitForFixture(predicate:()=>boolean){for(let i=0;i<200;i++){if(predicate())return;await new Promise<void>(resolve=>{setTimeout(resolve,1);});}assert.fail('Synthetic collection did not reach its expected checkpoint');}
test('collection script forwards only allowlisted recovery reasons and clears its abort ownership', async () => {
 for(const reason of ['sign-in-required','account-changed','unknown']) {
  const packets:string[]=[],window={top:null as unknown,ReactNativeWebView:{postMessage:(text:string)=>packets.push(text)}};window.top=window;
  const input=profile();if(reason==='account-changed')input.context.accountNumber='999990099';
  const readProfile=()=>reason==='account-changed'?input:{error:reason==='unknown'?'private provider details':reason};
  const collect=runInNewContext(`(${FINANCIAL_COLLECTION_SOURCE})`,{window,document:{readyState:'complete'},location:new URL(PROFILE_URL),URL,AbortController,setTimeout,clearTimeout});
  await collect({profileUrl:PROFILE_URL,context:target.scope.context,ownRecipientLabel:profile().ownRecipientLabel},[],'synthetic-collect',readProfile,()=>{},()=>{});
  assert.equal(packets.length,1);const packet=JSON.parse(packets[0]!);assert.equal(packet.error,reason==='unknown'?'source-unavailable':reason);
  assert.deepEqual(packet.diagnostic,{stage:'profile-before',reason:reason==='sign-in-required'?'authentication':reason==='account-changed'?'account-context':'response'});
  assert.equal(packets[0]!.includes('private provider details'),false);assert.equal('__moflightFinancialAbort' in window,false);
 }
});
test('actual collection source bounds flight GETs at two and preserves deterministic order and prefix progress',async()=>{
 let active=0,maxActive=0;
 const fixture=collectionSourceFixture(async(url)=>{
  if(new URL(url).pathname==='/member/profile/viewflight.php'){
   active++;maxActive=Math.max(maxActive,active);const id=new URL(url).searchParams.get('flid');await new Promise<void>(resolve=>{setTimeout(resolve,id==='54321'?15:1);});active--;
  }
  return sourceResponse(url);
 },(_doc,url)=>{const sourceFlightId=new URL(url).searchParams.get('flid')!;return sourceFlightId==='54322'?{error:'private billing sentinel'}:{sourceFlightId};});
 const refs=Array.from({length:7},(_,index)=>String(54321+index));
 await runCollectionSource(fixture,refs);
 const packets=fixture.packets.map(value=>JSON.parse(value));
 assert.equal(maxActive,2);assert.equal(active,0);
 assert.deepEqual(packets.filter(value=>value.progress).map(value=>value.progress),[
  {processed:5,total:7,billed:4},{processed:7,total:7,billed:6},
 ]);
 assert.deepEqual(packets.at(-1)?.result.billed.map((value:{sourceFlightId:string})=>value.sourceFlightId),['54321','54323','54324','54325','54326','54327']);
 assert.deepEqual(packets.at(-1)?.result.unknown,[{sourceFlightRef:'54322',reason:'unavailable'}]);
 assert.equal(JSON.stringify(packets).includes('private billing sentinel'),false);
});
test('actual collection source reports fixed early stage/reason codes without provider details',async()=>{
 const fixture=collectionSourceFixture(async(url)=>new URL(url).pathname==='/member/profile/userinvoice.php'
  ?sourceResponse(url,{ok:false,body:'PRIVATE_SENTINEL invoice account url'})
  :sourceResponse(url));
 await runCollectionSource(fixture,['54321']);
 assert.equal(fixture.packets.length,1);const failure=JSON.parse(fixture.packets[0]!);
 assert.equal(failure.error,'source-unavailable');assert.deepEqual(failure.diagnostic,{stage:'invoice-summary',reason:'response'});
 assert.equal(JSON.stringify(failure.diagnostic).includes('PRIVATE_SENTINEL'),false);
 const job=new FinancialCollectionRun(target,'diag-source',['54321'],{hash,prepare:async()=>{}});before(job);
 assert.throws(()=>job.accept(PROFILE_URL,PROFILE_URL,{...failure,nonce:job.id+'-collect'},target,at),/Financial source unavailable/);
 assert.deepEqual(job.takeSourceDiagnostic(),{stage:'invoice-summary',reason:'response'});
 assert.equal(job.takeSourceDiagnostic(),null);
});
test('actual collection source cancellation aborts both bounded workers without a late packet',async()=>{
 let active=0;
 const fixture=collectionSourceFixture((url,init)=>new URL(url).pathname==='/member/profile/viewflight.php'
  ?new Promise((_resolve,reject)=>{active++;const stop=()=>{active--;reject(Error('fixture aborted'));};if(init.signal.aborted)stop();else init.signal.addEventListener('abort',stop,{once:true});})
  :Promise.resolve(sourceResponse(url)));
 const collecting=runCollectionSource(fixture,['54321','54322','54323']);
 await waitForFixture(()=>active===2);fixture.window.__moflightFinancialAbort?.();await collecting;
 await new Promise<void>(resolve=>{setTimeout(resolve,0);});
 assert.equal(active,0);assert.deepEqual(fixture.packets,[]);assert.equal('__moflightFinancialAbort' in fixture.window,false);
});
async function result(){const evidence=await evidenceSnapshot();return {before:profile(),after:profile(),summary:evidence.summary,ledgers:evidence.ledgers.map(({observation:o,invoiceLinks})=>({label:o.sourceAccount.label,url:o.sourceUrl,selector:o.sourceAccount.selector,columns:o.capture.columns,rows:o.capture.rows,filters:o.capture.filters,reportedRowCount:o.reportedRowCount,truncated:o.capture.coverage.truncated,invoiceLinks})),billed:[evidenceBilled().source],unknown:[] as FinancialEvidenceSnapshot['unknown']};}
const refs=['54321'];
function packet(id:string,stage:string,value:object){return {kind:'vf-financial-collection-v1',nonce:id+'-'+stage,url:PROFILE_URL,...value};}
function before(job:FinancialCollectionRun){job.observeNavigation(PROFILE_URL);assert.equal(job.accept(PROFILE_URL,PROFILE_URL,packet(job.id,'before',{profile:profile()}),target,at),'navigate');job.observeNavigation(PROFILE_URL);}
async function ready(job:FinancialCollectionRun,change?:(v:Awaited<ReturnType<typeof result>>)=>void){before(job);const value=await result();change?.(value);assert.equal(job.accept(PROFILE_URL,PROFILE_URL,packet(job.id,'collect',{result:value}),target,at),'save');}

test('journaled ordinary collection saves raw receipts and durable invoice links; retry and fresh refresh never duplicate billed facts',async()=>{
 const raw=nodeDriver(':memory:'),side=nodeDriver(':memory:');const store=new FinancialObservationStore(raw,target,hash,gate),evidence=new FinancialEvidenceStore(side,target,hash,gate);
 try{await store.initialize(true);await evidence.initialize(true);await store.save('accepted-old-native','billed-flight',evidenceBilled());
  for(const id of ['ordinary-a','ordinary-b']){let prepared=0;const job=new FinancialCollectionRun(target,id,refs,{hash,prepare:async()=>{prepared++;await evidence.prepare(id,{source:'verified-own-flight-library',sourceFlightRefs:refs},at);}});await job.prepare(gate);await job.prepare(gate);assert.equal(prepared,1);await ready(job);const receipt=await job.save(store,()=>target,gate);await job.saveEvidence(evidence,gate);assert.equal(receipt.id,id);
   job.markSaveAcknowledgementUncertain();assert.deepEqual(await job.save(store,()=>target,gate),receipt);await job.saveEvidence(evidence,gate);
  }
  const archive=await store.exportBackup(),snapshots=await evidence.snapshots();assert.equal(snapshots.length,2);assert.equal((await store.history()).total,3);
  const ports={hash,gate:async()=>{},readInvoiceBookingEvidence:(_t:unknown,billed:Parameters<typeof financialProofsFor>[2])=>financialProofsFor(target,snapshots,billed,hash)};
  const projection=await projectCapturedFinancialArchive(archive,target,{mode:'year',year:2026},ports);assert.equal(projection.flying.knownMinor,640);assert.equal(projection.contributions.length,1);assert.equal(projection.flying.totalMinor,null);assert.equal(projection.annual?.covered.knownMinor,null);
  const read=await readCapturedFinancialSnapshot(archive,target,ports);assert.deepEqual(read.receipts,(await store.history()).receipts.sort((a,b)=>a.sequence-b.sequence));const data={snapshot:read.snapshot,evidence:snapshots,receipts:read.receipts};const may=financialAnalysisView(data,{mode:'month',year:2026,month:5}),june=financialAnalysisView(data,{mode:'month',year:2026,month:6});assert.equal(may.projection.flying.knownMinor,null);assert.equal(june.projection.flying.knownMinor,640);assert.equal(june.accounts[0]?.balanceMinor,0);assert.equal(june.monthly[5]?.knownMinor,640);assert.equal(may.statements.length,0);
 }finally{await raw.close();await side.close();}
});

test('stale/foreign bridge, mismatched own context, missing inventory, duplicate and foreign references cannot become saved evidence',async()=>{
 const changes:((v:Awaited<ReturnType<typeof result>>)=>void)[]=[ v=>{v.after.context.accountNumber='99999';},v=>{v.billed=[];},v=>{v.billed[0]!.sourceFlightId='99999';},v=>{v.unknown=[{sourceFlightRef:'54321',reason:'unavailable'}];}];
 for(const change of changes){
  const job=new FinancialCollectionRun(target,'guarded',refs,{hash,prepare:gate});before(job);const value=await result();change(value);assert.throws(()=>job.accept(PROFILE_URL,PROFILE_URL,packet(job.id,'collect',{result:value}),target,at));
 }
 const job=new FinancialCollectionRun(target,'bridge',refs,{hash,prepare:gate});before(job);const p=packet(job.id,'collect',{result:await result()});for(const [sender,doc,value] of [['https://evil.example',PROFILE_URL,p],[PROFILE_URL,'https://evil.example',p],[PROFILE_URL,PROFILE_URL,{...p,nonce:'stale'}]] as const)assert.equal(job.accept(sender,doc,value,target,at),'ignored');
 job.cancel();assert.equal(job.accept(PROFILE_URL,PROFILE_URL,p,target,at),'ignored');
});

test('ordinary collection keeps unavailable and unbilled references explicit, and rejects revoked writes without replacing old data',async()=>{
 const db=nodeDriver(':memory:');let allowed=true;const writeGate=async()=>{if(!allowed)throw Error('revoked');};const store=new FinancialObservationStore(db,target,hash,writeGate);
 try{await store.initialize(true);const original=await store.save('original','billed-flight',evidenceBilled());const job=new FinancialCollectionRun(target,'cancel-write',refs,{hash,prepare:gate});await ready(job);allowed=false;await assert.rejects(job.save(store,()=>target,writeGate),/revoked/);allowed=true;assert.equal(canonical(await store.find('original')),canonical(original));assert.equal((await store.history()).total,1);
 const unknown=new FinancialCollectionRun(target,'unknown',refs,{hash,prepare:gate});await ready(unknown,v=>{v.billed=[];v.unknown=[{sourceFlightRef:'54321',reason:'unbilled'}];});assert.equal((await unknown.save(store,()=>target,writeGate)).kind,'ledger');
 }finally{await db.close();}
});

test('money formatting preserves exact supported integer cents and unknown values',()=>{assert.equal(expenseMoney(null),'—');assert.equal(expenseMoney(0),'0,00 €');assert.equal(expenseMoney(-123456),'−1.234,56 €');assert.equal(expenseMoney(Number.MAX_SAFE_INTEGER),'90.071.992.547.409,91 €');assert.equal(expenseMoney(1.5),'—');});

function batchPacket(attempt:string,stage:string,index:number,value:object){return {kind:'vf-financial-collection-v1',nonce:`${attempt}-${stage}-${index}`,url:PROFILE_URL,...value};}
function batchBefore(job:FinancialCollectionRun,attempt:string,index:number){
 job.observeNavigation(PROFILE_URL);assert.equal(job.accept(PROFILE_URL,PROFILE_URL,batchPacket(attempt,'before',index,{profile:profile()}),target,at),'navigate');job.observeNavigation(PROFILE_URL);
}
async function batchResult(selected:string[]){const value=await result();const billed=value.billed[0]!;billed.sourceFlightId=selected[0]!;billed.url=billed.url.replace(/flid=\d+/,`flid=${selected[0]}`);value.unknown=selected.slice(1).map(sourceFlightRef=>({sourceFlightRef,reason:'unbilled'}));return value;}
test('durable full-reference batches reopen, skip completed details and reconcile the exact final payload without provider replay',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'moflight-financial-batches-')),path=join(directory,'evidence.sqlite');
 const raw=nodeDriver(':memory:');let side=nodeDriver(path);
 try{
  const store=new FinancialObservationStore(raw,target,hash,gate);await store.initialize(true);
  let evidence=new FinancialEvidenceStore(side,target,hash,gate);await evidence.initialize(true);
  const all=Array.from({length:11},(_,i)=>String(54321+i));
  const make=(attempt:string,resume:FinancialCollectionCheckpoint|null)=>new FinancialCollectionRun(target,resume?.id??'durable-job',all,{hash,attempt,resume,now:()=>at,prepare:gate,checkpoint:async value=>{await evidence.checkpointCollection(value);}});
  const first=make('attempt-a',null);await first.prepare(gate);batchBefore(first,'attempt-a',0);
  const firstResult=await batchResult(all.slice(0,10));assert.equal(first.accept(PROFILE_URL,PROFILE_URL,batchPacket('attempt-a','collect',0,{result:firstResult}),target,at),'checkpoint');
  await first.checkpoint(gate);assert.equal(first.progress.processed,10);assert.equal(first.readyToSave,false);
  assert.equal((await store.history()).total,0);assert.deepEqual(await evidence.snapshots(),[]);
  const emptyArchive=await evidence.exportBackup();assert.equal(emptyArchive.includes('durable-job'),false);
  first.cancel();await side.close();side=nodeDriver(path);evidence=new FinancialEvidenceStore(side,target,hash,gate);await evidence.initialize();
  assert.equal(await evidence.pendingCollection(all.slice(1)),null);
  const checkpoint=await evidence.pendingCollection(all);assert.equal(checkpoint?.batches.length,1);
  const second=make('attempt-b',checkpoint);await second.prepare(gate);batchBefore(second,'attempt-b',1);
  assert.ok(second.script.includes('["54331"]'));assert.ok(!second.script.includes('["54321","54322"'));
  assert.equal(second.accept(PROFILE_URL,PROFILE_URL,batchPacket('attempt-a','collect',0,{result:firstResult}),target,at),'ignored');
  const later='2026-11-03T12:00:00.000Z';
  assert.equal(second.accept(PROFILE_URL,PROFILE_URL,batchPacket('attempt-b','collect',1,{result:await batchResult(all.slice(10))}),target,later),'checkpoint');await second.checkpoint(gate);
  assert.equal(second.readyToSave,true);assert.deepEqual(second.progress,{processed:11,total:11,billed:2});
  await side.close();side=nodeDriver(path);evidence=new FinancialEvidenceStore(side,target,hash,gate);await evidence.initialize();
  const third=make('attempt-c',await evidence.pendingCollection(all));await third.prepare(gate);
  assert.equal(third.readyToSave,true);assert.throws(()=>third.script,/not reading/);
  const receipt=await third.save(store,()=>target,gate);assert.equal(receipt.id,'durable-job');
  // Simulate death after the atomic raw commit, before the evidence commit.
  const fourth=make('attempt-d',await evidence.pendingCollection(all));await fourth.prepare(gate);assert.equal(fourth.readyToSave,true);
  assert.deepEqual(await fourth.save(store,()=>target,gate),receipt);await fourth.saveEvidence(evidence,gate);
  const snapshots=await evidence.snapshots();assert.equal(snapshots.length,1);assert.deepEqual(snapshots[0]!.selection.sourceFlightRefs,all);assert.equal(snapshots[0]!.retrievedAt,later);
  assert.equal(snapshots[0]!.unknown.length,9);assert.equal((await store.history()).total,3);assert.equal(await evidence.pendingCollection(all),null);
  const captured=(await store.history()).receipts.filter(r=>r.kind==='billed-flight');assert.deepEqual(captured.map(r=>r.retrievedAt).sort(),[at,later].sort());
 }finally{await side.close();await raw.close();await rm(directory,{recursive:true,force:true});}
});
test('unfinished batch cancellation and changed profile never publish or overwrite an accepted checkpoint',async()=>{
 let held:FinancialCollectionCheckpoint|null=null;
 const refs=Array.from({length:11},(_,i)=>String(54321+i));
 const ports={hash,attempt:'boundary-a',now:()=>at,prepare:gate,checkpoint:async(value:FinancialCollectionCheckpoint)=>{held=structuredClone(value);}};
 const job=new FinancialCollectionRun(target,'boundary-job',refs,ports);await job.prepare(gate);batchBefore(job,'boundary-a',0);
 assert.equal(job.accept(PROFILE_URL,PROFILE_URL,batchPacket('boundary-a','collect',0,{result:await batchResult(refs.slice(0,10))}),target,at),'checkpoint');await job.checkpoint(gate);
 const original=canonical(held);job.cancel();assert.equal(canonical(held),original);
 const resumed=new FinancialCollectionRun(target,'boundary-job',refs,{...ports,attempt:'boundary-b',resume:held});await resumed.prepare(gate);resumed.observeNavigation(PROFILE_URL);
 const changed=profile();changed.ownRecipientLabel='Other synthetic recipient';
 assert.throws(()=>resumed.accept(PROFILE_URL,PROFILE_URL,batchPacket('boundary-b','before',1,{profile:changed}),target,at));assert.equal(canonical(held),original);
 const different=new FinancialCollectionRun(target,'boundary-job',refs.slice(1),{...ports,resume:held});await assert.rejects(different.prepare(gate),/selection changed/);assert.equal(canonical(held),original);
});

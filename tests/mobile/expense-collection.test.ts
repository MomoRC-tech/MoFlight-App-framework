import assert from 'node:assert/strict';
import test from 'node:test';
import { canonical } from '../../packages/flight-logbook/src/index.ts';
import { FinancialCollectionRun } from '../../apps/platform-lab/src/vereinsflieger/expense-collection-run.ts';
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
  const read=await readCapturedFinancialSnapshot(archive,target,ports);const data={snapshot:read.snapshot,evidence:snapshots,receipts:(await store.history()).receipts};const may=financialAnalysisView(data,{mode:'month',year:2026,month:5}),june=financialAnalysisView(data,{mode:'month',year:2026,month:6});assert.equal(may.projection.flying.knownMinor,null);assert.equal(june.projection.flying.knownMinor,640);assert.equal(june.accounts[0]?.balanceMinor,0);assert.equal(june.monthly[5]?.knownMinor,640);assert.equal(may.statements.length,0);
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

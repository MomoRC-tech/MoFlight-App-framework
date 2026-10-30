import assert from 'node:assert/strict';
import test from 'node:test';
import { FinancialEvidenceStore, decodeFinancialEvidence, encodeFinancialEvidence, financialProofsFor } from '../../apps/platform-lab/src/vereinsflieger/expense-evidence-store.ts';
import { FinancialObservationStore } from '../../apps/platform-lab/src/vereinsflieger/expense-observation-store.ts';
import { projectCapturedFinancialArchive } from '../../apps/platform-lab/src/vereinsflieger/expense-projection-adapter.ts';
import { financialHash,financialTarget } from './fixtures/expense-capture.ts';
import { evidenceBilled,evidenceSnapshot } from './fixtures/expense-evidence.ts';
import { nodeDriver } from './sqlite-driver.ts';
test('durable own evidence round-trips exact receipts and qualifies the actual host projector',async()=>{
 const db=nodeDriver(':memory:'),raw=nodeDriver(':memory:');
 try {const evidence=new FinancialEvidenceStore(db,financialTarget,financialHash,async()=>{});await evidence.initialize(true);const value=await evidenceSnapshot();await evidence.prepare(value.id,value.selection,value.retrievedAt);await evidence.save(value);await evidence.save(value);
 const archive=await evidence.exportBackup();assert.deepEqual(await decodeFinancialEvidence(archive,financialTarget,financialHash),[value]);
 const store=new FinancialObservationStore(raw,financialTarget,financialHash,async()=>{});await store.initialize(true);const receipt=await store.save('old-native-receipt','billed-flight',evidenceBilled());
 const result=await projectCapturedFinancialArchive(await store.exportBackup(),financialTarget,{mode:'year',year:2026},{gate:async()=>{},hash:financialHash,readInvoiceBookingEvidence:(_target,receipts)=>financialProofsFor(financialTarget,[value],receipts,financialHash)});
 assert.equal(result.flying.knownMinor,640);assert.equal(result.contributions[0]!.revision,null);assert.equal((await evidence.snapshots()).length,1);
 const restoredDb=nodeDriver(':memory:');try{const restored=new FinancialEvidenceStore(restoredDb,financialTarget,financialHash,async()=>{});await restored.initialize(true);await restored.restoreBackup(archive);assert.equal(await restored.exportBackup(),archive);}finally{await restoredDb.close();}
 assert.equal(receipt.id,'old-native-receipt');
 }finally{await db.close();await raw.close();}
});
test('equal witnesses merge but changed invoice and booking evidence remains conflicting',async()=>{
 const a=await evidenceSnapshot(),b=await evidenceSnapshot('evidence-b');b.retrievedAt='2026-10-31T12:00:00.000Z';b.ledgers[0]!.observation.capture.retrievedAt=b.retrievedAt;
 const raw=nodeDriver(':memory:');try{const store=new FinancialObservationStore(raw,financialTarget,financialHash,async()=>{});await store.initialize(true);const receipt=await store.save('billed-a','billed-flight',evidenceBilled());
 const equal=await financialProofsFor(financialTarget,[a,b],[receipt],financialHash);assert.equal(equal[0]!.summary.rows.length,1);assert.equal(equal[0]!.ledgers.length,1);
 b.summary.rows[0]!.url=b.summary.rows[0]!.url.replace('99999','88888');b.ledgers[0]!.invoiceLinks[0]!.url=b.summary.rows[0]!.url;
 const conflict=await projectCapturedFinancialArchive(await store.exportBackup(),financialTarget,{mode:'year',year:2026},{hash:financialHash,gate:async()=>{},readInvoiceBookingEvidence:(_t,receipts)=>financialProofsFor(financialTarget,[a,b],receipts,financialHash)});
 assert.equal(conflict.state,'conflict');assert.equal(conflict.flying.knownMinor,null);
 }finally{await raw.close();}
});
for(const field of ['owner','connectionId','accountNumber','clubLabel','storeId'] as const)test(`foreign ${field} evidence rejects without changing originals`,async()=>{
 const value=await evidenceSnapshot();if(field==='storeId')value.target.storeId='44444444-4444-4444-8444-444444444444';else if(field==='owner'||field==='connectionId')value.target.scope[field]='foreign';else value.target.scope.context[field]='foreign';
 await assert.rejects(()=>encodeFinancialEvidence(financialTarget,[value],financialHash));
});
test('changed reused snapshot IDs, corrupt archives, and interrupted transactions preserve originals',async()=>{
 const db=nodeDriver(':memory:');let allowed=true;try{const store=new FinancialEvidenceStore(db,financialTarget,financialHash,async()=>{if(!allowed)throw Error('revoked');});await store.initialize(true);const a=await evidenceSnapshot();await store.save(a);const original=await store.exportBackup();
 const changed=await evidenceSnapshot();changed.summary.rows[0]!.amountRaw='99,00';await assert.rejects(()=>store.save(changed));assert.equal(await store.exportBackup(),original);
 await assert.rejects(()=>decodeFinancialEvidence(original.replace('6,40','9,99'),financialTarget,financialHash));
 allowed=false;await assert.rejects(async()=>store.save(await evidenceSnapshot('b')));allowed=true;assert.equal(await store.exportBackup(),original);
 }finally{await db.close();}
});

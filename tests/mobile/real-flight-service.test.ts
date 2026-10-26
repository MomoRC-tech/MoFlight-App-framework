import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nodeDriver } from './sqlite-driver.ts';
import { RealFlightLibrary, type RealFlightPermit } from '../../apps/platform-lab/src/vereinsflieger/real-flight-library.ts';
import { RealFlightService, PendingRealFlightOperation, type RealFlightServicePorts } from '../../apps/platform-lab/src/vereinsflieger/real-flight-service.ts';
import { RealFlightCommandJournal } from '../../apps/platform-lab/src/vereinsflieger/real-flight-command-journal.ts';
import type { RealFlightSourceInput } from '../../apps/platform-lab/src/vereinsflieger/real-flight-source.ts';
import { RealFlightSelection } from '../../apps/platform-lab/src/vereinsflieger/real-flight-selection.ts';
import { continueRealFlightOwnerSetup } from '../../apps/platform-lab/src/vereinsflieger/real-flight-owner-setup.ts';
import { realHistoryCandidateName } from '../../apps/platform-lab/src/vereinsflieger/real-history-contract.ts';
import type { RealFlightRepositorySession } from '../../apps/platform-lab/src/vereinsflieger/real-flight-service.ts';
import { readAiFlightSnapshot } from '../../apps/platform-lab/src/ai/flight-context.ts';
import { AiFlightTools } from '../../apps/platform-lab/src/ai/flight-tools.ts';
import { DiagnosticJournal } from '../../apps/platform-lab/src/diagnostics.ts';

const ownerId = '11111111-1111-4111-8111-111111111111', storeId = '22222222-2222-4222-8222-222222222222';
const at = '2026-10-20T10:00:00.000Z';
const hash = async (text: string) => createHash('sha256').update(text).digest('hex');
function source(captureId = 'fresh-capture'): RealFlightSourceInput {
  const context = {accountNumber:'101',clubLabel:'Example club',clubIdentity:'display-label-only' as const,verification:'observed-profile-number' as const};
  return {version:1,binding:{provider:'vereinsflieger',accountRef:'101'},contextBefore:{...context},contextAfter:{...context},
    requestedWindow:{from:'2026-10-01',to:'2026-10-20',participation:'Pilot oder Fluglehrer'},capture:{captureId,retrievedAt:at,
      headers:['Datum','Lfz.','Start','Landung','Flugzeit','Pilot'],rows:[{sourceFlightId:'9001',values:['20.10.2026','D-TEST','','','0','Example pilot']}],
      sourceIdentity:'unverified',timeBasis:'unknown',coverage:'complete-requested-list',exportContext:{from:'2026-10-01',to:'2026-10-20',preset:'Konfiguration laden',
        participation:'Pilot oder Fluglehrer',accountLabel:'Example account',recordCount:1,pageCount:1,columnIds:['1','2','3','4','5','6'],adapterVersion:2}}};
}
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(),'moflight-service-')), path = join(directory,'library.sqlite'), journalPath = join(directory,'commands.sqlite');
  const sentinelPath = join(directory,'old-lab-private.sqlite'); await writeFile(sentinelPath,'preserved old-store sentinel');
  let permit: RealFlightPermit | null = {ownerId,storeId,leaseId:'active-lease',writable:true}, failure = '';
  const authorize = () => permit;
  const first = await RealFlightLibrary.create(nodeDriver(path),{singleton:1,family:'moflight-real-flight-history',schema_version:1,payload_version:1,
    store_id:storeId,owner_id:ownerId,created_at:at},hash,authorize); await first.close();
  const commands = await RealFlightCommandJournal.open(nodeDriver(journalPath),ownerId,storeId,authorize,hash,true); await commands.close();
  let nextSource = source();
  const ports: RealFlightServicePorts = {
    authorize, hash, uuid:randomUUID, now:()=>at,
    retrieve:async (_request,signal)=>{ if(signal.aborted) throw new Error('Cancelled source'); return structuredClone(nextSource); },
    repository:async()=>{
      const driver=nodeDriver(path);
      try {
        const library = await RealFlightLibrary.open(driver,ownerId,storeId,hash,authorize,async stage=>{if(stage===failure) throw new Error('Injected save interruption');});
        return {library,writable:true,warning:null,close:()=>library.close()};
      } catch(error) {await driver.close();throw error;}
    },
    journal:()=>RealFlightCommandJournal.open(nodeDriver(journalPath),ownerId,storeId,authorize,hash),
  };
  const make = () => new RealFlightService(ownerId,storeId,'active-lease',ports);
  return {make,ports,authorize,path,directory,setFailure:(stage:string)=>{failure=stage;},setSource:(input:RealFlightSourceInput)=>{nextSource=input;},
    switchOwner:()=>{permit={ownerId:randomUUID(),storeId:randomUUID(),leaseId:'other-lease',writable:true};},
    cleanup:async()=>{assert.equal(await readFile(sentinelPath,'utf8'),'preserved old-store sentinel');await rm(directory,{recursive:true,force:true});}};
}
async function ready(f: Awaited<ReturnType<typeof fixture>>) {
  const service=f.make();const review=await service.reviewSource(source());assert.equal(review.state,'confirm-account');
  const bound=await service.confirmAccount(review);assert.equal(bound.state,'ready');return {service,review:bound};
}

test('verified save with stored readback uses one ready-session and preserves the complete graph and receipt',async()=>{
  const f=await fixture(),reference=await fixture();
  for(const value of [f,reference]){let n=0;value.ports.uuid=()=>`44444444-4444-4444-8444-${String(++n).padStart(12,'0')}`;}
  const current=await ready(f),old=await ready(reference),verified={accountNumber:'101',clubLabel:'Example club'};
  let opens=0,closes=0,readbacks=0;
  const repository=f.ports.repository;
  f.ports.repository=async timing=>{
    opens++;const session=await repository(timing),read=session.library.readStored.bind(session.library);
    session.library.readStored=async span=>{readbacks++;return read(span);};
    return {...session,close:async()=>{closes++;await session.close();}};
  };
  try{
    const combined=await current.service.saveVerifiedReviewWithStoredReadback(current.review,verified);
    assert.equal(opens,1);assert.equal(closes,1);assert.equal(readbacks,1,'fresh stored read occurs after commit on the same session');
    assert.equal(combined.result.counts.added,1);assert.equal(combined.stored.flights.length,1);
    assert.deepEqual(combined.stored.snapshot.latestSavedResult,combined.result);
    assert.equal(combined.stored.snapshot.generation,2);
    const priorResult=await old.service.saveVerifiedReview(old.review,verified);
    assert.deepEqual(combined.result,priorResult);
    assert.deepEqual(combined.stored,await old.service.readStored());
    assert.equal(await current.service.exportBackup(),await old.service.exportBackup(),'all source records and receipts remain byte-identical to the established save path');
    assert.equal((await current.service.recoverPending()).status,'none');
  }finally{current.service.dispose();old.service.dispose();await f.cleanup();await reference.cleanup();}
});

test('verified save with readback preserves first-use binding and unchanged/corrected capture history',async()=>{
  const f=await fixture(),service=f.make(),verified={accountNumber:'101',clubLabel:'Example club'};
  try{
    const unbound=await service.reviewSource(source());assert.equal(unbound.state,'confirm-account');
    const first=await service.saveVerifiedReviewWithStoredReadback(unbound,verified);
    assert.equal(first.result.counts.added,1);assert.equal(first.stored.snapshot.generation,2);
    const repeated=await service.saveVerifiedReviewWithStoredReadback(await service.reviewSource(source('readback-repeat')),verified);
    assert.equal(repeated.result.counts.unchanged,1);assert.equal(repeated.stored.snapshot.generation,3);
    assert.equal(repeated.stored.snapshot.savedRetrievals.length,2,'unchanged facts still append committed capture coverage');
    const correction=source('readback-correction');correction.capture.rows[0]!.values[4]='1:00';
    const changed=await service.saveVerifiedReviewWithStoredReadback(await service.reviewSource(correction),verified);
    assert.equal(changed.result.counts.changed,1);assert.equal(changed.stored.snapshot.generation,4);
    assert.equal(changed.stored.flights[0]!.facts.assessment.observation.row.values[4],'1:00','the correction retains its exact source text');
  }finally{service.dispose();await f.cleanup();}
});

for(const failure of ['before-commit','after-commit'])test(`combined saved readback preserves original command recovery after ${failure}`,async()=>{
  const f=await fixture(),{service,review}=await ready(f);
  try{
    f.setFailure(failure);
    await assert.rejects(service.saveVerifiedReviewWithStoredReadback(review,{accountNumber:'101',clubLabel:'Example club'}),PendingRealFlightOperation);
    f.setFailure('');
    const recovery=await service.recoverPending();
    assert.equal(recovery.status,failure==='before-commit'?'not-committed':'committed');
    if(failure==='before-commit')assert.equal((await service.retryPending()).counts.added,1);
    const stored=await service.readStored();assert.equal(stored.flights.length,1);assert.equal(stored.snapshot.generation,2);
    assert.equal((await service.recoverPending()).status,'none');
  }finally{service.dispose();await f.cleanup();}
});

for(const failure of ['read-error','foreign-owner','tamper'])test(`post-save fresh readback rejects ${failure}, closes session and never reuses consumed review`,async()=>{
  const f=await fixture(),{service,review}=await ready(f),repository=f.ports.repository;
  let closes=0;
  f.ports.repository=async timing=>{
    const session=await repository(timing),read=session.library.readStored.bind(session.library);
    session.library.readStored=async span=>{
      if(failure==='read-error')throw new Error('Injected projection failure');
      if(failure==='foreign-owner')f.switchOwner();
      if(failure==='tamper'){
        const db=nodeDriver(f.path);
        try{
          const trigger=await db.first<{name:string;sql:string}>("SELECT name,sql FROM sqlite_master WHERE type='trigger' AND name LIKE '%records%update'");assert.ok(trigger);assert.match(trigger.name,/^[a-z_]+$/);
          await db.exec(`DROP TRIGGER ${trigger.name}`);await db.run("UPDATE real_history_records SET payload=replace(payload,'D-TEST','D-FORGED') WHERE kind='facts'");await db.exec(trigger.sql);
        }finally{await db.close();}
      }
      return read(span);
    };
    return {...session,close:async()=>{closes++;await session.close();}};
  };
  try{
    await assert.rejects(service.saveVerifiedReviewWithStoredReadback(review,{accountNumber:'101',clubLabel:'Example club'}),/projection failure|Unauthorized|foreign|record graph/);
    assert.equal(closes,1);
    f.ports.repository=repository;
    if(failure!=='foreign-owner'){
      assert.equal((await service.recoverPending()).status,'none','successful commit and resolution do not become fictitious unresolved commands');
      await assert.rejects(service.saveVerifiedReviewWithStoredReadback(review,{accountNumber:'101',clubLabel:'Example club'}),/Review changed/);
    }
    if(failure==='read-error'){
      const stored=await service.readStored();assert.equal(stored.snapshot.generation,2);assert.equal(stored.flights.length,1);
      const next=await service.reviewSource(source('after-read-error'));
      assert.equal((await service.saveVerifiedReviewWithStoredReadback(next,{accountNumber:'101',clubLabel:'Example club'})).result.counts.unchanged,1);
    }
  }finally{service.dispose();await f.cleanup();}
});

test('metadata callback runs before the final same-selection read and a real same-owner head change rejects publication',async()=>{
  const f=await fixture(),{service,review}=await ready(f),name=realHistoryCandidateName(randomUUID());
  const selection=await RealFlightSelection.open(nodeDriver(join(f.directory,'callback-selection.sqlite')),ownerId,storeId,f.authorize,
    async(candidate,authorize,gate)=>{
      assert.equal(candidate,name);
      return RealFlightLibrary.open(nodeDriver(f.path),ownerId,storeId,hash,authorize,async()=>{},gate);
    },hash,true);
  let closes=0,readbacks=0;
  try{
    await selection.activate(randomUUID(),name,null,at);
    f.ports.repository=async()=>{
      const selected=await selection.select(),read=selected.candidate.readStored.bind(selected.candidate);
      selected.candidate.readStored=async timing=>{readbacks++;return read(timing);};
      return {library:selected.candidate,writable:!selected.recoveryRequired,warning:selected.warning,
        close:async()=>{closes++;await selected.candidate.close();}};
    };
    await assert.rejects(service.saveVerifiedReviewWithStoredReadback(review,{accountNumber:'101',clubLabel:'Example club'},async()=>{
      assert.equal(closes,0,'the selected save session remains open during bounded local metadata work');
      assert.equal(readbacks,0,'projection is read after metadata, not reused from before it');
      const journal=await f.ports.journal();try{assert.equal(await journal.pending(),null);}finally{await journal.close();}
      await selection.activate(randomUUID(),name,1,at);
    }),/Active real history changed/);
    assert.equal(readbacks,1);assert.equal(closes,1);
    const current=await service.readStored();assert.equal(current.snapshot.generation,2);assert.equal(current.flights.length,1);
    await assert.rejects(service.saveVerifiedReviewWithStoredReadback(review,{accountNumber:'101',clubLabel:'Example club'}),/Review changed/);
  }finally{service.dispose();await selection.close();await f.cleanup();}
});

for(const failure of ['same-generation','callback-error','cancelled','pending'] as const)test(`metadata callback ${failure} preserves committed results and fails before publishing a reused view`,async()=>{
  const f=await fixture(),{service,review}=await ready(f),repository=f.ports.repository;
  let closes=0,readbacks=0;const unexpectedId=randomUUID();
  f.ports.repository=async timing=>{
    const session=await repository(timing),read=session.library.readStored.bind(session.library);
    session.library.readStored=async span=>{readbacks++;return read(span);};
    return {...session,close:async()=>{closes++;await session.close();}};
  };
  try{
    const callback=async()=>{
      assert.equal(closes,0);assert.equal(readbacks,0);
      if(failure==='callback-error')throw new Error('Local metadata unavailable');
      if(failure==='cancelled'){service.cancelReview();return;}
      if(failure==='pending'){
        const journal=await f.ports.journal();
        try{await journal.prepare({version:1,kind:'bind',commandId:unexpectedId,baseGeneration:2,ownerId,storeId,source:source('unexpected-pending'),at});}
        finally{await journal.close();}
        return;
      }
      const db=nodeDriver(f.path);
      try{
        const trigger=await db.first<{name:string;sql:string}>("SELECT name,sql FROM sqlite_master WHERE type='trigger' AND name LIKE '%records%update'");assert.ok(trigger);assert.match(trigger.name,/^[a-z_]+$/);
        await db.exec(`DROP TRIGGER ${trigger.name}`);await db.run("UPDATE real_history_records SET payload=replace(payload,'D-TEST','D-FORGED') WHERE kind='facts'");await db.exec(trigger.sql);
      }finally{await db.close();}
    };
    const action=service.saveVerifiedReviewWithStoredReadback(review,{accountNumber:'101',clubLabel:'Example club'},callback);
    if(failure==='pending')await assert.rejects(action,error=>error instanceof PendingRealFlightOperation&&error.commandId===unexpectedId);
    else await assert.rejects(action,/record graph|Local metadata unavailable|Superseded/);
    assert.equal(closes,1);assert.equal(readbacks,failure==='same-generation'?1:0);
    f.ports.repository=repository;
    const journal=await f.ports.journal();
    try{assert.equal((await journal.pending())?.commandId??null,failure==='pending'?unexpectedId:null);}
    finally{await journal.close();}
    const db=nodeDriver(f.path);
    try{assert.equal((await db.first<{count:number}>("SELECT count(*) AS count FROM real_history_receipts WHERE kind='import-unassigned'"))?.count,1);}
    finally{await db.close();}
    await assert.rejects(service.saveVerifiedReviewWithStoredReadback(review,{accountNumber:'101',clubLabel:'Example club'}),/Review changed/);
    if(failure==='callback-error')assert.equal((await service.readStored()).snapshot.generation,2);
  }finally{service.dispose();await f.cleanup();}
});

test('review start follows live source retrieval, skips binding rebuild and keeps attempt timings across awaits',async()=>{
  const f=await fixture(),service=f.make(),journal=new DiagnosticJournal(()=>0),first=journal.begin('update-flights');
  let reviewStarts=0,release!:()=>void;f.ports.onReviewStart=()=>{reviewStarts++;};
  f.ports.retrieve=async()=>{await new Promise<void>(resolve=>{release=resolve;});return source();};
  try {
    const retrieved=service.retrieve({from:'2026-10-01',to:'2026-10-20'},journal.captureSpan());
    while(!release)await new Promise<void>(resolve=>{setImmediate(resolve);});
    const other=journal.begin('read-flights');assert.equal(reviewStarts,0);release();
    const review=await retrieved;assert.equal(reviewStarts,1);
    const measured=journal.snapshot();assert.ok(measured[0]!.stages.some(stage=>stage.name==='source-review'));
    assert.deepEqual(measured[1]!.stages,[]);
    const reviewPoint=measured[0]!.checkpoints.find(point=>point.name==='source-review'&&point.state==='start')!;
    assert.ok(measured[0]!.checkpoints.some(point=>point.name==='graph-read'&&point.parentSpanId===reviewPoint.spanId));
    assert.ok(!measured[0]!.checkpoints.some(point=>point.name==='import-derivation'),'Unbound review has no import derivation to measure');
    await service.confirmAccount(review);assert.equal(reviewStarts,1);
    await service.reviewSource(source('second-capture'));assert.equal(reviewStarts,2);
    first.finish('success');other.finish('success');
  }finally{service.dispose();await f.cleanup();}
});

test('saved SQLite source issues reach bounded AI evidence without changing the source or counting pending rows as flights', async () => {
  const f = await fixture(), service = f.make();
  try {
    const input = source('source-issues');
    const row = input.capture.rows[0]!;
    input.capture.rows = [row, structuredClone(row), { sourceFlightId: '9002', values: [...row.values.slice(0, 4), '35', row.values[5]!] },
      { sourceFlightId: '9002', values: [...row.values.slice(0, 4), '52', row.values[5]!] },
      { sourceFlightId: null, values: [...row.values.slice(0, 4), '99', row.values[5]!] }];
    input.capture.exportContext!.recordCount = 5;
    await service.saveVerifiedReview(await service.reviewSource(input), { accountNumber: '101', clubLabel: 'Example club' });
    const before = await service.exportBackup();
    let closed = 0;
    const snapshot = await readAiFlightSnapshot({ currentOwner: async () => ownerId, flights: { open: async () => ({
      ownerId, storeId, service, assertCurrent: async () => {}, pendingCommand: async () => false, close: async () => { closed++; },
    }) } }, { version: 1, localOwnerId: ownerId, provider: 'vereinsflieger', accountRef: '101', observedAt: at,
      provenance: { kind: 'authenticated-profile', verification: 'observed-profile-number' } }, 1);
    assert.equal(closed, 1); assert.equal(snapshot.projection?.rows.length, 1);
    const tools = new AiFlightTools(snapshot, { assertCurrent: async () => {}, token: () => 'a'.repeat(43) }, '2026-10-24');
    const description = await tools.execute({ id: 'c1', name: 'describeDataset', arguments: {} });
    assert.deepEqual(new Set(description.sourceReview.issues.map(i => i.kind)), new Set(['duplicate-source-row', 'conflicting-source-row', 'missing-source-reference']));
    const conflict = description.sourceReview.issues.find(i => i.kind === 'conflicting-source-row')!;
    const evidence = await tools.execute({ id: 'c2', name: 'getFlightEvidence', arguments: { referenceIds: conflict.referenceIds } });
    assert.deepEqual(evidence.sourceRows.map(row => row.knownMinutes), [35, 52]);
    assert.equal(evidence.rows.length, 0); assert.equal(evidence.coverage.state, 'partial');
    const json = JSON.stringify([description, evidence]);
    for (const raw of ['Example pilot', 'D-TEST', '9002', 'rawCapture', 'accountRef', 'captureSha256']) assert.equal(json.includes(raw), false, raw);
    assert.equal(await service.exportBackup(), before);
    const capped = await f.ports.repository();
    try {
      const { collectSavedSourceReview } = await import('../../apps/platform-lab/src/vereinsflieger/real-flight-review-evidence.ts');
      const review = collectSavedSourceReview(await capped.library.snapshot(), 2);
      assert.equal(review.rows.length, 2); assert.ok(review.omittedRows > 0);
    } finally { await capped.close(); }
  } finally { service.dispose(); await f.cleanup(); }
});

test('combined load binds a fresh verified account and saves valid flights, repeats and corrections without curation',async()=>{
  const f=await fixture();const service=f.make();
  try {
    const verified={accountNumber:'101',clubLabel:'Example club'};
    assert.equal((await service.saveVerifiedReview(await service.reviewSource(source()),verified)).counts.added,1);
    assert.equal((await service.saveVerifiedReview(await service.reviewSource(source('repeat')),verified)).counts.unchanged,1);
    const correction=source('correction');correction.capture.rows[0]!.values[4]='1:00';
    assert.equal((await service.saveVerifiedReview(await service.reviewSource(correction),verified)).counts.changed,1);
    service.dispose();const reopened=f.make();
    const flights=await reopened.list();assert.equal(flights.length,1);assert.equal(flights[0]!.factsRevision,2);
    assert.equal((await reopened.detail(flights[0]!.flightId))!.factHistory.length,2);
    assert.equal((await reopened.recoverPending()).status,'none');reopened.dispose();
  }finally{service.dispose();await f.cleanup();}
});

test('combined save rejects foreign context, altered intent, cancellation and changed owner before writing',async()=>{
  const f=await fixture();const service=f.make();
  try {
    const review=await service.reviewSource(source()),verified={accountNumber:'101',clubLabel:'Example club'};
    for(const other of [{...verified,accountNumber:'202'},{...verified,clubLabel:'Other club'}]){
      await assert.rejects(service.saveVerifiedReview(review,other),/context/);
      assert.equal((await service.snapshot()).generation,0);
    }
    await assert.rejects(service.saveVerifiedReview({...review,accountRef:'202'},verified),/Review changed/);
    service.cancelReview();await assert.rejects(service.saveVerifiedReview(review,verified),/Review changed/);
    const next=await service.reviewSource(source('next'));f.switchOwner();
    await assert.rejects(service.saveVerifiedReview(next,verified),/foreign/);
  }finally{service.dispose();await f.cleanup();}
});

test('combined save preserves uncertain rows separately and blocks a new load after response loss',async()=>{
  const f=await fixture();const service=f.make();
  try {
    const input=source();input.capture.rows.push({sourceFlightId:null,values:['20.10.2026','D-OTHER','','','','']});
    input.capture.exportContext!.recordCount=2;
    const result=await service.saveVerifiedReview(await service.reviewSource(input),{accountNumber:'101',clubLabel:'Example club'});
    assert.equal(result.counts.added,1);assert.equal(result.counts.pending,1);
    assert.equal((await service.list()).length,1);assert.equal((await service.snapshot()).pending.length,1);
    const review=await service.reviewSource(source('response-lost'));f.setFailure('after-commit');
    await assert.rejects(service.saveVerifiedReview(review,{accountNumber:'101',clubLabel:'Example club'}),PendingRealFlightOperation);
    f.setFailure('');assert.equal((await service.recoverPending()).status,'committed');
    assert.equal((await service.list()).length,1);
  }finally{service.dispose();await f.cleanup();}
});

test('fresh update supersedes a proven uncommitted import and uses a new capture after restart',async()=>{
  const f=await fixture();let service=f.make();
  try{
    const {service:bound,review}=await ready(f);service.dispose();service=bound;
    f.setFailure('before-commit');
    await assert.rejects(service.saveUnassigned(review),PendingRealFlightOperation);
    service.dispose();service=f.make();f.setFailure('');
    const fresh=source('new-authoritative-capture');fresh.capture.rows[0]!.values[4]='1:15';f.setSource(fresh);
    const next=await service.retrieveUpdate();
    await service.saveVerifiedReview(next,{accountNumber:'101',clubLabel:'Example club'});
    assert.equal((await service.list()).length,1);
    assert.equal((await service.detail((await service.list())[0]!.flightId))!.factHistory.length,1);
    assert.equal((await service.recoverPending()).status,'none');
  }finally{service.dispose();await f.cleanup();}
});

test('fresh update resolves committed response loss without repeating the original command',async()=>{
  const f=await fixture();let service=f.make();
  try{
    f.setFailure('after-commit');
    await assert.rejects(service.saveVerifiedReview(await service.reviewSource(source()),{accountNumber:'101',clubLabel:'Example club'}),PendingRealFlightOperation);
    service.dispose();service=f.make();f.setFailure('');
    await service.retrieveUpdate();
    assert.equal((await service.recoverPending()).status,'none');
    assert.equal((await service.snapshot()).generation,1);
  }finally{service.dispose();await f.cleanup();}
});

test('combined stored view keeps summary and rows coherent with one repository selection and no shared mutable output',async()=>{
  const f=await fixture();
  try {
    const {service,review}=await ready(f);await service.saveUnassigned(review);
    const expectedSnapshot=await service.snapshot(),expectedFlights=await service.list();
    const original=f.ports.repository;let opens=0,closes=0;
    f.ports.repository=async()=>{opens++;const session=await original();return {...session,close:async()=>{closes++;await session.close();}};};
    const stored=await service.readStored();
    assert.equal(opens,1);assert.equal(closes,1);
    assert.deepEqual(stored,{snapshot:expectedSnapshot,flights:expectedFlights});
    stored.flights.length=0;stored.snapshot.coverage.length=0;
    assert.deepEqual(await service.readStored(),{snapshot:expectedSnapshot,flights:expectedFlights});
    f.switchOwner();await assert.rejects(service.readStored(),/foreign/);service.dispose();
  }finally{await f.cleanup();}
});

test('combined stored view rejects changed SQL integrity and closes a repository on failure',async()=>{
  const f=await fixture();
  try {
    const {service,review}=await ready(f);await service.saveUnassigned(review);
    const original=f.ports.repository;let closes=0;
    f.ports.repository=async()=>{
      const session=await original();
      const db=nodeDriver(f.path);try{await db.exec('PRAGMA user_version=99');}finally{await db.close();}
      return {...session,close:async()=>{closes++;await session.close();}};
    };
    await assert.rejects(service.readStored(),/SQL version/);assert.equal(closes,1);service.dispose();
  }finally{await f.cleanup();}
});

test('service owns retrieve/review/explicit save/repeat and validated offline readers without adopting old stores', async () => {
  const f=await fixture();
  try {
    const service=f.make();const first=await service.retrieve({from:'2026-10-01',to:'2026-10-20'});
    assert.equal(first.state,'confirm-account');assert.equal((await service.snapshot()).generation,0);service.cancelReview();
    await assert.rejects(service.confirmAccount(first),/Review changed/);assert.equal((await service.list()).length,0);
    const account=await service.reviewSource(source()),review=await service.confirmAccount(account);
    assert.equal((await service.list()).length,0);const result=await service.saveUnassigned(review);assert.equal(result.counts.added,1);
    f.setSource(source('repeat-capture'));const repeat=await service.retrieve({from:'2026-10-01',to:'2026-10-20'});
    assert.equal(repeat.state,'ready');if(repeat.state!=='ready')throw new Error('Expected reviewed plan');assert.equal(repeat.plan.counts.unchanged,1);
    await service.saveUnassigned(repeat);service.dispose();
    const reopened=f.make();const flights=await reopened.list();assert.equal(flights.length,1);assert.equal(flights[0]?.factsRevision,1);
    const detail=await reopened.detail(flights[0]!.flightId);assert.equal(detail?.unassigned,true);assert.equal(detail?.factHistory.length,1);
    assert.equal((await reopened.recoverPending()).status,'none');reopened.dispose();
  } finally {await f.cleanup();}
});

test('cancelled or foreign-owner retrieval cannot publish late review or write a flight', async () => {
  const f=await fixture();
  try {
    let release!: (value:RealFlightSourceInput)=>void,started!:()=>void;
    let start=new Promise<void>(resolve=>{started=resolve;});
    f.ports.retrieve=async()=>new Promise(resolve=>{release=resolve;started();});
    const service=f.make(),pending=service.retrieve({from:'2026-10-01',to:'2026-10-20'});await start;service.cancelReview();release(source());
    await assert.rejects(pending,/Superseded/);assert.equal((await service.snapshot()).generation,0);
    start=new Promise<void>(resolve=>{started=resolve;});const switched=service.retrieve({from:'2026-10-01',to:'2026-10-20'});await start;f.switchOwner();release(source());
    await assert.rejects(switched,/foreign/);service.dispose();
  } finally {await f.cleanup();}
});

test('post-commit response loss recovers the original receipt after service restart without duplicate flights', async () => {
  const f=await fixture();
  try {
    const {service,review}=await ready(f);f.setFailure('after-commit');
    await assert.rejects(service.saveUnassigned(review),PendingRealFlightOperation);service.dispose();f.setFailure('');
    const reopened=f.make(),recovery=await reopened.recoverPending();assert.equal(recovery.status,'committed');
    if(recovery.status!=='committed')throw new Error('Missing recovery result');assert.equal(recovery.result.counts.added,1);
    assert.equal((await reopened.list()).length,1);assert.equal((await reopened.snapshot()).savedRetrievals.length,1);assert.equal((await reopened.recoverPending()).status,'none');reopened.dispose();
  } finally {await f.cleanup();}
});

test('before-commit failure keeps the exact durable request and blocks a new plan until explicit retry', async () => {
  const f=await fixture();
  try {
    const {service,review}=await ready(f);f.setFailure('before-commit');
    let commandId='';await assert.rejects(service.saveUnassigned(review),error=>{assert.ok(error instanceof PendingRealFlightOperation);commandId=error.commandId;return true;});
    assert.equal((await service.list()).length,0);assert.deepEqual((await service.snapshot()).savedRetrievals,[]);await assert.rejects(service.reviewSource(source('new-capture')),PendingRealFlightOperation);service.dispose();
    f.setFailure('');const reopened=f.make(),recovery=await reopened.recoverPending();assert.equal(recovery.status,'not-committed');
    await assert.rejects(reopened.exportBackup(),PendingRealFlightOperation);await assert.rejects(reopened.retrieve({from:'2026-10-01',to:'2026-10-20'}),PendingRealFlightOperation);
    const result=await reopened.retryPending();assert.equal(result.commandId,commandId);assert.equal(result.counts.added,1);
    assert.equal((await reopened.list()).length,1);assert.equal((await reopened.snapshot()).savedRetrievals.length,1);assert.equal((await reopened.recoverPending()).status,'none');reopened.dispose();
  } finally {await f.cleanup();}
});

test('altered review intent and partial retrieval preserve the previously saved library', async () => {
  const f=await fixture();
  try {
    const {service,review}=await ready(f),tampered=structuredClone(review);tampered.source.capture.rows[0]!.values[1]='FORGED';
    await assert.rejects(service.saveUnassigned(tampered),/Review changed/);await service.saveUnassigned(review);
    const partial=source('partial');partial.capture={...partial.capture,coverage:'visible-personal-list-only'};delete partial.capture.exportContext;
    await assert.rejects(service.reviewSource(partial),/partial/);assert.equal((await service.list()).length,1);service.dispose();
  } finally {await f.cleanup();}
});

test('cancelling while the repository opens prevents a stale review from preparing or committing a command', async () => {
  const f=await fixture();
  try {
    const {service,review}=await ready(f),open=f.ports.repository;
    let release!:()=>void;const paused=new Promise<void>(resolve=>{release=resolve;});
    f.ports.repository=async()=>{await paused;return open();};
    const save=service.saveUnassigned(review);service.cancelReview();release();
    await assert.rejects(save,/Superseded/);f.ports.repository=open;
    assert.equal((await service.list()).length,0);assert.equal((await service.recoverPending()).status,'none');service.dispose();
  } finally {await f.cleanup();}
});

test('two fast account confirmations produce one binding command and reject the concurrent action', async () => {
  const f=await fixture();
  try {
    const service=f.make(),review=await service.reviewSource(source());
    const results=await Promise.allSettled([service.confirmAccount(review),service.confirmAccount(review)]);
    assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
    assert.equal((await service.snapshot()).generation,1);assert.equal((await service.list()).length,0);
    assert.equal((await service.recoverPending()).status,'none');service.dispose();
  } finally {await f.cleanup();}
});

test('stored snapshot exposes read-only recovery and cannot export an older candidate as the current backup', async () => {
  const f=await fixture();
  try {
    const {service,review}=await ready(f);await service.saveUnassigned(review);
    const open=f.ports.repository;f.ports.repository=async()=>({...await open(),writable:false,warning:'Retained newer candidate is unavailable.'});
    const snapshot=await service.snapshot();assert.equal(snapshot.recovery.readOnly,true);assert.ok(snapshot.recovery.warning);
    assert.equal((await service.list()).length,1);await assert.rejects(service.exportBackup(),/recovery/);service.dispose();
  } finally {await f.cleanup();}
});


function windowSource(captureId: string, from: string, to: string, empty = false): RealFlightSourceInput {
  const input=source(captureId);input.requestedWindow={...input.requestedWindow,from,to};
  input.capture.exportContext={...input.capture.exportContext!,from,to,recordCount:empty?0:1};
  if(empty)input.capture.rows=[];
  return input;
}

test('planned retrieval uses saved empty coverage after restart, never login, capture or unsaved review', async () => {
  const f=await fixture(),now=new Date(2026,9,20,12),requests:{from:string;to:string}[]=[];
  try {
    f.ports.retrieve=async request=>{requests.push({...request});return windowSource(`empty-${requests.length}`,request.from,request.to,true);};
    let service=f.make();assert.equal(requests.length,0);
    const first=await service.retrieveUpdate(now);
    assert.deepEqual(requests[0],{from:'2025-01-01',to:'2026-10-20'});
    assert.deepEqual((await service.snapshot()).savedRetrievals,[]);
    const bound=await service.confirmAccount(first);assert.deepEqual((await service.snapshot()).savedRetrievals,[]);
    service.cancelReview();await service.retrieveUpdate(now);
    assert.deepEqual(requests[1],requests[0]);
    service.cancelReview();const review=await service.retrieveUpdate(now);await service.saveUnassigned(review);
    assert.equal((await service.list()).length,0);assert.equal((await service.snapshot()).savedRetrievals.length,1);
    service.dispose();service=f.make();await service.retrieveUpdate(now);
    assert.deepEqual(requests.at(-1),{from:'2026-04-20',to:'2026-10-20'});service.dispose();
  } finally {await f.cleanup();}
});

test('planned updates preserve checkpoint on retrieval failure and cancellation, and reject owner switch before navigation', async () => {
  const f=await fixture(),now=new Date(2027,9,20,12);
  try {
    const {service,review}=await ready(f);await service.saveUnassigned(review);
    const before=(await service.snapshot()).savedRetrievals;
    f.ports.retrieve=async request=>{assert.deepEqual(request,{from:'2026-10-20',to:'2027-10-20'});throw new Error('Offline');};
    await assert.rejects(service.retrieveUpdate(now),/Offline/);
    assert.deepEqual((await service.snapshot()).savedRetrievals,before);
    let release!:(value:RealFlightSourceInput)=>void,started!:()=>void;
    const start=new Promise<void>(resolve=>{started=resolve;});
    f.ports.retrieve=async()=>new Promise(resolve=>{release=resolve;started();});
    const pending=service.retrieveUpdate(now);await start;service.cancelReview();release(windowSource('cancelled','2026-10-20','2027-10-20',true));
    await assert.rejects(pending,/Superseded/);assert.deepEqual((await service.snapshot()).savedRetrievals,before);
    let called=false;f.ports.retrieve=async()=>{called=true;return source();};f.switchOwner();
    await assert.rejects(service.retrieveUpdate(now),/foreign/);assert.equal(called,false);service.dispose();
  } finally {await f.cleanup();}
});

test('correction/repeat and historical gaps preserve older flights without deletion', async () => {
  const f=await fixture(),now=new Date(2026,9,20,12);
  try {
    const service=f.make(),old=windowSource('older','2025-01-01','2026-02-10');
    old.capture.rows[0]!.values[0]='10.02.2026';old.capture.rows[0]!.sourceFlightId='8999';
    let review=await service.confirmAccount(await service.reviewSource(old));await service.saveUnassigned(review);
    f.ports.retrieve=async request=>{assert.deepEqual(request,{from:'2026-02-10',to:'2026-10-20'});return windowSource('new',request.from,request.to);};
    review=await service.retrieveUpdate(now);assert.equal(review.state,'ready');
    if(review.state!=='ready')throw new Error('Expected plan');assert.equal(review.plan.counts.added,1);
    await service.saveUnassigned(review);
    const correction=windowSource('correction','2026-04-20','2026-10-20');correction.capture.rows[0]!.values[4]='10';
    const changed=await service.reviewSource(correction);if(changed.state!=='ready')throw new Error('Expected plan');
    assert.equal(changed.plan.counts.changed,1);await service.saveUnassigned(changed);
    const repeat=windowSource('repeat','2026-04-20','2026-10-20');repeat.capture.rows[0]!.values[4]='10';
    const repeated=await service.reviewSource(repeat);if(repeated.state!=='ready')throw new Error('Expected plan');
    assert.equal(repeated.plan.counts.unchanged,1);await service.saveUnassigned(repeated);
    const empty=windowSource('historical-empty','2020-01-01','2020-12-31',true);
    await service.saveUnassigned(await service.reviewSource(empty));
    const retained=await service.list();assert.equal(retained.length,2);
    const original=retained.find(row=>row.sourceFlightRef==='8999')!;assert.ok(original);
    assert.equal((await service.detail(original.flightId))?.factHistory.length,1);
    f.ports.retrieve=async request=>{assert.deepEqual(request,{from:'2020-12-31',to:'2026-10-20'});return windowSource('gap-fill',request.from,request.to,true);};
    await service.saveUnassigned(await service.retrieveUpdate(now));
    assert.equal((await service.list()).length,2);service.dispose();
  } finally {await f.cleanup();}
});

test('initial stored read consumes its existing session without another open and later reads use fresh sessions',async()=>{
  const f=await fixture();
  try{
    const {service,review}=await ready(f);await service.saveUnassigned(review);
    const initial=await f.ports.repository(),original=f.ports.repository;let opens=0,closes=0;
    f.ports.repository=async()=>{opens++;return original();};
    const session={...initial,writable:false,warning:'Retained candidate recovery',close:async()=>{closes++;await initial.close();}};
    const stored=await service.readStored(session);
    assert.equal(opens,0);assert.equal(closes,1);assert.equal(stored.flights.length,1);
    assert.deepEqual(stored.snapshot.recovery,{readOnly:true,warning:'Retained candidate recovery'});
    assert.equal((await service.readStored()).flights.length,1);assert.equal(opens,1);service.dispose();
  }finally{await f.cleanup();}
});

test('supplied startup sessions are closed even when the service expires before consumption',async()=>{
  for(const dispose of [false,true]){
    const f=await fixture();
    try{
      const service=f.make(),initial=await f.ports.repository();let closes=0;
      if(dispose)service.dispose();else f.switchOwner();
      await assert.rejects(service.readStored({...initial,close:async()=>{closes++;await initial.close();}}),/foreign/);
      assert.equal(closes,1);service.dispose();
    }finally{await f.cleanup();}
  }
});

test('startup handoff rereads current SQLite integrity rather than trusting its earlier validated graph',async()=>{
  const f=await fixture();
  try{
    const service=f.make(),initial=await f.ports.repository();let closes=0;
    const corrupt=nodeDriver(f.path);try{await corrupt.exec('PRAGMA user_version=99');}finally{await corrupt.close();}
    await assert.rejects(service.readStored({...initial,close:async()=>{closes++;await initial.close();}}),/SQL version/);
    assert.equal(closes,1);service.dispose();
  }finally{await f.cleanup();}
});

test('initial reader rejects a legitimately opened foreign library instead of projecting it as the current owner',async()=>{
  const f=await fixture();
  try{
    const service=f.make(),foreignOwner=randomUUID(),foreignStore=randomUUID();
    const library=await RealFlightLibrary.create(nodeDriver(join(f.directory,'foreign.sqlite')),
      {singleton:1,family:'moflight-real-flight-history',schema_version:1,payload_version:1,owner_id:foreignOwner,store_id:foreignStore,created_at:at},hash,
      ()=>({ownerId:foreignOwner,storeId:foreignStore,leaseId:'foreign-lease',writable:true}));
    let closes=0;
    await assert.rejects(service.readStored({library,writable:true,warning:null,close:async()=>{closes++;await library.close();}}),/Foreign own-flight repository/);
    assert.equal(closes,1);service.dispose();
  }finally{await f.cleanup();}
});

test('actual SQLite selection head changes after readiness invalidate the transferred initial reader',async()=>{
  const f=await fixture(),name=realHistoryCandidateName(randomUUID());
  const selection=await RealFlightSelection.open(nodeDriver(join(f.directory,'selection.sqlite')),ownerId,storeId,f.authorize,
    async(candidate,authorize,gate)=>{
      assert.equal(candidate,name);
      return RealFlightLibrary.open(nodeDriver(f.path),ownerId,storeId,hash,authorize,async()=>{},gate);
    },hash,true);
  const service=f.make();let session:RealFlightRepositorySession|undefined;
  try{
    await selection.activate(randomUUID(),name,null,at);
    const isReady=await continueRealFlightOwnerSetup<RealFlightLibrary>({ownerId,storeId,candidateName:name,createdAt:at,selectedAt:at},{
      openCandidate:async()=>{throw new Error('Not initial activation');},resumeInitialCandidate:async()=>{throw new Error('Not initial activation');},
      isMissingCandidate:()=>false,isUninitializedStore:()=>false,openSelection:async()=>selection,openCommandJournal:f.ports.journal,uuid:randomUUID,
    },false,(selected,release)=>{session={library:selected.candidate,writable:!selected.recoveryRequired,warning:selected.warning??null,close:release};});
    assert.equal(isReady,true);assert.ok(session);
    await selection.activate(randomUUID(),name,1,at);
    await assert.rejects(service.readStored(session),/Active real history changed/);
    await assert.rejects(selection.select(),/Expired|foreign/);
  }finally{await session?.close();await selection.close();service.dispose();await f.cleanup();}
});

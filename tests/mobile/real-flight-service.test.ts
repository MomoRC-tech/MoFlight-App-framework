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

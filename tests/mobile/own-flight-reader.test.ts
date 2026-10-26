import { ownFlightFixture } from './own-flight-fixture.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readOwnFlightView, readOwnFlightDetail, OwnFlightChangedError, OwnFlightReadCancelled, serializeOwnFlightReads, type OwnFlightView } from '../../apps/platform-lab/src/mobile/own-flight-reader.ts';
import { allOwnFlights, ownFlightYears, ownFlightRegistrations, selectOwnFlights } from '../../apps/platform-lab/src/mobile/own-flight-model.ts';
import type { InformationCapture } from '../../apps/platform-lab/src/vereinsflieger/information.ts';

function deferred<T>() { let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return {promise,resolve}; }

test('verified flights publish before delayed optional sources, with honest independent loading and failure states',async()=>{
  const f=ownFlightFixture(), medical=deferred<InformationCapture|null>(),started=deferred<void>(),published:OwnFlightView[]=[];
  f.session.readMedical=async()=>{started.resolve();return medical.promise;};
  f.session.readDuties=async()=>{throw new Error('Synthetic unavailable roster');};
  f.session.readFeatureInformation=async()=>null;
  const result=readOwnFlightView(f.ports,undefined,{current:()=>true,publish:view=>published.push(view)});
  await started.promise;
  assert.equal(published.length,1);assert.deepEqual(published[0]?.flights,f.flights);
  assert.deepEqual(published[0]?.sections,{medical:'loading',duties:'loading',information:'loading'});
  assert.equal(f.closes(),0);
  medical.resolve(null);const final=await result;
  assert.deepEqual(final?.sections,{medical:'missing',duties:'failed',information:'missing'});
  assert.equal(final?.dutiesReadFailed,true);assert.equal(final?.flights.length,3);assert.equal(f.closes(),1);
  assert.equal(published[0]?.sections?.medical,'loading','prior publication is immutable');
});

test('a writer supersedes supplemental work at the next safe boundary and cannot receive a late projection',async()=>{
  const f=ownFlightFixture(), medical=deferred<InformationCapture|null>(),started=deferred<void>();
  let current=true,duties=0,publishes=0;
  f.session.readMedical=async()=>{started.resolve();return medical.promise;};
  f.session.readDuties=async()=>{duties++;return null;};
  const ports=serializeOwnFlightReads(f.ports);
  const read=readOwnFlightView(ports,undefined,{current:()=>current,publish:()=>{publishes++;}});
  await started.promise;current=false;let admitted=false;
  const writer=ports.suspend().then(release=>{admitted=true;return release;});
  await new Promise<void>(resolve=>{setImmediate(resolve);});assert.equal(admitted,false);
  medical.resolve(null);await assert.rejects(read,OwnFlightReadCancelled);
  const release=await writer;assert.equal(admitted,true);release();
  assert.equal(duties,0);assert.equal(publishes,1);assert.equal(f.closes(),1);
});

test('owner invalidation after a partial publication prevents every subsequent section publication',async()=>{
  const f=ownFlightFixture();let valid=true,published=0;
  f.session.assertCurrent=async()=>{if(!valid)throw new Error('Owner changed');};
  f.session.readMedical=async()=>{valid=false;return null;};
  await assert.rejects(readOwnFlightView(f.ports,undefined,{current:()=>true,publish:()=>{published++;}}),/Owner changed/);
  assert.equal(published,1);assert.equal(f.closes(),1);
});

test('saved-local timing separates read steps and records optional-source failures without changing the result',async()=>{
  const f=ownFlightFixture(), stages:[string,boolean][]=[];
  f.session.readMedical=async()=>{throw new Error('Synthetic Medical failure');};
  f.session.readDuties=async()=>null;
  f.session.readFeatureInformation=async()=>null;
  const view=await readOwnFlightView(f.ports,{span:name=>success=>{stages.push([name,success]);}});
  assert.equal(view?.flights.length,3);
  assert.equal(view?.medicalReadFailed,true);
  assert.deepEqual(stages.map(([name])=>name),[
    'local-session-open','local-owner-check','local-pending-command','local-stored-view','local-owner-check',
    'local-medical-read','local-owner-check','local-duties-read','local-owner-check','local-information-read',
    'local-owner-check','local-session-close']);
  assert.deepEqual(stages.filter(([,success])=>!success),[['local-medical-read',false]]);
  assert.equal(f.closes(),1);
});

test('saved Medical is read only for the selected flight account; failures and foreign captures cannot hide saved flights',async()=>{
  const capture:InformationCapture={version:1,id:'medical',owner:'owner',connectionId:'connection',retrievedAt:'2026-10-21T07:00:00.000Z',
    sourceIdentity:'provisional-observed-profile',category:'medical',path:'/member/profile/viewprofile',
    columns:[{key:'kind',label:'Medical-Art',index:0},{key:'expiry',label:'Gültig bis · Originaltext',index:1}],
    rows:[{position:1,values:['Klasse 2','31.12.2027']}],filters:[],empty:false,coverage:{kind:'visible-page',truncated:false,pagination:'unverified'}};
  for(const mode of ['saved','failed','foreign','owner-change'] as const){
    const f=ownFlightFixture();
    f.session.readMedical=async accountRef=>{
      assert.equal(accountRef,'101');
      if(mode==='failed')throw new Error('Unreadable Medical');
      if(mode==='owner-change')f.session.assertCurrent=async()=>{throw new Error('Owner changed');};
      return mode==='foreign'?{...capture,owner:'foreign'}:capture;
    };
    if(mode==='owner-change')await assert.rejects(readOwnFlightView(f.ports),/Owner changed/);
    else {
      const view=await readOwnFlightView(f.ports);assert.deepEqual(view?.flights,f.flights);
      assert.equal(view?.medical,mode==='saved'?capture:null);
      assert.equal(view?.medicalReadFailed,mode!=='saved');
    }
    assert.equal(f.closes(),1);
  }
});

test('ordinary read returns the saved coherent projection and pending status with both ownership checks and cleanup',async()=>{
  const f=ownFlightFixture();f.session.pendingCommand=async()=>true;
  assert.deepEqual(await readOwnFlightView(f.ports),{snapshot:f.snapshot,flights:f.flights,pendingCommand:true,medical:null,medicalReadFailed:false,duties:null,dutiesReadFailed:false,featureInformation:null,featureInformationReadFailed:false});
  assert.equal(f.assertions(),4);assert.equal(f.closes(),1);
  assert.equal(await readOwnFlightView({open:async()=>null}),null);
});
test('foreign snapshot, account rows, changed owner and read failures never publish a library',async()=>{
  for(const fail of ['owner','store','account','lease','read','journal']) {
    const f=ownFlightFixture();
    if(fail==='owner')f.snapshot.ownerId='foreign';if(fail==='store')f.snapshot.storeId='foreign';
    if(fail==='account')f.flights[0]!.accountRef='foreign';
    if(fail==='lease') {let checks=0;f.session.assertCurrent=async()=>{if(++checks===2)throw new Error('Owner changed');};}
    if(fail==='read')f.session.service.readStored=async()=>{throw new Error('Unreadable');};
    if(fail==='journal')f.session.pendingCommand=async()=>{throw new Error('Unconfirmed journal');};
    await assert.rejects(readOwnFlightView(f.ports));assert.equal(f.closes(),1,fail);
  }
});
test('detail revalidates selected owner, account, flight and facts revision; each attempt releases handles',async()=>{
  const f=ownFlightFixture();assert.equal(await readOwnFlightDetail(f.ports,f.snapshot,f.flights[0]!),f.detail);
  for(const fail of ['owner','store','accountRef','bindingId','flightId','sourceFlightRef','factsRevision','missing']) {
    const g=ownFlightFixture();
    if(fail==='owner')g.session.ownerId='other';else if(fail==='store')g.session.storeId='other';
    else if(fail==='missing')g.session.service.detail=async()=>null;
    else if(fail==='factsRevision')g.detail.factsRevision=2;else g.detail[fail as 'accountRef'|'bindingId'|'flightId'|'sourceFlightRef']='foreign';
    await assert.rejects(readOwnFlightDetail(g.ports,g.snapshot,g.flights[0]!),OwnFlightChangedError);assert.equal(g.closes(),1,fail);
  }
});
test('filters combine raw source text, parsed source year and exact registration without inventing identities or mutating evidence',()=>{
  const {flights}=ownFlightFixture(),before=structuredClone(flights);
  assert.deepEqual(ownFlightYears(flights),[2026,2025]);assert.deepEqual(ownFlightRegistrations(flights),['D-T000','D-T001']);
  assert.deepEqual(selectOwnFlights(flights,allOwnFlights).map(f=>f.flightId),['flight-0','flight-1','flight-2']);
  assert.deepEqual(selectOwnFlights(flights,{search:' SYNTHETIC a ',year:2025,registration:'D-T001'}).map(f=>f.flightId),['flight-1']);
  assert.equal(selectOwnFlights(flights,{search:'1000',year:2025,registration:undefined}).length,0);
  assert.equal(selectOwnFlights(flights,{...allOwnFlights,registration:null})[0]?.flightId,'flight-2');
  assert.equal(selectOwnFlights(flights,{...allOwnFlights,year:2024}).length,0);
  assert.equal(flights[2]!.facts.assessment.durations.flight.state,'unknown');assert.deepEqual(flights,before);
});

test('a remounted reader waits for prior native cleanup and selects the owner fresh after admission',async()=>{
  const f=ownFlightFixture();let opens=0,owner='owner',finishClose!:()=>void;
  const closing=new Promise<void>(done=>{finishClose=done;});
  let closeStarted!:()=>void;const started=new Promise<void>(done=>{closeStarted=done;});
  const ports=serializeOwnFlightReads({open:async()=>{
    opens++;const first=opens===1,selected=owner;
    return {...f.session,ownerId:selected,service:{...f.session.service,readStored:async()=>({snapshot:{...f.snapshot,ownerId:selected},flights:first?f.flights:[]})},
      close:async()=>{if(first){closeStarted();await closing;}}};
  }});
  const first=readOwnFlightView(ports);await started;const second=readOwnFlightView(ports);
  await new Promise<void>(done=>{setImmediate(done);});assert.equal(opens,1);
  owner='other-owner';finishClose();
  assert.equal((await first)?.snapshot.ownerId,'owner');assert.equal((await second)?.snapshot.ownerId,'other-owner');
  assert.equal(opens,2);assert.equal((await readOwnFlightView(ports))?.flights.length,0);
});

test('missing selection, failed open and failed close release the queue without granting overlapping sessions',async()=>{
  const f=ownFlightFixture();let attempt=0;
  const ports=serializeOwnFlightReads({open:async()=>{
    attempt++;if(attempt===1)throw new Error('Open interrupted');if(attempt===2)return null;
    if(attempt===3)return {...f.session,close:async()=>{throw new Error('Close interrupted');}};
    return f.session;
  }});
  const results=await Promise.allSettled(Array.from({length:4},()=>readOwnFlightView(ports)));
  assert.deepEqual(results.map(r=>r.status),['rejected','fulfilled','rejected','fulfilled']);
  assert.equal((results[1] as PromiseFulfilledResult<unknown>).value,null);
  assert.equal((results[3] as PromiseFulfilledResult<any>).value.flights.length,3);assert.equal(attempt,4);
});

test('provider-flow reservation drains native readers and blocks later reads until released',async()=>{
  const f=ownFlightFixture();let opened=0,finishClose!:()=>void;
  const closing=new Promise<void>(resolve=>{finishClose=resolve;});
  const ports=serializeOwnFlightReads({open:async()=>{opened++;return {...f.session,close:async()=>{if(opened===1)await closing;}};}});
  const first=await ports.open();assert.ok(first);
  const close=first.close();let admitted=false;
  const reservation=ports.suspend().then(release=>{admitted=true;return release;});
  const later=ports.open();
  await new Promise<void>(resolve=>{setImmediate(resolve);});assert.equal(admitted,false);assert.equal(opened,1);
  finishClose();await close;const release=await reservation;
  await new Promise<void>(resolve=>{setImmediate(resolve);});assert.equal(opened,1);
  release();release();const next=await later;assert.ok(next);await next.close();assert.equal(opened,2);
  const again=await ports.open();assert.ok(again);await again.close();assert.equal(opened,3);
});


test('feature information is scoped to the selected account and isolated failures preserve saved flights',async()=>{
 for(const mode of ['saved','failed','foreign-owner','foreign-account','foreign-capture','owner-change'] as const){
  const f=ownFlightFixture();
  f.session.readFeatureInformation=async()=>{
   if(mode==='failed')throw new Error('Unreadable');
   if(mode==='owner-change')f.session.assertCurrent=async()=>{throw new Error('Owner changed');};
   return {scope:{version:1,owner:mode==='foreign-owner'?'foreign':f.snapshot.ownerId,connectionId:'connection',context:{accountNumber:mode==='foreign-account'?'999':'101',clubLabel:'Synthetic Club',clubIdentity:'display-label-only',verification:'observed-profile-number'}},captures:mode==='foreign-capture'?[{owner:'foreign'} as any]:[]};
  };
  if(mode==='owner-change')await assert.rejects(readOwnFlightView(f.ports),/Owner changed/);
  else {const result=await readOwnFlightView(f.ports);assert.deepEqual(result?.flights,f.flights);assert.equal(result?.featureInformationReadFailed,mode!=='saved');assert.equal(result?.featureInformation?.events.status,mode==='saved'?'unavailable':undefined);}
  assert.equal(f.closes(),1);
 }
});


test('displayed detail uses retained evidence only after fresh pre/post context checks',async()=>{
  const f=ownFlightFixture();let contexts=0,freshReads=0;
  const context={leaseId:'lease',selectionIdentity:'selection'};
  f.session.assertDetailContext=async value=>{assert.equal(value,context);contexts++;};
  f.session.service.detail=async()=>{freshReads++;throw new Error('Must not reopen history');};
  const detailSource={detail:()=>structuredClone(f.detail)} as unknown as NonNullable<import('../../apps/platform-lab/src/mobile/own-flight-reader.ts').OwnFlightView['detailSource']>;
  const stored={detailSource,detailContext:context};
  assert.deepEqual(await readOwnFlightDetail(f.ports,f.snapshot,f.flights[0]!,stored),f.detail);
  assert.equal(contexts,2);assert.equal(freshReads,0);assert.equal(f.closes(),1);
  for(const failAt of [1,2]){
    contexts=0;f.session.assertDetailContext=async()=>{if(++contexts===failAt)throw new Error('Changed context');};
    await assert.rejects(readOwnFlightDetail(f.ports,f.snapshot,f.flights[0]!,stored),/Changed context/);
  }
  delete f.session.assertDetailContext;
  await assert.rejects(readOwnFlightDetail(f.ports,f.snapshot,f.flights[0]!,stored),OwnFlightChangedError);
  assert.equal(freshReads,0);assert.equal(f.closes(),4);
});

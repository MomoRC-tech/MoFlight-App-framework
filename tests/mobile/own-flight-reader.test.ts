import { ownFlightFixture } from './own-flight-fixture.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readOwnFlightView, readOwnFlightDetail, OwnFlightChangedError, serializeOwnFlightReads } from '../../apps/platform-lab/src/mobile/own-flight-reader.ts';
import { allOwnFlights, ownFlightYears, ownFlightRegistrations, selectOwnFlights } from '../../apps/platform-lab/src/mobile/own-flight-model.ts';

test('ordinary read returns the saved coherent projection and pending status with both ownership checks and cleanup',async()=>{
  const f=ownFlightFixture();f.session.pendingCommand=async()=>true;
  assert.deepEqual(await readOwnFlightView(f.ports),{snapshot:f.snapshot,flights:f.flights,pendingCommand:true});
  assert.equal(f.assertions(),2);assert.equal(f.closes(),1);
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

import test from 'node:test';
import assert from 'node:assert/strict';
import { acknowledgeOwnFlightReview, readOwnFlightView, type OwnFlightView } from '../../apps/platform-lab/src/mobile/own-flight-reader.ts';
import { ownFlightFixture } from './own-flight-fixture.ts';

function fixture() {
  const f=ownFlightFixture(), saved: unknown[]=[];
  f.detail.flightId='a'.repeat(64);f.flights[0]!.flightId=f.detail.flightId;
  const context={ownerSelectionSeq:1,selectionIdentity:'synthetic-selected-source'};
  const view:OwnFlightView={snapshot:f.snapshot,flights:f.flights,pendingCommand:false,detailContext:context};
  const acknowledgment={flightId:f.detail.flightId,revision:f.detail.factsRevision,payloadSha256:'a'.repeat(64)};
  f.session.assertDetailContext=async candidate=>assert.deepEqual(candidate,context);
  f.session.saveFlightAcknowledgment=async(detail,value,_context,current)=>{assert.equal(current(),true);saved.push({detail,value});};
  return {...f,saved,view,acknowledgment};
}

test('explicit acknowledgment verifies a fresh exact detail and closes its session without changing source data',async()=>{
  const f=fixture(), original=structuredClone(f.detail);let freshReads=0;
  f.session.service.detail=async()=>{freshReads++;return f.detail;};
  await acknowledgeOwnFlightReview(f.ports,f.view,f.detail,f.acknowledgment,()=>true);
  assert.equal(freshReads,1);assert.equal(f.saved.length,1);assert.equal(f.closes(),1);assert.deepEqual(f.detail,original);
});

test('foreign scope, stale revision/reference/account, pending work and background cannot acknowledge a displayed flight',async()=>{
  for(const kind of ['owner','store','account','revision','reference','pending','restore','background'] as const){
    const f=fixture();
    if(kind==='owner')f.session.ownerId='foreign';
    if(kind==='store')f.session.storeId='foreign';
    if(['account','revision','reference'].includes(kind)){
      const fresh=structuredClone(f.detail);
      if(kind==='account')fresh.accountRef='999';
      if(kind==='revision')fresh.factsRevision++;
      if(kind==='reference')fresh.sourceFlightRef='999';
      f.session.service.detail=async()=>fresh;
    }
    if(kind==='pending')f.session.pendingCommand=async()=>true;
    if(kind==='restore')f.view.pendingCommand=true;
    await assert.rejects(acknowledgeOwnFlightReview(f.ports,f.view,f.detail,f.acknowledgment,()=>kind!=='background'));
    assert.equal(f.saved.length,0,kind);
  }
});

test('review-store failure preserves ordinary flights and uses conservative unread attention',async()=>{
  const f=ownFlightFixture();
  f.session.service.readStored=async()=>({snapshot:f.snapshot,flights:f.flights,detailSource:{reviewSummaries:()=>({[f.detail.flightId]:{changed:true}})} as any});
  f.session.readFlightAcknowledgments=async()=>{throw new Error('Synthetic unavailable UI metadata');};
  const result=await readOwnFlightView(f.ports);
  assert.equal(result?.reviewReadFailed,true);assert.equal(result?.flights.length,f.flights.length);
  assert.equal(result?.sourceReviews?.[f.detail.flightId]?.changed,true);assert.equal(f.closes(),1);
});

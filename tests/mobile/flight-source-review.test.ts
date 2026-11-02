import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptHistoryFacts } from '../../apps/platform-lab/src/vereinsflieger/history-facts.ts';
import { compareFlightSourceFields, flightReviewSummary } from '../../apps/platform-lab/src/vereinsflieger/flight-source-review.ts';

const scope = { ownerId: '11111111-1111-4111-8111-111111111111', scopeId: '22222222-2222-4222-8222-222222222222' };
const facts = (headers: string[], values: string[], reference='101') => adaptHistoryFacts(scope,
  { captureId: 'synthetic-review', headers, rows: [{ sourceFlightId: reference, values }] }, 0);

test('comparison preserves exact raw values, missing versus empty, and rejects another flight or owner', () => {
  const before=facts(['Flugzeit','Pilot','Entfernt'],['40','','old']);
  const after=facts(['Pilot','Flugzeit','Neu'],['Alex','45','']);
  const changes=compareFlightSourceFields(before,after);
  assert.deepEqual(changes.map(row=>[row.label,row.before.state,row.current.state]),[
    ['Pilot','empty','value'],['Flugzeit','value','value'],['Neu','missing','empty'],['Entfernt','value','missing']]);
  assert.deepEqual(changes[1]?.before.values,['40']);assert.deepEqual(changes[1]?.current.values,['45']);
  assert.throws(()=>compareFlightSourceFields(before,facts(['Flugzeit'],['45'],'102')),/Foreign/);
  const foreign=structuredClone(after);foreign.scope.ownerId='33333333-3333-4333-8333-333333333333';
  assert.throws(()=>compareFlightSourceFields(before,foreign),/Foreign/);
});

test('column reordering is stable, duplicate labels remain ambiguous and unnamed columns retain position', () => {
  assert.deepEqual(compareFlightSourceFields(facts(['Pilot','Flugzeit'],['Alex','40']),facts(['Flugzeit','Pilot'],['40','Alex'])),[]);
  assert.throws(()=>facts(['X','X'],['a','b']),/Ambiguous/,'ordinary source admission rejects duplicate headers');
  // Defensive display behavior must not guess pairings if a future input carries them.
  const duplicate=(values:string[])=>{const result=facts(['X','Y',''],values);result.assessment.observation.headers[1]='X';return result;};
  assert.deepEqual(compareFlightSourceFields(duplicate(['a','b','old']),duplicate(['b','a','old'])),[]);
  const rows=compareFlightSourceFields(duplicate(['a','b','old']),duplicate(['a','c','new']));
  assert.equal(rows[0]?.current.state,'ambiguous');assert.deepEqual(rows[0]?.current.values,['a','c']);
  assert.equal(rows[1]?.key,'unnamed:2');
});

test('the initial revision is baseline; only an exact known acknowledgment advances it', () => {
  const revisions=[1,2,3].map(revision=>({revision,payloadSha256:String(revision).repeat(64)}));
  const ack={flightId:'a'.repeat(64),revision:2,payloadSha256:'2'.repeat(64)};
  assert.equal(flightReviewSummary(revisions.slice(0,1)).changed,false);
  assert.deepEqual(flightReviewSummary(revisions,ack),{baselineRevision:2,currentRevision:3,changed:true,changeCount:1});
  assert.equal(flightReviewSummary(revisions,{...ack,payloadSha256:'f'.repeat(64)}).baselineRevision,1);
  assert.equal(flightReviewSummary(revisions,{...ack,revision:9}).baselineRevision,1);
  assert.equal(flightReviewSummary(revisions,{...ack,revision:3,payloadSha256:'3'.repeat(64)}).changed,false);
});

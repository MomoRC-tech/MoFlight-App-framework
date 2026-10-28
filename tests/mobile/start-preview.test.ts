import test from 'node:test';
import assert from 'node:assert/strict';
import { makeStartPreview, readStartPreview, START_PREVIEW_LIMIT } from '../../apps/platform-lab/src/mobile/start-preview';
import { startPreviewFixture } from './start-preview-fixture';
import { medicalExpiry } from '../../apps/platform-lab/src/mobile/medical-expiry';
import { buildDutyOverview, DUTY_RETENTION_MS } from '../../apps/platform-lab/src/vereinsflieger/duties';
import type { InformationCapture } from '../../apps/platform-lab/src/vereinsflieger/information';

test('compact Start cache roundtrips synthetic scalar projections without retaining full flight history',()=>{
  const f=startPreviewFixture(),text=JSON.stringify(f.preview);
  assert.equal(f.preview.dashboard.current.time,'2:00');
  assert.equal(f.preview.dashboard.current.starts,'1');
  assert.equal(f.preview.dashboard.current.unknownDateCount,1);
  assert.ok(text.length<4000);
  assert.doesNotMatch(text,/observation|factHistory|firstCaptureId|detailSource/);
  assert.deepEqual(readStartPreview(text,f.expected,f.now),f.preview);
  const changed=structuredClone(f.view);
  changed.flights[0]!.facts.assessment.durations.flight={state:'known',minutes:145,evidence:[]};
  assert.equal(makeStartPreview(changed,f.scope,f.now,'b'.repeat(64))!.dashboard.current.time,'2:25');
  assert.equal(f.preview.dashboard.current.time,'2:00');
});

test('cache rejects different owner, store, account, connection, selection, version and calendar boundaries',()=>{
  const f=startPreviewFixture(),text=JSON.stringify(f.preview);
  for(const expected of [{...f.expected,ownerId:'other'},{...f.expected,storeId:'other'},{...f.expected,selectionSeq:2},
    {...f.expected,scope:{...f.scope,connectionId:'other'}},{...f.expected,scope:{...f.scope,context:{...f.scope.context,accountNumber:'202'}}}]){
    assert.equal(readStartPreview(text,expected,f.now),null);
  }
  assert.ok(readStartPreview(text,f.expected,new Date(2026,9,29,0).getTime()),'historical saved values remain usable the next day');
  for(const now of [new Date(2027,0,1).getTime(),f.now-1])assert.equal(readStartPreview(text,f.expected,now),null);
  assert.equal(readStartPreview(JSON.stringify({...f.preview,version:2}),f.expected,f.now),null);
});

test('truncated, oversized, malformed summary and foreign source cache are misses',()=>{
  const f=startPreviewFixture();
  for(const text of ['', '{', 'null', ' '.repeat(START_PREVIEW_LIMIT+1),
    JSON.stringify({...f.preview,dashboard:{...f.preview.dashboard,roles:[]}}),
    JSON.stringify({...f.preview,dashboard:{...f.preview.dashboard,current:{time:'1:00',starts:'1',unknownDateCount:-1}}}),
    JSON.stringify({...f.preview,medical:{owner:'other'}}),JSON.stringify({...f.preview,duties:{scope:{owner:'other'}}})]){
    assert.equal(readStartPreview(text,f.expected,f.now),null);
  }
});

test('pending writes, recovery and partial source errors never produce a reusable cache',()=>{
  const f=startPreviewFixture();
  for(const view of [{...f.view,pendingCommand:true},{...f.view,snapshot:{...f.snapshot,recovery:{readOnly:true,warning:null}}},
    {...f.view,medicalReadFailed:true},{...f.view,dutiesReadFailed:true},{...f.view,featureInformationReadFailed:true},{...f.view,detailContext:undefined}]){
    assert.equal(makeStartPreview(view,f.scope,f.now,'a'.repeat(64)),null);
  }
});

test('saved Medical and duties retain their original dates and are evaluated against the current clock',()=>{
  const f=startPreviewFixture();
  const common={version:1 as const,owner:f.scope.owner,connectionId:f.scope.connectionId,retrievedAt:new Date(f.now).toISOString(),
    sourceIdentity:'provisional-observed-profile' as const,filters:[],empty:false,coverage:{kind:'visible-page' as const,truncated:false,pagination:'unverified' as const}};
  const medical:InformationCapture={...common,id:'medical',category:'medical',path:'/member/profile/viewprofile',
    columns:[{key:'kind',label:'Medical-Art',index:0},{key:'expiry',label:'Gültig bis · Originaltext',index:1}],rows:[{position:0,values:['Klasse 2','28.10.2026']}]};
  const duty:InformationCapture={...common,id:'duties',category:'duties',path:'/member/profile/myservices.php',
    columns:[{key:'duty',label:'Dienst',index:0},{key:'period',label:'Zeitraum',index:1},{key:'people',label:'Person(en)',index:2}],
    rows:[{position:0,values:['Synthetic service','29.10.2026 09:00 - 29.10.2026 17:00','Example, Pilot']}]};
  const view={...f.view,medical,duties:{scope:f.scope,snapshot:{version:1 as const,scope:f.scope,retrievedAt:common.retrievedAt,captures:[duty]}}};
  const cached=makeStartPreview(view,f.scope,f.now,'a'.repeat(64))!;
  const tomorrow=new Date(2026,9,29,12).getTime();
  const reopened=readStartPreview(JSON.stringify(cached),f.expected,tomorrow)!;
  assert.ok(reopened);assert.equal(reopened.medical!.retrievedAt,common.retrievedAt);
  assert.equal(medicalExpiry(reopened.medical!,tomorrow).state,'expired');
  assert.equal(buildDutyOverview(f.scope,reopened.duties!.snapshot,'2026-10-29',tomorrow).ownItems.length,1);
  assert.equal(buildDutyOverview(f.scope,reopened.duties!.snapshot,'2026-11-28',f.now+DUTY_RETENTION_MS).status,'unavailable');
  const empty={...f.view,flights:[],snapshot:{...f.snapshot,savedRetrievals:[{from:'2026-01-01',to:'2026-10-28',retrievedAt:common.retrievedAt,savedAt:common.retrievedAt}]}};
  const zero=makeStartPreview(empty,f.scope,f.now,'b'.repeat(64))!;
  assert.equal(zero.dashboard.current.starts,'0');
  assert.equal(readStartPreview(JSON.stringify(zero),f.expected,tomorrow)!.dashboard.current.starts,'—','yesterday coverage cannot confirm an empty current day');
});

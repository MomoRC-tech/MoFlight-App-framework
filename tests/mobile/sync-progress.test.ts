import test from 'node:test';
import assert from 'node:assert/strict';
import {idleSyncProgress,idleSyncNotice,startSyncStage,finishSyncStage,completedSyncProgress} from '../../apps/platform-lab/src/mobile/sync-progress.ts';

test('idle notices distinguish loading, first use, failed reads and invalid receipts',()=>{
  const now=Date.parse('2026-10-25T12:00:00.000Z');
  const props={receivedAt:null,readState:'ready' as const,now};
  assert.equal(idleSyncNotice({...props,readState:'loading',activityChanged:true}),null);
  assert.equal(idleSyncNotice(props)?.caption,'Noch keine Flugdaten');
  for(const receivedAt of [null,'invalid','2026-10-26T12:00:00.000Z']){
    assert.equal(idleSyncNotice({...props,receivedAt,readState:'failed'})?.kind,'read-error');
  }
  for(const receivedAt of ['invalid','2026-10-26T12:00:00.000Z','2026-10-25T12:00:00Z']){
    assert.equal(idleSyncNotice({...props,receivedAt})?.caption,'Datenstand unklar');
  }
});

test('idle advice applies strictly after 72 hours and explains independent change evidence',()=>{
  const receivedAt='2026-10-22T12:00:00.000Z',boundary=Date.parse(receivedAt)+72*60*60*1000;
  const props={receivedAt,readState:'ready' as const,now:boundary};
  assert.equal(idleSyncNotice(props),null);
  assert.equal(idleSyncNotice({...props,now:boundary+1})?.caption,'Aktualisierung empfohlen');
  const changed=idleSyncNotice({...props,activityChanged:true});
  assert.equal(changed?.caption,'Änderungen möglich');assert.doesNotMatch(changed!.description,/drei Tage/);
  const both=idleSyncNotice({...props,now:boundary+1,activityChanged:true});
  assert.equal(both?.caption,'Änderungen möglich');assert.match(both!.description,/Anzahl.*nicht bestätigt.*drei Tage/);
  assert.equal(idleSyncNotice({...props,readState:'failed',activityChanged:true})?.kind,'read-error');
});

test('two progress rows promote confirmed completion and never invent success on a start or failure',()=>{
  let progress=startSyncStage(idleSyncProgress,'account');
  assert.equal(progress.last,null);assert.equal(progress.current,'account');
  assert.equal(startSyncStage(progress,'account'),progress,'Repeated controller renders are silent');
  progress=startSyncStage(progress,'sign-in');assert.equal(progress.state,'waiting');assert.equal(progress.last,null);
  progress=finishSyncStage(progress,'sign-in');progress=startSyncStage(progress,'flights');
  assert.equal(progress.last,'sign-in');assert.equal(progress.current,'flights');
  assert.equal(finishSyncStage(progress,'account'),progress,'Late completion cannot promote another stage');
  progress=finishSyncStage(progress,'flights');progress=startSyncStage(progress,'save');
  assert.equal(progress.last,'flights');assert.equal(progress.current,'save');
  progress={...progress,state:'failed'};assert.equal(progress.last,'flights','Failed save never becomes a completed row');
});

test('a saved-flight result names only failed/skipped sources and never treats bounded capture as failure',()=>{
  const result={pending:0,medicalStatus:'updated',dutyStatus:'partial',eventsStatus:'failed',documentNoticesStatus:'partial',tasksStatus:'partial'};
  assert.deepEqual(completedSyncProgress(result),{state:'partial',last:'save',current:null,message:'Nicht aktualisiert: Termine.'});
  assert.equal(completedSyncProgress({...result,eventsStatus:'partial'}),idleSyncProgress);
  assert.equal(completedSyncProgress({...result,medicalStatus:'skipped',workHoursStatus:'failed'}).message,'Nicht aktualisiert: Medical, Termine, Arbeitsstunden.');
  const protectedResult=completedSyncProgress({pending:1,cleanupPending:true});
  assert.equal(protectedResult.state,'partial');assert.match(protectedResult.message!,/Flüge benötigen eine Prüfung/);assert.match(protectedResult.message!,/Anbieteransicht/);
});

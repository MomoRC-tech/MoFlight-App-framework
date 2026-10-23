import test from 'node:test';
import assert from 'node:assert/strict';
import {idleSyncProgress,startSyncStage,finishSyncStage,completedSyncProgress} from '../../apps/platform-lab/src/mobile/sync-progress.ts';

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

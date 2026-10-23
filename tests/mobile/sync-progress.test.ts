import test from 'node:test';
import assert from 'node:assert/strict';
import {idleSyncProgress,startSyncStage,finishSyncStage} from '../../apps/platform-lab/src/mobile/sync-progress.ts';

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

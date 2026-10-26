import test from 'node:test';
import assert from 'node:assert/strict';
import { syncStatus } from '../../apps/platform-lab/src/mobile/sync-status.ts';
import { idleSyncProgress } from '../../apps/platform-lab/src/mobile/sync-progress.ts';
const base={receivedAt:'2026-10-26T12:00:00.000Z',now:Date.parse('2026-10-26T12:00:00.000Z'),readState:'ready' as const};

test('only a completed job plus usable saved evidence can show full sync success',()=>{
  assert.equal(syncStatus(base).reason,'saved');
  assert.equal(syncStatus({...base,completed:true}).reason,'success');
  for(const receivedAt of [null,'invalid','2026-10-27T12:00:00.000Z'])assert.equal(syncStatus({...base,receivedAt,completed:true}).reason,'unknown');
  assert.equal(syncStatus({...base,completed:true,readState:'failed'}).reason,'read-error');
  assert.equal(syncStatus({...base,completed:true,now:base.now+72*3600000+1}).reason,'stale');
});

test('work overrides old problems; read errors and partial/failed jobs override success',()=>{
  for(const state of ['active','waiting'] as const)assert.equal(syncStatus({...base,readState:'failed',completed:true,progress:{...idleSyncProgress,state}}).reason,state);
  for(const state of ['partial','failed'] as const){
    const progress={...idleSyncProgress,state,message:'Fixed synthetic detail.'};
    const status=syncStatus({...base,completed:true,activityChanged:true,progress});
    assert.equal(status.reason,state);assert.equal(status.mark,'!');assert.match(status.description,/Fixed synthetic detail/);
    assert.equal(syncStatus({...base,readState:'failed',progress}).reason,'read-error');
  }
  assert.equal(syncStatus({...base,completed:true,activityChanged:true}).reason,'changed');
});

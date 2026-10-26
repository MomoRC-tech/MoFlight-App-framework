import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSyncEstimate,reduceSyncEstimate,snapshotSyncEstimate,learnSyncEstimate,parseSyncEstimateHistory,syncEstimateVolume,
  SYNC_ESTIMATE_MODEL_VERSION,type SyncEstimateStage,type SyncEstimateEvent,type SyncEstimateMode,
} from '../../apps/platform-lab/src/mobile/sync-estimate.ts';

const scope='synthetic-device/model-boundary-1';
function history(weights:Partial<Record<SyncEstimateStage,number>>,mode:SyncEstimateMode='repeat'){
  return {version:SYNC_ESTIMATE_MODEL_VERSION,scope,samples:Object.entries(weights).map(([stage,duration])=>({stage,mode,volume:'small',durationsMs:[duration]}))};
}
function attempt(stages:SyncEstimateStage[],hints:unknown=history({}),mode:SyncEstimateMode='repeat',runId='run-1'){
  let state=createSyncEstimate({runId,scope,mode,volume:'small',stages,history:hints,now:0});
  return {
    get state(){return state;},
    send(event:Omit<SyncEstimateEvent,'runId'>&{runId?:string}){state=reduceSyncEstimate(state,{...event,runId:event.runId??runId} as SyncEstimateEvent);return state;},
  };
}
// Preserve discriminated event fields while giving tests a fake timestamp clock.
type TestEvent=SyncEstimateEvent extends infer Event?Event extends SyncEstimateEvent?Omit<Event,'runId'>&{runId?:string}:never:never;
function send(run:ReturnType<typeof attempt>,event:TestEvent){return run.send(event);}

test('cold start is indeterminate until confirmed success; then learns bounded actual units',()=>{
  const run=attempt(['flights','save']);
  send(run,{type:'start',stage:'flights',at:0});
  send(run,{type:'count',stage:'flights',done:100,total:100,at:100});
  assert.equal(run.state.fraction,null);
  send(run,{type:'finish',stage:'flights',at:100});
  send(run,{type:'start',stage:'save',at:100});
  send(run,{type:'finish',stage:'save',at:400});
  assert.equal(run.state.fraction,null);
  send(run,{type:'terminal',outcome:'success',at:410});
  assert.equal(run.state.fraction,1);
  assert.deepEqual(learnSyncEstimate(undefined,run.state).samples.map(sample=>sample.durationsMs),[[100],[300]]);
  const next=attempt(['flights','save'],learnSyncEstimate(undefined,run.state));
  assert.equal(next.state.fraction,0);
});

test('validated page counts affect only the retrieval budget and never imply whole-run completion',()=>{
  const run=attempt(['flights','review','save'],history({flights:100,review:200,save:700}));
  send(run,{type:'start',stage:'flights',at:0});
  send(run,{type:'count',stage:'flights',done:50,total:100,at:0});assert.equal(run.state.fraction,0.05);
  send(run,{type:'count',stage:'flights',done:100,total:100,at:1});assert.equal(run.state.fraction,0.1);
  send(run,{type:'finish',stage:'flights',at:2});
  send(run,{type:'start',stage:'review',at:2});
  send(run,{type:'tick',at:102});assert.equal(run.state.fraction,0.19);
  send(run,{type:'finish',stage:'review',at:103});assert.equal(run.state.fraction,0.3);
  send(run,{type:'start',stage:'save',at:103});
  send(run,{type:'count',stage:'save',done:100,total:100,at:103});assert.equal(run.state.fraction,0.3,'Saving counts do not simulate readback completion');
});

test('empty retrieval needs a confirmed finish and opaque overruns stop at the cap',()=>{
  const run=attempt(['flights','save'],history({flights:100,save:900}));
  send(run,{type:'start',stage:'flights',at:0});
  send(run,{type:'count',stage:'flights',done:0,total:0,at:50});assert.equal(run.state.fraction,0);
  send(run,{type:'finish',stage:'flights',at:50});assert.equal(run.state.fraction,0.1);
  send(run,{type:'start',stage:'save',at:50});
  send(run,{type:'tick',at:950});const capped=run.state.fraction;
  assert.equal(snapshotSyncEstimate(run.state).overrun,true);
  send(run,{type:'tick',at:95_000});assert.equal(run.state.fraction,capped);
  assert.ok(capped!<1);
  send(run,{type:'finish',stage:'save',at:95_001});assert.equal(run.state.fraction,0.99);
  send(run,{type:'terminal',outcome:'success',at:95_002});assert.equal(run.state.fraction,1);
});

test('sign-in waiting freezes estimates and does not pollute successful timing samples',()=>{
  const run=attempt(['save'],history({save:1000}));
  send(run,{type:'start',stage:'save',at:0});
  send(run,{type:'pause',reason:'sign-in',at:100});const fraction=run.state.fraction;
  send(run,{type:'tick',at:30_000});assert.equal(run.state.fraction,fraction);
  send(run,{type:'finish',stage:'save',at:30_001});assert.equal(run.state.units[0]!.done,false);
  send(run,{type:'resume',at:40_000});
  send(run,{type:'finish',stage:'save',at:40_100});
  send(run,{type:'terminal',outcome:'success',at:40_101});
  assert.deepEqual(learnSyncEstimate(undefined,run.state).samples[0]!.durationsMs,[200]);
  const withoutLogin=createSyncEstimate({runId:'login',scope,mode:'repeat',volume:'small',stages:['sign-in','save'],history:history({save:1000}),now:0});
  assert.equal(withoutLogin.units.length,1);
});

test('background pauses freeze activity and disqualify the attempt from training',()=>{
  const run=attempt(['save'],history({save:1000}));
  send(run,{type:'start',stage:'save',at:0});
  send(run,{type:'pause',reason:'background',at:10});
  send(run,{type:'tick',at:10_000});assert.equal(run.state.units[0]!.elapsedMs,10);
  send(run,{type:'resume',at:10_001});send(run,{type:'finish',stage:'save',at:10_011});
  send(run,{type:'terminal',outcome:'success',at:10_012});
  assert.deepEqual(learnSyncEstimate(undefined,run.state).samples,[]);
});

test('backgrounding while already waiting for sign-in still disqualifies successful timing samples',()=>{
  const run=attempt(['save'],history({save:1000}));
  send(run,{type:'start',stage:'save',at:0});send(run,{type:'pause',reason:'sign-in',at:10});
  send(run,{type:'pause',reason:'background',at:1000});assert.equal(run.state.learnable,false);
  send(run,{type:'resume',at:2000});send(run,{type:'finish',stage:'save',at:2010});
  send(run,{type:'terminal',outcome:'success',at:2011});
  assert.equal(run.state.status,'success');assert.equal(run.state.units[0]!.elapsedMs,20);
  assert.deepEqual(learnSyncEstimate(undefined,run.state).samples,[]);
});

test('early actual completion immediately credits the frozen duration budget',()=>{
  const run=attempt(['save','tasks'],history({save:900,tasks:100}));
  send(run,{type:'start',stage:'save',at:0});
  send(run,{type:'finish',stage:'save',at:1});assert.equal(run.state.fraction,0.9);
  send(run,{type:'start',stage:'tasks',at:1});
  send(run,{type:'finish',stage:'tasks',at:2});assert.equal(run.state.fraction,0.99);
  send(run,{type:'terminal',outcome:'success',at:2});assert.equal(run.state.fraction,1);
});

test('stale run, wrong stage, backward clocks, changed totals and decreasing counts are rejected',()=>{
  const run=attempt(['flights','save'],history({flights:100,save:100}));
  send(run,{type:'start',stage:'flights',at:0});
  send(run,{type:'count',stage:'flights',done:5,total:10,at:5});
  const before=run.state;
  for(const event of [
    {type:'finish',stage:'flights',runId:'old-run',at:6},
    {type:'finish',stage:'save',at:6},
    {type:'finish',stage:'flights',at:4},
    {type:'count',stage:'flights',done:4,total:10,at:6},
    {type:'count',stage:'flights',done:6,total:11,at:6},
    {type:'count',stage:'flights',done:NaN,total:10,at:6},
    {type:'count',stage:'flights',done:11,total:10,at:6},
  ] as TestEvent[])assert.equal(send(run,event),before);
});

test('failure, cancellation, partial and unconfirmed success never report 100 or train hints',()=>{
  for(const outcome of ['failed','cancelled','partial','success'] as const){
    const run=attempt(['save'],history({save:100}));
    send(run,{type:'start',stage:'save',at:0});send(run,{type:'tick',at:100});
    send(run,{type:'terminal',outcome,at:101});assert.ok(run.state.fraction!<1);
    assert.deepEqual(learnSyncEstimate(undefined,run.state).samples,[]);
    const stopped=run.state;send(run,{type:'finish',stage:'save',at:102});assert.equal(run.state,stopped);
  }
  const completed=attempt(['save'],history({save:100}));
  send(completed,{type:'start',stage:'save',at:0});send(completed,{type:'finish',stage:'save',at:10});
  send(completed,{type:'terminal',outcome:'partial',at:11});assert.equal(completed.state.fraction,0.99);
});

test('estimates stay monotonic when counts arrive after elapsed estimates and weights stay frozen',()=>{
  const hints=history({flights:100,save:100}),run=attempt(['flights','save'],hints);
  send(run,{type:'start',stage:'flights',at:0});send(run,{type:'tick',at:50});
  const before=run.state.fraction!;assert.equal(before,0.225);
  hints.samples[0]!.durationsMs[0]=10_000;
  send(run,{type:'count',stage:'flights',done:1,total:100,at:51});assert.equal(run.state.fraction,before);
  send(run,{type:'count',stage:'flights',done:90,total:100,at:52});assert.equal(run.state.fraction,0.45);
  assert.equal(run.state.units[0]!.expectedMs,100);
});

test('resume plans only remaining work and does not reuse first/repeat or other-volume samples',()=>{
  const hints=history({tasks:100},'resume');
  const run=attempt(['tasks'],hints,'resume');
  send(run,{type:'start',stage:'tasks',at:0});send(run,{type:'tick',at:50});assert.equal(run.state.fraction,0.45);
  assert.equal(attempt(['tasks'],hints,'repeat').state.fraction,null);
  assert.equal(createSyncEstimate({runId:'other-volume',scope,mode:'resume',volume:'large',stages:['tasks'],history:hints,now:0}).fraction,null);
  assert.equal(createSyncEstimate({runId:'missing',scope,mode:'resume',volume:'small',stages:['save','tasks'],history:hints,now:0}).fraction,null);
});

test('history sanitizes malformed/version/scope inputs, retains five samples and uses a robust median',()=>{
  for(const value of [null,'{bad',{},history({save:100}),{version:999,scope,samples:[]}]){
    const parsed=parseSyncEstimateHistory(value,'different-device');assert.deepEqual(parsed.samples,[]);
  }
  const hints=history({save:100});
  hints.samples[0]!.durationsMs=[-1,NaN,Infinity,0,100,110,120,130,86_400_001,100_000];
  const parsed=parseSyncEstimateHistory(JSON.stringify(hints),scope);
  assert.deepEqual(parsed.samples[0]!.durationsMs,[100,110,120,130,100_000]);
  assert.equal(attempt(['save'],parsed).state.units[0]!.expectedMs,120);
  const run=attempt(['save'],parsed);send(run,{type:'start',stage:'save',at:0});send(run,{type:'finish',stage:'save',at:140});send(run,{type:'terminal',outcome:'success',at:141});
  assert.deepEqual(learnSyncEstimate(parsed,run.state).samples[0]!.durationsMs,[110,120,130,100_000,140]);
  assert.equal(syncEstimateVolume(null),'unknown');assert.equal(syncEstimateVolume(0),'small');
  assert.equal(syncEstimateVolume(100,101),'medium');assert.equal(syncEstimateVolume(1,1001),'large');
});

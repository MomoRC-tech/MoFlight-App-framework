/** Frozen earlier-sample replay for host proxies or measured native local stages. */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonical } from '../packages/flight-logbook/src/index.ts';
import { createSyncEstimate, reduceSyncEstimate, learnSyncEstimate, parseSyncEstimateHistory, snapshotSyncEstimate, syncEstimateVolume, type SyncEstimateStage } from '../apps/platform-lab/src/mobile/sync-estimate.ts';

type Window = {stage: SyncEstimateStage;milliseconds: number};
type Trial = {trial:number;milliseconds:number;windows:Window[]};
type NativeSample = {scenario:string;trial:number;milliseconds:number;stages:Record<string,number>};
type Input = {source?:string;flights?:number;benchmark?:{flights:number};provenance?:{source_commit?:string};
  scenarios?:{name:string;samples:{trial:number;milliseconds:number}[]}[];samples?:NativeSample[]};

export function evaluateSyncEstimateReplay(report: Input) {
  const flights=report.flights??report.benchmark?.flights;
  assert.ok(Number.isSafeInteger(flights)&&flights!>0,'positive flight count required');
  const native=Array.isArray(report.samples);
  const scenarios:{name:string;samples:Trial[]}[]=native?[...new Set(report.samples!.map(sample=>sample.scenario))].map(name=>({name,
    samples:report.samples!.filter(sample=>sample.scenario===name).map(sample=>({trial:sample.trial,milliseconds:sample.milliseconds,
      windows:name==='reopened'?[{stage:'prepare',milliseconds:sample.stages.readback!}]:[
        {stage:'review',milliseconds:sample.stages['retrieval-review']!},{stage:'save',milliseconds:sample.stages.save!+sample.stages.readback!}]}))})):
    (report.scenarios??[]).map(scenario=>({...scenario,samples:scenario.samples.map(sample=>({...sample,windows:[{stage:'save',milliseconds:sample.milliseconds}]}))}));
  assert.ok(scenarios.length>0,'scenario samples required');
  const scope=native?'native-local-stage-replay-v1':'host-operation-proxy-replay-v1',volume=syncEstimateVolume(flights!),evaluations=[];
  for(const scenario of scenarios){
    assert.ok(scenario.samples.length>=5,'three training and at least two held-out trials required');
    const ids=scenario.samples.map(sample=>sample.trial),stages=scenario.samples[0]!.windows.map(unit=>unit.stage);
    assert.ok(ids.every((value,index)=>Number.isSafeInteger(value)&&value>=0&&(index===0||value>ids[index-1]!)),'trials must be unique and chronological');
    for(const sample of scenario.samples){
      assert.ok(Number.isFinite(sample.milliseconds)&&sample.milliseconds>=1);
      assert.deepEqual(sample.windows.map(unit=>unit.stage),stages);
      assert.ok(sample.windows.every(unit=>Number.isFinite(unit.milliseconds)&&unit.milliseconds>=1),'finite positive measured stages required');
      assert.ok(sample.windows.reduce((sum,unit)=>sum+unit.milliseconds,0)<=sample.milliseconds+0.001,'stage durations cannot exceed operation wall time');
    }
    let history=parseSyncEstimateHistory(null,scope);
    const training=scenario.samples.slice(0,3),heldOut=scenario.samples.slice(3);
    for(const sample of training){
      const runId=`train-${sample.trial}`;let at=0;
      let state=createSyncEstimate({runId,scope,mode:'repeat',volume,stages,history,now:0});
      for(const unit of sample.windows){
        state=reduceSyncEstimate(state,{runId,type:'start',stage:unit.stage,at});at+=unit.milliseconds;
        state=reduceSyncEstimate(state,{runId,type:'finish',stage:unit.stage,at});
      }
      state=reduceSyncEstimate(state,{runId,type:'terminal',outcome:'success',at});history=learnSyncEstimate(history,state);
    }
    const frozen=canonical(history),samples=[];
    for(const sample of heldOut){
      assert.ok(training.every(earlier=>earlier.trial<sample.trial));
      const runId=`held-out-${sample.trial}`;let offset=0,previous=0;
      let state=createSyncEstimate({runId,scope,mode:'repeat',volume,stages,history,now:0});
      const stageSamples=[];
      for(const unit of sample.windows){
        const expected=state.units.find(value=>value.stage===unit.stage)!.expectedMs;assert.ok(expected!==null);
        state=reduceSyncEstimate(state,{runId,type:'start',stage:unit.stage,at:offset});
        const checkpoints=[0.25,0.5,0.75,1].map(fraction=>unit.milliseconds*fraction);
        if(expected<unit.milliseconds)checkpoints.push(expected);checkpoints.sort((a,b)=>a-b);
        let capTimeMs=0,last=0;
        for(const elapsed of checkpoints){
          if(snapshotSyncEstimate(state).overrun)capTimeMs+=elapsed-last;
          state=reduceSyncEstimate(state,{runId,type:'tick',at:offset+elapsed});
          const value=snapshotSyncEstimate(state).fraction;
          assert.ok(value!==null&&value>=previous&&value<1,'estimate stays monotonic and below complete');previous=value;last=elapsed;
        }
        assert.ok(Math.abs(capTimeMs-Math.max(0,unit.milliseconds-expected))<1e-6);
        stageSamples.push({stage:unit.stage,predictedMs:expected,actualMs:unit.milliseconds,errorMs:expected-unit.milliseconds,
          absoluteErrorPercent:100*Math.abs(expected-unit.milliseconds)/unit.milliseconds,capTimeMs});
        offset+=unit.milliseconds;state=reduceSyncEstimate(state,{runId,type:'finish',stage:unit.stage,at:offset});
      }
      state=reduceSyncEstimate(state,{runId,type:'terminal',outcome:'success',at:offset});assert.equal(state.fraction,1);
      assert.equal(canonical(history),frozen,'held-out outcomes never train their own predictions');
      const predictedMs=stageSamples.reduce((sum,stage)=>sum+stage.predictedMs,0);
      samples.push({trial:sample.trial,predictedMs,actualMs:offset,operationWallMs:sample.milliseconds,unmodeledGapMs:sample.milliseconds-offset,
        errorMs:predictedMs-offset,absoluteErrorPercent:100*Math.abs(predictedMs-offset)/offset,
        capTimeMs:stageSamples.reduce((sum,stage)=>sum+stage.capTimeMs,0),stages:stageSamples});
    }
    evaluations.push({scenario:scenario.name,trainingTrials:training.map(sample=>sample.trial),heldOutTrials:heldOut.map(sample=>sample.trial),samples});
  }
  return {version:2,source:report.source??report.provenance?.source_commit??'not-recorded',mode:native?'native-local-stages':'host-operation-proxy',
    boundary:native?
      'Actual reducer/learner replay of measured native local stages. retrieval-review maps to review; save plus durable stored readback maps to save; reopened readback maps to prepare. Only these nonoverlapping local windows are modeled. Provider network, user login/setup and optional sources are absent; operation recovery/other gaps remain separately unmodeled. First three chronological trials train frozen per-stage medians; later trials are held out and never learned. Synthetic-AVD local-stage evidence does not establish physical-phone or full real Sync prediction accuracy.':
      'Actual reducer/learner using host whole-operation durations mapped to one opaque save unit solely as an arithmetic proxy. First three chronological comparable trials train a frozen median; later trials are held out and never learned. This does not calibrate actual per-stage Sync, provider/login/background behavior, native prediction accuracy or device speed.',evaluations};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [input,output,...extra]=process.argv.slice(2);
  if(!input||!output||extra.length)throw new Error('Usage: node --import tsx scripts/sync_estimate_replay.ts TRIAL_REPORT NEW_OUTPUT_JSON');
  const evaluated=evaluateSyncEstimateReplay(JSON.parse(await readFile(input,'utf8')) as Input);
  await writeFile(output,JSON.stringify(evaluated,null,2)+'\n',{flag:'wx'});
  console.info(`Held-out ${evaluated.mode} replay passed: ${evaluated.evaluations.length} scenarios; earlier-only training, per-stage error and exact capped duration recorded.`);
}

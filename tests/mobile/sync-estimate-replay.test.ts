import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSyncEstimateReplay } from '../../scripts/sync_estimate_replay.ts';

function nativeFixture() {
  return { benchmark: { flights: 101 }, provenance: { source_commit: 'synthetic' }, samples: [
    ...[0,1,2,3,4].map(trial => {
      const multiplier = trial === 3 ? 2 : trial === 4 ? 0.5 : 1;
      return { scenario: 'unchanged', trial, milliseconds: 30*multiplier+2,
        stages: { 'retrieval-review': 10*multiplier, save: 15*multiplier, readback: 5*multiplier } };
    }),
    ...[0,1,2,3,4].map(trial => ({ scenario: 'reopened', trial, milliseconds: (trial===3?20:10)+2, stages: { readback: trial===3?20:10 } })),
  ] };
}

test('native measured windows freeze earlier per-stage medians and account exact stage and total cap time', () => {
  const result = evaluateSyncEstimateReplay(nativeFixture());
  assert.equal(result.mode, 'native-local-stages');
  assert.equal(result.source, 'synthetic');
  const evaluation = result.evaluations[0]!;
  assert.deepEqual(evaluation.trainingTrials, [0,1,2]);
  assert.deepEqual(evaluation.heldOutTrials, [3,4]);
  const slow = evaluation.samples[0]!, fast = evaluation.samples[1]!;
  assert.equal(slow.predictedMs, 30); assert.equal(slow.actualMs, 60); assert.equal(slow.operationWallMs, 62);
  assert.equal(slow.errorMs, -30); assert.equal(slow.absoluteErrorPercent, 50); assert.equal(slow.capTimeMs, 30); assert.equal(slow.unmodeledGapMs, 2);
  assert.deepEqual(slow.stages.map(unit=>({stage:unit.stage,expected:unit.predictedMs,actual:unit.actualMs,capped:unit.capTimeMs})), [
    {stage:'review',expected:10,actual:20,capped:10}, {stage:'save',expected:20,actual:40,capped:20},
  ]);
  assert.equal(fast.predictedMs,30,'the earlier slow held-out run must not retrain the later prediction');
  assert.equal(fast.actualMs,15); assert.equal(fast.capTimeMs,0); assert.equal(fast.absoluteErrorPercent,100);
  const reopened = result.evaluations[1]!.samples[0]!;
  assert.equal(reopened.stages[0]!.stage,'prepare'); assert.equal(reopened.predictedMs,10); assert.equal(reopened.actualMs,20); assert.equal(reopened.capTimeMs,10);
});

test('native replay refuses inconsistent timing windows and nonchronological trial identities', () => {
  const overlap=nativeFixture(); overlap.samples[0]!.milliseconds=1;
  assert.throws(()=>evaluateSyncEstimateReplay(overlap),/exceed operation wall/);
  const unknown=nativeFixture(); unknown.samples[0]!.stages.readback=Number.NaN;
  assert.throws(()=>evaluateSyncEstimateReplay(unknown),/finite positive/);
  const reordered=nativeFixture(); reordered.samples[1]!.trial=0;
  assert.throws(()=>evaluateSyncEstimateReplay(reordered),/unique and chronological/);
});

test('existing host whole-operation proxy mode keeps frozen earlier-only prediction', () => {
  const result=evaluateSyncEstimateReplay({ source:'host',flights:101,scenarios:[{name:'first-import',samples:[10,20,30,100,5].map((milliseconds,trial)=>({trial,milliseconds}))}] });
  assert.equal(result.mode,'host-operation-proxy');
  assert.equal(result.evaluations[0]!.samples[0]!.predictedMs,20);
  assert.equal(result.evaluations[0]!.samples[0]!.capTimeMs,80);
  assert.equal(result.evaluations[0]!.samples[1]!.predictedMs,20);
});

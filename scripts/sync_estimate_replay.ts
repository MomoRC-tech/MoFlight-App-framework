/** Held-out arithmetic evaluation. Inputs are synthetic host operation windows, not actual Sync stage calibration. */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { canonical } from '../packages/flight-logbook/src/index.ts';
import { createSyncEstimate, reduceSyncEstimate, learnSyncEstimate, parseSyncEstimateHistory, snapshotSyncEstimate, syncEstimateVolume } from '../apps/platform-lab/src/mobile/sync-estimate.ts';

const [input, output, ...extra] = process.argv.slice(2);
if (!input || !output || extra.length) throw new Error('Usage: node --import tsx scripts/sync_estimate_replay.ts FIXED_TRIAL_REPORT NEW_OUTPUT_JSON');
type TrialReport = { source: string; flights: number; scenarios: {name: string; samples: {trial: number; milliseconds: number}[]}[] };
const report = JSON.parse(await readFile(input, 'utf8')) as TrialReport;
assert.ok(Number.isSafeInteger(report.flights) && report.flights > 0);
assert.ok(Array.isArray(report.scenarios) && report.scenarios.length > 0);
const scope = 'host-operation-proxy-replay-v1', volume = syncEstimateVolume(report.flights), evaluations = [];
for (const scenario of report.scenarios) {
  assert.ok(scenario.samples.length >= 5);
  let history = parseSyncEstimateHistory(null, scope);
  const training = scenario.samples.slice(0, 3), heldOut = scenario.samples.slice(3);
  for (const sample of training) {
    assert.ok(Number.isFinite(sample.milliseconds) && sample.milliseconds >= 1);
    const runId = `train-${sample.trial}`;
    let state = createSyncEstimate({runId,scope,mode:'repeat',volume,stages:['save'],history,now:0});
    state = reduceSyncEstimate(state,{runId,type:'start',stage:'save',at:0});
    state = reduceSyncEstimate(state,{runId,type:'finish',stage:'save',at:sample.milliseconds});
    state = reduceSyncEstimate(state,{runId,type:'terminal',outcome:'success',at:sample.milliseconds});
    history = learnSyncEstimate(history,state);
  }
  const frozen = canonical(history), samples = [];
  for (const sample of heldOut) {
    assert.ok(Number.isFinite(sample.milliseconds) && sample.milliseconds >= 1);
    assert.ok(training.every(earlier => earlier.trial < sample.trial), 'only earlier trials train the frozen prediction');
    const runId = `held-out-${sample.trial}`;
    let state = createSyncEstimate({runId,scope,mode:'repeat',volume,stages:['save'],history,now:0});
    const expected = state.units[0]!.expectedMs; assert.ok(expected !== null);
    state = reduceSyncEstimate(state,{runId,type:'start',stage:'save',at:0});
    const checkpoints = [0.25,0.5,0.75,1].map(fraction => sample.milliseconds*fraction);
    if (expected < sample.milliseconds) checkpoints.push(expected);
    checkpoints.sort((a,b)=>a-b);
    let previous = 0, capTimeMs = 0, last = 0;
    for (const at of checkpoints) {
      const capped = snapshotSyncEstimate(state).overrun;
      if (capped) capTimeMs += at-last;
      state = reduceSyncEstimate(state,{runId,type:'tick',at});
      const value = snapshotSyncEstimate(state).fraction;
      assert.ok(value !== null && value >= previous && value < 1, 'estimate stays monotonic and below complete');
      previous = value; last = at;
    }
    assert.ok(Math.abs(capTimeMs-Math.max(0,sample.milliseconds-expected))<1e-6);
    state = reduceSyncEstimate(state,{runId,type:'finish',stage:'save',at:sample.milliseconds});
    state = reduceSyncEstimate(state,{runId,type:'terminal',outcome:'success',at:sample.milliseconds});
    assert.equal(state.fraction,1);
    assert.equal(canonical(history),frozen,'held-out outcomes never train their own predictions');
    samples.push({trial:sample.trial,predictedMs:expected,actualMs:sample.milliseconds,
      errorMs:expected-sample.milliseconds,absoluteErrorPercent:100*Math.abs(expected-sample.milliseconds)/sample.milliseconds,capTimeMs});
  }
  evaluations.push({scenario:scenario.name,trainingTrials:training.map(sample=>sample.trial),heldOutTrials:heldOut.map(sample=>sample.trial),samples});
}
await writeFile(output,JSON.stringify({version:1,source:report.source,
  boundary:'Evaluation of the actual reducer/learner using host whole-operation durations mapped to one opaque save unit solely as an arithmetic proxy. First three chronological comparable trials train a frozen median; later trials are held out and never learned. This does not calibrate actual per-stage Sync, provider/login/background behavior, native prediction accuracy or device speed.',
  evaluations},null,2)+'\n',{flag:'wx'});
console.info(`Held-out replay passed: ${evaluations.length} scenarios; earlier-only training, prediction error and exact capped duration recorded.`);

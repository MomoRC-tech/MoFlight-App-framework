/** Synthetic host measurements through the actual service/library/journal, without a provider or model. */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { canonical } from '../packages/flight-logbook/src/index.ts';
import { nodeDriver } from '../tests/mobile/sqlite-driver.ts';
import { diagnosticJournal } from '../apps/platform-lab/src/diagnostics.ts';
import { summarizeDiagnosticTiming } from '../apps/platform-lab/src/diagnostic-timing.ts';
import { flightDiagnostics, timeFlightStage } from '../apps/platform-lab/src/vereinsflieger/flight-diagnostics.ts';
import { RealFlightLibrary } from '../apps/platform-lab/src/vereinsflieger/real-flight-library.ts';
import { RealFlightService } from '../apps/platform-lab/src/vereinsflieger/real-flight-service.ts';
import { RealFlightCommandJournal } from '../apps/platform-lab/src/vereinsflieger/real-flight-command-journal.ts';
import type { RealFlightSourceInput } from '../apps/platform-lab/src/vereinsflieger/real-flight-source.ts';

const [output, countText = '101', runsText = '3', ...extra] = process.argv.slice(2);
const count = Number(countText), runs = Number(runsText);
if (!output || extra.length || !Number.isSafeInteger(count) || count < 1 || count > 500 || !Number.isSafeInteger(runs) || runs < 2 || runs > 10) throw new Error('Usage: node --import tsx scripts/flight_loading_baseline.ts NEW_OUTPUT_DIR [1..500_FLIGHTS] [2..10_RUNS]');
await mkdir(output); // Never overwrite an earlier measurement.
const directory = await mkdtemp(join(tmpdir(), 'moflight-timing-'));
const ownerId = randomUUID(), storeId = randomUUID(), leaseId = 'synthetic-timing', at = '2026-10-22T10:00:00.000Z';
const authorize = () => ({ ownerId, storeId, leaseId, writable: true });
const hash = (text: string) => flightDiagnostics.measure('hash', async () => createHash('sha256').update(text).digest('hex'));
const path = join(directory, 'history.sqlite'), commands = join(directory, 'commands.sqlite');
const driver = (path: string) => flightDiagnostics.driver(nodeDriver(path));
let capture = 0;
function source(request: { from: string; to: string }): RealFlightSourceInput {
  const context = { accountNumber:'101', clubLabel:'Synthetic club', clubIdentity:'display-label-only' as const, verification:'observed-profile-number' as const };
  return { version:1, binding:{provider:'vereinsflieger',accountRef:'101'}, contextBefore:context, contextAfter:context,
    requestedWindow:{...request,participation:'Pilot oder Fluglehrer'}, capture:{captureId:`synthetic-timing-${++capture}`,retrievedAt:at,
      headers:['Datum','Lfz.','Start','Landung','Flugzeit','Pilot'],rows:Array.from({length:count},(_,i)=>({sourceFlightId:String(9000+i),values:['22.10.2026',i%2?'D-SYN1':'D-SYN2','10:00','10:12','12','Synthetic pilot']})),
      sourceIdentity:'unverified',timeBasis:'unknown',coverage:'complete-requested-list',exportContext:{...request,preset:'Konfiguration laden',participation:'Pilot oder Fluglehrer',accountLabel:'Synthetic account',recordCount:count,pageCount:1,columnIds:['1','2','3','4','5','6'],adapterVersion:2}} };
}
const ports = { authorize, hash, uuid:randomUUID, now:()=>at,
  retrieve:async (request:{from:string;to:string},signal:AbortSignal) => { assert.equal(signal.aborted,false); return source(request); },
  repository:async () => {
    const library = await RealFlightLibrary.open(driver(path),ownerId,storeId,hash,authorize);
    return { library, writable:true, warning:null, close:()=>library.close() };
  }, journal:()=>RealFlightCommandJournal.open(driver(commands),ownerId,storeId,authorize,hash),
};
const samples: { mode:string; milliseconds:number; counters:ReturnType<typeof flightDiagnostics.snapshot> }[] = [];
let baseline = '';
diagnosticJournal.clear();
try {
  const library = await RealFlightLibrary.create(driver(path),{singleton:1,family:'moflight-real-flight-history',schema_version:1,payload_version:1,store_id:storeId,owner_id:ownerId,created_at:at},hash,authorize);
  await library.close();
  const journal = await RealFlightCommandJournal.open(driver(commands),ownerId,storeId,authorize,hash,true); await journal.close();
  for (let i=0;i<runs;i++) {
    const service = new RealFlightService(ownerId,storeId,leaseId,ports), operation = diagnosticJournal.begin('update-flights');
    const before = flightDiagnostics.snapshot(), started = performance.now();
    try {
      const review = await service.retrieveUpdate(new Date(at));
      const result = await service.saveVerifiedReview(review,{accountNumber:'101',clubLabel:'Synthetic club'});
      assert.equal(i===0?result.counts.added:result.counts.unchanged,count);
      const stored = await timeFlightStage('return-readback',()=>service.readStored());
      assert.equal(stored.flights.length,count);
      if (!baseline) baseline=canonical(stored.flights);
      else assert.equal(canonical(stored.flights),baseline,'unchanged imports preserve exact flight IDs/facts');
      assert.equal((await service.recoverPending()).status,'none');
      samples.push({mode:i===0?'first-import':'repeat-import',milliseconds:performance.now()-started,counters:flightDiagnostics.difference(before)});
      operation.finish('success');
    } finally { service.dispose(); }
  }
  const service = new RealFlightService(ownerId,storeId,leaseId,ports), operation = diagnosticJournal.begin('read-flights');
  const started = performance.now(), before = flightDiagnostics.snapshot();
  try {
    assert.equal(canonical((await timeFlightStage('local-read',()=>service.readStored())).flights),baseline);
    samples.push({mode:'reopened-read',milliseconds:performance.now()-started,counters:flightDiagnostics.difference(before)}); operation.finish('success');
  } finally { service.dispose(); }
  const report = { version:1, source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
    dirty:!!execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(), environment:{node:process.version,platform:process.platform,arch:process.arch},
    scope:'synthetic host real SQLite; same process, new connections; no native driver, provider, sign-in, OS cold-cache or device speed claim', flights:count,
    assertions:{exactFlightIdsAndFacts:true,noPendingCommands:true,offlineReopen:true}, samples, timing:summarizeDiagnosticTiming(JSON.parse(diagnosticJournal.export())) };
  await writeFile(join(output,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  for (const sample of samples) console.info(`${sample.mode}: ${Math.round(sample.milliseconds)} ms`);
} finally {
  diagnosticJournal.clear();
  assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
  assert.ok(basename(directory).startsWith('moflight-timing-'));
  await rm(directory,{recursive:true,force:true}); // Only this freshly generated mkdtemp directory.
}

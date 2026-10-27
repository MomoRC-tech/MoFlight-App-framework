import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonical } from '../../packages/flight-logbook/src/index.ts';
import type { Bind, Driver, Hash } from '../../packages/local-data/src/index.ts';
import { nodeDriver } from './sqlite-driver.ts';
import { REAL_HISTORY_BACKUP_LIMIT, REAL_HISTORY_COMMAND_LIMIT, type RealHistoryManifest } from '../../apps/platform-lab/src/vereinsflieger/real-history-contract.ts';
import { RealFlightLibrary, RealFlightDetailSource, IndeterminateRealFlightCommit, type RealFlightPermit } from '../../apps/platform-lab/src/vereinsflieger/real-flight-library.ts';
import type { RealFlightSourceInput } from '../../apps/platform-lab/src/vereinsflieger/real-flight-source.ts';
import { deriveRealFlightCommand, validateRealFlightGraph, type RealFlightGraph, type RealFlightRecord } from '../../apps/platform-lab/src/vereinsflieger/real-flight-library-model.ts';
import { DiagnosticJournal } from '../../apps/platform-lab/src/diagnostics.ts';

const hash: Hash = async value => createHash('sha256').update(value, 'utf8').digest('hex');
const at = '2026-10-20T10:00:00.000Z';
const ownerA = '11111111-1111-4111-8111-111111111111';
const storeA = '22222222-2222-4222-8222-222222222222';
const ownerB = '33333333-3333-4333-8333-333333333333';
const storeB = '44444444-4444-4444-8444-444444444444';
const commandId = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const headers = ['Datum','Lfz.','Start','Landung','Flugzeit','Pilot'];
const context = { accountNumber: '10101', clubLabel: 'Example Gliding Club', clubIdentity: 'display-label-only' as const, verification: 'observed-profile-number' as const };

function source(captureId: string, rows: Array<{ sourceFlightId: string | null; values: string[] }>, accountRef = '10101'): RealFlightSourceInput {
  return {
    version: 1,
    binding: { provider: 'vereinsflieger', accountRef },
    contextBefore: { ...context, accountNumber: accountRef },
    contextAfter: { ...context, accountNumber: accountRef },
    requestedWindow: { from: '2026-10-01', to: '2026-10-31', participation: 'Pilot oder Fluglehrer' },
    capture: {
      captureId, retrievedAt: at, headers: [...headers], rows: rows.map(row => ({ sourceFlightId: row.sourceFlightId, values: [...row.values] })),
      sourceIdentity: 'unverified', coverage: 'complete-requested-list', timeBasis: 'unknown',
      exportContext: { from: '2026-10-01', to: '2026-10-31', preset: 'Konfiguration laden', participation: 'Pilot oder Fluglehrer',
        accountLabel: 'Example account', recordCount: rows.length, pageCount: 1, columnIds: ['1','2','3','4','5','6'], adapterVersion: 2 },
    },
  };
}
const row = (reference: string | null, duration = '12', date = '20.10.2026') => ({
  sourceFlightId: reference, values: [date, 'D-TEST', '10:00', '10:12', duration, 'Example Pilot'],
});
function manifest(ownerId: string, storeId: string): RealHistoryManifest {
  return { singleton: 1, family: 'moflight-real-flight-history', schema_version: 1, payload_version: 1,
    store_id: storeId, owner_id: ownerId, created_at: at };
}

async function setup(t: TestContext, ownerId = ownerA, storeId = storeA, fault?: (stage: string) => Promise<void>) {
  const db: Driver = nodeDriver(':memory:');
  let permit: RealFlightPermit = { ownerId, storeId, leaseId: 'lease-a', writable: true };
  const authorize = () => permit;
  const library = await RealFlightLibrary.create(db, manifest(ownerId, storeId), hash, authorize, fault);
  t.after(async () => { await library.close(); });
  return { library, db, authorize, setPermit(value: RealFlightPermit) { permit = value; } };
}

async function bind(library: RealFlightLibrary, input = source('capture-bind', [row('101')]), id = 1) {
  return library.bindAccount({ kind: 'bind', commandId: commandId(id), baseGeneration: 0, source: input, at });
}
async function save(library: RealFlightLibrary, input: RealFlightSourceInput, id: number, atTime = at) {
  const plan = await library.prepareImport(input);
  const result = await library.saveUnassigned({ kind: 'import-unassigned', commandId: commandId(id), baseGeneration: plan.baseGeneration,
    bindingId: plan.bindingId, source: input, planToken: plan.planToken, at: atTime });
  return { plan, result };
}

test('snapshot bytes match stored graph and nested caller mutations cannot affect subsequent reads',async t=>{
  const {library,db}=await setup(t);await bind(library);await save(library,source('snapshot-detached',[row('101')]),2);
  const graph=await library.snapshot();
  const stored={manifest:await db.first('SELECT * FROM real_history_manifest'),generation:2,
    receipts:await db.all('SELECT * FROM real_history_receipts ORDER BY generation'),records:await db.all('SELECT * FROM real_history_records ORDER BY seq')};
  const expected=canonical(stored);assert.equal(canonical(graph),expected);
  graph.manifest.owner_id=ownerB;graph.receipts[0]!.request_json='{}';graph.records[0]!.payload='{}';graph.records.reverse();
  assert.equal(canonical(await library.snapshot()),expected);
  assert.equal((await library.readStored()).flights.length,1);
});

test('command derivation owns its source before asynchronous hashing and preserves exact original evidence',async t=>{
  const {library}=await setup(t),graph=await library.snapshot(),input={version:1 as const,kind:'bind' as const,ownerId:ownerA,storeId:storeA,
    commandId:commandId(900),baseGeneration:0,at,source:source('detached-command',[row('101')])};
  const expected=await deriveRealFlightCommand(graph,input,hash);let calls=0;
  const result=await deriveRealFlightCommand(graph,input,async text=>{
    if(++calls===1){input.source.capture.rows[0]!.values[1]='D-MUTATED';input.source.capture.headers[0]='Changed';input.source.contextAfter.accountNumber='20202';}
    return hash(text);
  });
  assert.ok(calls>0);assert.equal(canonical(result),canonical(expected));
  assert.match(result.receipt.request_json,/D-TEST/);assert.doesNotMatch(result.receipt.request_json,/D-MUTATED/);
});

test('detached command source still enforces unsupported fields, row shape and whole-command byte limits',async t=>{
  const {library}=await setup(t),graph=await library.snapshot();
  for(const kind of ['extra-field','invalid-row','oversized'] as const){
    const input=source(`invalid-${kind}`,[row('101')]);
    if(kind==='extra-field')Object.assign(input,{unexpected:true});
    if(kind==='invalid-row')(input.capture.rows[0]!.values as unknown[])[0]=17;
    if(kind==='oversized')input.capture.rows[0]!.values[0]='ü'.repeat(REAL_HISTORY_COMMAND_LIMIT);
    let hashes=0;
    await assert.rejects(deriveRealFlightCommand(graph,{version:1,kind:'bind',ownerId:ownerA,storeId:storeA,commandId:commandId(901),baseGeneration:0,at,source:input},
      async text=>{hashes++;return hash(text);}),/source input keys|raw capture value|size limit/);
    assert.equal(hashes,0,'malformed or oversized source is rejected before any evidence hash');
  }
});

test('full history replay validates each receipt capture once without losing source or plan checks',async t=>{
  const {library}=await setup(t);
  await bind(library);
  const input=source('capture-replay-once',[row('101')]);await save(library,input,2);
  const graph=await library.snapshot();
  const captures=new Set(graph.records.filter(record=>record.kind==='capture').map(record=>
    (JSON.parse(record.payload) as {source:{capture:{rawCaptureJson:string}}}).source.capture.rawCaptureJson));
  let captureChecks=0;
  await validateRealFlightGraph(graph,async value=>{if(captures.has(value))captureChecks++;return hash(value);});
  assert.equal(captureChecks,graph.receipts.length,'each detached receipt source is validated once, including its import plan');
  const forged=structuredClone(graph),command=JSON.parse(forged.receipts[1]!.request_json);
  command.source.capture.exportContext.recordCount=2;
  forged.receipts[1]!.request_json=canonical(command);forged.receipts[1]!.request_sha256=await hash(forged.receipts[1]!.request_json);
  await assert.rejects(validateRealFlightGraph(forged,hash),/source|coverage|record count|export shape/i);
  const changedPlan=structuredClone(graph),changed=JSON.parse(changedPlan.receipts[1]!.request_json);
  changed.planToken='0'.repeat(64);changedPlan.receipts[1]!.request_json=canonical(changed);
  changedPlan.receipts[1]!.request_sha256=await hash(changedPlan.receipts[1]!.request_json);
  await assert.rejects(validateRealFlightGraph(changedPlan,hash),/plan changed/);
});

test('library phase hooks measure actual replay, derivation, writes and fresh durable readback',async t=>{
 const f=await setup(t),journal=new DiagnosticJournal(),op=journal.begin('update-flights');
 const command={version:1 as const,kind:'bind' as const,ownerId:ownerA,storeId:storeA,commandId:commandId(91),baseGeneration:0,at,source:source('timed-binding',[row('101')])};
 await f.library.commit(command,op.span);
 const entry=journal.snapshot()[0]!,names=entry.stages.map(stage=>stage.name);
 for(const name of ['graph-read','graph-canonicalization','graph-validation','import-derivation','graph-writes','save-readback'])assert.ok(names.includes(name as typeof names[number]),name);
 const readback=entry.checkpoints.find(point=>point.name==='save-readback'&&point.state==='start')!;
 const children=entry.checkpoints.filter(point=>point.parentSpanId===readback.spanId);
 assert.ok(children.some(point=>point.name==='graph-read'));
 assert.ok(children.some(point=>point.name==='graph-canonicalization'));
 assert.ok(!children.some(point=>point.name==='graph-validation'),'Exact validated committed bytes skip replay but still reread');
 const before=await f.library.snapshot();
 const reviewed=await f.library.prepareReview(source('timed-review',[row('101')]),op.span);
 assert.deepEqual(reviewed.graph,before);assert.ok(reviewed.plan);
 assert.ok(!journal.export().includes('timed-binding'));assert.ok(!journal.export().includes(ownerA));
 const failed=journal.begin('update-flights');
 await assert.rejects(f.library.commit({...command,commandId:commandId(92),baseGeneration:99},failed.span));
 assert.ok(journal.snapshot().at(-1)!.stages.some(stage=>stage.name==='import-derivation'&&stage.failures===1));
 assert.ok(!journal.snapshot().at(-1)!.stages.some(stage=>stage.name==='graph-writes'||stage.name==='save-readback'));
 assert.deepEqual(await f.library.snapshot(),before);op.finish('success');failed.finish('failed');
});

test('save reuses exact pre-write evidence but validates new bytes and idempotent retries still reread', async t => {
  const f = await setup(t);
  await bind(f.library);
  const input = source('prewrite-reuse', [row('101')]);
  const plan = await f.library.prepareImport(input);
  const command = {version:1 as const,kind:'import-unassigned' as const,ownerId:ownerA,storeId:storeA,
    commandId:commandId(2),baseGeneration:plan.baseGeneration,bindingId:plan.bindingId,source:input,planToken:plan.planToken,at};
  const journal = new DiagnosticJournal(), first = journal.begin('update-flights');
  const saved = await f.library.commit(command, first.span); first.finish('success');
  assert.equal(journal.snapshot()[0]!.stages.find(stage => stage.name === 'graph-validation')?.calls, 1,
    'only the changed post-write graph needs full replay');
  const before = await f.library.snapshot(), retry = journal.begin('update-flights');
  assert.deepEqual(await f.library.commit(command, retry.span), saved); retry.finish('success');
  const stages = journal.snapshot().at(-1)!.stages;
  assert.ok(stages.some(stage => stage.name === 'graph-read'));
  assert.ok(!stages.some(stage => stage.name === 'graph-validation' || stage.name === 'graph-writes'));
  assert.deepEqual(await f.library.snapshot(), before);
});

test('save replays a valid graph changed by another handle before writing', async t => {
  const f = await setup(t);
  await bind(f.library);
  const writer = await RealFlightLibrary.open(f.db, ownerA, storeA, hash, f.authorize);
  await save(writer, source('external-write', [row('101')]), 2);
  const input = source('after-external-write', [row('101','14')]);
  const plan = await writer.prepareImport(input);
  const journal = new DiagnosticJournal(), op = journal.begin('update-flights');
  await f.library.commit({version:1,kind:'import-unassigned',ownerId:ownerA,storeId:storeA,
    commandId:commandId(3),baseGeneration:plan.baseGeneration,bindingId:plan.bindingId,
    source:input,planToken:plan.planToken,at},op.span); op.finish('success');
  assert.equal(journal.snapshot()[0]!.stages.find(stage => stage.name === 'graph-validation')?.calls,2,
    'both externally changed pre-write bytes and our new post-write bytes require replay');
  assert.equal((await f.library.snapshot()).generation,3);
  assert.equal((await f.library.list())[0]!.facts.assessment.durations.flight.minutes,14);
});

test('committed readback reuses validated bytes while unchanged captures still append receipts and evidence', async t => {
  let calls = 0, beforeReadback = -1;
  const counted: Hash = async value => { calls++; return hash(value); };
  const db = nodeDriver(':memory:');
  const library = await RealFlightLibrary.create(db, manifest(ownerA, storeA), counted,
    () => ({ ownerId: ownerA, storeId: storeA, leaseId: 'commit-cache', writable: true }), async stage => {
      if (stage === 'before-readback') beforeReadback = calls;
    });
  t.after(() => library.close());
  await bind(library);
  assert.equal(calls, beforeReadback, 'binding readback uses the graph validated inside the committed transaction');
  for (const [id, captureId, duration, expected] of [
    [2, 'commit-first', '12', 'added'], [3, 'commit-unchanged', '12', 'unchanged'], [4, 'commit-changed', '14', 'changed'],
  ] as const) {
    const { result } = await save(library, source(captureId, [row('101', duration)]), id);
    assert.equal(result.counts[expected], 1);
    assert.equal(calls, beforeReadback, 'fresh receipt readback does not replay an exact validated graph');
    const graph = await library.snapshot();
    assert.equal(graph.generation, id);
    assert.equal(graph.receipts.length, id);
    assert.ok(graph.records.some(record => record.kind === 'capture' && record.id === captureId));
    assert.equal((await library.recoverReceipt(commandId(id))).status, 'found');
  }
  const detail = await library.detail((await library.list())[0]!.flightId);
  assert.equal(detail?.factHistory.length, 2);
  assert.equal(detail?.facts.assessment.durations.flight.minutes, 14);
});

test('driver failure after transaction work rolls back without publishing its validated candidate', async t => {
  const db = nodeDriver(':memory:'), transaction = db.transaction.bind(db);
  let failCommit = false, calls = 0;
  db.transaction = work => transaction(async tx => {
    const result = await work(tx);
    if (failCommit) { failCommit = false; throw new Error('injected commit failure'); }
    return result;
  });
  const counted: Hash = async value => { calls++; return hash(value); };
  const library = await RealFlightLibrary.create(db, manifest(ownerA, storeA), counted,
    () => ({ ownerId: ownerA, storeId: storeA, leaseId: 'rollback-cache', writable: true }));
  t.after(() => library.close());
  await bind(library); await save(library, source('rollback-existing', [row('101')]), 2);
  const before = await library.snapshot(), input = source('rollback-candidate', [row('101', '14')]);
  const plan = await library.prepareImport(input);
  const command = { kind: 'import-unassigned' as const, commandId: commandId(3), baseGeneration: plan.baseGeneration,
    bindingId: plan.bindingId, source: input, planToken: plan.planToken, at };
  failCommit = true;
  await assert.rejects(library.saveUnassigned(command), IndeterminateRealFlightCommit);
  const afterFailure = calls;
  assert.deepEqual(await library.snapshot(), before);
  assert.equal(calls, afterFailure, 'rollback preserves trust only in the previously committed exact graph');
  assert.equal((await library.recoverReceipt(command.commandId)).status, 'not-found');
  assert.equal((await library.saveUnassigned(command)).counts.changed, 1);
});

test('review prepares binding state and plan from one fresh protected snapshot', async t => {
  const { library, db, setPermit } = await setup(t);
  const transaction = db.transaction.bind(db); let reads = 0;
  db.transaction = work => { reads++; return transaction(work); };
  const input = source('review-single-read', [row('101')]);
  const unbound = await library.prepareReview(input);
  assert.equal(unbound.plan, null); assert.equal(unbound.graph.generation, 0); assert.equal(reads, 1);
  await assert.rejects(library.prepareImport(input), /Bind the observed provider account/);
  await bind(library); reads = 0;
  const reviewed = await library.prepareReview(input);
  assert.equal(reads, 1); assert.equal(reviewed.graph.generation, reviewed.plan?.baseGeneration);
  assert.equal(reviewed.plan?.counts.added, 1);
  const recordCount = reviewed.graph.records.length;
  reviewed.graph.records.length = 0;
  assert.equal((await library.snapshot()).records.length, recordCount, 'returned graph cannot change storage or cached validation');
  await assert.rejects(library.prepareReview(source('review-foreign', [row('101')], '20202')), /expected provider account|differs from the immutable/);
  setPermit({ ownerId: ownerA, storeId: storeA, leaseId: 'foreign-review-lease', writable: true });
  await assert.rejects(library.prepareReview(input), /lease/);
});

test('same-handle exact graph replay reuse preserves changed-graph, fresh-handle and lease validation',async t=>{
  let calls=0;
  const counted:Hash=async value=>{calls++;return hash(value);};
  const db=nodeDriver(':memory:');
  let permit:RealFlightPermit={ownerId:ownerA,storeId:storeA,leaseId:'replay-lease',writable:true};
  const authorize=()=>permit;
  const library=await RealFlightLibrary.create(db,manifest(ownerA,storeA),counted,authorize);
  t.after(()=>db.close());
  await bind(library);await save(library,source('replay-first',[row('101')]),2);
  const first=await library.snapshot(),before=calls;
  first.records.length=0;
  assert.equal((await library.snapshot()).generation,2);assert.equal(calls,before,'unchanged exact graph avoids redundant hashing');
  const writer=await RealFlightLibrary.open(db,ownerA,storeA,counted,authorize);
  await save(writer,source('replay-new',[row('101'),row('102')]),3);
  const afterWrite=calls;assert.equal((await library.readStored()).flights.length,2);
  assert.ok(calls>afterWrite,'a later graph must replay even on the same handle');
  const beforeOpen=calls;
  const reopened=await RealFlightLibrary.open(db,ownerA,storeA,counted,authorize);
  assert.ok(calls>beforeOpen,'new handles cannot inherit replay trust');
  const afterOpen=calls;assert.equal((await reopened.snapshot()).generation,3);assert.equal(calls,afterOpen);
  permit={...permit,leaseId:'foreign-lease'};
  await assert.rejects(reopened.snapshot(),/lease/);
});

test('same-generation forged records and failed replay cannot populate exact-graph trust',async t=>{
  const db=nodeDriver(':memory:');let corrupt=false,corruptReadback=false,calls=0;
  const transaction=db.transaction.bind(db);
  db.transaction=work=>transaction(tx=>work({...tx,all:async<T>(sql:string,...params:Bind[])=>{
    const rows=await tx.all<T>(sql,...params);
    if(corrupt&&sql==='SELECT * FROM real_history_records ORDER BY seq') {
      return (rows as RealFlightRecord[]).map(row=>row.kind==='facts'?{...row,payload:row.payload.replaceAll('D-TEST','D-FORGED')}:row) as T[];
    }
    return rows;
  }}));
  const counted:Hash=async value=>{calls++;return hash(value);};
  const library=await RealFlightLibrary.create(db,manifest(ownerA,storeA),counted,
    ()=>({ownerId:ownerA,storeId:storeA,leaseId:'same-generation',writable:true}), async stage=>{
      if(stage==='before-readback'&&corruptReadback)corrupt=true;
    });
  t.after(()=>library.close());
  await bind(library);await save(library,source('cached-records',[row('101')]),2);
  await library.snapshot();
  const input=source('reject-prewrite-corruption',[row('101','14')]),plan=await library.prepareImport(input);
  const command={kind:'import-unassigned' as const,commandId:commandId(3),baseGeneration:plan.baseGeneration,
    bindingId:plan.bindingId,source:input,planToken:plan.planToken,at};
  corrupt=true;
  await assert.rejects(library.saveUnassigned(command),/record graph/);
  assert.equal((await db.first<{count:number}>('SELECT COUNT(*) AS count FROM real_history_receipts'))!.count,2,
    'same-generation corruption is rejected before a receipt is appended');
  for(let attempt=0;attempt<2;attempt++){
    const before=calls;await assert.rejects(library.readStored(),/record graph/);
    assert.ok(calls>before,'a rejected graph is never memoized');
  }
  corrupt=false;assert.equal((await library.readStored()).flights[0]!.sourceFlightRef,'101');
  corruptReadback=true;
  await assert.rejects(save(library,source('corrupt-committed-readback',[row('101','14')]),3),IndeterminateRealFlightCommit);
  corrupt=false;corruptReadback=false;
  assert.equal((await library.recoverReceipt(commandId(3))).status,'found','fresh readback rejects altered bytes without losing the durable receipt');
});
async function reEnvelope(graph: RealFlightGraph, change: (graph: RealFlightGraph & { version: number }) => void) {
  const body = { version: 1, ...structuredClone(graph) };
  change(body);
  const payload = canonical(body);
  return canonical({ format: 'moflight-real-flight-history-backup', version: 1, payload, checksum: await hash(payload) });
}

async function assertRestoreRejected(text: string, ownerId: string, storeId: string, leaseId: string, expected: RegExp,
  fault?: (stage: string) => Promise<void>) {
  const db = nodeDriver(':memory:');
  try {
    await assert.rejects(RealFlightLibrary.restoreValidated(db, text, ownerId, storeId, hash,
      () => ({ ownerId, storeId, leaseId, writable: true }), fault), expected);
  } finally { await db.close(); }
}

test('first-use account binding and unassigned flights preserve source evidence and round-trip to a fresh same-owner candidate', async t => {
  const { library } = await setup(t);
  const initial = source('capture-first', [row('101'), row('102', '', '21.10.2026')]);
  const bindingResult = await bind(library, initial, 1);
  assert.equal(bindingResult.kind, 'bind');
  const plan = await library.prepareImport(initial);
  assert.equal(plan.counts.added, 2); assert.equal(plan.counts.pending, 0); assert.equal(plan.baseGeneration, 1);
  const saved = await library.saveUnassigned({ kind: 'import-unassigned', commandId: commandId(2), baseGeneration: plan.baseGeneration,
    bindingId: plan.bindingId, source: initial, planToken: plan.planToken, at });
  assert.equal(saved.counts.added, 2);
  const list = await library.list(); assert.equal(list.length, 2); assert.ok(list.every(item => item.unassigned));
  assert.equal(list[0]!.facts.assessment.semantics.crewCredit, 'unresolved');
  const graph = await library.snapshot();
  const capture = JSON.parse(graph.records.find(record => record.kind === 'capture' && record.id === 'capture-first')!.payload);
  assert.equal(capture.source.capture.rawCaptureJson, canonical(initial.capture));
  assert.equal(capture.source.capture.rawCaptureSha256, await hash(capture.source.capture.rawCaptureJson));
  assert.ok(graph.records.every(record => !['book','choice','acknowledgement','paper','training'].includes(record.kind)));
  const backup = await library.exportBackup(); assert.ok(new TextEncoder().encode(backup).length <= REAL_HISTORY_BACKUP_LIMIT);
  const restoredDb = nodeDriver(':memory:');
  const restored = await RealFlightLibrary.restoreValidated(restoredDb, backup, ownerA, storeA, hash,
    () => ({ ownerId: ownerA, storeId: storeA, leaseId: 'restore-lease', writable: true }));
  t.after(async () => { await restored.close(); });
  assert.deepEqual(await restored.snapshot(), graph);
  assert.equal(await restored.exportBackup(), backup);
});

test('restore retries an initialized generation-zero candidate after rollback and exact completed replay is read-only', async t => {
  const { library } = await setup(t);
  await bind(library, source('capture-bind-restore-retry', [row('111')]), 101);
  await save(library, source('capture-flights-restore-retry', [row('111'), row('112')]), 102);
  const expected = await library.snapshot();
  const backup = await library.exportBackup();
  const db = nodeDriver(':memory:');
  const authorize = () => ({ ownerId: ownerA, storeId: storeA, leaseId: 'restore-retry-lease', writable: true });

  await assert.rejects(RealFlightLibrary.restoreIntoEmptyValidated(db, backup, ownerA, storeA, hash, authorize, async stage => {
    if (stage === 'restore-record') throw new Error('injected restore transaction rollback');
  }), /injected restore transaction rollback/);
  assert.equal((await db.first<{ count: number }>('SELECT COUNT(*) AS count FROM real_history_manifest'))?.count, 1,
    'the initialized candidate manifest remains available for exact recovery');
  assert.equal((await db.first<{ count: number }>('SELECT COUNT(*) AS count FROM real_history_receipts'))?.count, 0,
    'rolled-back restore receipts are not partially published');
  assert.equal((await db.first<{ count: number }>('SELECT COUNT(*) AS count FROM real_history_records'))?.count, 0,
    'rolled-back restore records are not partially published');

  const restored = await RealFlightLibrary.restoreIntoEmptyValidated(db, backup, ownerA, storeA, hash, authorize);
  assert.deepEqual(await restored.snapshot(), expected);
  await save(library, source('capture-later-after-restore-backup', [row('113')]), 103);
  const differentBackup = await library.exportBackup();
  await assert.rejects(RealFlightLibrary.restoreIntoEmptyValidated(db, differentBackup, ownerA, storeA, hash, authorize),
    /candidate is not empty/);
  assert.deepEqual(await restored.snapshot(), expected, 'a different nonempty candidate is preserved');
  const replay = await RealFlightLibrary.restoreIntoEmptyValidated(db, backup, ownerA, storeA, hash, authorize);
  assert.deepEqual(await replay.snapshot(), expected, 'the exact matching complete graph is an idempotent no-write success');
  t.after(async () => { await restored.close(); });
});

test('exact retry resolves before stale-generation rejection and altered command reuse is rejected', async t => {
  const { library } = await setup(t); await bind(library, source('capture-bind-retry', [row('201')]), 10);
  const input = source('capture-idempotent', [row('201')]); const plan = await library.prepareImport(input);
  const command = { kind: 'import-unassigned' as const, commandId: commandId(11), baseGeneration: plan.baseGeneration,
    bindingId: plan.bindingId, source: input, planToken: plan.planToken, at };
  const result = await library.saveUnassigned(command); const after = await library.snapshot();
  await save(library, source('capture-later', [row('202')]), 12);
  const identical = await save(library, source('capture-identical-repeat', [row('201')]), 13);
  assert.equal(identical.plan.counts.unchanged, 1);
  assert.deepEqual(await library.saveUnassigned(command), result);
  assert.equal((await library.snapshot()).generation, after.generation + 2);
  await assert.rejects(library.saveUnassigned({ ...command, at: '2026-10-20T11:00:00.000Z' }), /idempotency ID reused/);
  const records = (await library.snapshot()).records;
  assert.equal(records.filter(record => record.kind === 'flight').length, 2);
  assert.equal(records.filter(record => record.kind === 'facts').length, 2);
});

test('corrections append facts revisions while conflicting same-reference variants preserve usable facts as pending', async t => {
  const { library } = await setup(t); await bind(library, source('capture-bind-correction', [row('301')]), 20);
  await save(library, source('capture-original', [row('301','12')]), 21);
  const conflicting = source('capture-conflict', [row('301','14'), row('301','16')]);
  const conflictPlan = await library.prepareImport(conflicting);
  assert.equal(conflictPlan.counts.pending, 1); assert.equal(conflictPlan.counts.changed, 0);
  await library.saveUnassigned({ kind: 'import-unassigned', commandId: commandId(22), baseGeneration: conflictPlan.baseGeneration,
    bindingId: conflictPlan.bindingId, source: conflicting, planToken: conflictPlan.planToken, at });
  let detail = await library.detail((await library.list())[0]!.flightId);
  assert.ok(detail); assert.equal(detail.factHistory.length, 1); assert.equal(detail.facts.assessment.durations.flight.minutes, 12);
  assert.equal(detail.pending.length, 1); assert.equal(detail.pending[0]!.issue.reason, 'conflicting-source-reference');
  await save(library, source('capture-correction', [row('301','14')]), 23);
  detail = await library.detail((await library.list())[0]!.flightId);
  assert.ok(detail); assert.equal(detail.factHistory.length, 2); assert.equal(detail.factHistory[1]!.predecessor, 1);
  assert.equal(detail.facts.assessment.durations.flight.minutes, 14);
  assert.equal((await library.snapshot()).records.filter(record => record.kind === 'pending').length, 1);
});

test('empty complete windows persist capture and coverage without deleting saved flights; missing references remain pending', async t => {
  const { library } = await setup(t); await bind(library, source('capture-bind-empty', [row('401')]), 30);
  await save(library, source('capture-before-empty', [row('401')]), 31);
  const empty = source('capture-empty', []), emptyPlan = await library.prepareImport(empty);
  assert.deepEqual(emptyPlan.counts, { added: 0, changed: 0, unchanged: 0, pending: 0 });
  assert.deepEqual(emptyPlan.entries, []);
  await library.saveUnassigned({ kind: 'import-unassigned', commandId: commandId(32), baseGeneration: emptyPlan.baseGeneration,
    bindingId: emptyPlan.bindingId, source: empty, planToken: emptyPlan.planToken, at });
  assert.equal((await library.list()).length, 1);
  let graph = await library.snapshot(); assert.ok(graph.records.some(record => record.kind === 'coverage' && record.id === 'capture-empty'));
  assert.equal(graph.records.filter(record => record.kind === 'flight').length, 1);
  const missing = source('capture-missing-ref', [row(null)]), missingPlan = await library.prepareImport(missing);
  assert.equal(missingPlan.counts.pending, 1);
  await library.saveUnassigned({ kind: 'import-unassigned', commandId: commandId(33), baseGeneration: missingPlan.baseGeneration,
    bindingId: missingPlan.bindingId, source: missing, planToken: missingPlan.planToken, at });
  graph = await library.snapshot(); assert.equal(graph.records.filter(record => record.kind === 'flight').length, 1);
  assert.equal(graph.records.filter(record => record.kind === 'pending').length, 1);
  assert.equal((await library.list()).length, 1);
});

test('foreign owner/account, stale plans and expired leases are rejected before they can alter data', async t => {
  const a = await setup(t, ownerA, storeA); await bind(a.library, source('capture-bind-isolation', [row('501')]), 40);
  const b = await setup(t, ownerB, storeB);
  const before = await a.library.snapshot();
  await assert.rejects(a.library.bindAccount({ kind: 'bind', commandId: commandId(44), baseGeneration: before.generation,
    source: source('capture-rebind-foreign', [row('502')], '20202'), at }), /already bound to an account/);
  assert.deepEqual(await a.library.snapshot(), before);
  await assert.rejects(RealFlightLibrary.open(nodeDriver(':memory:'), ownerA, storeA, hash,
    () => ({ ownerId: ownerB, storeId: storeB, leaseId: 'foreign', writable: true })), /Unauthorized/);
  await assert.rejects(a.library.prepareImport(source('capture-foreign-account', [row('501')], '20202')), /expected provider account|differs from the immutable/);
  const changedClub = source('capture-changed-club', [row('501')]);
  changedClub.contextBefore.clubLabel = changedClub.contextAfter.clubLabel = 'Another observed club';
  await assert.rejects(a.library.prepareImport(changedClub), /Source club context changed/);
  assert.deepEqual(await a.library.snapshot(), before);
  const staleSource = source('capture-stale-plan', [row('502')]), stalePlan = await a.library.prepareImport(staleSource);
  await save(a.library, source('capture-advance', []), 41);
  await assert.rejects(a.library.saveUnassigned({ kind: 'import-unassigned', commandId: commandId(42), baseGeneration: stalePlan.baseGeneration,
    bindingId: stalePlan.bindingId, source: staleSource, planToken: stalePlan.planToken, at }), /Stale real flight history generation/);
  a.setPermit({ ownerId: ownerA, storeId: storeA, leaseId: 'lease-b', writable: true });
  await assert.rejects(a.library.snapshot(), /Expired or foreign real flight history lease/);
  assert.equal((await b.library.list()).length, 0);
  a.setPermit({ ownerId: ownerA, storeId: storeA, leaseId: 'lease-a', writable: true });
  const after = await a.library.snapshot(); assert.equal(after.generation, before.generation + 1);
  assert.equal(after.records.filter(record => record.kind === 'flight').length, 0);
});

test('file access gate runs before candidate creation and authorization loss after commit requires receipt recovery', async t => {
  const unopened = nodeDriver(':memory:');
  await assert.rejects(RealFlightLibrary.create(unopened, manifest(ownerA, storeA), hash,
    () => ({ ownerId: ownerA, storeId: storeA, leaseId: 'blocked-create', writable: true }), async () => {}, async write => {
      assert.equal(write, true); throw new Error('candidate access denied');
    }), /candidate access denied/);
  assert.equal(await unopened.first("SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'"), null);
  await unopened.close();

  const db = nodeDriver(':memory:');
  let permit: RealFlightPermit = { ownerId: ownerA, storeId: storeA, leaseId: 'post-commit-lease', writable: true };
  let revokeAfterCommit = false;
  const library = await RealFlightLibrary.create(db, manifest(ownerA, storeA), hash, () => permit, async stage => {
    if (stage === 'after-commit' && revokeAfterCommit) permit = { ...permit, writable: false };
  });
  t.after(async () => { await library.close(); });
  await bind(library, source('capture-bind-post-commit', [row('551')]), 45);
  const input = source('capture-post-commit', [row('551')]);
  const plan = await library.prepareImport(input);
  const command = { kind: 'import-unassigned' as const, commandId: commandId(46), baseGeneration: plan.baseGeneration,
    bindingId: plan.bindingId, source: input, planToken: plan.planToken, at };
  revokeAfterCommit = true;
  await assert.rejects(library.saveUnassigned(command), IndeterminateRealFlightCommit);
  const recovered = await library.recoverReceipt(command.commandId);
  assert.equal(recovered.status, 'found');
  if (recovered.status === 'found') assert.equal(recovered.receipt.generation, plan.baseGeneration + 1);
});

test('transaction faults roll back, post-commit uncertainty resolves the original receipt', async t => {
  let failAt: string | null = null;
  const { library } = await setup(t, ownerA, storeA, async stage => { if (stage === failAt) { failAt = null; throw new Error(`fault:${stage}`); } });
  await bind(library, source('capture-bind-faults', [row('601')]), 50);
  const input = source('capture-rollback', [row('601')]), plan = await library.prepareImport(input);
  const command = { kind: 'import-unassigned' as const, commandId: commandId(51), baseGeneration: plan.baseGeneration,
    bindingId: plan.bindingId, source: input, planToken: plan.planToken, at };
  failAt = 'after-facts'; await assert.rejects(library.saveUnassigned(command), /fault:after-facts/);
  assert.equal((await library.snapshot()).generation, plan.baseGeneration);
  failAt = 'after-commit'; await assert.rejects(library.saveUnassigned(command), IndeterminateRealFlightCommit);
  const recovered = await library.recoverReceipt(command.commandId);
  assert.equal(recovered.status, 'found');
  if (recovered.status === 'found') assert.equal(recovered.result.commandId, command.commandId);
  assert.equal((await library.saveUnassigned(command)).generation, plan.baseGeneration + 1);
});

test('backup replay rejects semantic receipt/source corruption, unsupported versions and foreign-owner restores', async t => {
  const { library } = await setup(t); await bind(library, source('capture-bind-corrupt', [row('701')]), 60);
  await save(library, source('capture-corrupt', [row('701')]), 61);
  const graph = await library.snapshot(), backup = await library.exportBackup();
  await assertRestoreRejected(await reEnvelope(graph, candidate => {
    candidate.receipts[1]!.result_json = canonical({ commandId: 'changed' });
  }), ownerA, storeA, 'restore-a', /receipt semantics/);
  await assertRestoreRejected(await reEnvelope(graph, candidate => {
    const capture = candidate.records.find(record => record.kind === 'capture' && record.id === 'capture-corrupt')!;
    const value = JSON.parse(capture.payload); value.source.capture.rawCaptureSha256 = 'f'.repeat(64); capture.payload = canonical(value);
  }), ownerA, storeA, 'restore-b', /record graph/);
  const unsupported = await reEnvelope(graph, candidate => { candidate.version = 2; });
  await assertRestoreRejected(unsupported, ownerA, storeA, 'restore-c', /backup version/);
  await assertRestoreRejected(backup, ownerB, storeB, 'restore-d', /Foreign real flight history backup/);
  await assertRestoreRejected(backup, ownerA, storeA, 'restore-e', /injected restore failure/, async stage => {
    if (stage === 'restore-record') throw new Error('injected restore failure');
  });
  const callerOwnedDb = nodeDriver(':memory:');
  const closeUnderlying = callerOwnedDb.close.bind(callerOwnedDb); let closeCount = 0;
  callerOwnedDb.close = async () => { closeCount++; if (closeCount > 1) throw new Error('Driver closed more than once'); await closeUnderlying(); };
  await assert.rejects(RealFlightLibrary.restoreValidated(callerOwnedDb,backup,ownerA,storeA,hash,
    () => ({ownerId:ownerA,storeId:storeA,leaseId:'restore-f',writable:true}),async stage => {
      if (stage === 'restore-record') throw new Error('original restore failure');
    }),/original restore failure/);
  assert.equal(closeCount,0,'restore factory leaves the supplied Driver with its caller on failure');
  await callerOwnedDb.close(); assert.equal(closeCount,1);
  assert.equal(graph.generation, 2);
});

test('partial windows and oversized command/backup payloads fail closed without truncating evidence', async t => {
  const { library } = await setup(t); await bind(library, source('capture-bind-limits', [row('801')]), 70);
  const partial = source('capture-partial', [row('801')]);
  partial.capture.coverage = 'visible-personal-list-only'; delete partial.capture.exportContext;
  await assert.rejects(library.prepareImport(partial), /partial source window/);
  const graph = await library.snapshot();
  assert.ok(REAL_HISTORY_COMMAND_LIMIT < REAL_HISTORY_BACKUP_LIMIT);
  assert.equal(graph.records.filter(record => record.kind === 'flight').length, 0);
});



test('displayed evidence owns its graph and exact reuse includes history beyond generation/count',async t=>{
  const f=await setup(t);await bind(f.library);await save(f.library,source('capture-saved',[row('101')]),2);
  const {graph,flights}=await f.library.readStored(),flight=flights[0]!;
  const retained=new RealFlightDetailSource(graph),same=new RealFlightDetailSource(graph);
  const expected=retained.detail(flight.flightId);
  assert.equal(retained.sameEvidence(same),true);
  // Equal sizes/generation do not establish equal bytes or admitted evidence.
  graph.records[0]!.payload += ' ';
  assert.equal(retained.sameEvidence(new RealFlightDetailSource(graph)),false);
  graph.records.length=0;
  assert.deepEqual(retained.detail(flight.flightId),expected,'caller mutation cannot change retained evidence');
});

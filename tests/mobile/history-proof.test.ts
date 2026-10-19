import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { canonical } from '../../packages/flight-logbook/src/index.ts';
import type { Driver } from '../../packages/local-data/src/index.ts';
import { nodeDriver } from './sqlite-driver.ts';
import { ProofHost, catalogue, importCommand, proofAt, proofBook, proofCapture, proofHash, proofScope } from './history-proof-host.ts';
import { BACKUP_LIMIT, COMMAND_LIMIT, boundedJson, cloneProof, latestValues, type ProofGraph, type StoredFacts, type StoredChoice, type ProofCommand } from '../../apps/platform-lab/src/vereinsflieger/history-proof-model.ts';
import { HistoryProofStore, IndeterminateProofCommit, type ProofFault } from '../../apps/platform-lab/src/vereinsflieger/history-proof-store.ts';
import { IndeterminateProofActivation } from '../../apps/platform-lab/src/vereinsflieger/history-proof-selection.ts';
import { planHistoryReview } from '../../apps/platform-lab/src/vereinsflieger/history-plan.ts';

async function setup(t:TestContext,fault?:ProofFault) {
  const host=await ProofHost.create(); t.after(()=>host.cleanup());
  const next=await host.candidate(fault); await next.store.commit(await catalogue(next.store)); return {host,...next};
}
async function corruptedBackup(text:string,change:(g:ProofGraph&{version:number})=>void) {
  const e=JSON.parse(text); const g=JSON.parse(e.payload) as ProofGraph&{version:number}; change(g); e.payload=canonical(g); e.checksum=await proofHash(e.payload); return canonical(e);
}

test('B1 empty first-use manifest and exact raw evidence survive transactional backup and offline reopen',async t=>{
  const {host,store,name}=await setup(t); const c=await importCommand(store,proofCapture('fixture-unknown',{Flugzeit:'',Start:'24:01'}),null,'fixture-unknown-import',false);
  const original=c.original; await store.commit(c);
  let h=await store.history(proofScope); assert.equal(h.rows.length,1); assert.equal(h.unknownMinutes,1); assert.equal(h.knownMinutes,0);
  assert.equal(h.rows[0]!.facts.assessment.semantics.timeBasis,'unknown'); assert.equal(h.rows[0]!.facts.assessment.semantics.crewCredit,'unresolved'); assert.equal(h.rows[0]!.choice!.bookId,null);
  const backup=await store.backup(), graph=await store.snapshot();
  assert.equal(JSON.parse(graph.records.find(r=>r.kind==='capture')!.payload).original,original);
  await store.close(); const reopened=await host.openCandidate(name); assert.deepEqual(await reopened.history(proofScope),h);
  const restored=await host.candidate(undefined,backup); assert.equal(await restored.store.backup(),backup); assert.deepEqual(await restored.store.snapshot(),graph);
});

test('B1 absent/blank/invalid/conflicting/zero minutes retain distinct states through restore',async t=>{
  const {host,store}=await setup(t);
  const cases:Record<string,string>[]=[{Flugzeit:''},{Flugzeit:'invalid'},{Flugzeit:'0'},{Flugzeit:'12','Flugzeit in hh:mm':'00:13'}];
  for(let i=0;i<cases.length;i++) {
    const capture=proofCapture('fixture-fields-'+i,cases[i]); capture.observation.rows[0]!.sourceFlightId=String(200+i);
    await store.commit(await importCommand(store,capture,null,'fixture-fields-import-'+i,false));
  }
  const absent=proofCapture('fixture-absent'); const ix=absent.observation.headers.indexOf('Flugzeit'); absent.observation.headers.splice(ix,1); absent.observation.rows[0]!.values.splice(ix,1); absent.observation.rows[0]!.sourceFlightId='299';
  await store.commit(await importCommand(store,absent,null,'fixture-absent-import',false));
  const h=await store.history(proofScope); assert.equal(h.rows.length,5); assert.equal(h.knownMinutes,0); assert.equal(h.unknownMinutes,4);
  assert.equal(h.rows.filter(r=>r.facts.assessment.durations.flight.minutes===0).length,1);
  const copy=await host.candidate(undefined,await store.backup()); assert.deepEqual(await copy.store.history(proofScope),h);
});

test('B2 exact retry returns original receipt after newer commands; new capture adds no duplicate facts, choices or credit',async t=>{
  const {store}=await setup(t); const c=await importCommand(store); const first=await store.commit(c); const once=await store.snapshot();
  assert.deepEqual(await store.commit(cloneProof(c)),first); assert.deepEqual(await store.snapshot(),once);
  await store.commit(await importCommand(store,proofCapture('fixture-capture-b'),'fixture-book-a','fixture-import-b'));
  assert.deepEqual(await store.commit(c),first);
  const graph=await store.snapshot(); assert.equal(graph.generation,3);
  for(const kind of ['flight','facts','choice']) assert.equal(graph.records.filter(r=>r.kind===kind).length,1);
  assert.equal(graph.records.filter(r=>r.kind==='capture').length,2);
  assert.equal((await store.history(proofScope,[proofBook.id])).knownMinutes,12);
  const changed=cloneProof(c); changed.at='2026-10-19T11:00:00.000Z'; await assert.rejects(store.commit(changed),/Idempotency/);
});

test('B2 corrections retain predecessors and exact facts; conflicts/invalid rows preserve usable prior history',async t=>{
  const {store}=await setup(t); await store.commit(await importCommand(store));
  await store.commit(await importCommand(store,proofCapture('fixture-corrected',{Flugzeit:'14'}),null,'fixture-correction'));
  let g=await store.snapshot(); const facts=g.records.filter(r=>r.kind==='facts'); assert.equal(facts.length,2); assert.equal(JSON.parse(facts[1]!.payload).predecessor,1);
  assert.equal(latestValues<StoredChoice>(g.records,'choice')[0]!.choice.bookId,null);
  const conflicting=proofCapture('fixture-conflict',{Flugzeit:'16'}); const other=cloneProof(conflicting.observation.rows[0]!); other.values[2]='17'; conflicting.observation.rows.push(other);
  const result=await store.commit(await importCommand(store,conflicting,null,'fixture-conflicting-import'));
  assert.equal(result.counts.pending,1); assert.equal((await store.history(proofScope)).knownMinutes,14);
  const invalid=proofCapture('fixture-invalid-date',{Datum:'31.02.2026'}); await store.commit(await importCommand(store,invalid,null,'fixture-invalid-import'));
  g=await store.snapshot(); assert.equal(g.records.filter(r=>r.kind==='facts').length,2); assert.equal(g.records.filter(r=>r.kind==='pending').length,2);
  assert.equal((await store.history(proofScope)).retainedPendingObservations,2);
});

test('B2 same-looking different source IDs remain distinct; omission and verified empty window do not delete',async t=>{
  const {store}=await setup(t); const capture=proofCapture(); const second=cloneProof(capture.observation.rows[0]!); second.sourceFlightId='102'; capture.observation.rows.push(second);
  await store.commit(await importCommand(store,capture)); assert.equal((await store.history(proofScope)).rows.length,2);
  const empty=proofCapture('fixture-empty'); empty.observation.rows=[]; const receipt=await store.commit(await importCommand(store,empty,null,'fixture-empty-import'));
  assert.equal(receipt.retainedIds.length,2); assert.equal((await store.history(proofScope)).knownMinutes,24);
  assert.equal((await store.snapshot()).records.filter(r=>r.kind==='facts').length,2);
});

test('B2 repeated identical rows deduplicate; changed immutable capture/scope rejects without altering receipts',async t=>{
  const {store}=await setup(t); const capture=proofCapture(); capture.observation.rows.push(cloneProof(capture.observation.rows[0]!));
  await store.commit(await importCommand(store,capture)); assert.equal((await store.history(proofScope)).rows.length,1);
  const before=await store.backup(); const changed=proofCapture(undefined,{Flugzeit:'14'}); await assert.rejects(async()=>store.commit(await importCommand(store,changed,null,'fixture-reuse')),/Immutable/);
  const scopeChange=await catalogue(store,'fixture-change-scope'); scopeChange.scopes[0]!.clubRef='fixture-other-club'; await assert.rejects(store.commit(scopeChange),/Immutable/);
  assert.equal(await store.backup(),before);
});

test('B1/B3 independent books, explicit reassignment and format changes preserve evidence and disable stale credit',async t=>{
  const {store}=await setup(t); const b={...proofBook,id:'fixture-book-b'};
  await store.commit(await catalogue(store,'fixture-second-book',[],[b]));
  await store.commit(await importCommand(store));
  await store.commit(await importCommand(store,proofCapture('fixture-reassign'),b.id,'fixture-reassign-import'));
  assert.equal((await store.history(proofScope,[proofBook.id])).rows.length,0); assert.equal((await store.history(proofScope,[proofBook.id,b.id])).rows.length,1);
  await store.commit(await catalogue(store,'fixture-unsupported-format',[],[{...b,formatVersion:'999'}]));
  assert.equal((await store.history(proofScope)).rows[0]!.staleChoice,true); assert.equal((await store.history(proofScope,[b.id])).rows.length,0);
  const deferred=await importCommand(store,proofCapture('fixture-later'),null,'fixture-later-import'); await store.commit(deferred);
  assert.equal((await store.history(proofScope)).rows[0]!.choice!.bookId,null);
  assert.equal((await store.snapshot()).records.filter(r=>r.kind==='choice').length,3);
  await assert.rejects(store.history(proofScope,['foreign-book']),/Foreign/);
});

test('B3 two scopes with equal provider references never merge; foreign files reject before open',async t=>{
  const {host,store,name}=await setup(t); const second={...proofScope,scopeId:'fixture-scope-b'}; host.current!.scopeIds.push(second.scopeId);
  await store.commit(await catalogue(store,'fixture-second-scope',[second],[]));
  await store.commit(await importCommand(store)); await store.commit(await importCommand(store,proofCapture('fixture-scope-b-capture',{},second),null,'fixture-scope-b-import'));
  const g=await store.snapshot(); assert.equal(g.records.filter(r=>r.kind==='flight').length,2);
  assert.equal((await store.history(second)).rows.length,1); assert.equal((await store.history(proofScope)).rows.length,1);
  const twoScopeBackup=await store.backup(); host.current!.scopeIds=[proofScope.scopeId];
  await assert.rejects(store.snapshot(),/unauthorized scope/); await assert.rejects(host.openCandidate(name),/unauthorized scope/);
  await assert.rejects(host.candidate(undefined,twoScopeBackup),/Unauthorized restored scope/); host.current!.scopeIds.push(second.scopeId);
  const saved=cloneProof(host.current!); host.current={...saved,ownerId:'fixture-owner-b',storeId:'fixture-store-b',leaseId:'fixture-other-owner'};
  await assert.rejects(host.openCandidate(name),/foreign/); await assert.rejects(store.history(proofScope),/Unauthorized/);
  const b=await host.candidate(); await assert.rejects(b.store.workspace(proofScope),/Foreign|Unknown|scope/);
  host.current={...saved,leaseId:'fixture-new-session'}; await assert.rejects(store.snapshot(),/Expired/);
});

test('B3 authorization rejects before SQL access and expiry prevents a transaction from publishing',async t=>{
  const {host,store}=await setup(t); let calls=0;
  const trap=new Proxy({} as Driver,{get(){return async()=>{calls++;throw new Error('must not read');};}});
  await assert.rejects(HistoryProofStore.open(trap,'fixture-other','fixture-store-a',proofHash,host.authorize),/Unauthorized/); assert.equal(calls,0);
  const permit=host.current; host.current=null; await assert.rejects(store.backup(),/Unauthorized/); host.current=permit;
  const c=await importCommand(store); c.capture.scope={...proofScope,scopeId:'fixture-foreign-scope'}; await assert.rejects(store.commit(c),/scope/);
  const next=await host.candidate(async stage=>{if(stage==='before-commit') host.current=null;});
  const seed=await catalogue(next.store); await assert.rejects(next.store.commit(seed),/Unauthorized/); host.current=permit;
  assert.equal((await next.store.snapshot()).generation,0);
});

test('B3 forged workspace/facts/book/token and unconfirmed/partial/unknown-identity plans reject without mutation',async t=>{
  const {store}=await setup(t); const c=await importCommand(store), before=await store.backup();
  const changes:((v:typeof c)=>void)[]=[v=>{v.baseGeneration=0;},v=>{v.workspace.previous.push({} as never);},v=>{v.workspace.books[0]!.ownerId='foreign';},v=>{v.planToken='forged';},v=>{v.fixture.identity='unverified';},v=>{v.capture.coverage.state='partial';},v=>{v.workspace.choices=[];},v=>{v.original+=' ';v.original=v.original.replace('12','99');},v=>{(v.capture as unknown as Record<string,unknown>).verified=true;},v=>{v.coverageEvidence.rowCount++;},v=>{v.coverageEvidence.complete=false;},v=>{v.coverageEvidence.pageCount=0;}];
  for(const change of changes) {const bad=cloneProof(c);change(bad);await assert.rejects(store.commit(bad));assert.equal(await store.backup(),before);}
  const partial=await importCommand(store); partial.capture.coverage.state='visible-only'; partial.planToken=planHistoryReview(partial.workspace,partial.capture,partial.fixture).fingerprint;
  await assert.rejects(store.commit(partial),/source validation/);
});

for(const stage of ['before-transaction','before-receipt','after-receipt','after-capture','after-flight','after-facts','after-choice','after-coverage','before-commit']) {
  test('B4 rollback on injected '+stage+' leaves the previous generation after reopen',async t=>{
    let armed=false; const {host,store,name}=await setup(t,async at=>{if(armed&&at===stage) throw new Error('fixture injected '+stage);});
    const c=await importCommand(store), before=await store.backup(); armed=true; await assert.rejects(store.commit(c),/fixture injected/); armed=false;
    assert.equal(await store.backup(),before); await store.close(); const reopen=await host.openCandidate(name); assert.equal(await reopen.backup(),before);
  });
}

for(const stage of ['after-commit','before-readback']) {
  test('B4 indeterminate '+stage+' resolves through exact original receipt',async t=>{
    let armed=false; const {host,store,name}=await setup(t,async at=>{if(armed&&at===stage) throw new Error('fixture readback failure');});
    const c=await importCommand(store); armed=true; await assert.rejects(store.commit(c),IndeterminateProofCommit); armed=false; await store.close();
    const reopened=await host.openCandidate(name), receipt=await reopened.commit(c); assert.equal(receipt.generation,2); assert.equal((await reopened.snapshot()).receipts.length,2);
  });
}

test('B4 actual child exit after commit-before-response preserves exactly one receipt on restart',async t=>{
  const {host,store,name}=await setup(t); const c=await importCommand(store), path=join(host.root,'fixture-request.json'); await writeFile(path,canonical(c)); await store.close();
  const child=spawnSync(process.execPath,['--import','tsx','tests/mobile/history-proof-crash.ts',host.path(name),path],{encoding:'utf8',timeout:30000});
  assert.equal(child.status,27,child.stderr); const reopened=await host.openCandidate(name); const receipt=await reopened.commit(c);
  assert.equal(receipt.generation,2); assert.equal((await reopened.snapshot()).records.filter(r=>r.kind==='facts').length,1);
});

test('B4 competing stale commands cannot overwrite a newer generation',async t=>{
  const {host,store,name}=await setup(t); const a=await importCommand(store), b=cloneProof(a); b.commandId='fixture-other-command';
  const second=await host.openCandidate(name); await store.commit(a); await assert.rejects(second.commit(b),/Stale/); assert.equal((await store.snapshot()).generation,2);
});

test('B5 checksum-valid corruption in every record kind and receipt rejects before activation',async t=>{
  const {host,store}=await setup(t); await store.commit(await importCommand(store)); const invalid=proofCapture('fixture-pending',{Datum:'invalid'}); await store.commit(await importCommand(store,invalid,null,'fixture-pending-import'));
  const backup=await store.backup(); const original=await store.snapshot();
  for(const kind of ['scope','capture','flight','facts','book','choice','coverage','pending']) {
    const bad=await corruptedBackup(backup,g=>{const row=g.records.find(r=>r.kind===kind)!; const payload=JSON.parse(row.payload); payload.foreignId='fixture-forged'; row.payload=canonical(payload);});
    await assert.rejects(host.candidate(undefined,bad)); assert.deepEqual(await store.snapshot(),original);
  }
  const changes:((g:ProofGraph&{version:number})=>void)[]=[g=>{g.version=2;},g=>{g.manifest.owner_id='fixture-foreign';},g=>{g.manifest.schema_version=2 as 1;},g=>{g.records[0]!.revision=2;},g=>{g.records[0]!.generation=999;},g=>{g.records.push(cloneProof(g.records[0]!));},g=>{g.records[0]!.kind='future' as never;},g=>{g.receipts[0]!.result_json='{}';},g=>{g.receipts[0]!.request_sha256='0'.repeat(64);},g=>{g.receipts[0]!.generation=2;},g=>{g.generation=Number.MAX_SAFE_INTEGER+1;}];
  for(const change of changes) await assert.rejects(host.candidate(undefined,await corruptedBackup(backup,change)));
  await assert.rejects(HistoryProofStore.validateBackup(backup,store.manifest.owner_id,'fixture-foreign-store',proofHash),/Foreign/);
  assert.equal(await store.backup(),backup);
});

test('B5 semantic hashes and input limits do not permit forged facts or silently truncated backups',async t=>{
  const {store}=await setup(t); await store.commit(await importCommand(store)); const backup=await store.backup();
  const e=JSON.parse(backup), g=JSON.parse(e.payload) as ProofGraph; const row=g.records.find(r=>r.kind==='facts')!; const p=JSON.parse(row.payload) as StoredFacts;
  p.facts.assessment.durations.flight.minutes=999; row.payload=canonical(p); row.payload_sha256=await proofHash(row.payload); e.payload=canonical(g); e.checksum=await proofHash(e.payload);
  await assert.rejects(HistoryProofStore.validateBackup(canonical(e),store.manifest.owner_id,store.manifest.store_id,proofHash));
  assert.throws(()=>boundedJson('x'.repeat(COMMAND_LIMIT),COMMAND_LIMIT),/limit/);
  await assert.rejects(HistoryProofStore.validateBackup(' '.repeat(BACKUP_LIMIT+1),store.manifest.owner_id,store.manifest.store_id,proofHash),/limit/);
  assert.equal(await store.backup(),backup);
});

test('B5 unsupported/existing SQL files are preserved; append-only triggers reject destructive SQL',async t=>{
  const {host,store,name}=await setup(t); const db=nodeDriver(host.path(name));
  try {
    await assert.rejects(db.run('UPDATE history_manifest SET owner_id=?','fixture-foreign'),/Append-only/);
    await assert.rejects(db.run('DELETE FROM history_receipts'),/Append-only/);
    await assert.rejects(HistoryProofStore.create(db,host.manifest(),proofHash,host.authorize),/Existing/);
    await store.close(); await db.exec('PRAGMA user_version=99'); await assert.rejects(host.openCandidate(name),/version/);
    await db.exec('PRAGMA user_version=1; DROP TRIGGER history_records_no_update'); await assert.rejects(host.openCandidate(name),/shape/);
  } finally { await db.close(); }
});

test('B5 injected restore writes preserve prior selected file and never publish the failed candidate',async t=>{
  const {host,store,name}=await setup(t); await store.commit(await importCommand(store)); const backup=await store.backup();
  const journal=await host.journal(); await journal.activate('fixture-initial',name,null,proofAt);
  for(const stage of ['restore-receipt','restore-record','restore-before-commit']) await assert.rejects(host.candidate(async at=>{if(at===stage) throw new Error('fixture restore failure');},backup),/restore failure/);
  const selected=await journal.select(); assert.equal(selected.name,name); assert.equal(selected.recoveryRequired,false); assert.equal(await selected.store.backup(),backup);
});

test('B6 staged activation/retry/rollback preserve files and make older receipts read-only',async t=>{
  const {host,store,name}=await setup(t); await store.commit(await importCommand(store)); const backup=await store.backup();
  const journal=await host.journal(), first=await journal.activate('fixture-activation-a',name,null,proofAt);
  assert.equal(await journal.activate('fixture-activation-a',name,null,proofAt),first);
  const restored=await host.candidate(undefined,backup); const second=await journal.activate('fixture-activation-b',restored.name,first,proofAt);
  await restored.store.commit(await importCommand(restored.store,proofCapture('fixture-newer',{Flugzeit:'15'}),null,'fixture-newer-import'));
  const rollback=await journal.activate('fixture-rollback',name,second,proofAt); assert.ok(rollback>second);
  const selected=await journal.select(); assert.equal(selected.name,name); assert.equal(selected.recoveryRequired,true); assert.ok(selected.warning);
  await assert.rejects(selected.store.commit(await importCommand(selected.store,proofCapture('fixture-replay'),null,'fixture-replay-import')),/Unauthorized/);
  assert.equal((await store.history(proofScope)).knownMinutes,12); assert.equal((await restored.store.history(proofScope)).knownMinutes,15);
  assert.ok((await readFile(host.path(name))).length>0 && (await readFile(host.path(restored.name))).length>0);
  await assert.rejects(journal.activate('fixture-activation-a',restored.name,null,proofAt),/reused/);
});

for(const stage of ['before-candidate-open','after-candidate-read','before-selection-write','after-selection-write','after-selection-commit']) {
  test('B6 activation failure '+stage+' preserves or recovers one complete journal entry',async t=>{
    const {host,store,name}=await setup(t); const backup=await store.backup(); let armed=false;
    const journal=await host.journal(true,async at=>{if(armed&&at===stage) throw new Error('fixture activation failure');});
    const first=await journal.activate('fixture-active',name,null,proofAt), restored=await host.candidate(undefined,backup); armed=true;
    await assert.rejects(journal.activate('fixture-next',restored.name,first,proofAt),stage==='after-selection-commit'?IndeterminateProofActivation:/activation failure/); armed=false;
    const selected=await journal.select(); assert.equal(selected.name,stage==='after-selection-commit'?restored.name:name);
    const seq=await journal.activate('fixture-next',restored.name,first,proofAt); assert.ok(seq>first);
  });
}

test('B6 missing/corrupt newest candidate falls back with warning and blocks writes; no valid candidate never seeds',async t=>{
  const {host,store,name}=await setup(t); const backup=await store.backup(), journal=await host.journal(); const first=await journal.activate('fixture-a',name,null,proofAt);
  const next=await host.candidate(undefined,backup); await journal.activate('fixture-b',next.name,first,proofAt); await next.store.close(); await unlink(host.path(next.name));
  let selected=await journal.select(); assert.equal(selected.name,name); assert.equal(selected.recoveryRequired,true); assert.ok(selected.warning); await selected.store.close();
  await store.close(); await writeFile(host.path(name),'fixture corrupt sqlite'); await assert.rejects(journal.select(),/No readable/);
  await assert.rejects(journal.activate('fixture-path','../foreign.sqlite',null,proofAt),/path/);
  await assert.rejects(host.openCandidate(next.name));
});

test('B6 selection changes through another journal handle invalidate old readers/writers',async t=>{
  const {host,store,name}=await setup(t); const journal=await host.journal(); const first=await journal.activate('fixture-select-a',name,null,proofAt);
  const selected=await journal.select(); const request=await importCommand(selected.store);
  const next=await host.candidate(undefined,await store.backup()), other=await host.journal(false);
  await other.activate('fixture-select-b',next.name,first,proofAt);
  await assert.rejects(selected.store.commit(request),/changed/); await assert.rejects(selected.store.snapshot(),/changed/);
  const current=await journal.select(); assert.equal(current.name,next.name); assert.equal(current.recoveryRequired,false);
  await journal.close(); await assert.rejects(current.store.snapshot(),/Closed/);
});

test('B6 divergent same-generation branches and corrupt newest candidates preserve read-only recovery',async t=>{
  const {host,store,name}=await setup(t); const backup=await store.backup(), next=await host.candidate(undefined,backup), journal=await host.journal();
  const first=await journal.activate('fixture-branch-a',name,null,proofAt);
  await store.commit(await importCommand(store)); await next.store.commit(await importCommand(next.store,proofCapture('fixture-branch-capture',{Flugzeit:'15'}),null,'fixture-branch-import'));
  await journal.activate('fixture-branch-b',next.name,first,proofAt);
  const selected=await journal.select(); assert.equal(selected.recoveryRequired,true); await selected.store.close(); await next.store.close();
  const db=nodeDriver(host.path(next.name)); try{await db.exec('PRAGMA user_version=99');}finally{await db.close();}
  const recovered=await journal.select(); assert.equal(recovered.name,name); assert.equal(recovered.recoveryRequired,true); assert.ok(recovered.warning);
});

test('B6 malformed journal paths never open foreign files; journal schema and append-only guards are enforced',async t=>{
  const {host,name}=await setup(t); const journal=await host.journal(), first=await journal.activate('fixture-good',name,null,proofAt);
  const db=nodeDriver(host.path('history-proof-selection.sqlite'));
  try {
    await assert.rejects(db.run('DELETE FROM history_selection'),/Append-only/);
    await db.run('INSERT INTO history_selection(owner_id,store_id,candidate_name,manifest_sha256,validated_generation,activation_id,previous_seq,activated_at) VALUES (?,?,?,?,?,?,?,?)',proofScope.ownerId,'fixture-store-a','../private.sqlite','0'.repeat(64),0,'fixture-forged',first,proofAt);
    const selected=await journal.select(); assert.equal(selected.name,name); assert.equal(selected.recoveryRequired,true); await selected.store.close();
    await journal.close(); await db.exec('PRAGMA user_version=99'); await assert.rejects(host.journal(false),/version/);
  }finally{await db.close();}
});

test('B7 all operations preserve unrelated sentinel files and expose no paper/acknowledgement commands',async t=>{
  const {host,store,name}=await setup(t); const sentinels=['lab.sqlite','raw-capture.sqlite','recovery-journal.sqlite','old-backup.json','paper-snapshot.json'];
  for(const file of sentinels) await writeFile(join(host.root,file),'fixture immutable '+file);
  const before=await Promise.all(sentinels.map(async file=>proofHash(await readFile(join(host.root,file),'utf8'))));
  await store.commit(await importCommand(store)); const backup=await store.backup(); const restored=await host.candidate(undefined,backup); const journal=await host.journal(); await journal.activate('fixture-active',restored.name,null,proofAt);
  const bad={...(await catalogue(store)),kind:'acknowledge'} as unknown as ProofCommand; await assert.rejects(store.commit(bad));
  assert.deepEqual(await Promise.all(sentinels.map(async file=>proofHash(await readFile(join(host.root,file),'utf8')))),before);
  assert.ok((await readFile(host.path(name))).length>0);
});

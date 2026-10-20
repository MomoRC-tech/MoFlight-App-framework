import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { REAL_HISTORY_SCHEMA, inspectRealHistoryPrerequisites, realHistoryCandidateName,
  validateRealHistoryCandidateName, validateRealHistoryManifest, validateRealHistorySaveIntent,
  type RealHistoryManifest } from '../../apps/platform-lab/src/vereinsflieger/real-history-contract.ts';

const owner = '11111111-1111-4111-8111-111111111111';
const store = '22222222-2222-4222-8222-222222222222';
const command = '33333333-3333-4333-8333-333333333333';
const at = '2026-10-20T10:00:00.000Z';
const manifest: RealHistoryManifest = {singleton:1,family:'moflight-real-flight-history',schema_version:1,payload_version:1,owner_id:owner,store_id:store,created_at:at};
const context = {accountNumber:'101',clubLabel:'Example club',clubIdentity:'display-label-only',verification:'observed-profile-number'};
function review(complete = false) {
  return {manifest:{...manifest},scope:{version:1,owner,connectionId:'example-connection',context:{...context}},
    contextBefore:{...context},contextAfter:{...context},
    capture:{captureId:'example-capture',retrievedAt:at,headers:['Datum','Lfz.','Start','Landung','Flugzeit','Pilot'],
      rows:[{sourceFlightId:'101',values:['20.10.2026','D-TEST','','','0','Example pilot']}],sourceIdentity:'unverified',
      timeBasis:'unknown',coverage:complete ? 'complete-requested-list' : 'visible-personal-list-only',
      ...(complete ? {exportContext:{from:'2026-10-01',to:'2026-10-20',preset:'Konfiguration laden',participation:'Pilot oder Fluglehrer',
        accountLabel:'Example account',recordCount:1,pageCount:1,columnIds:['1','2','3','4','5','6'],adapterVersion:2}} : {})}};
}
function intent() {
  return {version:1,kind:'save-unassigned',commandId:command,ownerId:owner,storeId:store,baseGeneration:0,
    captureId:'example-capture',captureSha256:'a'.repeat(64),planSha256:'b'.repeat(64),at};
}

test('production manifest refuses proof families, unsupported versions, legacy owner and impossible timestamps', () => {
  assert.deepEqual(validateRealHistoryManifest(manifest),manifest);
  for (const change of [{family:'moflight-history-proof'},{schema_version:2},{payload_version:2},{owner_id:'synthetic-pilot'},
    {created_at:'2026-02-30T10:00:00.000Z'},{mode:'synthetic-only'},{store_id:'../../private'}])
    assert.throws(() => validateRealHistoryManifest({...manifest,...change}));
});

test('candidate basename is opaque and refuses traversal, URI, synthetic/proof path and alternate UUIDs', () => {
  const name = realHistoryCandidateName(store);
  assert.equal(validateRealHistoryCandidateName(name),name);
  for (const bad of [`../${name}`,`file://${name}`,`${name}-wal`,name.toUpperCase(),'history-proof-'+store+'.sqlite',
    'pilot-synthetic-v1.sqlite','moflight-real-history-22222222-2222-2222-2222-222222222222.sqlite'])
    assert.throws(() => validateRealHistoryCandidateName(bad));
});

test('save intent validates review identity without granting source authorization or accepting forged fields', () => {
  const valid = intent(); assert.deepEqual(validateRealHistorySaveIntent(valid,manifest),valid);
  for (const change of [{ownerId:store},{storeId:owner},{baseGeneration:-1},{baseGeneration:Number.MAX_SAFE_INTEGER+1},
    {captureSha256:'invalid'},{kind:'assign'},{verified:true},{sourceIdentity:'verified'},{at:'2026-02-30T10:00:00.000Z'}])
    assert.throws(() => validateRealHistorySaveIntent({...valid,...change},manifest));
  const parsed = validateRealHistorySaveIntent(valid,manifest); parsed.captureId = 'changed';
  assert.equal(valid.captureId,'example-capture');
});

test('current visible capture is blocked on actual source limitations while unknown clocks and zero remain intact', () => {
  const input = review(), original = structuredClone(input), result = inspectRealHistoryPrerequisites(input);
  assert.equal(result.status,'blocked-source-verification'); assert.equal(result.retainedRows,1);
  assert.deepEqual(result.blockers,['stable-account-binding-unverified',
    'flight-reference-durability-unverified','requested-window-not-complete']);
  assert.deepEqual(input,original);
});

test('complete-requested-list metadata never attests durable identity or provider window semantics', () => {
  const result = inspectRealHistoryPrerequisites(review(true));
  assert.equal(result.status,'blocked-source-verification');
  assert.ok(result.blockers.includes('requested-window-semantics-unverified'));
  assert.ok(result.blockers.includes('stable-account-binding-unverified'));
  assert.ok(!result.blockers.some(blocker => blocker.includes('club')));
  const empty = review(true); empty.capture.rows = []; empty.capture.exportContext!.recordCount = 0;
  assert.equal(inspectRealHistoryPrerequisites(empty).retainedRows,0);
  const partial = review(true); partial.capture.exportContext!.recordCount = 2;
  assert.throws(() => inspectRealHistoryPrerequisites(partial),/shape/);
});

test('foreign owner, provider switch and unknown attestation keys cannot bypass prerequisites', () => {
  const foreign = review(); foreign.scope.owner = store;
  assert.throws(() => inspectRealHistoryPrerequisites(foreign),/Foreign/);
  const switched = review(); switched.contextAfter.accountNumber = '102';
  assert.throws(() => inspectRealHistoryPrerequisites(switched),/changed/);
  const clubSwitch = review(); clubSwitch.contextBefore.clubLabel = 'Other club';
  assert.throws(() => inspectRealHistoryPrerequisites(clubSwitch),/changed/);
  assert.throws(() => inspectRealHistoryPrerequisites({...review(),verified:true}),/keys/);
  const asserted = review(); Object.assign(asserted.capture,{verified:true});
  assert.throws(() => inspectRealHistoryPrerequisites(asserted),/keys/);
  const assertedRow = review(); Object.assign(assertedRow.capture.rows[0]!,{identityVerified:true});
  assert.throws(() => inspectRealHistoryPrerequisites(assertedRow),/keys/);
});

test('missing references and oversized history remain unavailable rather than silently truncated', () => {
  const missing = review(); (missing.capture.rows[0] as {sourceFlightId:string|null}).sourceFlightId = null;
  assert.ok(inspectRealHistoryPrerequisites(missing).blockers.includes('missing-flight-reference'));
  const many = review(true), row = many.capture.rows[0]!;
  many.capture.rows = Array.from({length:5001}, (_,i) => ({...row,sourceFlightId:String(i+1)}));
  many.capture.exportContext!.recordCount = 5001; many.capture.exportContext!.pageCount = 6;
  const result = inspectRealHistoryPrerequisites(many);
  assert.equal(result.retainedRows,5001); assert.ok(result.blockers.includes('planning-bound-exceeded'));
  const oversized = review(); oversized.capture.rows = Array.from({length:20_001}, () => row);
  assert.throws(() => inspectRealHistoryPrerequisites(oversized),/Oversized/);
});

test('proposed DDL enforces append-only manifest/receipts/records, foreign references and v1 kind boundaries', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys=ON;'); db.exec(REAL_HISTORY_SCHEMA);
    db.prepare('INSERT INTO real_history_manifest VALUES (?,?,?,?,?,?,?)').run(1,manifest.family,1,1,store,owner,at);
    const receipt = db.prepare('INSERT INTO real_history_receipts VALUES (?,?,?,?,?,?,?,?,?)');
    assert.throws(() => receipt.run(command,store,'bind',0,1,'{}','a'.repeat(64),'{}',at),/FOREIGN KEY/);
    assert.throws(() => receipt.run(command,owner,'bind',0,2,'{}','a'.repeat(64),'{}',at),/CHECK/);
    receipt.run(command,owner,'bind',0,1,'{}','a'.repeat(64),'{}',at);
    const record = db.prepare('INSERT INTO real_history_records VALUES (?,?,?,?,?,?,?,?)');
    record.run(1,owner,'binding','example-binding',1,1,'{}','a'.repeat(64));
    assert.throws(() => record.run(2,owner,'binding','example-binding',1,1,'{}','a'.repeat(64)),/identity collision/);
    assert.throws(() => record.run(2,owner,'book','example-book',1,1,'{}','a'.repeat(64)),/CHECK/);
    assert.throws(() => record.run(2,owner,'flight','example-flight',1,2,'{}','a'.repeat(64)),/FOREIGN KEY/);
    assert.throws(() => record.run(2,owner,'flight','example-flight',1,1,'not-json','a'.repeat(64)),/CHECK/);
    for (const table of ['real_history_manifest','real_history_receipts','real_history_records']) {
      assert.throws(() => db.exec(`UPDATE ${table} SET owner_id=owner_id`),/Append-only/);
      assert.throws(() => db.exec(`DELETE FROM ${table}`),/Append-only/);
    }
    assert.equal((db.prepare('PRAGMA user_version').get() as {user_version:number}).user_version,1);
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM real_history_records').get() as {n:number}).n,1);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  } finally { db.close(); }
});

test('INSERT OR REPLACE cannot rewrite any unique append-only identity with recursive triggers disabled', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys=ON; PRAGMA recursive_triggers=OFF;'); db.exec(REAL_HISTORY_SCHEMA);
    db.prepare('INSERT INTO real_history_manifest VALUES (?,?,?,?,?,?,?)').run(1,manifest.family,1,1,store,owner,at);
    db.prepare('INSERT INTO real_history_receipts VALUES (?,?,?,?,?,?,?,?,?)').run(command,owner,'bind',0,1,'{}','a'.repeat(64),'{}',at);
    db.prepare('INSERT INTO real_history_records VALUES (?,?,?,?,?,?,?,?)').run(1,owner,'binding','example-binding',1,1,'{}','a'.repeat(64));
    const tables = ['real_history_manifest','real_history_receipts','real_history_records'];
    const before = tables.map(table => db.prepare(`SELECT * FROM ${table}`).all());
    const insertManifest = db.prepare('INSERT OR REPLACE INTO real_history_manifest VALUES (?,?,?,?,?,?,?)');
    for (const [singleton,storeId,ownerId] of [[1,command,command],[2,store,command],[2,command,owner]] as const)
      assert.throws(() => insertManifest.run(singleton,manifest.family,1,1,storeId,ownerId,'2026-10-21T00:00:00.000Z'),/identity collision/);
    const insertReceipt = db.prepare('INSERT OR REPLACE INTO real_history_receipts VALUES (?,?,?,?,?,?,?,?,?)');
    for (const [id,base,generation] of [[command,1,2],[store,0,1]] as const)
      assert.throws(() => insertReceipt.run(id,owner,'bind',base,generation,'{"changed":true}','b'.repeat(64),'{}',at),/identity collision/);
    const insertRecord = db.prepare('INSERT OR REPLACE INTO real_history_records VALUES (?,?,?,?,?,?,?,?)');
    for (const [seq,kind,id,revision] of [[1,'facts','new-fact',1],[2,'binding','example-binding',1]] as const)
      assert.throws(() => insertRecord.run(seq,owner,kind,id,revision,1,'{"changed":true}','b'.repeat(64)),/identity collision/);
    assert.deepEqual(tables.map(table => db.prepare(`SELECT * FROM ${table}`).all()),before);
    assert.equal((db.prepare('PRAGMA recursive_triggers').get() as {recursive_triggers:number}).recursive_triggers,0);
  } finally { db.close(); }
});

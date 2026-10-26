import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nodeDriver } from './sqlite-driver.ts';
import { RealFlightLibrary } from '../../apps/platform-lab/src/vereinsflieger/real-flight-library.ts';
import { RealFlightSelection, type RealSelectionAuthorization, type RealSelectionGate, type RealSelectionSnapshot } from '../../apps/platform-lab/src/vereinsflieger/real-flight-selection.ts';
import { realHistoryCandidateName, type RealHistoryManifest } from '../../apps/platform-lab/src/vereinsflieger/real-history-contract.ts';
import { recoverySource } from '../../apps/platform-lab/src/development/android-core-recovery-fixture.ts';

const owner='11111111-1111-4111-8111-111111111111',store='22222222-2222-4222-8222-222222222222';
const id=(n:number)=>`33333333-3333-4333-8333-${String(n).padStart(12,'0')}`;
const at='2026-10-20T10:00:00.000Z', hash=async(text:string)=>createHash('sha256').update(text).digest('hex');
const manifest:RealHistoryManifest={singleton:1,family:'moflight-real-flight-history',schema_version:1,payload_version:1,owner_id:owner,store_id:store,created_at:at};

for(const tamper of ['none','records','schema'] as const)test(`real selected library opens once and rereads exact bytes before publication (${tamper})`,async t=>{
  const directory=mkdtempSync(join(tmpdir(),'moflight-selection-reuse-')),name=realHistoryCandidateName(id(1)),path=join(directory,name);
  const permit={ownerId:owner,storeId:store,leaseId:'real-selection-reuse',writable:true};
  const authorize=()=>permit;
  const created=await RealFlightLibrary.create(nodeDriver(path),manifest,hash,authorize);
  const input=recoverySource('selection-reuse-input');
  await created.bindAccount({kind:'bind',commandId:id(21),baseGeneration:0,source:input,at});
  const plan=await created.prepareImport(input);
  await created.saveUnassigned({kind:'import-unassigned',commandId:id(22),baseGeneration:plan.baseGeneration,bindingId:plan.bindingId,source:input,planToken:plan.planToken,at});
  await created.close();
  let opens=0,reads=0,replays=0,snapshots=0,closed=0,inspect=false;
  const opener=async(candidateName:string,auth:RealSelectionAuthorization,gate?:RealSelectionGate)=>{
    assert.equal(candidateName,name);opens++;
    const db=nodeDriver(path),library=await RealFlightLibrary.open(db,owner,store,hash,auth,async()=>{},gate,
      stage=>{if(stage==='graph-validation')replays++;if(stage==='graph-read')reads++;return()=>{};});
    const snapshot=library.snapshot.bind(library),close=library.close.bind(library);
    library.close=async()=>{closed++;await close();};
    library.snapshot=async()=>{
      snapshots++;
      const value=await snapshot(stage=>{if(stage==='graph-validation')replays++;if(stage==='graph-read')reads++;return()=>{};});
      if(inspect&&tamper!=='none'&&snapshots===1){
        const foreign=nodeDriver(path);
        try{
          if(tamper==='schema')await foreign.exec('CREATE TABLE unapproved_side_table(value TEXT)');
          else{
            const trigger=await foreign.first<{name:string;sql:string}>("SELECT name,sql FROM sqlite_master WHERE type='trigger' AND name LIKE '%records%update'");
            assert.ok(trigger);assert.match(trigger.name,/^[a-z_]+$/);
            await foreign.exec(`DROP TRIGGER ${trigger.name}`);
            await foreign.run("UPDATE real_history_records SET payload=replace(payload,'D-TEST','D-FORGED') WHERE kind='facts'");
            await foreign.exec(trigger.sql);
          }
        }finally{await foreign.close();}
      }
      return value;
    };
    return library;
  };
  const selection=await RealFlightSelection.open(nodeDriver(':memory:'),owner,store,authorize,opener,hash,true);
  t.after(async()=>{await selection.close();unlinkSync(path);rmdirSync(directory);});
  await selection.activate(id(31),name,null,at);
  opens=reads=replays=snapshots=closed=0;inspect=true;
  if(tamper!=='none'){
    if(tamper==='schema')await assert.rejects(selection.select());
    else await assert.rejects(selection.select(),/record graph/);
    assert.equal(replays,tamper==='schema'?1:2,'schema checks precede replay; same-generation changed bytes take the complete replay path');
    assert.equal(closed,1,'failed final replay releases the retained handle');
  }else{
    const selected=await selection.select();
    assert.equal(selected.recoveryRequired,false);
    assert.equal(selected.candidate.manifest.owner_id,owner);
    assert.equal(replays,1,'unchanged inspection and publication reuse only the open replay');
    assert.equal(closed,0,'successful selected handle stays open for its consumer');
    await selected.candidate.close();assert.equal(closed,1);
  }
  assert.equal(opens,1);assert.equal(snapshots,2);assert.equal(reads,3,'open plus inspection and final read all access fresh graph bytes');
});

for(const change of ['diverge','append'] as const)test(`inspection denies writes, final ${change} controls recovery, and nonselected handles close`,async t=>{
  const db=nodeDriver(':memory:'),permit={ownerId:owner,storeId:store,leaseId:'classification-reuse',writable:true};
  const names=[realHistoryCandidateName(id(1)),realHistoryCandidateName(id(2))];
  const graphs=new Map(names.map(name=>[name,{manifest:{...manifest},generation:1,receipts:[{receipt:'same'}],records:[{value:'same'}]}]));
  let selectPhase=false,opens=0,closes=0,writesDenied=0,snapshotCount=0;
  const opener=async(name:string,authorize:RealSelectionAuthorization,gate?:RealSelectionGate)=>{
    opens++;let closed=false;
    return {snapshot:async()=>{
      assert.equal(closed,false);await gate?.(false);
      if(selectPhase){assert.equal(authorize()?.writable,false);await assert.rejects(gate!(true),/Read-only/);writesDenied++;}
      const result=structuredClone(graphs.get(name)!);
      if(selectPhase&&++snapshotCount===2){
        const chosen=graphs.get(names[1]!)!;
        if(change==='diverge')chosen.records=[{value:'divergent-final'}];
        else{chosen.records.push({value:'new-record'});chosen.receipts.push({receipt:'new'});chosen.generation++;}
      }
      return result;
    },close:async()=>{assert.equal(closed,false);closed=true;closes++;},write:async()=>{await gate?.(true);assert.equal(authorize()?.writable,true);}};
  };
  const selection=await RealFlightSelection.open(db,owner,store,()=>permit,opener,hash,true);t.after(()=>selection.close());
  await selection.activate(id(41),names[0]!,null,at);await selection.activate(id(42),names[1]!,1,at);
  opens=closes=0;selectPhase=true;
  const result=await selection.select();
  assert.equal(result.recoveryRequired,change==='diverge','final chosen snapshot must drive retained-prefix classification');
  assert.equal(opens,2,'each retained candidate opens once');assert.equal(closes,1);assert.equal(writesDenied,3);
  if(change==='diverge')await assert.rejects(result.candidate.write(),/Read-only/);
  else await result.candidate.write();
  await result.candidate.close();assert.equal(closes,2);
});

test('final fresh manifest and selection-head changes fail closed and release retained handle',async t=>{
  for(const change of ['manifest','head','owner'] as const){
    const db=nodeDriver(':memory:');let permit={ownerId:owner,storeId:store,leaseId:'final-gates',writable:true};
    let selecting=false,reads=0,closes=0;
    const graph:RealSelectionSnapshot={manifest:{...manifest},generation:0,receipts:[],records:[]};
    const opener=async(_name:string,authorize:RealSelectionAuthorization,gate?:RealSelectionGate)=>({
      snapshot:async()=>{
        await gate?.(false);assert.ok(authorize());const result=structuredClone(graph);
        if(selecting&&++reads===1){
          if(change==='manifest')graph.manifest={...graph.manifest,created_at:'2026-10-21T10:00:00.000Z'};
          if(change==='owner')permit={...permit,ownerId:id(90),leaseId:'new-owner'};
          if(change==='head'){
            const row=await db.first<{manifest_sha256:string}>('SELECT manifest_sha256 FROM real_history_selection');assert.ok(row);
            await db.run('INSERT INTO real_history_selection(owner_id,store_id,candidate_name,manifest_sha256,validated_generation,activation_id,previous_seq,activated_at) VALUES (?,?,?,?,?,?,?,?)',owner,store,realHistoryCandidateName(id(9)),row.manifest_sha256,0,id(9),1,at);
          }
        }
        return result;
      },close:async()=>{closes++;},
    });
    const selection=await RealFlightSelection.open(db,owner,store,()=>permit,opener,hash,true);t.after(()=>selection.close());
    await selection.activate(id(51),realHistoryCandidateName(id(1)),null,at);closes=0;selecting=true;
    await assert.rejects(selection.select(),/identity or generation|changed|foreign/);
    assert.equal(closes,1,`${change} invalidation closes the selected handle exactly once`);
  }
});

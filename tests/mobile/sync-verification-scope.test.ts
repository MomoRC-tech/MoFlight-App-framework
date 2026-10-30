import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,rm,copyFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {canonical} from '../../packages/flight-logbook/src/index.ts';
import {nodeDriver} from './sqlite-driver.ts';
import {RealFlightLibrary,type RealFlightTiming} from '../../apps/platform-lab/src/vereinsflieger/real-flight-library.ts';
import {RealFlightCommandJournal} from '../../apps/platform-lab/src/vereinsflieger/real-flight-command-journal.ts';
import {RealFlightService} from '../../apps/platform-lab/src/vereinsflieger/real-flight-service.ts';
import {SyncVerificationScope} from '../../apps/platform-lab/src/vereinsflieger/sync-verification-scope.ts';
import {responsivenessSource} from '../../apps/platform-lab/src/development/android-flight-responsiveness.ts';
import {RECOVERY_AT,RECOVERY_MANIFEST,RECOVERY_OWNER,RECOVERY_STORE,recoveryPermit} from '../../apps/platform-lab/src/development/android-core-recovery-fixture.ts';

const hash=async(text:string)=>createHash('sha256').update(text).digest('hex');
const identity=recoveryPermit();
const verified={accountNumber:'101',clubLabel:'Synthetic recovery club'};
async function fixture(){
  const directory=await mkdtemp(join(tmpdir(),'moflight-verification-'));
  const libraryPath=join(directory,'seed.sqlite'),journalPath=join(directory,'seed-journal.sqlite');
  await (await RealFlightLibrary.create(nodeDriver(libraryPath),RECOVERY_MANIFEST,hash,recoveryPermit)).close();
  await (await RealFlightCommandJournal.open(nodeDriver(journalPath),RECOVERY_OWNER,RECOVERY_STORE,recoveryPermit,hash,true)).close();
  function service(library:string,journal:string,scope?:SyncVerificationScope,start=100){
    let sequence=start,hashes=0,validations=0;
    const measuredHash=async(text:string)=>{hashes++;return hash(text);};
    const timing:RealFlightTiming=name=>{if(name==='graph-validation')validations++;return()=>{};};
    const ports={authorize:recoveryPermit,hash:measuredHash,uuid:()=>`59595959-5959-4959-8959-${(sequence++).toString(16).padStart(12,'0')}`,now:()=>RECOVERY_AT,
      retrieve:async()=>responsivenessSource('fixed-next',3),
      repository:async()=>{
        const db=nodeDriver(library);
        try{const candidate=await RealFlightLibrary.open(db,RECOVERY_OWNER,RECOVERY_STORE,measuredHash,recoveryPermit,undefined,undefined,timing,scope);
          return {library:candidate,writable:true,warning:null,close:()=>candidate.close()};}
        catch(error){await db.close();throw error;}
      },journal:()=>RealFlightCommandJournal.open(nodeDriver(journal),RECOVERY_OWNER,RECOVERY_STORE,recoveryPermit,measuredHash,false,undefined,scope)};
    return {value:new RealFlightService(RECOVERY_OWNER,RECOVERY_STORE,identity.leaseId,ports),ports,counts:()=>({hashes,validations}),scope};
  }
  const seed=service(libraryPath,journalPath,undefined,1);
  try{await seed.value.retrieveUpdateWithStoredReadback({beforeSave:async()=>verified},new Date(RECOVERY_AT));}finally{seed.value.dispose();}
  return {directory,libraryPath,journalPath,service,cleanup:()=>rm(directory,{recursive:true,force:true})};
}

test('one Sync reuses exact history/commands across closed handles and preserves the complete graph and receipts',async()=>{
  const f=await fixture();const runs=[];
  try{
    for(const enabled of [false,true]){
      const library=join(f.directory,`${enabled}.sqlite`),journal=join(f.directory,`${enabled}-journal.sqlite`);
      await copyFile(f.libraryPath,library);await copyFile(f.journalPath,journal);
      const scope=enabled?new SyncVerificationScope(identity):undefined,run=f.service(library,journal,scope);
      try{
        await run.value.readStored();await run.value.prepareFreshFetch();
        const saved=await run.value.retrieveUpdateWithStoredReadback({beforeSave:async()=>verified},new Date(RECOVERY_AT));
        assert.equal(saved.stored.flights.length,3);
        const counts=run.counts();scope?.close();
        runs.push({counts,backup:await run.value.exportBackup(),saved,reuse:scope?.snapshot()});
      }finally{scope?.close();run.value.dispose();}
    }
    assert.equal(runs[0]!.backup,runs[1]!.backup,'every raw record/receipt and command ID matches');
    assert.deepEqual(runs[0]!.saved,runs[1]!.saved);
    assert.equal(runs[0]!.counts.validations,3);assert.equal(runs[1]!.counts.validations,1,'one initial replay instead of three opens; post-write checks use the service span');
    assert.ok(runs[1]!.counts.hashes<runs[0]!.counts.hashes);
    assert.ok(runs[1]!.reuse!.graphHits>=2);assert.ok(runs[1]!.reuse!.commandHits>0);
  }finally{await f.cleanup();}
});

test('fresh history reads reject changed bytes at the same generation and schema corruption despite reused proof',async()=>{
  for(const mutation of ['record','schema'] as const){
    const f=await fixture(),scope=new SyncVerificationScope(identity),run=f.service(f.libraryPath,f.journalPath,scope);
    try{
      await run.value.readStored();const db=nodeDriver(f.libraryPath);
      try{if(mutation==='record'){
          const trigger=await db.first<{name:string;sql:string}>("SELECT name,sql FROM sqlite_master WHERE type='trigger' AND tbl_name='real_history_records' AND sql LIKE '%BEFORE UPDATE%'");
          assert.ok(trigger);await db.exec('DROP TRIGGER '+trigger.name);
          await db.run('UPDATE real_history_records SET payload_sha256=? WHERE seq=(SELECT MIN(seq) FROM real_history_records)','0'.repeat(64));
          await db.exec(trigger.sql);
        }
        else await db.exec('CREATE TABLE foreign_schema(value TEXT)');}finally{await db.close();}
      await assert.rejects(run.value.readStored());
    }finally{scope.close();run.value.dispose();await f.cleanup();}
  }
});

test('changed journal hashes are rechecked after reopening',async()=>{
  const f=await fixture(),scope=new SyncVerificationScope(identity),run=f.service(f.libraryPath,f.journalPath,scope);
  try{
    await run.value.prepareFreshFetch();const db=nodeDriver(f.journalPath);
    try{const trigger=await db.first<{sql:string}>("SELECT sql FROM sqlite_master WHERE name='real_flight_commands_no_update'");
      assert.ok(trigger);await db.exec('DROP TRIGGER real_flight_commands_no_update');
      await db.run('UPDATE real_flight_commands SET request_sha256=? WHERE seq=(SELECT MIN(seq) FROM real_flight_commands)','0'.repeat(64));
      await db.exec(trigger.sql);
    }finally{await db.close();}
    await assert.rejects(run.value.prepareFreshFetch(),/hash or identity mismatch/);
  }finally{scope.close();run.value.dispose();await f.cleanup();}
});

test('reopening a reused journal observes newly prepared commands and their current resolution',async()=>{
  const f=await fixture(),scope=new SyncVerificationScope(identity),run=f.service(f.libraryPath,f.journalPath,scope);
  try{
    await run.value.prepareFreshFetch();
    const raw=nodeDriver(f.journalPath);
    let command;
    try{command=JSON.parse((await raw.first<{request_json:string}>('SELECT request_json FROM real_flight_commands ORDER BY seq DESC LIMIT 1'))!.request_json);}
    finally{await raw.close();}
    command.commandId='59595959-5959-4959-8959-000000009999';
    let journal=await run.ports.journal();try{await journal.prepare(command);}finally{await journal.close();}
    journal=await run.ports.journal();try{assert.equal((await journal.pending())!.commandId,command.commandId);await journal.resolve(command.commandId,'committed');}finally{await journal.close();}
    journal=await run.ports.journal();try{assert.equal(await journal.pending(),null);}finally{await journal.close();}
  }finally{scope.close();run.value.dispose();await f.cleanup();}
});

test('fresh owner and lease authorization still reject foreign use after the same bytes were validated',async()=>{
  const f=await fixture(),scope=new SyncVerificationScope(identity),run=f.service(f.libraryPath,f.journalPath,scope);
  try{
    await run.value.readStored();
    run.ports.authorize=()=>({...identity,ownerId:'33333333-3333-4333-8333-333333333333'});
    await assert.rejects(run.value.readStored(),/Expired or foreign/);
    run.ports.authorize=()=>({...identity,leaseId:'different-lease'});
    await assert.rejects(run.value.readStored(),/Expired or foreign/);
  }finally{scope.close();run.value.dispose();await f.cleanup();}
});

test('a changed source during provider wait takes a fresh replay before review and never uses a generation-only shortcut',async()=>{
  const f=await fixture(),scope=new SyncVerificationScope(identity),run=f.service(f.libraryPath,f.journalPath,scope);
  try{
    await run.value.readStored();
    run.ports.retrieve=async()=>{
      const db=nodeDriver(f.libraryPath);
      try{const trigger=await db.first<{name:string;sql:string}>("SELECT name,sql FROM sqlite_master WHERE type='trigger' AND tbl_name='real_history_records' AND sql LIKE '%BEFORE UPDATE%'");
        assert.ok(trigger);await db.exec('DROP TRIGGER '+trigger.name);
        await db.run('UPDATE real_history_records SET payload_sha256=? WHERE seq=(SELECT MIN(seq) FROM real_history_records)','f'.repeat(64));await db.exec(trigger.sql);
      }finally{await db.close();}
      return responsivenessSource('fixed-next',3);
    };
    await assert.rejects(run.value.retrieveUpdateWithStoredReadback({beforeSave:async()=>verified},new Date(RECOVERY_AT)));
    const journal=await run.ports.journal();try{assert.equal(await journal.pending(),null);}finally{await journal.close();}
  }finally{scope.close();run.value.dispose();await f.cleanup();}
});

test('scope close, foreign owner/store/lease and bounded eviction never reuse an unrelated proof',()=>{
  const scope=new SyncVerificationScope(identity),text=canonical({generation:1,records:['validated']});
  scope.rememberGraph(identity,text);scope.rememberCommand(identity,'valid-command');
  assert.equal(scope.hasGraph(identity,text),true);
  for(const field of ['ownerId','storeId','leaseId'] as const){
    const foreign={...identity,[field]:'foreign'};
    assert.equal(scope.hasGraph(foreign,text),false);assert.equal(scope.hasCommand(foreign,'valid-command'),false);
  }
  scope.rememberGraph(identity,'x'.repeat(4*1024*1024+1));assert.equal(scope.hasGraph(identity,text),false);
  for(let i=0;i<129;i++)scope.rememberCommand(identity,'row-'+i);
  assert.equal(scope.hasCommand(identity,'row-0'),false);assert.equal(scope.hasCommand(identity,'row-128'),true);
  scope.close();scope.rememberGraph(identity,text);scope.rememberCommand(identity,'after-close');
  assert.equal(scope.hasGraph(identity,text),false);assert.equal(scope.hasCommand(identity,'after-close'),false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as reader from '../../apps/platform-lab/src/mobile/own-flight-reader.ts';
import * as trace from '../../apps/platform-lab/src/local-read-diagnostics.ts';
import * as medical from '../../apps/platform-lab/src/mobile/medical-source.ts';
import { DiagnosticJournal } from '../../apps/platform-lab/src/diagnostics.ts';

test('native read binds selection timings to its originating operation and shares information loading across sections',async()=>{
  const journal=new DiagnosticJournal(),operation=journal.begin('read-flights');
  const scope={owner:'owner',connectionId:'connection',context:{accountNumber:'101'}};
  const lease={ownerId:'owner',storeId:'store',leaseId:'lease'};
  let informationLoads=0,registryCloses=0,selectedTiming:unknown,servicePorts:any;
  class Service { constructor(...args:any[]){servicePorts=args[3];} dispose(){} }
  const modules:Record<string,unknown>={
    '../local-read-diagnostics':trace,'@moflight/flight-logbook':{canonical:JSON.stringify},'expo-crypto':{randomUUID:()=> 'synthetic'},
    '../storage':{hash:async()=> 'synthetic'},'./own-flight-reader':reader,'./medical-source':medical,
    '../vereinsflieger/real-flight-service':{RealFlightService:Service},
    '../vereinsflieger/scoped-storage':{loadProviderScope:async()=>scope},
    '../vereinsflieger/information-native':{loadInformation:async()=>{informationLoads++;return [];}},
    '../vereinsflieger/duty-native':{loadDutyRoster:async()=>null},
    '../user-backup-restore-journal-native':{assertNoPendingUserBackupRestore:async()=>{}},
    '../vereinsflieger/real-flight-native':{
      openOwnerRegistry:async()=>({currentOwner:async()=>lease,assertCurrent:async()=>{},close:async()=>{registryCloses++;}}),
      openRealFlightSelection:async(_scope:any,_create:any,_fault:any,timing:any)=>{
        selectedTiming=timing;return {select:async()=>({candidate:{close:async()=>{}},recoveryRequired:false,warning:null}),close:async()=>{}};
      },
    },
  };
  const source=ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/mobile/own-flight-reader-native.ts',import.meta.url),'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS},
  }).outputText;
  const exports:any={};runInNewContext(source,{exports,require:(name:string)=>{assert.ok(name in modules,name);return modules[name];}});
  const session=await exports.ownFlightReadPorts.open(operation.span);assert.ok(session);
  await Promise.all([session.readMedical('101'),session.readFeatureInformation('101')]);
  assert.equal(informationLoads,1);
  const unrelated=journal.begin('update-flights');
  const repository=await servicePorts.repository(unrelated.span);
  assert.equal(selectedTiming,operation.span,'queued/native selection must not adopt the newest concurrent operation');
  await repository.close();await session.close();assert.equal(registryCloses,1);
  operation.finish('success');unrelated.finish('success');
  assert.ok(journal.snapshot()[0]?.stages.some(stage=>stage.name==='local-information-load'));
});

function detailGuardFixture() {
  const lease={ownerId:'owner',storeId:'store',leaseId:'lease'};
  const calls={restore:0,owner:0,selectionOpens:0,selects:0,identities:[] as string[],selectionCloses:0,registryCloses:0,candidateCloses:0,disposes:0};
  const state={failRestoreAt:0,failOwnerAt:0,failSelection:false,missingSelection:false,failClose:false};
  const evidenceFlags:boolean[]=[];
  class Service {
    constructor(_owner:unknown,_store:unknown,_lease:unknown,private readonly ports:any){}
    async readStored(_initial:unknown,_span:unknown,includeEvidence:boolean){
      evidenceFlags.push(includeEvidence);
      const repository=await this.ports.repository();
      try{return {snapshot:{},flights:[]};}finally{await repository.close();}
    }
    dispose(){calls.disposes++;}
  }
  const modules:Record<string,unknown>={
    '../local-read-diagnostics':trace,'@moflight/flight-logbook':{canonical:JSON.stringify},'expo-crypto':{randomUUID:()=> 'synthetic'},
    '../storage':{hash:async()=> 'synthetic'},'./own-flight-reader':reader,'./medical-source':medical,
    '../vereinsflieger/real-flight-service':{RealFlightService:Service},
    '../vereinsflieger/scoped-storage':{loadProviderScope:async()=>null},
    '../vereinsflieger/information-native':{loadInformation:async()=>[]},
    '../vereinsflieger/duty-native':{loadDutyRoster:async()=>null},
    '../user-backup-restore-journal-native':{assertNoPendingUserBackupRestore:async()=>{
      if(++calls.restore===state.failRestoreAt)throw new Error('Pending restore');
    }},
    '../vereinsflieger/real-flight-native':{
      openOwnerRegistry:async()=>({currentOwner:async()=>lease,assertCurrent:async()=>{
        if(++calls.owner===state.failOwnerAt)throw new Error('Owner lease changed');
      },close:async()=>{calls.registryCloses++;}}),
      openRealFlightSelection:async()=>{
        calls.selectionOpens++;
        if(state.missingSelection)return null;
        return {
          select:async()=>{calls.selects++;return {selectionIdentity:'verified-activation-chain',candidate:{close:async()=>{calls.candidateCloses++;}},recoveryRequired:false,warning:null};},
          assertIdentity:async(identity:string)=>{calls.identities.push(identity);if(state.failSelection)throw new Error('Selection changed');},
          close:async()=>{calls.selectionCloses++;if(state.failClose)throw new Error('Selection close failed');},
        };
      },
    },
  };
  const source=ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/mobile/own-flight-reader-native.ts',import.meta.url),'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS},
  }).outputText;
  const exports:any={};runInNewContext(source,{exports,require:(name:string)=>{assert.ok(name in modules,name);return modules[name];}});
  return {ports:exports.ownFlightReadPorts,calls,state,evidenceFlags};
}

test('native list opts into snapshot evidence and captures the selected activation context',async()=>{
  const f=detailGuardFixture(),session=await f.ports.open();
  try{
    assert.equal(session.detailContext(),undefined);
    await session.service.readStored();
    assert.deepEqual(f.evidenceFlags,[true]);
    const context=session.detailContext();
    assert.equal(context.leaseId,'lease');assert.equal(context.selectionIdentity,'verified-activation-chain');
    assert.equal(f.calls.selects,1);assert.equal(f.calls.selectionOpens,1);
    assert.equal(f.calls.candidateCloses,1);assert.equal(f.calls.selectionCloses,1);
  }finally{await session.close();}
  assert.equal(f.calls.registryCloses,1);assert.equal(f.calls.disposes,1);
});

test('native detail guards reuse one journal across pre/post checks without selecting or opening a candidate',async()=>{
  const f=detailGuardFixture(),session=await f.ports.open();
  const context={leaseId:'lease',selectionIdentity:'verified-activation-chain'};
  try{
    await session.assertDetailContext(context);
    await session.assertDetailContext(context);
    assert.equal(f.calls.selectionOpens,1);assert.equal(f.calls.selects,0);assert.equal(f.calls.candidateCloses,0);
    assert.deepEqual(f.calls.identities,['verified-activation-chain','verified-activation-chain']);
    assert.equal(f.calls.restore,5,'session admission plus both sides of each context check');
    assert.equal(f.calls.owner,4);
    assert.equal(f.calls.selectionCloses,0,'guard journal stays open until session cleanup');
  }finally{await session.close();await session.close();}
  assert.equal(f.calls.selectionCloses,1);assert.equal(f.calls.registryCloses,1);assert.equal(f.calls.disposes,1);
});

for(const mode of ['lease','owner-before','owner-after','restore-before','restore-after','selection','missing-selection'] as const)
test(`native detail context rejects ${mode} and cleans up`,async()=>{
  const f=detailGuardFixture(),session=await f.ports.open();
  const context={leaseId:mode==='lease'?'other-lease':'lease',selectionIdentity:'verified-activation-chain'};
  if(mode==='owner-before')f.state.failOwnerAt=1;
  if(mode==='owner-after')f.state.failOwnerAt=2;
  if(mode==='restore-before')f.state.failRestoreAt=2;
  if(mode==='restore-after')f.state.failRestoreAt=3;
  if(mode==='selection')f.state.failSelection=true;
  if(mode==='missing-selection')f.state.missingSelection=true;
  try{
    await assert.rejects(session.assertDetailContext(context),/lease changed|Pending restore|Selection changed|selection is unavailable/);
    assert.equal(f.calls.selects,0);assert.equal(f.calls.candidateCloses,0);
    const rejectedBeforeOpen=['lease','owner-before','restore-before'].includes(mode);
    assert.equal(f.calls.selectionOpens,rejectedBeforeOpen?0:1);
  }finally{await session.close();}
  assert.equal(f.calls.selectionCloses,f.calls.selectionOpens&&mode!=='missing-selection'?1:0);
  assert.equal(f.calls.registryCloses,1);assert.equal(f.calls.disposes,1);
});

test('native second detail context check rejects a selection change while retaining one guard journal',async()=>{
  const f=detailGuardFixture(),session=await f.ports.open();
  const context={leaseId:'lease',selectionIdentity:'verified-activation-chain'};
  try{
    await session.assertDetailContext(context);f.state.failSelection=true;
    await assert.rejects(session.assertDetailContext(context),/Selection changed/);
    assert.equal(f.calls.selectionOpens,1);assert.equal(f.calls.selects,0);assert.equal(f.calls.identities.length,2);
  }finally{await session.close();}
  assert.equal(f.calls.selectionCloses,1);assert.equal(f.calls.registryCloses,1);
});

test('native guard journal close failure still closes registry and releases serialized read admission',async()=>{
  const f=detailGuardFixture(),session=await f.ports.open();
  await session.assertDetailContext({leaseId:'lease',selectionIdentity:'verified-activation-chain'});
  f.state.failClose=true;
  await assert.rejects(session.close(),/Selection close failed/);
  assert.equal(f.calls.registryCloses,1);
  const next=await f.ports.open();await next.close();
  assert.equal(f.calls.registryCloses,2);assert.equal(f.calls.disposes,2);
});

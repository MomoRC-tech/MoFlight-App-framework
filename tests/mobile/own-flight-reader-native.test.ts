import { startPreviewFixture } from './start-preview-fixture';
import * as startPreview from '../../apps/platform-lab/src/mobile/start-preview.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as reader from '../../apps/platform-lab/src/mobile/own-flight-reader.ts';
import * as trace from '../../apps/platform-lab/src/local-read-diagnostics.ts';
import * as medical from '../../apps/platform-lab/src/mobile/medical-source.ts';
import { DiagnosticJournal } from '../../apps/platform-lab/src/diagnostics.ts';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RealOwnerRegistry } from '../../apps/platform-lab/src/vereinsflieger/real-owner-registry.ts';
import { nodeDriver } from './sqlite-driver.ts';
import { ownFlightFixture } from './own-flight-fixture.ts';

test('native read binds selection timings to its originating operation and shares information loading across sections',async()=>{
  const journal=new DiagnosticJournal(),operation=journal.begin('read-flights');
  const scope={owner:'owner',connectionId:'connection',context:{accountNumber:'101'}};
  const lease={ownerId:'owner',storeId:'store',leaseId:'lease',selectionSeq:1};
  let informationLoads=0,registryCloses=0,selectedTiming:unknown,servicePorts:any;
  class Service { constructor(...args:any[]){servicePorts=args[3];} dispose(){} }
  const modules:Record<string,unknown>={
    './start-preview':startPreview,'./start-preview-native':{loadStartPreviewCache:async()=>null,saveStartPreviewCache:async()=>{},clearStartPreviewCache:async()=>{}},'../local-read-diagnostics':trace,'@moflight/flight-logbook':{canonical:JSON.stringify},'expo-crypto':{randomUUID:()=> 'synthetic'},
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

function detailGuardFixture(openRegistry?: () => Promise<RealOwnerRegistry>) {
  const lease={ownerId:'owner',storeId:'store',leaseId:'lease',selectionSeq:1};
  const flights=ownFlightFixture();
  const calls={restore:0,owner:0,selectionOpens:0,selects:0,identities:[] as string[],selectionCloses:0,registryCloses:0,candidateCloses:0,disposes:0};
  const state={failRestoreAt:0,failOwnerAt:0,failSelection:false,missingSelection:false,failClose:false,pendingCommand:false,pendingRestore:false,previewText:null as string|null,providerScope:null as any,cacheSaves:0};
  const evidenceFlags:boolean[]=[];
  class Service {
    constructor(private readonly owner:string,private readonly store:string,_lease:unknown,private readonly ports:any){}
    async readStored(_initial:unknown,_span:unknown,includeEvidence:boolean){
      evidenceFlags.push(includeEvidence);
      const repository=await this.ports.repository();
      try{return {snapshot:{...flights.snapshot,ownerId:this.owner,storeId:this.store},flights:flights.flights,
        detailSource:{detail:()=>structuredClone(flights.detail)}};}finally{await repository.close();}
    }
    dispose(){calls.disposes++;}
  }
  const modules:Record<string,unknown>={
    './start-preview':startPreview,'./start-preview-native':{loadStartPreviewCache:async()=>state.previewText,saveStartPreviewCache:async(_store:string,text:string,gate:()=>Promise<void>)=>{await gate();state.previewText=text;state.cacheSaves++;await gate();},clearStartPreviewCache:async()=>{state.previewText=null;}},'../local-read-diagnostics':trace,'@moflight/flight-logbook':{canonical:JSON.stringify},'expo-crypto':{randomUUID:()=> 'synthetic'},
    '../storage':{hash:async()=> 'a'.repeat(64)},'./own-flight-reader':reader,'./medical-source':medical,
    '../vereinsflieger/real-flight-service':{RealFlightService:Service},
    '../vereinsflieger/scoped-storage':{loadProviderScope:async()=>state.providerScope},
    '../vereinsflieger/information-native':{loadInformation:async()=>[]},
    '../vereinsflieger/duty-native':{loadDutyRoster:async()=>null},
    '../user-backup-restore-journal-native':{assertNoPendingUserBackupRestore:async()=>{
      if(++calls.restore===state.failRestoreAt)throw new Error('Pending restore');
    }},
    '../vereinsflieger/real-flight-native':{
      openRealFlightCommandJournal:async()=>({pending:async()=>state.pendingCommand?{}:null,close:async()=>{}}),
      openOwnerRegistry:openRegistry??(async()=>({currentOwner:async()=>lease,assertCurrent:async()=>{
        if(++calls.owner===state.failOwnerAt)throw new Error('Owner lease changed');
      },close:async()=>{calls.registryCloses++;}})),
      openRealFlightSelection:async()=>{
        calls.selectionOpens++;
        if(state.missingSelection)return null;
        return {
          listRestorePreparations:async()=>state.pendingRestore?[{status:'pending'}]:[],
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

test('native displayed detail survives fresh owner leases and rejects owner switches including away and back',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'moflight-detail-lifecycle-')),path=join(directory,'registry.sqlite');
  let nextUuid=1;
  const uuid=()=>`00000000-0000-4000-8000-${(nextUuid++).toString(16).padStart(12,'0')}`;
  const at='2026-10-26T10:00:00.000Z';
  const registry=await RealOwnerRegistry.create(nodeDriver(path),uuid,at);
  const first=await registry.createFreshOwner(at);
  const issued:string[]=[];
  const f=detailGuardFixture(async()=>{
    const opened=await RealOwnerRegistry.open(nodeDriver(path),uuid);
    const currentOwner=opened.currentOwner.bind(opened);
    opened.currentOwner=async()=>{const lease=await currentOwner();if(lease)issued.push(lease.leaseId);return lease;};
    return opened;
  });
  try{
    const view=await reader.readOwnFlightView(f.ports);assert.ok(view?.detailContext);
    const selected=view.flights[0]!;
    assert.equal(issued.length,1);
    for(let attempt=0;attempt<3;attempt++){
      assert.equal((await reader.readOwnFlightDetail(f.ports,view.snapshot,selected,view)).flightId,selected.flightId);
    }
    assert.equal(new Set(issued).size,4,'list and every detail must use separately issued registry leases');
    assert.equal(f.calls.selects,1,'retained details must not reopen or validate the full candidate');
    const second=await registry.createFreshOwner(at);
    await assert.rejects(reader.readOwnFlightDetail(f.ports,view.snapshot,selected,view),reader.OwnFlightChangedError);
    await registry.selectOwner(first.ownerId,at,second);
    await assert.rejects(reader.readOwnFlightDetail(f.ports,view.snapshot,selected,view),/owner selection changed/);
    const refreshed=await reader.readOwnFlightView(f.ports);assert.ok(refreshed);
    assert.equal((await reader.readOwnFlightDetail(f.ports,refreshed.snapshot,refreshed.flights[0]!,refreshed)).flightId,selected.flightId);
  }finally{await registry.close();await rm(directory,{recursive:true,force:true});}
});

test('native list opts into snapshot evidence and captures the selected activation context',async()=>{
  const f=detailGuardFixture(),session=await f.ports.open();
  try{
    assert.equal(session.detailContext(),undefined);
    await session.service.readStored();
    assert.deepEqual(f.evidenceFlags,[true]);
    const context=session.detailContext();
    assert.equal(context.ownerSelectionSeq,1);assert.equal(context.selectionIdentity,'verified-activation-chain');
    assert.equal(f.calls.selects,1);assert.equal(f.calls.selectionOpens,1);
    assert.equal(f.calls.candidateCloses,1);assert.equal(f.calls.selectionCloses,1);
  }finally{await session.close();}
  assert.equal(f.calls.registryCloses,1);assert.equal(f.calls.disposes,1);
});

test('native detail guards reuse one journal across pre/post checks without selecting or opening a candidate',async()=>{
  const f=detailGuardFixture(),session=await f.ports.open();
  const context={ownerSelectionSeq:1,selectionIdentity:'verified-activation-chain'};
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

for(const mode of ['owner-selection','owner-before','owner-after','restore-before','restore-after','selection','missing-selection'] as const)
test(`native detail context rejects ${mode} and cleans up`,async()=>{
  const f=detailGuardFixture(),session=await f.ports.open();
  const context={ownerSelectionSeq:mode==='owner-selection'?2:1,selectionIdentity:'verified-activation-chain'};
  if(mode==='owner-before')f.state.failOwnerAt=1;
  if(mode==='owner-after')f.state.failOwnerAt=2;
  if(mode==='restore-before')f.state.failRestoreAt=2;
  if(mode==='restore-after')f.state.failRestoreAt=3;
  if(mode==='selection')f.state.failSelection=true;
  if(mode==='missing-selection')f.state.missingSelection=true;
  try{
    await assert.rejects(session.assertDetailContext(context),/lease changed|owner selection changed|Pending restore|Selection changed|selection is unavailable/);
    assert.equal(f.calls.selects,0);assert.equal(f.calls.candidateCloses,0);
    const rejectedBeforeOpen=['owner-selection','owner-before','restore-before'].includes(mode);
    assert.equal(f.calls.selectionOpens,rejectedBeforeOpen?0:1);
  }finally{await session.close();}
  assert.equal(f.calls.selectionCloses,f.calls.selectionOpens&&mode!=='missing-selection'?1:0);
  assert.equal(f.calls.registryCloses,1);assert.equal(f.calls.disposes,1);
});

test('native second detail context check rejects a selection change while retaining one guard journal',async()=>{
  const f=detailGuardFixture(),session=await f.ports.open();
  const context={ownerSelectionSeq:1,selectionIdentity:'verified-activation-chain'};
  try{
    await session.assertDetailContext(context);f.state.failSelection=true;
    await assert.rejects(session.assertDetailContext(context),/Selection changed/);
    assert.equal(f.calls.selectionOpens,1);assert.equal(f.calls.selects,0);assert.equal(f.calls.identities.length,2);
  }finally{await session.close();}
  assert.equal(f.calls.selectionCloses,1);assert.equal(f.calls.registryCloses,1);
});

test('native guard journal close failure still closes registry and releases serialized read admission',async()=>{
  const f=detailGuardFixture(),session=await f.ports.open();
  await session.assertDetailContext({ownerSelectionSeq:1,selectionIdentity:'verified-activation-chain'});
  f.state.failClose=true;
  await assert.rejects(session.close(),/Selection close failed/);
  assert.equal(f.calls.registryCloses,1);
  const next=await f.ports.open();await next.close();
  assert.equal(f.calls.registryCloses,2);assert.equal(f.calls.disposes,2);
});


test('native Start preview admission verifies owner, scope, activation and recovery without opening history',async()=>{
  const now=Date.now(),f=startPreviewFixture(now);
  for(const failure of ['none','owner','selection','pending','restore','foreign-scope']){
    const h=detailGuardFixture();
    h.state.previewText=JSON.stringify(f.preview);h.state.providerScope=f.scope;
    if(failure==='owner')h.state.failOwnerAt=1;
    if(failure==='selection')h.state.failSelection=true;
    if(failure==='pending')h.state.pendingCommand=true;
    if(failure==='restore')h.state.pendingRestore=true;
    if(failure==='foreign-scope')h.state.providerScope={...f.scope,context:{...f.scope.context,accountNumber:'202'}};
    const session=await h.ports.open();
    try{
      if(failure==='none')assert.deepEqual(await session.readStartPreview(),f.preview);
      else if(failure==='foreign-scope')assert.equal(await session.readStartPreview(),null);
      else await assert.rejects(session.readStartPreview());
      assert.equal(h.calls.selects,0);assert.equal(h.calls.candidateCloses,0,'preview never opens/replays any candidate');
    }finally{await session.close();}
    assert.equal(h.calls.registryCloses,1);
  }
});


test('native cache stores verified Start values and unchanged revalidation avoids rewriting or recomputing the preview',async()=>{
  const f=startPreviewFixture(Date.now()),h=detailGuardFixture();h.state.providerScope=f.scope;
  let session=await h.ports.open();
  await session.saveStartPreview(f.view);await session.close();
  assert.equal(h.state.cacheSaves,1);assert.equal(JSON.parse(h.state.previewText!).dashboard.current.time,'2:00');
  session=await h.ports.open();
  assert.ok(await session.readStartPreview());
  await session.saveStartPreview(f.view);assert.equal(h.state.cacheSaves,1);
  await session.saveStartPreview({...f.view,snapshot:{...f.snapshot,recovery:{readOnly:true,warning:'Synthetic recovery'}}});
  assert.equal(h.state.previewText,null,'recovery invalidates cache even when its source revision is unchanged');
  await session.close();
});

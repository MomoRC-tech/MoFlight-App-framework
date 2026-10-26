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

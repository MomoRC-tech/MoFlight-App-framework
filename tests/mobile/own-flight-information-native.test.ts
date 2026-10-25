import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { canonical } from '../../packages/flight-logbook/src/index';
const compiled=ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/mobile/own-flight-reader-native.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
test('native Medical and feature reads share only their admitted session and reject changed account, scope or owner',async()=>{
 for(const mode of ['same','account','scope','owner','closed'] as const){
  let reads=0, revoked=false;
  let selected={owner:'owner',connectionId:'connection',context:{accountNumber:'101'}};
  const registry={currentOwner:async()=>({ownerId:'owner',storeId:'store',leaseId:'lease'}),assertCurrent:async()=>{if(revoked)throw new Error('revoked');},close:async()=>{}};
  const modules:Record<string,unknown>={
   '../local-read-diagnostics':{traceLocalRead:(_stage:unknown,work:()=>unknown)=>work()},'@moflight/flight-logbook':{canonical},'expo-crypto':{randomUUID:()=>''},'../storage':{hash:()=>''},
   '../vereinsflieger/real-flight-native':{openOwnerRegistry:async()=>registry},
   '../vereinsflieger/real-flight-service':{RealFlightService:class{dispose(){}}},
   './own-flight-reader':{serializeOwnFlightReads:(ports:unknown)=>ports},
   '../vereinsflieger/scoped-storage':{loadProviderScope:async()=>selected},
   '../vereinsflieger/information-native':{loadInformation:async()=>{reads++;return [];}},
   './medical-source':{medicalSource:()=>null},'../vereinsflieger/duty-native':{},
   '../user-backup-restore-journal-native':{assertNoPendingUserBackupRestore:async()=>{}},
  };
  const exports:Record<string,any>={};runInNewContext(compiled,{exports,require:(id:string)=>{if(!(id in modules))throw new Error(id);return modules[id];}});
  const session=await exports.ownFlightReadPorts.open();await session.readMedical('101');
  if(mode==='scope')selected={...selected,connectionId:'other'};
  if(mode==='owner')revoked=true;
  if(mode==='closed')await session.close();
  const work=session.readFeatureInformation(mode==='account'?'999':'101');
  if(mode==='same'){const result=await work;assert.equal(result.scope.owner,'owner');assert.equal(reads,1);}
  else await assert.rejects(work);
  assert.equal(reads,1);await session.close();
 }
});

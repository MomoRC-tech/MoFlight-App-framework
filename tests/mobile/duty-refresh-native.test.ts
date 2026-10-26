import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { canonical } from '../../packages/flight-logbook/src/index';
import * as duties from '../../apps/platform-lab/src/vereinsflieger/duties';
import type { ProviderScope } from '../../apps/platform-lab/src/vereinsflieger/scope-store';
import type { InformationCapture } from '../../apps/platform-lab/src/vereinsflieger/information';

const source=ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/vereinsflieger/duty-refresh-native.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const scope:ProviderScope={version:1,owner:'owner',connectionId:'connection',context:{accountNumber:'101',clubLabel:'Synthetic Club',clubIdentity:'display-label-only',verification:'observed-profile-number'}};
function capture(kind:'own'|'club'):InformationCapture{return {version:1,id:kind,retrievedAt:new Date().toISOString(),owner:scope.owner,connectionId:scope.connectionId,sourceIdentity:'provisional-observed-profile',category:'duties',path:kind==='own'?'/member/profile/myservices.php':'/member/community/serviceshedulelist.php',columns:[{key:'duty',label:'Dienst',index:0},{key:'period',label:'Zeitraum',index:1},{key:'people',label:'Person(en)',index:2}],rows:[],filters:[],empty:true,coverage:{kind:'visible-page',truncated:false,pagination:'unverified'}};}
test('two guarded source pages save atomically to duty cache; failures and scope change preserve previous snapshot',async()=>{
 for(const mode of ['success','club-fails','scope-change','background','save-fails','wrong-own-source','wrong-club-source','restore-pending'] as const){
  let current=scope,active=true,previous:unknown={prior:true},writes=0;
  const calls:string[]=[];
  const modules:Record<string,unknown>={'@moflight/flight-logbook':{canonical},'./scoped-storage':{loadProviderScope:async()=>current},'./duties':duties,'../user-backup-restore-journal-native':{assertNoPendingUserBackupRestore:async()=>{if(mode==='restore-pending')throw new Error('Restore is pending');}},'./duty-native':{
   saveAndLoadDutyRoster:async(_scope:unknown,value:unknown,gate:()=>void)=>{gate();if(mode==='save-fails')throw new Error('cache write failed');writes++;previous=value;return previous;},
  }};
  const exports={} as typeof import('../../apps/platform-lab/src/vereinsflieger/duty-refresh-native');
  runInNewContext(source,{exports,require:(name:string)=>{assert.ok(name in modules,name);return modules[name];},Date,Error});
  const work=exports.refreshDutyRoster(scope.owner,scope.context.accountNumber,{active:()=>active,readPage:async kind=>{
   calls.push(kind);if(kind==='club'&&mode==='club-fails')throw new Error('offline');
   if(kind==='club'&&mode==='scope-change')current={...scope,context:{...scope.context,accountNumber:'999'}};
   if(kind==='own'&&mode==='background')active=false;
   const value=capture(kind);
   if(kind==='own'&&mode==='wrong-own-source')value.path='/member/profile/allservicelist.php';
   if(kind==='club'&&mode==='wrong-club-source')value.path='/member/profile/allservicelist.php';
   return value;
  }});
  if(mode==='success'){assert.equal((await work).partial,true);assert.equal(writes,1);assert.deepEqual(calls,['own','club']);}
  else if(mode==='restore-pending'){await assert.rejects(work,/Restore is pending/);assert.equal(writes,0);assert.deepEqual(calls,[]);}
  else {await assert.rejects(work);assert.equal(writes,0);assert.deepEqual(previous,{prior:true});}
 }
});

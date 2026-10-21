import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as diagnostics from '../../apps/platform-lab/src/diagnostics';

const source=ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/mobile/diagnostics-native.ts',import.meta.url),'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:false},
}).outputText;
function fixture() {
  const journal=new diagnostics.DiagnosticJournal(),files=new Map<string,string>(),shared:{uri:string;content:string}[]=[];
  let clearFailure=false,writeFailure=false,available=true,holdExport=false,release:(()=>void)|null=null;
  const filePath='file:///documents/moflight-support-diagnostics-v1.json', exportPath='file:///documents/moflight-support-report.json';
  class File {
    uri:string;constructor(...parts:string[]){this.uri=parts.join('/');}
    get exists(){return files.has(this.uri);}get size(){return Buffer.byteLength(files.get(this.uri)??'');}
    textSync(){return files.get(this.uri)!;}delete(){if(clearFailure&&this.uri===exportPath)throw new Error('Private deletion error');files.delete(this.uri);}
  }
  const write=async(uri:string,text:string)=>{
    if(writeFailure)throw new Error('Private disk error');
    if(holdExport&&uri===exportPath)await new Promise<void>(done=>{release=done;});
    files.set(uri,text);assert.ok([...files.values()].reduce((sum,value)=>sum+Buffer.byteLength(value),0)<=diagnostics.DIAGNOSTIC_STORAGE_BYTES);
  };
  const modules:Record<string,unknown>={
    'expo-file-system':{File,Paths:{document:'file:///documents'}},'expo-file-system/legacy':{writeAsStringAsync:write},
    'expo-sharing':{isAvailableAsync:async()=>available,shareAsync:async(uri:string)=>{shared.push({uri,content:files.get(uri)!});}},
    'react-native':{Platform:{OS:'android',Version:37}},'expo':{requireOptionalNativeModule:()=>({diagnosticContextAsync:async()=>({appVersion:'0.1.0',buildVersion:'42',webViewVersion:'145.0.1',private:'never include'})})},
    '../../package.json':{version:'0.1.0'},'../diagnostics':{...diagnostics,diagnosticJournal:journal},
  };
  const exports:any={};runInNewContext(source,{exports,require:(name:string)=>{assert.ok(name in modules,name);return modules[name];},__DEV__:false,process:{env:{EXPO_PUBLIC_MOFLIGHT_SOURCE:'abcdef1234567'}}});
  return {journal,files,shared,filePath,exportPath,initialize:()=>exports.initializeDiagnostics(),share:()=>exports.shareDiagnosticFile(),
    failClear:()=>{clearFailure=true;},failWrite:()=>{writeFailure=true;},unavailable:()=>{available=false;},hold:()=>{holdExport=true;},release:()=>{assert.ok(release);release();},waiting:()=>!!release};
}

test('native full sharing uses only two capped files, excludes retention timestamps and includes public runtime context',async()=>{
  const f=fixture();f.initialize();await new Promise<void>(done=>{setImmediate(done);});
  for(let i=0;i<600;i++)f.journal.begin('read-flights').finish('success');
  await f.share();assert.equal(f.shared.length,1);assert.ok(Buffer.byteLength(f.shared[0]!.content)>32_000);
  const payload=JSON.parse(f.shared[0]!.content);assert.equal(payload.context.androidApi,37);assert.equal(payload.context.webViewVersion,'145.0.1');assert.equal(payload.context.buildSource,'abcdef1234567');
  assert.ok(!f.shared[0]!.content.includes('retainedAt'));assert.ok(!f.shared[0]!.content.includes('never include'));assert.deepEqual([...f.files.keys()].sort(),[f.filePath,f.exportPath].sort());
  f.journal.clear();await f.journal.flush();assert.equal(f.files.has(f.exportPath),false);assert.deepEqual(JSON.parse(f.files.get(f.filePath)!).entries,[]);
});

test('clear during delayed export prevents stale report recreation or sharing',async()=>{
  const f=fixture();f.initialize();f.journal.begin('update-flights').finish('failed');f.hold();const pending=f.share();
  for(let i=0;i<20&&!f.waiting();i++)await new Promise<void>(done=>{setImmediate(done);});assert.equal(f.waiting(),true);
  f.journal.clear();f.release();await pending;await f.journal.flush();assert.equal(f.shared.length,0);assert.equal(f.files.has(f.exportPath),false);assert.deepEqual(f.journal.snapshot(),[]);
});

test('unavailable sharing and write failures retain in-memory data and surface the failed persistence',async()=>{
  const f=fixture();f.initialize();f.journal.begin('read-flights').finish('success');f.unavailable();await assert.rejects(f.share());assert.equal(f.journal.snapshot().length,1);
  f.failWrite();await f.journal.flush();assert.equal(f.journal.storageFailed,true);assert.equal(f.journal.snapshot().length,1);
});

test('failed export deletion stays visible despite successful journal writes',async()=>{
  const f=fixture();f.initialize();f.journal.begin('read-flights').finish('success');await f.share();f.failClear();f.journal.clear();await f.journal.flush();assert.equal(f.journal.storageFailed,true);assert.equal(f.files.has(f.exportPath),true);
});

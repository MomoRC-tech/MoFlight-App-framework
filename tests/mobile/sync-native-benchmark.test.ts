import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,copyFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {nodeDriver} from './sqlite-driver.ts';
import * as domain from '../../packages/flight-logbook/src/index.ts';
import * as library from '../../apps/platform-lab/src/vereinsflieger/real-flight-library.ts';
import * as journal from '../../apps/platform-lab/src/vereinsflieger/real-flight-command-journal.ts';
import * as service from '../../apps/platform-lab/src/vereinsflieger/real-flight-service.ts';
import * as fixture from '../../apps/platform-lab/src/development/android-core-recovery-fixture.ts';
import * as responsiveness from '../../apps/platform-lab/src/development/android-flight-responsiveness.ts';
import * as verification from '../../apps/platform-lab/src/vereinsflieger/sync-verification-scope.ts';

// Two independent clones exercise repeatability; actual native measurement keeps
// the runners' default five trials. Host contract checks make no speed claim.
test('verification benchmark preserves graph equality and reuse across independent SQLite trials',async(t)=>{
  t.mock.method(console,'info',()=>{});
  const directory=mkdtempSync(join(tmpdir(),'moflight-verification-benchmark-'));
  class Directory{uri:string;constructor(parent:string|Directory,name:string){this.uri=join(typeof parent==='string'?parent:parent.uri,name);}create(){mkdirSync(this.uri,{recursive:true});}}
  class File{path:string;constructor(parent:Directory,name:string){this.path=join(parent.uri,name);}get exists(){return existsSync(this.path);}async copy(target:File){copyFileSync(this.path,target.path);}async base64(){return readFileSync(this.path).toString('base64');}write(value:string){writeFileSync(this.path,value);}}
  const code=ts.transpileModule(readFileSync('apps/platform-lab/src/development/sync-verification-benchmark.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports:{runSyncVerificationBenchmark?:(active:()=>boolean,update:(value:string)=>void,count:number,trials:number)=>Promise<{samples:{variant:string;openReplays:number;graphSha256:string;graphHits:number}[]}>}={};
  const modules:Record<string,unknown>={'expo-file-system':{Directory,File,Paths:{cache:directory}},'@moflight/flight-logbook':domain,
    'expo-sqlite':{openDatabaseAsync:async(name:string,_options:unknown,root:string)=>nodeDriver(join(root,name))},
    '../vereinsflieger/real-flight-native-driver':{openRealFlightNativeDriver:async(name:string,opener:(name:string)=>Promise<unknown>)=>opener(name)},
    '../storage':{hash:async(value:string)=>createHash('sha256').update(value).digest('hex')},
    '../vereinsflieger/real-flight-library':library,'../vereinsflieger/real-flight-command-journal':journal,'../vereinsflieger/real-flight-service':service,
    '../vereinsflieger/sync-verification-scope':verification,'./android-core-recovery-fixture':fixture,'./android-flight-responsiveness':responsiveness};
  try{
    runInNewContext(code,{exports,require:(name:string)=>{assert.ok(name in modules,name);return modules[name];},performance,console:{info:()=>{}},Date});
    const report=await exports.runSyncVerificationBenchmark!(()=>true,()=>{},3,2);
    assert.equal(report.samples.length,4);assert.equal(new Set(report.samples.map(s=>s.graphSha256)).size,1);
    for(const sample of report.samples){assert.equal(sample.openReplays,sample.variant==='control'?3:1);assert.equal(sample.graphHits,sample.variant==='control'?0:2);}
  }finally{assert.equal(dirname(directory),tmpdir());rmSync(directory,{recursive:true,force:true});}
});

test('native benchmark preserves complete graphs across independent clones of every scenario',async(t)=>{
  t.mock.method(console,'info',()=>{});
  const directory=mkdtempSync(join(tmpdir(),'moflight-native-benchmark-'));
  class Directory{uri:string;constructor(parent:string|Directory,name:string){this.uri=join(typeof parent==='string'?parent:parent.uri,name);}create(){mkdirSync(this.uri,{recursive:true});}}
  class File{path:string;constructor(parent:Directory,name:string){this.path=join(parent.uri,name);}get exists(){return existsSync(this.path);}async copy(target:File){await new Promise(resolve=>{setTimeout(resolve,5);});copyFileSync(this.path,target.path);}async base64(){return readFileSync(this.path).toString('base64');}write(value:string){writeFileSync(this.path,value);}}
  const code=ts.transpileModule(readFileSync('apps/platform-lab/src/development/sync-native-benchmark.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports:{runSyncNativeBenchmark?:(update:(value:string)=>void,count:number,trials:number)=>Promise<{samples:{scenario:string;trial:number;graphSha256:string;receipts:number}[]}>}={};
  const modules:Record<string,unknown>={'expo-file-system':{Directory,File,Paths:{cache:directory}},'@moflight/flight-logbook':domain,
    'expo-sqlite':{openDatabaseAsync:async(name:string,_options:unknown,root:string)=>nodeDriver(join(root,name))},
    '../vereinsflieger/real-flight-native-driver':{openRealFlightNativeDriver:async(name:string,opener:(name:string)=>Promise<unknown>)=>opener(name)},
    '../storage':{hash:async(value:string)=>createHash('sha256').update(value).digest('hex'),openDriver:async(name:string,root:string)=>nodeDriver(join(root,name))},
    '../vereinsflieger/real-flight-library':library,'../vereinsflieger/real-flight-command-journal':journal,'../vereinsflieger/real-flight-service':service,
    './android-core-recovery-fixture':fixture,'./android-flight-responsiveness':responsiveness};
  try{
    runInNewContext(code,{exports,require:(name:string)=>{if(!(name in modules))throw new Error(name);return modules[name];},performance,console:{info:()=>{}},Date});
    const report=await exports.runSyncNativeBenchmark!(()=>{},3,2);assert.equal(report.samples.length,8);
    for(const scenario of ['first','unchanged','changed','reopened']){const rows=report.samples.filter(row=>row.scenario===scenario);assert.equal(rows.length,2);assert.equal(new Set(rows.map(row=>row.graphSha256)).size,1);}
  }finally{assert.equal(dirname(directory),tmpdir());rmSync(directory,{recursive:true,force:true});}
});

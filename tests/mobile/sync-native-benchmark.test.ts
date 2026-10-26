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

test('native fixed-state benchmark preserves complete graphs across five independent clones per scenario',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'moflight-native-benchmark-'));
  class Directory{uri:string;constructor(parent:string|Directory,name:string){this.uri=join(typeof parent==='string'?parent:parent.uri,name);}create(){mkdirSync(this.uri,{recursive:true});}}
  class File{path:string;constructor(parent:Directory,name:string){this.path=join(parent.uri,name);}get exists(){return existsSync(this.path);}async copy(target:File){await new Promise(resolve=>setTimeout(resolve,5));copyFileSync(this.path,target.path);}async base64(){return readFileSync(this.path).toString('base64');}write(value:string){writeFileSync(this.path,value);}}
  const code=ts.transpileModule(readFileSync('apps/platform-lab/src/development/sync-native-benchmark.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports:{runSyncNativeBenchmark?:(update:(value:string)=>void,count:number)=>Promise<{samples:{scenario:string;trial:number;graphSha256:string;receipts:number}[]}>}={};
  const modules:Record<string,unknown>={'expo-file-system':{Directory,File,Paths:{cache:directory}},'@moflight/flight-logbook':domain,
    'expo-sqlite':{openDatabaseAsync:async(name:string,_options:unknown,root:string)=>nodeDriver(join(root,name))},
    '../vereinsflieger/real-flight-native-driver':{openRealFlightNativeDriver:async(name:string,opener:(name:string)=>Promise<unknown>)=>opener(name)},
    '../storage':{hash:async(value:string)=>createHash('sha256').update(value).digest('hex'),openDriver:async(name:string,root:string)=>nodeDriver(join(root,name))},
    '../vereinsflieger/real-flight-library':library,'../vereinsflieger/real-flight-command-journal':journal,'../vereinsflieger/real-flight-service':service,
    './android-core-recovery-fixture':fixture,'./android-flight-responsiveness':responsiveness};
  try{
    runInNewContext(code,{exports,require:(name:string)=>{if(!(name in modules))throw new Error(name);return modules[name];},performance,console:{info:()=>{}},Date});
    const report=await exports.runSyncNativeBenchmark!(()=>{},3);assert.equal(report.samples.length,20);
    for(const scenario of ['first','unchanged','changed','reopened']){const rows=report.samples.filter(row=>row.scenario===scenario);assert.equal(rows.length,5);assert.equal(new Set(rows.map(row=>row.graphSha256)).size,1);}
  }finally{assert.equal(dirname(directory),tmpdir());rmSync(directory,{recursive:true,force:true});}
});

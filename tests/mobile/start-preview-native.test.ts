import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { nodeDriver } from './sqlite-driver';
import * as contract from '../../apps/platform-lab/src/vereinsflieger/real-history-contract';
import * as preview from '../../apps/platform-lab/src/mobile/start-preview';

test('disposable native cache persists atomically across reopen, isolates stores and never creates a missing read store',async()=>{
  const root=await mkdtemp(join(tmpdir(),'moflight-start-'));
  const store='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
  const opened:string[]=[];
  class Directory {
    uri:string;
    constructor(parent:string,name:string){this.uri=join(parent,name);}
    create(){mkdirSync(this.uri,{recursive:true});}
  }
  const source=ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/mobile/start-preview-native.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  const load=()=>{
    const modules:Record<string,unknown>={
      'expo-file-system':{Paths:{cache:root},Directory,File:class{constructor(private directory:Directory,private name:string){}get exists(){return existsSync(join(this.directory.uri,this.name));}}},
      '../storage':{openDriver:async(name:string,directory:string)=>{opened.push(name);return nodeDriver(join(directory,name));}},
      '../vereinsflieger/real-history-contract':contract,'./start-preview':preview,
    };
    const exports:any={};runInNewContext(source,{exports,encodeURIComponent,require:(name:string)=>{assert.ok(name in modules,name);return modules[name];}});return exports;
  };
  try{
    const cache=load();
    assert.equal(await cache.loadStartPreviewCache(store),null);assert.equal(opened.length,0);
    let gates=0;const gate=async()=>{gates++;};
    await cache.saveStartPreviewCache(store,'{"saved":"first"}',gate);assert.equal(gates,3);
    assert.equal(await load().loadStartPreviewCache(store),'{"saved":"first"}','fresh adapter sees the closed committed cache');
    assert.equal(await cache.loadStartPreviewCache(other),null);
    let checks=0;
    await assert.rejects(cache.saveStartPreviewCache(store,'{"saved":"blocked"}',async()=>{if(++checks===2)throw new Error('Writer started');}));
    assert.equal(await cache.loadStartPreviewCache(store),'{"saved":"first"}');
    await cache.saveStartPreviewCache(store,'x'.repeat(preview.START_PREVIEW_LIMIT+1),gate);
    assert.equal(await cache.loadStartPreviewCache(store),'{"saved":"first"}');
    await assert.rejects(cache.loadStartPreviewCache('../foreign'));
    await cache.clearStartPreviewCache(store);assert.equal(await cache.loadStartPreviewCache(store),null);
  }finally{await rm(root,{recursive:true,force:true});}
});

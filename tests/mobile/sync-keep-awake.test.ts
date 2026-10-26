import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source=ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/mobile/SyncKeepAwake.tsx',import.meta.url),'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React},
}).outputText;

function fixture(){
  let foreground=true;
  const activations:string[]=[];
  const react={createElement:(type:unknown,props:unknown)=>({type,props})};
  const exports:Record<string,any>={};
  runInNewContext(source+'\nexports.SyncKeepAwake=SyncKeepAwake;',{
    exports,
    require:(name:string)=>name==='react'?react:name==='expo-keep-awake'?{useKeepAwake:(tag:string)=>activations.push(tag)}:name==='./SyncProgress'?{useForeground:()=>foreground}:undefined,
  });
  return {render:(active:boolean)=>exports.SyncKeepAwake({active}),activations,setForeground:(value:boolean)=>{foreground=value;}};
}

test('screen awake owner mounts only during active foreground Sync',()=>{
  const f=fixture();
  assert.equal(f.render(false),null,'idle, failed, and partial states pass inactive');
  f.setForeground(false);assert.equal(f.render(true),null,'background Sync does not keep the display awake');
  f.setForeground(true);
  const lock=f.render(true);assert.ok(lock,'active or waiting foreground Sync mounts the keep-awake owner');
  assert.equal(lock.type(),null);
  assert.deepEqual(f.activations,['moflight-sync']);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { chartOrder } from '../../apps/platform-lab/src/mobile/statistics-charts-model';
function fixture(){
  const saved=new Map<string,string>(),keys=new Map<string,string>();let fail=false;
  const source=ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/mobile/statistics-chart-preferences-native.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  const modules:Record<string,any>={'expo-crypto':{CryptoDigestAlgorithm:{SHA256:'SHA256'},digestStringAsync:async(_:string,scope:string)=>{if(!keys.has(scope))keys.set(scope,`hash${keys.size}`);return keys.get(scope);}},'expo-secure-store':{getItemAsync:async(k:string)=>{if(fail)throw Error('storage');return saved.get(k)??null;},setItemAsync:async(k:string,v:string)=>{if(fail)throw Error('storage');saved.set(k,v);}},'./statistics-charts-model':{chartOrder}};
  const exports:any={};runInNewContext(source,{exports,require:(name:string)=>{assert.ok(name in modules,name);return modules[name];}});return{...exports,saved,setFailure:(value:boolean)=>{fail=value;}};
}
test('chart choice and collapse survive reopen without crossing account/store scope',async()=>{
  const f=fixture();assert.equal((await f.readChartPreference('owner-a/store-a')).chart,'monthly');
  await f.saveChartPreference('owner-a/store-a',{chart:'timeline',expanded:false});
  assert.equal((await f.readChartPreference('owner-a/store-a')).expanded,false);
  assert.equal((await f.readChartPreference('owner-a/store-a')).chart,'timeline');
  assert.equal((await f.readChartPreference('owner-b/store-a')).chart,'monthly');
  assert.equal((await f.readChartPreference('owner-a/store-b')).expanded,true);
  assert.ok([...f.saved.keys()].every((key:string)=>!key.includes('owner')));
});
test('rapid saves keep the latest preference, corrupt values and storage failures propagate',async()=>{
  const f=fixture();await Promise.all([f.saveChartPreference('a',{chart:'timeline',expanded:false}),f.saveChartPreference('a',{chart:'roles',expanded:true})]);
  assert.equal((await f.readChartPreference('a')).chart,'roles');
  const key=[...f.saved.keys()][0]!;f.saved.set(key,'{"chart":"invented","expanded":true}');await assert.rejects(f.readChartPreference('a'));
  f.setFailure(true);await assert.rejects(f.saveChartPreference('a',{chart:'roles',expanded:false}));await assert.rejects(f.readChartPreference('a'));
});

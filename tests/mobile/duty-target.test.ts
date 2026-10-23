import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import * as model from '../../apps/platform-lab/src/mobile/cockpit-season.ts';

function fixture() {
  const files=new Map<string,string>(),hooks:any[]=[];
  let index=0,failWrite=false;const effects:(()=>void)[]=[],cleanups=new Map<number,()=>void>();
  const react={useRef:(value:any)=>{const i=index++;return hooks[i]??=( {current:value} );},
    useState:(value:any)=>{const i=index++;if(!(i in hooks))hooks[i]=value;return [hooks[i],(next:any)=>{hooks[i]=next;}];},
    useEffect:(effect:()=>any,deps:any[])=>{const i=index++;if(!hooks[i]||deps.some((v,n)=>v!==hooks[i][n])){hooks[i]=deps;effects.push(()=>{cleanups.get(i)?.();cleanups.set(i,effect());});}}};
  class File {name:string;constructor(_root:any,name:string){this.name=name;}get exists(){return files.has(this.name);}async text(){return files.get(this.name)!;}write(value:string){if(failWrite)throw Error('disk');files.set(this.name,value);}}
  const source=ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/mobile/DutyTarget.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
  const modules:any={react:{default:react,...react},'react-native':{},'./theme':{},'expo-file-system':{File,Paths:{document:'synthetic'}},'../storage':{hash:async(value:string)=>Buffer.from(value).toString('hex')},'./cockpit-season':model};
  const exports:any={};runInNewContext(source,{exports,require:(id:string)=>{assert.ok(id in modules);return modules[id];}});
  const render=(scope:string|null='owner/store/account',year=2026)=>{index=0;const result=exports.useDutyTarget(scope,year);effects.splice(0).forEach(fn=>fn());return result;};
  return {render,files,fail:()=>{failWrite=true;}};
}
const settle=()=>new Promise(resolve=>{setImmediate(resolve);});
test('local provisional target survives reload, isolates accounts and years, and preserves confirmed zero',async()=>{
  const f=fixture();let state=f.render();assert.equal(state.hours,25);await settle();assert.equal(await f.render().save('0'),true);
  assert.equal(f.render().hours,0);f.render('foreign');await settle();assert.equal(f.render('foreign').hours,25);
  f.render('owner/store/account',2025);await settle();assert.equal(f.render('owner/store/account',2025).hours,25);
  f.render();await settle();assert.equal(f.render().hours,0);assert.equal(f.files.size,1);
});
test('invalid input and failed writes are explicit; no account means no preference write',async()=>{
  const f=fixture();f.render();await settle();assert.equal(await f.render().save('25 EUR'),false);assert.equal(f.files.size,0);
  f.fail();assert.equal(await f.render().save('30'),false);assert.match(f.render().error,/nicht gespeichert/);assert.equal(f.render().hours,25);
  assert.equal(await f.render(null).save('30'),false);assert.equal(f.files.size,0);
});
test('an owner switch during awaited hashing cannot save under the incoming owner',async()=>{
  const f=fixture();f.render();await settle();const pending=f.render().save('40');f.render('other');assert.equal(await pending,false);assert.equal(f.files.size,0);
});

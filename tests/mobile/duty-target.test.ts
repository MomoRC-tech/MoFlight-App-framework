import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import * as model from '../../apps/platform-lab/src/mobile/cockpit-season.ts';
import * as calculation from '../../apps/platform-lab/src/mobile/annual-duty-calculation.ts';
import type { FeatureSource, WorkSummaryItem } from '../../apps/platform-lab/src/mobile/feature-information.ts';

function deferred() {
  let release!:()=>void;
  const promise=new Promise<void>(resolve=>{release=resolve;});
  return {promise,release};
}
function fixture(files=new Map<string,string>()) {
  const hooks:any[]=[],listeners=new Set<()=>void>();
  let index=0,failWrite=false,corruptRead=false,fileAccess=0;
  let nextRead:ReturnType<typeof deferred>|null=null;
  const effects:(()=>void)[]=[],cleanups=new Map<number,()=>void>();
  const react={createElement:(type:any,props:any,...children:any[])=>({type,props:props??{},children:children.flat(Infinity)}),
    useRef:(value:any)=>{const i=index++;return hooks[i]??={current:value};},
    useState:(value:any)=>{const i=index++;if(!(i in hooks))hooks[i]=value;return [hooks[i],(next:any)=>{hooks[i]=typeof next==='function'?next(hooks[i]):next;}];},
    useEffect:(effect:()=>any,deps:any[])=>{const i=index++;if(!hooks[i]||deps.some((v,n)=>v!==hooks[i][n])){hooks[i]=deps;effects.push(()=>{cleanups.get(i)?.();cleanups.set(i,effect());});}}};
  class File {
    name:string;constructor(_root:any,name:string){fileAccess++;this.name=name;}
    get exists(){return files.has(this.name);}
    async text(){const value=files.get(this.name)!;const gate=nextRead;nextRead=null;if(gate)await gate.promise;if(corruptRead){corruptRead=false;return 'corrupt';}return value;}
    write(value:string){if(failWrite)throw Error('disk');files.set(this.name,value);}
  }
  const source=ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/mobile/DutyTarget.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
  const modules:any={react:{default:react,...react},'react-native':{View:'View',TextInput:'TextInput'},'./theme':{startTileSurfaces:{card:'#164154',raised:'#235469',border:'#60889e'},Action:'Action',Label:'Label',colors:{}},'expo-file-system':{File,Paths:{document:'synthetic'}},'../duty-target-native':{ subscribeDutyTargets:(listener:()=>void)=>{listeners.add(listener);return()=>listeners.delete(listener);},
    async readDutyTargetNative(key:string) { const file=new File('synthetic',`cockpit-duty-${Buffer.from(key).toString('hex')}.json`); if(!file.exists)return null; const value=JSON.parse(await file.text());if(value.key!==key)throw Error('foreign');return value.hours; },
    async saveDutyTargetNative(key:string,hours:number,current:()=>boolean) { await Promise.resolve(); if(!current())return false; const file=new File('synthetic',`cockpit-duty-${Buffer.from(key).toString('hex')}.json`); const payload=JSON.stringify({version:1,key,hours});file.write(payload);if(await file.text()!==payload)throw Error('readback');return current(); },
    async readDutyCalculationNative(key:string){const text=files.get(`calculated-${key}`);return text?JSON.parse(text):null;},
    async saveDutyCalculationNative(key:string,value:unknown,current:()=>boolean){await Promise.resolve();if(!current())return null;if(failWrite)throw Error('disk');files.set(`calculated-${key}`,JSON.stringify(value));return value;},
    async clearDutyTargetNative(key:string,current:()=>boolean){await Promise.resolve();if(!current())return false;if(failWrite)throw Error('disk');files.delete(`cockpit-duty-${Buffer.from(key).toString('hex')}.json`);return true;}
  },'./cockpit-season':model,'./annual-duty-calculation':calculation};
  const exports:any={};runInNewContext(source,{exports,require:(id:string)=>{assert.ok(id in modules);return modules[id];}});
  const flush=()=>effects.splice(0).forEach(fn=>fn());
  const render=(scope:string|null='owner/store/account',year=2026,persistent=true,source?:FeatureSource<WorkSummaryItem>)=>{index=0;const result=exports.useDutyTarget(scope,year,persistent,source);flush();return result;};
  return {render,files,notify:()=>{listeners.forEach(listener=>listener());},fail:(value=true)=>{failWrite=value;},
    pauseRead:()=>{const gate=deferred();nextRead=gate;return gate.release;},corrupt:()=>{corruptRead=true;},accesses:()=>fileAccess,
    unmount:()=>{cleanups.forEach(fn=>fn?.());cleanups.clear();},
    editor:(target:any,onClose:()=>void)=>{index=0;const tree=exports.DutyTargetEditor({target,onClose});flush();return tree;}};
}
const settle=()=>new Promise(resolve=>{setImmediate(resolve);});
const summary=(performed='50,00 EUR',hours='5',retrievedAt='2026-05-01T12:00:00.000Z'):FeatureSource<WorkSummaryItem>=>({status:'partial',empty:false,truncated:false,filters:[],retrievedAt,items:[{key:'synthetic:0',period:'Jahr 2026',obligation:'150,00 EUR',performed,hours}]});
async function stabilize(f:ReturnType<typeof fixture>,source?:FeatureSource<WorkSummaryItem>,scope='owner/store/account',year=2026,persistent=true){
  for(let i=0;i<5;i++){f.render(scope,year,persistent,source);await settle();}
  return f.render(scope,year,persistent,source);
}

test('annual calculation persists after capping/reopen and resets separately from a manual override',async()=>{
  const f=fixture();let state=await stabilize(f,summary());
  assert.equal(state.hours,15);assert.equal(state.lastCalculated,15);assert.equal(state.configured,false);
  assert.equal(await state.save('22'),true);
  state=await stabilize(f,summary('60,00 EUR','8','2026-06-01T12:00:00.000Z'));
  assert.equal(state.hours,22);assert.equal(state.lastCalculated,20);assert.equal(state.configured,true);
  const reopened=fixture(f.files);state=await stabilize(reopened,summary('150,00 EUR','16','2026-07-01T12:00:00.000Z'));
  assert.equal(state.hours,22);assert.equal(state.lastCalculated,20,'Equality retains the last valid unequal observation');
  assert.equal(await state.reset(),true);state=await stabilize(reopened);
  assert.equal(state.hours,20);assert.equal(state.configured,false);
  state=await stabilize(reopened,summary('100,00 EUR','10','2026-08-01T12:00:00.000Z'));
  assert.equal(state.hours,15,'Reset returns to automatic updates');
  assert.equal((await stabilize(reopened,undefined,'owner/store/account',2027)).hours,30);
  assert.equal((await stabilize(reopened,undefined,'foreign',2026)).lastCalculated,null);
});

test('failed automatic persistence is visible, has a bounded attempt and can retry locally',async()=>{
  const f=fixture();f.fail();let state=await stabilize(f,summary());
  assert.equal(state.hours,30);assert.equal(state.lastCalculated,null);assert.equal(f.files.size,0);
  assert.match(state.error,/Berechnetes Soll.*nicht gespeichert/);assert.equal(state.busy,false);
  f.fail(false);state.retry();state=await stabilize(f,summary());
  assert.equal(state.hours,15);assert.equal(state.error,null);
});

test('unreadable derived history cannot hide an existing manual target',async()=>{
 const f=fixture();f.render();await settle();assert.equal(await f.render().save('22'),true);
 f.files.set(`calculated-${JSON.stringify(['owner/store/account',2026])}`,'corrupt');
 const reopened=fixture(f.files),state=await stabilize(reopened);
 assert.equal(state.hours,22);assert.equal(state.configured,true);assert.equal(state.lastCalculated,null);
 assert.match(state.error,/Berechnung nicht lesbar/);
});

test('calculation in preview never writes files and stale reset cannot delete another context',async()=>{
  const f=fixture();let state=await stabilize(f,summary(),'owner/store/account',2026,false);
  assert.equal(state.hours,15);assert.equal(f.files.size,0);assert.equal(f.accesses(),0);
  assert.equal((await stabilize(f,undefined,'owner/store/account',2027,false)).hours,30);
  state=await stabilize(f,undefined,'owner/store/account',2026,false);assert.equal(state.lastCalculated,15);
  assert.equal(await state.save('22'),true);
  assert.equal(await state.reset(),true);assert.equal((await stabilize(f,undefined,'owner/store/account',2026,false)).hours,15);
  const persistent=fixture();state=await stabilize(persistent,summary());assert.equal(await state.save('22'),true);
  state=await stabilize(persistent);const reset=state.reset();persistent.render('other');assert.equal(await reset,false);
  assert.equal((await stabilize(persistent)).hours,22);
});

test('target editor shows the last calculation and resets through its explicit action',async()=>{
  const f=fixture();let reset=0,closed=0;
  const tree=f.editor({hours:22,lastCalculated:15,configured:true,persistent:true,busy:false,error:null,save:async()=>true,reset:async()=>{reset++;return true;}},()=>closed++);
  assert.match(JSON.stringify(tree),/Zuletzt berechnet: 15 h/);assert.match(JSON.stringify(tree),/Manuelles Soll aktiv/);
  const action=tree.children.find((n:any)=>n?.type==='Action'&&n.children.includes('Auf berechnetes Soll zurücksetzen'));
  assert.equal(action.props.disabled,false);action.props.onPress();await settle();assert.equal(reset,1);assert.equal(closed,1);
});
test('local provisional target survives reload, isolates accounts and years, and preserves confirmed zero',async()=>{
  const f=fixture();let state=f.render();assert.equal(state.hours,30);await settle();assert.equal(await f.render().save('0'),true);
  assert.equal(f.render().hours,0);f.render('foreign');await settle();assert.equal(f.render('foreign').hours,30);
  f.render('owner/store/account',2025);await settle();assert.equal(f.render('owner/store/account',2025).hours,30);
  f.render();await settle();assert.equal(f.render().hours,0);assert.equal(f.files.size,1);
});

test('30-hour annual default never replaces an explicitly saved 25-hour target',async()=>{
  const f=fixture();f.render();await settle();assert.equal(f.render().hours,30);
  assert.equal(await f.render().save('25'),true);
  const reopened=fixture(f.files);reopened.render();await settle();
  assert.equal(reopened.render().hours,25);assert.equal(reopened.render().configured,true);
  reopened.render('owner/store/account',2027);await settle();
  assert.equal(reopened.render('owner/store/account',2027).hours,30);
  assert.equal(reopened.render('owner/store/account',2027).configured,false);
  assert.equal(reopened.files.size,1,'The annual fallback is not a migration or preference write');
  reopened.render();await settle();assert.equal(reopened.render().hours,25);
});
test('invalid input and failed writes are explicit; no account means no preference write',async()=>{
  const f=fixture();f.render();await settle();assert.equal(await f.render().save('25 EUR'),false);assert.equal(f.files.size,0);
  f.fail();assert.equal(await f.render().save('40'),false);assert.match(f.render().error,/nicht gespeichert/);assert.equal(f.render().hours,30);
  assert.equal(await f.render(null).save('30'),false);assert.equal(f.files.size,0);
});
test('an owner switch during awaited hashing cannot save under the incoming owner',async()=>{
  const f=fixture();f.render();await settle();const pending=f.render().save('40');f.render('other');assert.equal(await pending,false);assert.equal(f.files.size,0);
});

test('obsolete readback cannot report success after year/owner switch or A-B-A return',async()=>{
  for(const incoming of ['year','owner','return']){
    const f=fixture();f.render();await settle();const release=f.pauseRead();const pending=f.render().save('35');await settle();
    if(incoming==='year')f.render('owner/store/account',2025);
    else {f.render('other');if(incoming==='return')f.render();}
    release();assert.equal(await pending,false);await settle();
    const state=incoming==='year'?f.render('owner/store/account',2025):incoming==='owner'?f.render('other'):f.render();
    assert.equal(state.busy,false);assert.equal(state.hours,incoming==='return'?35:30);assert.equal(f.files.size,1);
    assert.equal(await state.save('40'),true,'incoming editor can retry after obsolete work settles');
  }
});

test('unmount and stale callbacks cannot complete or start a preference write',async()=>{
  const f=fixture();f.render();await settle();const stale=f.render();f.render('other');
  assert.equal(await stale.save('80'),false);assert.equal(f.files.size,0);
  const release=f.pauseRead();const pending=f.render('other').save('30');await settle();f.unmount();release();assert.equal(await pending,false);
});

test('readback mismatch is explicit and retry works; duplicate submissions cannot race',async()=>{
  const f=fixture();f.render();await settle();f.corrupt();assert.equal(await f.render().save('30'),false);
  assert.match(f.render().error,/nicht gespeichert/);assert.equal(f.render().busy,false);
  const release=f.pauseRead();const pending=f.render().save('40');await settle();assert.equal(await f.render().save('50'),false);
  release();assert.equal(await pending,true);assert.equal(f.render().hours,40);assert.equal(f.render().busy,false);
});

test('preview target edits stay in memory and never read existing local preferences',async()=>{
  const files=new Map<string,string>();const local=fixture(files);local.render();await settle();await local.render().save('80');
  const before=[...files];const preview=fixture(files);preview.render(undefined,2026,false);await settle();assert.equal(preview.render(undefined,2026,false).hours,30);
  assert.equal(await preview.render(undefined,2026,false).save('35'),true);assert.equal(preview.render(undefined,2026,false).hours,35);
  preview.render(undefined,2025,false);await settle();assert.equal(preview.render(undefined,2025,false).hours,30);
  preview.render(undefined,2026,false);await settle();assert.equal(preview.render(undefined,2026,false).hours,35);
  assert.equal(preview.accesses(),0);assert.deepEqual([...files],before);preview.unmount();
  const reopened=fixture(files);reopened.render(undefined,2026,false);await settle();assert.equal(reopened.render(undefined,2026,false).hours,30);
  assert.equal(reopened.accesses(),0);
});

test('closing an editor prevents its pending save callback from closing the next editor',async()=>{
  const f=fixture(),gate=deferred();let closed=0;
  const tree=f.editor({persistent:true,hours:25,busy:false,error:null,save:async()=>{await gate.promise;return true;}},()=>closed++);
  tree.children.find((n:any)=>n?.type==='Action'&&n.children.includes('Soll lokal speichern')).props.onPress();
  f.unmount();gate.release();await settle();assert.equal(closed,0);
});

test('subscribed reload clears an obsolete read error and refreshes restored or absent preferences',async()=>{
  const f=fixture();f.render();await settle();assert.equal(await f.render().save('37.5'),true);
  const reopened=fixture(f.files);reopened.corrupt();reopened.render();await settle();assert.match(reopened.render().error,/nicht gelesen.*30 h/);
  reopened.notify();reopened.render();await settle();assert.equal(reopened.render().hours,37.5);assert.equal(reopened.render().error,null);
  reopened.files.clear();reopened.notify();reopened.render();await settle();assert.equal(reopened.render().hours,30);assert.equal(reopened.render().configured,false);assert.equal(reopened.render().error,null);
});

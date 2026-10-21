import * as diagnostics from '../../apps/platform-lab/src/diagnostics';
import * as processedResults from '../../apps/platform-lab/src/mobile/processed-result.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as reader from '../../apps/platform-lab/src/mobile/own-flight-reader.ts';
import { ownFlightFixture } from './own-flight-fixture.ts';

const source=ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/mobile/use-own-flights.ts',import.meta.url),'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS},
}).outputText;
function deferred<T>() { let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return {promise,resolve}; }
function host() {
  const f=ownFlightFixture(),hooks:any[]=[],effects:(()=>void)[]=[],cleanups:(()=>void)[]=[];
  let index=0,active=true,revision=0,listener!:(state:string)=>void;
  const react={
    useRef(initial:unknown){const i=index++;if(!(i in hooks))hooks[i]={current:initial};return hooks[i];},
    useState(initial:unknown){const i=index++;if(!(i in hooks))hooks[i]=initial;return [hooks[i],(value:unknown)=>{hooks[i]=value;}];},
    useCallback(fn:unknown,deps:unknown[]){const i=index++;if(!hooks[i]||deps.some((v,n)=>v!==hooks[i].deps[n]))hooks[i]={fn,deps};return hooks[i].fn;},
    useEffect(fn:()=>void|(()=>void),deps:unknown[]){const i=index++;if(!hooks[i]||deps.some((v,n)=>v!==hooks[i][n])){hooks[i]=deps;effects.push(()=>{const cleanup=fn();if(cleanup)cleanups.push(cleanup);});}},
  };
  const exports:any={};runInNewContext(source,{exports,require:(name:string)=>name==='react'?react:name==='react-native'?{
    AppState:{currentState:'active',addEventListener:(_:string,fn:typeof listener)=>{listener=fn;return{remove(){}};}},
  }:name==='../diagnostics'?diagnostics:name==='./processed-result'?processedResults:reader});
  let result:any;
  function render(){index=0;result=exports.useOwnFlights(f.ports,active,revision);effects.splice(0).forEach(fn=>fn());return result;}
  async function flush(){for(let i=0;i<3;i++){await new Promise<void>(done=>{setImmediate(done);});render();}return result;}
  render();return{...f,render,flush,background:()=>listener('background'),foreground:()=>listener('active'),
    setActive:(value:boolean)=>{active=value;render();},reload:()=>{revision++;render();},unmount:()=>cleanups.forEach(fn=>fn())};
}
test('local read, detail and retry are independent of provider calls; returning reloads the selected owner',async()=>{
  const h=host();let state=await h.flush();assert.equal(state.phase,'ready');assert.equal(state.view.flights.length,3);
  await state.openDetail(h.flights[0]);state=h.render();assert.equal(state.detail.flightId,'flight-0');
  state.clearDetail();assert.equal(h.render().detail,null);
  h.setActive(false);state=h.render();assert.equal(state.view,null);
  h.setActive(true);state=await h.flush();assert.equal(state.phase,'ready');assert.equal(h.closes(),3);h.unmount();
});
test('late list read is discarded in background and only a fresh foreground read is published',async()=>{
  const h=host();await h.flush();const pending=deferred<any>();let reads=0;
  h.session.service.readStored=async()=>++reads===1?pending.promise:{snapshot:h.snapshot,flights:[]};
  h.reload();h.background();h.foreground();pending.resolve({snapshot:h.snapshot,flights:h.flights});
  const state=await h.flush();assert.equal(state.phase,'ready');assert.equal(state.view.flights.length,0);assert.equal(reads,2);h.unmount();
});
test('Back cancels a late detail and a changed revision fails closed before local retry',async()=>{
  const h=host();let state=await h.flush();const pending=deferred<any>();h.session.service.detail=async()=>pending.promise;
  const opening=state.openDetail(h.flights[0]);h.render().clearDetail();pending.resolve(h.detail);await opening;
  assert.equal(h.render().detail,null);
  h.session.service.detail=async()=>({...h.detail,factsRevision:2});await h.render().openDetail(h.flights[0]);
  state=h.render();assert.equal(state.phase,'failed');assert.equal(state.view,null);assert.match(state.detailError,/geändert/);
  h.reload();state=await h.flush();assert.equal(state.phase,'ready');h.unmount();
});
test('unmount during read still releases the session and prevents late publication',async()=>{
  const h=host();await h.flush();const pending=deferred<any>();h.session.service.readStored=async()=>pending.promise;
  h.reload();h.unmount();const before=h.closes();pending.resolve({snapshot:h.snapshot,flights:h.flights});
  for(let i=0;i<10;i++)await Promise.resolve();assert.equal(h.closes(),before+1);
});

test('a failed local read removes prior content and explicit retry returns the current stored view',async()=>{
  const h=host();await h.flush();const read=h.session.service.readStored;
  h.session.service.readStored=async()=>{throw new Error('Synthetic temporary native read failure');};
  h.reload();let state=await h.flush();assert.equal(state.phase,'failed');assert.equal(state.view,null);
  h.session.service.readStored=read;await state.reload();state=h.render();assert.equal(state.phase,'ready');assert.equal(state.view.flights.length,3);h.unmount();
});

test('identical verified reads reuse the processed view and metadata changes retain flight references', async () => {
  const h=host(); const first=(await h.flush()).view;
  h.session.service.readStored=async()=>structuredClone({snapshot:h.snapshot,flights:h.flights});
  h.reload(); let state=await h.flush(); assert.equal(state.view,first);
  h.background(); assert.equal(h.render().view,null); h.foreground();
  state=await h.flush(); assert.equal(state.view,first);
  h.session.service.readStored=async()=>({...structuredClone({snapshot:h.snapshot,flights:h.flights}),snapshot:{...structuredClone(h.snapshot),generation:3}});
  h.reload(); state=await h.flush(); assert.notEqual(state.view,first); assert.equal(state.view.flights,first.flights);
  h.session.service.readStored=async()=>{const result=structuredClone({snapshot:h.snapshot,flights:h.flights});result.flights[0]!.facts.assessment.durations.flight={state:'known',minutes:999,evidence:[]};return result;};
  h.reload(); state=await h.flush(); assert.notEqual(state.view.flights,first.flights); assert.equal(state.view.flights[0].facts.assessment.durations.flight.minutes,999);
  h.unmount();
});

test('a verified owner change never reuses previous owner branches even with identical flights', async () => {
  const h=host(); const first=(await h.flush()).view;
  h.session.ownerId='owner-b';h.session.storeId='store-b';
  h.session.service.readStored=async()=>({snapshot:{...h.snapshot,ownerId:'owner-b',storeId:'store-b'},flights:structuredClone(h.flights)});
  h.setActive(false); assert.equal(h.render().view,null);h.setActive(true);
  const state=await h.flush();assert.equal(state.view.snapshot.ownerId,'owner-b');assert.notEqual(state.view.flights,first.flights);h.unmount();
});

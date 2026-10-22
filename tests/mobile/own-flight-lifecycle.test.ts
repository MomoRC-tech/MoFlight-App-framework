import * as diagnostics from '../../apps/platform-lab/src/diagnostics';
import * as processedResults from '../../apps/platform-lab/src/mobile/processed-result.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as reader from '../../apps/platform-lab/src/mobile/own-flight-reader.ts';
import { ownFlightFixture } from './own-flight-fixture.ts';
import * as flightModel from '../../apps/platform-lab/src/mobile/own-flight-model.ts';
import * as captureReview from '../../apps/platform-lab/src/vereinsflieger/capture-review.ts';
import { planFlightRetrieval } from '../../apps/platform-lab/src/vereinsflieger/retrieval-policy.ts';
import { dataFreshness } from '../../apps/platform-lab/src/mobile/data-freshness.ts';

const source=ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/mobile/use-own-flights.ts',import.meta.url),'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS},
}).outputText;
function deferred<T>() { let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return {promise,resolve}; }
function host(withPresentation = false) {
  const f=ownFlightFixture(),hooks:any[]=[],effects:(()=>void)[]=[],cleanups:(()=>void)[]=[];
  let index=0,active=true,revision=0,listener!:(state:string)=>void;
  let flightsActive=true,filterRequest:flightModel.OwnFlightRequest|null=null;
  const react={
    createElement:(type:unknown,props:unknown,...children:unknown[])=>({type,props,children}),
    useMemo:(fn:()=>unknown)=>fn(),
    useRef(initial:unknown){const i=index++;if(!(i in hooks))hooks[i]={current:initial};return hooks[i];},
    useState(initial:unknown){const i=index++;if(!(i in hooks))hooks[i]=initial;return [hooks[i],(value:unknown)=>{hooks[i]=value;}];},
    useCallback(fn:unknown,deps:unknown[]){const i=index++;if(!hooks[i]||deps.some((v,n)=>v!==hooks[i].deps[n]))hooks[i]={fn,deps};return hooks[i].fn;},
    useEffect(fn:()=>void|(()=>void),deps:unknown[]){const i=index++;if(!hooks[i]||deps.some((v,n)=>v!==hooks[i][n])){hooks[i]=deps;effects.push(()=>{const cleanup=fn();if(cleanup)cleanups.push(cleanup);});}},
  };
  const exports:any={};runInNewContext(source,{exports,require:(name:string)=>name==='react'?react:name==='react-native'?{
    AppState:{currentState:'active',addEventListener:(_:string,fn:typeof listener)=>{listener=fn;return{remove(){}};}},
  }:name==='../diagnostics'?diagnostics:name==='./processed-result'?processedResults:reader});
  const presentation:any={};
  const onHeaderChange=()=>{};
  if(withPresentation){
    const leaves=(names:string[])=>Object.fromEntries(names.map(name=>[name,name]));
    const modules:Record<string,unknown>={
      react:{default:react,...react},'react-native':{
        ...leaves(['ActivityIndicator','FlatList','Pressable','ScrollView','TextInput','View']),
        Keyboard:{dismiss(){}},StyleSheet:{create:(value:unknown)=>value},useWindowDimensions:()=>({width:390,fontScale:1}),
      },'../diagnostics':diagnostics,
      './theme':{...leaves(['Action','Card','Chip','Empty','IconLabel','Label','Section']),colors:{},ui:{}},
      './SymbolIcon':leaves(['SymbolIcon']),'./own-flight-model':flightModel,
      '../vereinsflieger/retrieval-policy':{planFlightRetrieval},'./data-freshness':{dataFreshness},
      '../vereinsflieger/capture-review':captureReview,
    };
    const component=ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/mobile/OwnFlights.tsx',import.meta.url),'utf8'),{
      compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:false},
    }).outputText;
    runInNewContext(component,{exports:presentation,require:(name:string)=>{assert.ok(name in modules,name);return modules[name];}});
  }
  let result:any;
  function render(){index=0;result=exports.useOwnFlights(f.ports,active,revision);if(withPresentation)presentation.OwnFlights({active:flightsActive,data:result,filterRequest,onHeaderChange});effects.splice(0).forEach(fn=>fn());return result;}
  async function flush(){for(let i=0;i<3;i++){await new Promise<void>(done=>{setImmediate(done);});render();}return result;}
  render();return{...f,render,flush,background:()=>listener('background'),foreground:()=>listener('active'),
    setFlightsActive:(value:boolean)=>{flightsActive=value;render();},
    requestFlight:(flightId:string)=>{filterRequest={year:null,flightId};flightsActive=true;render();},
    setActive:(value:boolean)=>{active=value;render();},reload:()=>{revision++;render();},unmount:()=>cleanups.forEach(fn=>fn())};
}

test('latest recent-flight request survives a busy local detail read through the real presentation and reader',async()=>{
  const h=host(true);await h.flush();
  const first=deferred<any>(),second=deferred<any>(),reads:string[]=[];
  h.session.service.detail=async flightId=>{reads.push(flightId);return flightId===h.flights[0]!.flightId?first.promise:second.promise;};
  try{
    h.requestFlight(h.flights[0]!.flightId);
    assert.equal((await h.flush()).detailBusy,true);
    h.setFlightsActive(false);
    h.requestFlight(h.flights[1]!.flightId);
    let state=await h.flush();
    assert.equal(state.detailBusy,true);assert.deepEqual(reads,[h.flights[0]!.flightId]);
    first.resolve(h.detail);
    state=await h.flush();
    assert.deepEqual(reads,[h.flights[0]!.flightId,h.flights[1]!.flightId]);
    assert.equal(state.detailBusy,true);assert.equal(state.detail,null);
    second.resolve({...h.flights[1]!,factHistory:[],captures:[],pending:[]});
    state=await h.flush();
    assert.equal(state.detailBusy,false);assert.equal(state.detail.flightId,h.flights[1]!.flightId);
    h.setFlightsActive(false);h.setFlightsActive(true);await h.flush();
    assert.equal(reads.length,2,'a consumed request must not reopen on ordinary tab return');
  }finally{first.resolve(h.detail);second.resolve(null);h.unmount();}
});
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

test('ordinary tab return and duplicate active events preserve the verified view without storage reads',async()=>{
 const h=host(true),first=(await h.flush()).view,reads=h.closes();
 h.setFlightsActive(false);h.setFlightsActive(true);h.setFlightsActive(false);
 h.foreground();h.foreground();
 const next=await h.flush();assert.equal(next.phase,'ready');assert.equal(next.view,first);assert.equal(h.closes(),reads);
 h.background();assert.equal(h.render().view,null);h.foreground();await h.flush();assert.equal(h.closes(),reads+1);
 h.unmount();
});

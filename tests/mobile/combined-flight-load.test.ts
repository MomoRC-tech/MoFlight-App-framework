import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as policy from '../../apps/platform-lab/src/mobile/core-flight-review-policy.ts';
import { planFlightRetrieval } from '../../apps/platform-lab/src/vereinsflieger/retrieval-policy.ts';
import { dataFreshness } from '../../apps/platform-lab/src/mobile/data-freshness.ts';

interface Element { type: string; props: Record<string, any>; children: unknown[] }
const source=ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/mobile/CoreFlightFoundation.tsx',import.meta.url),'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:false},
}).outputText+'\nexports.OwnerFlightLibrary=OwnerFlightLibrary;';

// Real screen effects and handlers; SQLite and provider behavior have their own
// integration tests. These ports control timing to exercise the screen coordinator.
function fixture({startUpdate=false,root=false,readOnly=false}={}) {
  const hooks:any[]=[],effects:(()=>void)[]=[],calls:string[]=[],closed:any[]=[];
  let index=0,dirty=true,tree:Element,abort:AbortController|null=null;
  const listeners=new Set<(state:string)=>void>();
  const lease={ownerId:'owner',storeId:'store',leaseId:'lease'};
  const registry={currentOwner:async()=>null,createFreshOwner:async()=>{calls.push('create');return lease;},assertCurrent:async()=>{},close:async()=>{}};
  const snapshot={account:null,savedRetrievals:[],coverage:[],pending:[],recovery:{readOnly}};
  const input={capture:{captureId:'fresh',rows:[]},requestedWindow:{from:'2025-01-01',to:'2026-10-21'}};
  const c:any={viewReady:true,browserActive:false,from:'',to:'',connection:{phase:'unknown',confirmed:false},
    busy:false,saving:false,restoring:{current:false},visible:false,recovery:false,result:'none',completedFlightSource:null,
    retrieval:{current:{state:{phase:'idle'}}},
    setFrom:(v:string)=>{c.from=v;dirty=true;},setTo:(v:string)=>{c.to=v;dirty=true;},
    beginGuidedFlightConnection:()=>{calls.push('session');c.connection={phase:'observed',confirmed:true,observed:{accountNumber:'101',clubLabel:'Example'}};dirty=true;},
    endGuidedFlightConnection:()=>{},connect:()=>calls.push('login'),
    checkConnection:()=>{calls.push('retrieve');c.busy=true;dirty=true;},
    dismissLogin:()=>{c.visible=false;dirty=true;},backWithinProvider:()=>false,cancelRetrieval:()=>{c.busy=false;dirty=true;},
  };
  class Service {
    constructor(...args:any[]) { this.ports=args[3]; }
    ports:any;
    async readStored(){return {snapshot,flights:[]};}
    async recoverPending(){return {status:'none'};}
    async retrieveUpdate(){abort=new AbortController();const value=await this.ports.retrieve({from:'2025-01-01',to:'2026-10-21'},abort.signal);return {state:'confirm-account',source:value};}
    async saveVerifiedReview(_review:any,context:any){assert.equal(context.accountNumber,'101');calls.push('save');return {counts:{added:2,changed:1,pending:0}};}
    cancelReview(){abort?.abort();}
    dispose(){this.cancelReview();}
  }
  const react={
    createElement:(type:string,props:any,...children:unknown[]):Element=>({type,props:props??{},children:children.flat(Infinity)}),
    useRef:(initial:unknown)=>{const i=index++;return hooks[i]??=( {current:initial} );},
    useState:(initial:unknown)=>{const i=index++;if(!(i in hooks))hooks[i]=typeof initial==='function'?initial():initial;return [hooks[i],(value:any)=>{const next=typeof value==='function'?value(hooks[i]):value;if(next!==hooks[i]){hooks[i]=next;dirty=true;}}];},
    useMemo:(make:()=>unknown,deps:unknown[])=>{const i=index++,old=hooks[i];if(!old||deps.some((v,n)=>v!==old.deps[n]))hooks[i]={deps,value:make()};return hooks[i].value;},
    useEffect:(effect:()=>unknown,deps:unknown[])=>{const i=index++,old=hooks[i];if(!old||deps.some((v,n)=>v!==old.deps[n])){hooks[i]={deps};effects.push(()=>{old?.cleanup?.();hooks[i].cleanup=effect();});}},
  };
  const leaves=(names:string[])=>Object.fromEntries(names.map(name=>[name,name]));
  const modules:Record<string,any>={react:{default:react,...react},
    'react-native':{...leaves(['ActivityIndicator','ScrollView','View']),AppState:{currentState:'active',addEventListener:(_:string,f:(state:string)=>void)=>{listeners.add(f);return {remove:()=>listeners.delete(f)};}},BackHandler:{addEventListener:()=>({remove(){}})}},
    'react-native-safe-area-context':leaves(['SafeAreaView']), 'expo-crypto':{randomUUID:()=> 'uuid'},'../storage':{hash:async()=>''},
    '../vereinsflieger/flight-diagnostics':{timeFlightStage:(_:string,work:()=>unknown)=>work()},
    '../vereinsflieger/use-access-controller':{useAccessController:()=>({...c})},
    '../vereinsflieger/real-flight-native':{openOwnerRegistry:async()=>registry,openRealFlightSelection:async()=>({listRestorePreparations:async()=>[],close:async()=>{}})},
    '../vereinsflieger/real-flight-owner-setup':{continueRealFlightOwnerSetup:async()=>true},
    '../vereinsflieger/real-flight-service':{RealFlightService:Service,PendingRealFlightOperation:class extends Error{}},
    './core-flight-review-policy':policy,'../vereinsflieger/real-flight-backup-native':{},
    './ProviderConnection':leaves(['ProviderConnection']),'./theme':{...leaves(['Action','Card','Label','Section']),colors:{}},
    '../vereinsflieger/retrieval-policy':{planFlightRetrieval},'./data-freshness':{dataFreshness},
  };
  const exports:any={};runInNewContext(source,{exports,require:(name:string)=>{assert.ok(name in modules,name);return modules[name];},setTimeout,clearTimeout,console,Error});
  function render(){dirty=false;index=0;tree=root?exports.CoreFlightFoundation({startUpdate,close:(v:any)=>closed.push(v)}):exports.OwnerFlightLibrary({lease,registry,startUpdate,close:(v:any)=>closed.push(v),takeInitialRepository:()=>null});while(effects.length)effects.shift()!();return tree;}
  async function flush(){for(let n=0;n<12;n++){if(dirty)render();await new Promise<void>(resolve=>{setImmediate(resolve);});}if(dirty)render();}
  function nodes(){const result:Element[]=[];function visit(value:any){if(value&&typeof value==='object'&&'children'in value){result.push(value);value.children.forEach(visit);}}visit(tree);return result;}
  const text=(node:any):string=>node&&typeof node==='object'&&'children'in node?node.children.map(text).join(''):typeof node==='string'?node:'';
  function press(label:string){const node=nodes().find(n=>n.type==='Action'&&text(n)===label);assert.ok(node,label);assert.ok(!node.props.disabled,label);node.props.onPress();}
  return {render,flush,c,calls,closed,nodes,text:()=>text(tree),press,background:()=>listeners.forEach(f=>f('background')),
    complete:()=>{c.busy=false;c.result='captured';c.completedFlightSource=input;dirty=true;},
    dispose:()=>{for(const hook of hooks)hook?.cleanup?.();},
  };
}

test('opening options does no retrieval; one explicit action verifies, loads, saves and returns a result',async()=>{
  const f=fixture();try{
    f.render();await f.flush();assert.deepEqual(f.calls,[]);
    assert.equal(f.text().includes('Quellzeilen'),false);assert.equal(f.text().includes('Geräteordner'),false);
    f.press('Mit Vereinsflieger anmelden & Flüge laden');await f.flush();
    assert.deepEqual(f.calls,['session','retrieve']);
    f.complete();await f.flush();assert.deepEqual(f.calls,['session','retrieve','save']);
    assert.equal(f.closed.length,1);assert.equal(f.closed[0].added,2);assert.equal(f.closed[0].from,'2025-01-01');
  }finally{f.dispose();}
});

test('combined entry starts once, while read-only recovery prevents automatic work',async()=>{
  for(const readOnly of [false,true]){
    const f=fixture({startUpdate:true,readOnly});try{
      f.render();await f.flush();await f.flush();
      assert.deepEqual(f.calls,readOnly?[]:['session','retrieve']);
      if(readOnly)assert.ok(f.nodes().some(n=>n.props.title==='Bibliothek nur lesbar')); 
    }finally{f.dispose();}
  }
});

test('cancelled, backgrounded and mismatched load cannot save a late capture',async()=>{
  for(const stop of ['cancel','background','mismatch']){
    const f=fixture({startUpdate:true});try{
      f.render();await f.flush();
      if(stop==='cancel')f.nodes().find(n=>n.type==='ProviderConnection')!.props.close();
      if(stop==='background')f.background();
      if(stop==='mismatch'){f.c.connection={phase:'mismatch',confirmed:false};f.render();}
      await f.flush();f.complete();await f.flush();
      assert.equal(f.calls.includes('save'),false);assert.equal(f.closed.length,0);
    }finally{f.dispose();}
  }
});

test('fresh local setup is internal to the explicit combined entry, not ordinary options',async()=>{
  for(const startUpdate of [false,true]){
    const f=fixture({root:true,startUpdate});try{
      f.render();await f.flush();assert.equal(f.calls.includes('create'),startUpdate);
      if(startUpdate)assert.ok(f.nodes().some(n=>typeof n.type==='function'&&n.props.startUpdate===true));
    }finally{f.dispose();}
  }
});

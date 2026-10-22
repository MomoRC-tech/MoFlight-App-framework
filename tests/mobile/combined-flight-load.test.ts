import { DiagnosticJournal } from '../../apps/platform-lab/src/diagnostics';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as policy from '../../apps/platform-lab/src/mobile/core-flight-review-policy.ts';
import { planFlightRetrieval } from '../../apps/platform-lab/src/vereinsflieger/retrieval-policy.ts';
import { dataFreshness } from '../../apps/platform-lab/src/mobile/data-freshness.ts';
import * as accountJobs from '../../apps/platform-lab/src/mobile/account-retrieval-jobs.ts';
import { retrievalFailureHint } from '../../apps/platform-lab/src/vereinsflieger/connection-state.ts';

interface Element { type: string; props: Record<string, any>; children: unknown[] }
const source=ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/mobile/CoreFlightFoundation.tsx',import.meta.url),'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:false},
}).outputText+'\nexports.OwnerFlightLibrary=OwnerFlightLibrary;';

// Real screen effects and handlers; SQLite and provider behavior have their own
// integration tests. These ports control timing to exercise the screen coordinator.
function fixture({startUpdate=false,root=false,readOnly=false,deferReservation=false,failStartup=false,medicalFailure=false,loginPending=false,deferProvider=false,quietResume=false,deferSource=false,sameWindow=false,deferVerification=false,priorConnection='unknown',existingOwner=false,intent:requestedIntent=undefined as string|undefined}={}) {
  let panelOpen=true,requestId=0;
  const journal=new DiagnosticJournal(), diagnosis={current:journal.begin(startUpdate?'update-flights':'open-flight-tools')};
  const hooks:any[]=[],effects:(()=>void)[]=[],calls:string[]=[],closed:any[]=[];
  let index=0,dirty=true,tree:Element,abort:AbortController|null=null;
  let finishReservation!:()=>void;
  const reservation=new Promise<void>(resolve=>{finishReservation=resolve;});
  const listeners=new Set<(state:string)=>void>();
  let saved=false,timerId=0;
  const timers=new Map<number,()=>void>();
  let admitSource!:()=>void;
  const lease={ownerId:'owner',storeId:'store',leaseId:'lease'};
  let ownerProof=0,selectedHead=1;
  const registry={currentOwner:async()=>existingOwner?{...lease,selectionSeq:selectedHead,leaseId:'proof-'+(++ownerProof)}:null,createFreshOwner:async()=>{calls.push('create');return lease;},assertCurrent:async()=>{},close:async()=>{}};
  const snapshot={account:null,savedRetrievals:[],coverage:[],pending:[],recovery:{readOnly}};
  const input={capture:{captureId:'fresh',rows:[]},requestedWindow:{from:'2025-01-01',to:'2026-10-21'}};
  const c:any={viewReady:true,browserActive:false,from:sameWindow?'2025-01-01':'',to:sameWindow?'2026-10-21':'',connection:priorConnection==='verified'?{phase:'observed',confirmed:true,observed:{accountNumber:'101',clubLabel:'Example'}}:{phase:priorConnection,confirmed:false},
    busy:false,saving:false,restoring:{current:false},visible:false,recovery:false,result:'none',completedFlightSource:null,
    retrieval:{current:{state:{phase:'idle'}}},
    setFrom:(v:string)=>{if(c.from!==v){c.from=v;dirty=true;}},setTo:(v:string)=>{if(c.to!==v){c.to=v;dirty=true;}},
    beginGuidedFlightConnection:()=>{calls.push('session');c.result='none';if(deferVerification)c.connection={phase:'checking',confirmed:false};else if(loginPending)c.visible=true;else c.connection={phase:'observed',confirmed:true,observed:{accountNumber:'101',clubLabel:'Example'}};dirty=true;},
    resumeGuidedFlightConnection:()=>{calls.push('resume');if(!quietResume){c.connection={phase:'unknown',confirmed:false};c.visible=true;dirty=true;}return true;},
    endGuidedFlightConnection:()=>{},connect:()=>calls.push('login'),
    retrieveMedical:async()=>{calls.push('medical');if(medicalFailure)throw new Error('Synthetic Medical failure');return {rows:[{}]};},
    checkConnection:(action?:string)=>{if(action==='check'){calls.push('verify-job');c.connection={phase:'checking',confirmed:false};}else{calls.push('retrieve');c.busy=true;}dirty=true;return true;},
    dismissLogin:()=>{c.visible=false;c.busy=false;dirty=true;},backWithinProvider:()=>false,cancelRetrieval:()=>{c.busy=false;dirty=true;},
  };
  class Service {
    constructor(...args:any[]) { this.ports=args[3]; }
    ports:any;
    async readStored(){return {snapshot,flights:saved?[{},{},{}]:[]};}
    async recoverPending(){return {status:'none'};}
    async retrieveUpdate(){if(deferSource)await new Promise<void>(resolve=>{admitSource=resolve;});abort=new AbortController();if(deferProvider)c.viewReady=false;const value=await this.ports.retrieve({from:'2025-01-01',to:'2026-10-21'},abort.signal);return {state:'confirm-account',source:value};}
    async saveVerifiedReview(_review:any,context:any){assert.equal(context.accountNumber,'101');calls.push('save');saved=true;return {counts:{added:2,changed:1,pending:0}};}
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
    './account-retrieval-jobs':accountJobs, '../diagnostics':{diagnosticJournal:journal},
    '../vereinsflieger/duty-refresh-native':{refreshDutyRoster:async()=>({rows:[],partial:true})},
    '../vereinsflieger/connection-state':{retrievalFailureHint},
    'react-native':{...leaves(['ActivityIndicator','ScrollView','View']),AppState:{currentState:'active',addEventListener:(_:string,f:(state:string)=>void)=>{listeners.add(f);return {remove:()=>listeners.delete(f)};}},BackHandler:{addEventListener:()=>({remove(){}})}},
    'react-native-safe-area-context':leaves(['SafeAreaView']), 'expo-crypto':{randomUUID:()=> 'uuid'},'../storage':{hash:async()=>''},
    '../vereinsflieger/flight-diagnostics':{timeFlightStage:(_:string,work:()=>unknown)=>work()},
    '../vereinsflieger/use-access-controller':{useAccessController:()=>({...c})},
    '../vereinsflieger/real-flight-native':{openOwnerRegistry:async()=>{calls.push('registry');if(failStartup)throw new Error('Startup interrupted');return registry;},openRealFlightSelection:async()=>({listRestorePreparations:async()=>[],close:async()=>{}})},
    '../vereinsflieger/real-flight-owner-setup':{continueRealFlightOwnerSetup:async()=>true},
    '../vereinsflieger/real-flight-service':{RealFlightService:Service,PendingRealFlightOperation:class extends Error{}},
    './core-flight-review-policy':policy,'../vereinsflieger/real-flight-backup-native':{},
    './own-flight-reader-native':{ownFlightReadPorts:{suspend:async()=>{calls.push('reserve');if(deferReservation)await reservation;return ()=>calls.push('release');}}},
    './ProviderConnection':leaves(['ProviderConnection']),'./theme':{...leaves(['Action','Card','Label','Section']),colors:{}},
    '../vereinsflieger/retrieval-policy':{planFlightRetrieval},'./data-freshness':{dataFreshness},
  };
  const exports:any={};runInNewContext(source,{exports,require:(name:string)=>{assert.ok(name in modules,name);return modules[name];},setTimeout:(fn:()=>void)=>{timers.set(++timerId,fn);return timerId;},clearTimeout:(id:number)=>timers.delete(id),console,Error});
  function render(){dirty=false;index=0;tree=root?exports.CoreFlightFoundation({startUpdate,intent:requestedIntent,open:panelOpen,requestId,close:(v:any)=>closed.push(v)}):exports.OwnerFlightLibrary({lease,registry,startUpdate,intent:requestedIntent,open:panelOpen,requestId,close:(v:any)=>closed.push(v),takeInitialRepository:()=>null,diagnosis});while(effects.length)effects.shift()!();return tree;}
  async function flush(){for(let n=0;n<12;n++){if(dirty)render();await new Promise<void>(resolve=>{setImmediate(resolve);});}if(dirty)render();}
  function nodes(){const result:Element[]=[];function visit(value:any){if(value&&typeof value==='object'&&'children'in value){result.push(value);value.children.forEach(visit);if(value.props.progress)visit(value.props.progress);}}visit(tree);return result;}
  const text=(node:any):string=>node&&typeof node==='object'&&'children'in node?node.children.map(text).join(''):typeof node==='string'?node:'';
  function press(label:string){const node=nodes().find(n=>n.type==='Action'&&text(n)===label);assert.ok(node,label);assert.ok(!node.props.disabled,label);node.props.onPress();}
  return {journal,render,flush,c,calls,closed,nodes,changeSelection:()=>{selectedHead++;},setOpen:(value:boolean)=>{panelOpen=value;if(value)requestId++;dirty=true;},text:()=>text(tree),progressText:()=>text(nodes().find(n=>n.type==='ProviderConnection')?.props.progress),press,finishReservation,background:()=>listeners.forEach(f=>f('background')),resume:()=>listeners.forEach(f=>f('active')),
    verify:()=>{c.visible=false;c.connection={phase:'observed',confirmed:true,observed:{accountNumber:'101',clubLabel:'Example'}};dirty=true;},
    pendingTimers:()=>timers.size,expire:()=>{for(const [id,fn] of timers){timers.delete(id);fn();}},
    admitSource:()=>admitSource(),
    complete:()=>{c.busy=false;c.result='captured';c.completedFlightSource=input;dirty=true;},
    dispose:()=>{for(const hook of hooks)hook?.cleanup?.();},
  };
}

test('opening options does no retrieval; one explicit action verifies, loads, saves and returns a result',async()=>{
  const f=fixture();try{
    f.render();await f.flush();assert.deepEqual(f.calls,[]);
    assert.equal(f.nodes().find(n=>n.type==='ProviderConnection')!.props.guided,false);
    assert.equal(f.text().includes('Quellzeilen'),false);assert.equal(f.text().includes('Geräteordner'),false);
    f.press('Anmelden & Daten laden');await f.flush();
    assert.deepEqual(f.calls,['session','retrieve']);
    f.complete();await f.flush();assert.deepEqual(f.calls,['session','retrieve','save','medical']);
    assert.equal(f.closed.length,0);assert.match(f.progressText(),/3 Flüge auf diesem Gerät gespeichert/);assert.match(f.progressText(),/Medical-Angaben geladen/);
    assert.equal(f.nodes().find(n=>n.type==='ProviderConnection')!.props.open,true);
    assert.ok(f.nodes().some(n=>n.type==='ScrollView'&&n.props.importantForAccessibility==='no-hide-descendants'&&n.props.style?.display==='none'));
    f.press('Fertig');
    assert.equal(f.closed.length,1);assert.equal(f.closed[0].added,2);assert.equal(f.closed[0].from,'2025-01-01');assert.equal(f.closed[0].dutyStatus,'partial');assert.equal(f.journal.snapshot().at(-1)!.outcome,'success');
  }finally{f.dispose();}
});

test('combined entry starts once, while read-only recovery prevents automatic work',async()=>{
  for(const readOnly of [false,true]){
    const f=fixture({startUpdate:true,readOnly});try{
      f.render();await f.flush();await f.flush();
      assert.deepEqual(f.calls,readOnly?[]:['session','retrieve']);
      if(readOnly)assert.equal(f.journal.snapshot().at(-1)!.code,'recovery-required');
      if(readOnly)assert.ok(f.nodes().some(n=>n.props.title==='Bibliothek nur lesbar')); 
    }finally{f.dispose();}
  }
});

test('Medical failure still returns the confirmed flight save and separate Medical outcome',async()=>{
  const f=fixture({startUpdate:true,medicalFailure:true});try{
    f.render();await f.flush();f.complete();await f.flush();
    assert.deepEqual(f.calls,['session','retrieve','save','medical']);
    assert.equal(f.closed.length,0);assert.match(f.progressText(),/Medical konnte nicht geladen werden/);f.press('Zur Übersicht');
    assert.equal(f.closed.length,1);assert.equal(f.closed[0].added,2);assert.equal(f.closed[0].medicalStatus,'failed');assert.equal(f.journal.snapshot().at(-1)!.outcome,'partial');assert.equal(f.journal.snapshot().at(-1)!.code,'medical-failed');
  }finally{f.dispose();}
});

test('cancelled, backgrounded and mismatched load cannot save a late capture',async()=>{
  for(const stop of ['cancel','background','mismatch']){
    const f=fixture({startUpdate:true});try{
      f.render();await f.flush();
      if(stop==='cancel')f.nodes().find(n=>n.type==='ProviderConnection')!.props.close();
      if(stop==='background')f.background();
      if(stop==='mismatch'){f.c.connection={phase:'mismatch',confirmed:false};f.render();}
      await f.flush();f.complete();await f.flush();
      assert.equal(f.calls.includes('save'),false);assert.equal(f.closed.length,0);assert.equal(f.journal.snapshot().at(-1)!.code,stop==='background'?'background':stop==='mismatch'?'account-mismatch':'cancelled');
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

test('flow cannot open native ownership before read admission, and cancellation releases its queued reservation',async()=>{
  const f=fixture({root:true,startUpdate:true,deferReservation:true});
  f.render();await f.flush();assert.deepEqual(f.calls,['reserve']);
  f.dispose();f.finishReservation();await f.flush();
  assert.deepEqual(f.calls,['reserve','release']);
});

test('startup failure releases reserved reader access on exit without creating new storage',async()=>{
  const f=fixture({root:true,startUpdate:true,failStartup:true});
  f.render();await f.flush();assert.deepEqual(f.calls,['reserve','registry']);
  f.dispose();await f.flush();assert.deepEqual(f.calls,['reserve','registry','release']);
});

test('interactive login has no flight timeout and foreground return needs verification before retrieval',async()=>{
  const f=fixture({startUpdate:true,loginPending:true});try{
    f.render();await f.flush();assert.deepEqual(f.calls,['session']);assert.equal(f.pendingTimers(),0);
    f.expire();await f.flush();assert.equal(f.closed.length,0);assert.match(f.progressText(),/Bitte bei Vereinsflieger anmelden/);
    f.background();f.background();await f.flush();assert.equal(f.calls.includes('retrieve'),false);assert.match(f.progressText(),/Anmeldung pausiert/);
    f.resume();await f.flush();assert.deepEqual(f.calls,['session','resume']);assert.equal(f.pendingTimers(),0);
    f.verify();await f.flush();assert.deepEqual(f.calls,['session','resume','retrieve']);assert.equal(f.pendingTimers(),1);
    f.complete();await f.flush();assert.equal(f.pendingTimers(),0);assert.equal(f.closed.length,0);f.press('Fertig');assert.equal(f.closed.length,1);
  }finally{f.dispose();}
});

test('a retrieval timeout stays in the progress screen with retry and no confirmed save',async()=>{
  const f=fixture({startUpdate:true});try{
    f.render();await f.flush();f.expire();await f.flush();
    assert.equal(f.calls.includes('save'),false);assert.equal(f.closed.length,0);
    assert.equal(f.nodes().find(n=>n.type==='ProviderConnection')!.props.open,true);
    assert.match(f.progressText(),/Datenabruf hat zu lange gedauert/);
    f.press('Erneut versuchen');await f.flush();assert.equal(f.calls.filter(v=>v==='session').length,2);
  }finally{f.dispose();}
});

for(const status of ['Provider page failed to load. Previous captures preserved.','Provider returned an HTTP error. Previous captures preserved.']){
  test(`failed fresh login opening exposes guidance and explicit retry: ${status}`,async()=>{
    const f=fixture({startUpdate:true,loginPending:true});try{
      f.render();await f.flush();assert.deepEqual(f.calls,['session']);assert.equal(f.pendingTimers(),0);
      f.c.visible=false;f.c.result='failed';f.c.status=status;f.render();await f.flush();
      assert.match(f.progressText(),/Anbieterseite/);assert.equal(f.pendingTimers(),0);
      assert.deepEqual(f.calls,['session']);assert.equal(f.closed.length,0);
      f.press('Erneut versuchen');await f.flush();
      assert.deepEqual(f.calls,['session','session']);assert.equal(f.c.result,'none');
      assert.match(f.progressText(),/Bitte bei Vereinsflieger anmelden/);
      f.verify();await f.flush();assert.deepEqual(f.calls,['session','session','retrieve']);
      f.complete();await f.flush();assert.deepEqual(f.calls,['session','session','retrieve','save','medical']);
    }finally{f.dispose();}
  });
}

test('leaving a completed progress screen retains its saved result but invalidates session presentation',async()=>{
  const f=fixture({startUpdate:true});try{
    f.render();await f.flush();f.complete();await f.flush();assert.equal(f.closed.length,0);
    f.background();f.resume();await f.flush();
    assert.match(f.progressText(),/3 Flüge auf diesem Gerät gespeichert/);f.press('Fertig');
    assert.equal(f.closed.length,1);assert.equal(f.closed[0].added,2);assert.equal(f.closed[0].verifiedConnection,undefined);
  }finally{f.dispose();}
});

test('interruption before browser readiness starts guided login once readiness returns',async()=>{
  const f=fixture({startUpdate:true,loginPending:true,deferProvider:true});try{
    f.render();await f.flush();assert.deepEqual(f.calls,[]);
    f.background();f.resume();await f.flush();assert.deepEqual(f.calls,[]);
    f.c.viewReady=true;f.render();await f.flush();assert.deepEqual(f.calls,['session']);
    assert.match(f.progressText(),/Bitte bei Vereinsflieger anmelden/);assert.equal(f.pendingTimers(),0);
  }finally{f.dispose();}
});

test('a preserved login form returns to sign-in guidance even without a provider state change',async()=>{
  const f=fixture({startUpdate:true,loginPending:true,quietResume:true});try{
    f.render();await f.flush();f.background();await f.flush();f.resume();await f.flush();
    assert.deepEqual(f.calls,['session','resume']);assert.match(f.progressText(),/Bitte bei Vereinsflieger anmelden/);
    assert.doesNotMatch(f.progressText(),/nach der Rückkehr geprüft/);
  }finally{f.dispose();}
});

test('both Android credential dialogs retain the original login surface until sign-in resumes',async()=>{
  const f=fixture({startUpdate:true,loginPending:true,quietResume:true});try{
    f.render();await f.flush();
    const login=()=>f.nodes().find(n=>n.type==='ProviderConnection')!.props;
    for(let dialog=0;dialog<2;dialog++){
      f.background();await f.flush();f.background();await f.flush();
      assert.match(f.progressText(),/Anmeldung pausiert/);
      assert.equal(login().open,true);
      assert.equal(login().controller.visible,true);
      assert.equal(login().controller.visible,true,'The system credential dialog must not hide its target login surface');
      assert.equal(f.pendingTimers(),0);assert.equal(f.calls.includes('retrieve'),false);
      f.resume();await f.flush();
      assert.match(f.progressText(),/Bitte bei Vereinsflieger anmelden/);
      assert.equal(login().controller.visible,true);
    }
    assert.deepEqual(f.calls,['session','resume','resume']);
    f.verify();await f.flush();assert.deepEqual(f.calls,['session','resume','resume','retrieve']);
    f.complete();await f.flush();assert.equal(f.calls.filter(call=>call==='save').length,1);
  }finally{f.dispose();}
});

test('cancelling while Android credentials are open revokes the login surface and automatic continuation',async()=>{
  const f=fixture({startUpdate:true,loginPending:true});try{
    f.render();await f.flush();f.background();await f.flush();
    f.nodes().find(n=>n.type==='ProviderConnection')!.props.close();await f.flush();
    assert.equal(f.nodes().find(n=>n.type==='ProviderConnection')!.props.controller.visible,false);
    f.resume();f.verify();await f.flush();
    assert.equal(f.calls.includes('resume'),false);assert.equal(f.calls.includes('retrieve'),false);assert.equal(f.calls.includes('save'),false);
  }finally{f.dispose();}
});

test('a delayed source request and same-window retry start without incidental controller state updates',async()=>{
  const f=fixture({startUpdate:true,deferSource:true,sameWindow:true});try{
    f.render();await f.flush();assert.deepEqual(f.calls,[]);
    f.admitSource();await f.flush();assert.deepEqual(f.calls,['session','retrieve']);
    f.nodes().find(n=>n.type==='ProviderConnection')!.props.close();await f.flush();
    f.press('Erneut versuchen');await f.flush();f.admitSource();await f.flush();
    assert.deepEqual(f.calls,['session','retrieve','session','retrieve']);
  }finally{f.dispose();}
});

test('fresh verification cannot consume an old confirmed or error state from the initiating render',async()=>{
  for(const priorConnection of ['verified','error']){
    const f=fixture({startUpdate:true,deferVerification:true,priorConnection});try{
      f.render();await f.flush();assert.deepEqual(f.calls,['session']);
      assert.equal(f.progressText().includes('nicht abgeschlossen'),false);
      f.verify();await f.flush();assert.deepEqual(f.calls,['session','retrieve']);
    }finally{f.dispose();}
  }
});

test('fresh sign-in clears a previous failed result before waiting indefinitely for the user',async()=>{
  const f=fixture({startUpdate:true,loginPending:true,sameWindow:true});try{
    f.c.result='failed';f.c.status='Provider page failed to load. Previous captures preserved.';
    f.render();await f.flush();assert.deepEqual(f.calls,['session']);assert.equal(f.c.result,'none');
    assert.match(f.progressText(),/Bitte bei Vereinsflieger anmelden/);assert.equal(f.pendingTimers(),0);
    f.expire();await f.flush();assert.deepEqual(f.calls,['session']);assert.equal(f.closed.length,0);
    f.verify();await f.flush();assert.deepEqual(f.calls,['session','retrieve']);
  }finally{f.dispose();}
});


test('connection-only entry opens the provider directly and never starts flight retrieval',async()=>{
  const f=fixture({intent:'connect',loginPending:true});try{
    f.render();await f.flush();assert.deepEqual(f.calls,['session']);
    assert.equal(f.nodes().find(n=>n.type==='ProviderConnection')!.props.open,true);
    assert.ok(f.nodes().some(n=>n.type==='Section'&&n.props.title==='Vereinsflieger'));
    f.background();await f.flush();f.resume();await f.flush();assert.deepEqual(f.calls,['session']);
    f.verify();await f.flush();assert.match(f.progressText(),/Verbunden/);assert.deepEqual(f.calls,['session']);
    f.press('Daten aktualisieren');await f.flush();assert.deepEqual(f.calls,['session','session']);f.verify();await f.flush();assert.deepEqual(f.calls,['session','session','retrieve']);
    f.complete();await f.flush();assert.deepEqual(f.calls,['session','session','retrieve','save','medical']);
  }finally{f.dispose();}
});

test('closing and reopening connection retains the controller and creates no hidden work',async()=>{
  const f=fixture({intent:'connect',loginPending:true});try{
    f.render();await f.flush();const first=f.nodes().find(n=>n.type==='ProviderConnection')!.props.controller;
    f.c.dismissLogin();f.setOpen(false);await f.flush();assert.equal(f.nodes().find(n=>n.type==='ProviderConnection')!.props.open,false);
    assert.deepEqual(f.calls,['session']);
    f.setOpen(true);await f.flush();const reopened=f.nodes().find(n=>n.type==='ProviderConnection')!.props.controller;
    assert.equal(reopened.retrieval,first.retrieval);assert.deepEqual(f.calls,['session','session']);
    assert.equal(reopened.visible,true);assert.equal(f.calls.includes('save'),false);
  }finally{f.dispose();}
});


test('Medical-only retry verifies the account again and never repeats a confirmed flight save',async()=>{
  const f=fixture({startUpdate:true,medicalFailure:true});try{
    f.render();await f.flush();f.complete();await f.flush();
    f.press('Nur Medical erneut laden');await f.flush();assert.deepEqual(f.calls,['session','retrieve','save','medical','verify-job']);
    f.verify();await f.flush();assert.deepEqual(f.calls,['session','retrieve','save','medical','verify-job','medical']);
    assert.match(f.progressText(),/3 Flüge auf diesem Gerät gespeichert/);assert.match(f.progressText(),/Erneuter Abruf nicht abgeschlossen/);
    assert.equal(f.calls.filter(x=>x==='save').length,1);assert.equal(f.journal.snapshot().at(-1)!.code,'medical-failed');
  }finally{f.dispose();}
});


test('foreign-account proof blocks an independent retry while preserving the confirmed flight result',async()=>{
  const f=fixture({startUpdate:true,medicalFailure:true});try{
    f.render();await f.flush();f.complete();await f.flush();f.press('Nur Medical erneut laden');await f.flush();
    f.c.connection={phase:'mismatch',confirmed:false};f.render();await f.flush();
    assert.deepEqual(f.calls,['session','retrieve','save','medical','verify-job']);
    assert.match(f.progressText(),/3 Flüge auf diesem Gerät gespeichert/);assert.equal(f.closed.length,0);
  }finally{f.dispose();}
});


test('renewed capabilities for one owner selection cannot replace the retained provider host',async()=>{
  const f=fixture({root:true,existingOwner:true,intent:'connect'});try{
    f.render();await f.flush();const host=()=>f.nodes().find(n=>typeof n.type==='function'&&(n.type as Function).name==='OwnerFlightLibrary')!;
    const first=host();assert.ok(first);
    f.setOpen(false);await f.flush();f.setOpen(true);await f.flush();const reopened=host();
    assert.notEqual(reopened.props.lease.leaseId,first.props.lease.leaseId,'The registry renews capabilities when reopened');
    assert.equal(reopened.props.key,first.props.key,'A fresh capability does not mean a different owner selection');
    f.setOpen(false);await f.flush();f.changeSelection();f.setOpen(true);await f.flush();
    assert.notEqual(host().props.key,first.props.key,'Changing the actual selection must revoke and replace the old host');
  }finally{f.dispose();}
});

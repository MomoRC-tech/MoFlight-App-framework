import * as syncProgress from '../../apps/platform-lab/src/mobile/sync-progress.ts';
import { DiagnosticJournal } from '../../apps/platform-lab/src/diagnostics';

test('ordinary sync reports actual stages while login is minimal and completion runs once',async()=>{
  const f=fixture({intent:'update'});try{
    f.render();await f.flush();assert.ok(f.progressUpdates.some(p=>p.last==='prepare'),'Local preparation is the first confirmed row');f.verify();await f.flush();
    assert.equal(f.nodes().find(n=>n.type==='ProviderConnection')!.props.minimal,true);
    assert.ok(f.progressUpdates.some(p=>p.current==='flights'));
    assert.ok(!f.progressUpdates.some(p=>p.last==='save'),'No confirmed save before source completion');
    f.complete();await f.flush();
    assert.equal(f.closed.length,1);
    const events=f.journal.journey().filter(e=>e.kind==='sync').map(e=>e.target);
    assert.ok(events.includes('sync-flights'));assert.ok(events.includes('sync-save'));assert.ok(events.includes('sync-success'));
  }finally{f.dispose();}
});
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as policy from '../../apps/platform-lab/src/mobile/core-flight-review-policy.ts';
import { planFlightRetrieval } from '../../apps/platform-lab/src/vereinsflieger/retrieval-policy.ts';
import { dataFreshness } from '../../apps/platform-lab/src/mobile/data-freshness.ts';
import * as accountJobs from '../../apps/platform-lab/src/mobile/account-retrieval-jobs.ts';
import * as activityLedger from '../../apps/platform-lab/src/mobile/activity-ledger.ts';
import * as activitySync from '../../apps/platform-lab/src/mobile/activity-sync.ts';
import { retrievalFailureHint } from '../../apps/platform-lab/src/vereinsflieger/connection-state.ts';
import { startSessionMonitor } from '../../apps/platform-lab/src/mobile/session-monitor.ts';
import { canonical } from '../../packages/flight-logbook/src/index.ts';

interface Element { type: string; props: Record<string, any>; children: unknown[] }
const source=ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/mobile/CoreFlightFoundation.tsx',import.meta.url),'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:false},
}).outputText+'\nexports.OwnerFlightLibrary=OwnerFlightLibrary;';
const fixtureActivityScope={version:1 as const,owner:'owner',connectionId:'connection',context:{accountNumber:'101',clubLabel:'Example',clubIdentity:'display-label-only' as const,verification:'observed-profile-number' as const}};
const fixtureActivityIdentity={owner:'owner',store:'store',connection:'connection',account:'101',club:'Example'};
const fixtureActivityConfiguration=`activity-v1:sha256:${'c'.repeat(64)}`;
const fixtureActivityWindow={from:'2025-01-01',to:'2026-10-21'};
const cloneJson=<T>(value:T):T=>JSON.parse(JSON.stringify(value)) as T;
const fixtureActivityLedger={
  createActivityLedger:(identity:unknown)=>activityLedger.createActivityLedger(cloneJson(identity) as any),
  decodeActivityLedger:(value:unknown,identity:unknown)=>activityLedger.decodeActivityLedger(cloneJson(value),cloneJson(identity) as any),
  activityCheckDue:(ledger:unknown,now:number)=>activityLedger.activityCheckDue(cloneJson(ledger) as any,now),
  recordActivityAttempt:(ledger:unknown,now:number)=>activityLedger.recordActivityAttempt(cloneJson(ledger) as any,now),
  observeActivityLedger:(ledger:unknown,sources:unknown,observedAt:number,now:number)=>activityLedger.observeActivityLedger(cloneJson(ledger) as any,cloneJson(sources) as any,observedAt,now),
  activityLedgerChanged:(ledger:unknown)=>activityLedger.activityLedgerChanged(cloneJson(ledger) as any),
};

// Real screen effects and handlers; SQLite and provider behavior have their own
// integration tests. These ports control timing to exercise the screen coordinator.
function fixture({providerAllowed=true,deferRead=false,startUpdate=false,root=false,readOnly=false,deferReservation=false,deferActivityCancel=false,deferActivityWrite=false,failStartup=false,medicalFailure=false,loginPending=false,deferProvider=false,quietResume=false,deferSource=false,sameWindow=false,deferVerification=false,priorConnection='unknown',existingOwner=false,pendingRestore=false,cancelRestore=false,initialOpen=true,unactivatedPreparation=false,activityEnabled=false,activityBaselineCount=1,activityResultCount=2,onStatus:statusCallback=undefined as ((status:any)=>void)|undefined,intent:requestedIntent=undefined as string|undefined}={}) {
  let panelOpen=initialOpen,requestId=0;
  const journal=new DiagnosticJournal(), diagnosis={current:journal.begin(startUpdate?'update-flights':'open-flight-tools')};
  const hooks:any[]=[],effects:(()=>void)[]=[],calls:string[]=[],activityOrder:string[]=[],closed:any[]=[];
  let index=0,dirty=true,tree:Element,abort:AbortController|null=null;
  let finishRead!:()=>void;
  const storedRead=new Promise<void>(resolve=>{finishRead=resolve;});
  let finishActivityCancel!:()=>void;
  const activityCancel=new Promise<void>(resolve=>{finishActivityCancel=resolve;});
  let finishActivityWrite!:()=>void;
  const activityWrite=new Promise<void>(resolve=>{finishActivityWrite=resolve;});
  let finishReservation!:()=>void;
  const reservation=new Promise<void>(resolve=>{finishReservation=resolve;});
  const listeners=new Set<(state:string)=>void>();
  let saved=false,timerId=0;
  const timers=new Map<number,()=>void>();
  let admitSource!:()=>void;
  let activityChecks=0,pendingRestoreChecks=0;
  let activityWriteCalls=0;
  const activityLedgerSaves:unknown[]=[],statusUpdates:any[]=[];
  const initialActivityAt=Date.now()-1000;
  const trackedActivity=[{source:'flights' as const,configuration:fixtureActivityConfiguration,markers:{count:activityBaselineCount},window:fixtureActivityWindow,participation:'Pilot oder Fluglehrer'}];
  let savedActivityLedger:unknown=activityEnabled?activityLedger.observeActivityLedger(activityLedger.createActivityLedger(fixtureActivityIdentity),trackedActivity,initialActivityAt,initialActivityAt+1):null;
  let lease={ownerId:'owner',storeId:'store',leaseId:'lease'};
  let ownerProof=0,selectedHead=1;
  const registry={currentOwner:async()=>existingOwner?{...lease,selectionSeq:selectedHead,leaseId:'proof-'+(++ownerProof)}:null,createFreshOwner:async()=>{calls.push('create');return lease;},assertCurrent:async()=>{},close:async()=>{}};
  const snapshot={account:null,savedRetrievals:[],coverage:[],pending:[],recovery:{readOnly}};
  const input={capture:{captureId:'fresh',rows:[]},requestedWindow:{from:'2025-01-01',to:'2026-10-21'}};
  const c:any={viewReady:true,browserActive:false,from:sameWindow?'2025-01-01':'',to:sameWindow?'2026-10-21':'',connection:priorConnection==='verified'?{phase:'observed',confirmed:true,observed:{accountNumber:'101',clubLabel:'Example'}}:{phase:priorConnection,confirmed:false},
    activityScope:activityEnabled?fixtureActivityScope:undefined,
    busy:false,saving:false,restoring:{current:false},visible:false,recovery:false,result:'none',completedFlightSource:null,
    retrieval:{current:{state:{phase:'idle'}}},checkSession:()=>calls.push('quiet-session'),
    checkActivity:async(beforeStart:()=>Promise<void>)=>{activityChecks++;activityOrder.push('activity-probe');await beforeStart();return {observedAt:Date.now(),sources:[{source:'flights',configuration:fixtureActivityConfiguration,markers:{count:activityResultCount},window:fixtureActivityWindow,participation:'Pilot oder Fluglehrer'}]};},
    setFrom:(v:string)=>{if(c.from!==v){c.from=v;dirty=true;}},setTo:(v:string)=>{if(c.to!==v){c.to=v;dirty=true;}},
    beginGuidedFlightConnection:()=>{calls.push('session');c.result='none';if(deferVerification)c.connection={phase:'checking',confirmed:false};else if(loginPending)c.visible=true;else c.connection={phase:'observed',confirmed:true,observed:{accountNumber:'101',clubLabel:'Example'}};dirty=true;},
    resumeGuidedFlightConnection:()=>{calls.push('resume');if(!quietResume){c.connection={phase:'unknown',confirmed:false};c.visible=true;dirty=true;}return true;},
    endGuidedFlightConnection:()=>{},connect:()=>calls.push('login'),
    retrieveFeatureInformation:async(category:string)=>{calls.push(category);return {rows:[{}]};},
    retrieveMedical:async()=>{calls.push('medical');if(medicalFailure)throw new Error('Synthetic Medical failure');return {rows:[{}]};},
    cancelActivity:async()=>{activityOrder.push('cancel-start');if(deferActivityCancel)await activityCancel;activityOrder.push('cancel-finish');},
    checkConnection:(action?:string)=>{if(action==='check'){calls.push('verify-job');c.connection={phase:'checking',confirmed:false};}else{calls.push('retrieve');c.busy=true;}dirty=true;return true;},
    dismissLogin:()=>{c.visible=false;c.busy=false;dirty=true;},backWithinProvider:()=>false,cancelRetrieval:()=>{c.busy=false;dirty=true;},
  };
  class Service {
    disposed=false;
    constructor(...args:any[]) { this.ports=args[3]; }
    ports:any;
    async readStored(){activityOrder.push('refresh-read');if(deferRead)await storedRead;return {snapshot,flights:saved?[{},{},{}]:[]};}
    async recoverPending(){return {status:'none'};}
    async prepareFreshFetch(){return {status:'none'};}
    async retrieveUpdate(){if(deferSource)await new Promise<void>(resolve=>{admitSource=resolve;});abort=new AbortController();if(deferProvider)c.viewReady=false;const value=await this.ports.retrieve({from:'2025-01-01',to:'2026-10-21'},abort.signal);return {state:'confirm-account',accountRef:'101',source:value};}
    async saveVerifiedReview(_review:any,context:any){assert.equal(context.accountNumber,'101');calls.push('save');saved=true;return {counts:{added:2,changed:1,pending:0}};}
    cancelReview(){abort?.abort();}
    dispose(){this.disposed=true;this.cancelReview();}
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
    '../user-backup-native':{getPendingUserBackupRestoreNative:async()=>{pendingRestoreChecks++;return pendingRestore?{operationId:'pending',ownerId:'owner',storeId:'store'}:null;},
      restoreUserBackupFromPickerNative:async(_scope:any,_gate:any,id:string)=>{calls.push('resume-'+id);if(cancelRestore)return {state:'cancelled'};pendingRestore=false;return {state:'restored'};}},
    './sync-progress':syncProgress,'./session-monitor':{startSessionMonitor},
    './activity-ledger':fixtureActivityLedger,
    './activity-sync':activitySync,
    '../vereinsflieger/scoped-storage':{
      loadScopedActivity:async()=>{activityOrder.push('activity-cache-load');return savedActivityLedger===null?null:cloneJson(savedActivityLedger);},
      saveScopedActivity:async(_scope:any,_store:string,value:unknown,gate:()=>void)=>{gate();const write=++activityWriteCalls;if(deferActivityWrite&&write===1)activityOrder.push('activity-cache-save-pending');if(deferActivityWrite&&write===1)await activityWrite;gate();activityOrder.push('activity-cache-save');savedActivityLedger=cloneJson(value);activityLedgerSaves.push(cloneJson(value));gate();},
    },
    '@moflight/flight-logbook':{canonical},
    './account-retrieval-jobs':accountJobs, '../diagnostics':{diagnosticJournal:journal},
    '../vereinsflieger/duty-refresh-native':{refreshDutyRoster:async()=>({rows:[],partial:true})},
    '../vereinsflieger/connection-state':{retrievalFailureHint},
    'react-native':{...leaves(['ActivityIndicator','ScrollView','View']),AppState:{currentState:'active',addEventListener:(_:string,f:(state:string)=>void)=>{listeners.add(f);return {remove:()=>listeners.delete(f)};}},BackHandler:{addEventListener:()=>({remove(){}})}},
    'react-native-safe-area-context':leaves(['SafeAreaView']), 'expo-crypto':{randomUUID:()=> 'uuid'},'../storage':{hash:async()=>''},
    '../vereinsflieger/flight-diagnostics':{timeFlightStage:(_:string,work:()=>unknown)=>work()},
    '../vereinsflieger/use-access-controller':{useAccessController:()=>({...c})},
    '../vereinsflieger/real-flight-native':{openOwnerRegistry:async()=>{calls.push('registry');if(failStartup)throw new Error('Startup interrupted');return registry;},openRealFlightSelection:async()=>({listRestorePreparations:async()=>unactivatedPreparation?[{operationId:"prepared",status:"pending"}]:[],close:async()=>{}})},
    '../vereinsflieger/real-flight-owner-setup':{continueRealFlightOwnerSetup:async()=>true},
    '../vereinsflieger/real-flight-service':{RealFlightService:Service,PendingRealFlightOperation:class extends Error{}},
    './core-flight-review-policy':policy,'../vereinsflieger/real-flight-backup-native':{},
    './own-flight-reader-native':{ownFlightReadPorts:{suspend:async()=>{calls.push('reserve');if(deferReservation)await reservation;return ()=>calls.push('release');}}},
    './ConnectionSettings':{ConnectionSettings:'ConnectionSettings'},'./ProviderConnection':leaves(['ProviderConnection']),'./theme':{...leaves(['Action','Card','Label','Section']),colors:{}},
    '../vereinsflieger/retrieval-policy':{planFlightRetrieval},'./data-freshness':{dataFreshness},
  };
  c.beginFreshFlightConnection=()=>{c.beginGuidedFlightConnection();return true;};
  const progressUpdates:syncProgress.SyncProgress[]=[];
  const exports:any={};runInNewContext(source,{exports,require:(name:string)=>{assert.ok(name in modules,name);return modules[name];},setTimeout:(fn:()=>void)=>{timers.set(++timerId,fn);return timerId;},clearTimeout:(id:number)=>timers.delete(id),console,Error});
  function render(){dirty=false;index=0;tree=root?exports.CoreFlightFoundation({providerEntryAllowed:providerAllowed,startUpdate,intent:requestedIntent,open:panelOpen,requestId,onProgress:(value:syncProgress.SyncProgress)=>progressUpdates.push(value),close:(v:any)=>closed.push(v),onStatus:statusCallback}):exports.OwnerFlightLibrary({providerEntryAllowed:providerAllowed,lease,registry,startUpdate,intent:requestedIntent,open:panelOpen,requestId,onProgress:(value:syncProgress.SyncProgress)=>progressUpdates.push(value),close:(v:any)=>closed.push(v),onStatus:(status:any)=>{statusUpdates.push(cloneJson(status));statusCallback?.(status);},takeInitialRepository:()=>null,diagnosis});while(effects.length)effects.shift()!();return tree;}
  async function flush(){for(let n=0;n<12;n++){if(dirty)render();await new Promise<void>(resolve=>{setImmediate(resolve);});}if(dirty)render();}
  function nodes(){const result:Element[]=[];function visit(value:any){if(value&&typeof value==='object'&&'children'in value){result.push(value);value.children.forEach(visit);if(value.props.progress)visit(value.props.progress);}}visit(tree);return result;}
  const text=(node:any):string=>node&&typeof node==='object'&&'children'in node?node.children.map(text).join(''):typeof node==='string'?node:'';
  function press(label:string){const node=nodes().find(n=>n.type==='Action'&&text(n)===label);assert.ok(node,label);assert.ok(!node.props.disabled,label);node.props.onPress();}
  return {renewLease:()=>{lease={...lease,leaseId:'renewed'};dirty=true;},progressUpdates,journal,render,flush,c,calls,closed,nodes,activityChecks:()=>activityChecks,activityWriteCalls:()=>activityWriteCalls,pendingRestoreChecks:()=>pendingRestoreChecks,activityLedgerSaves:()=>activityLedgerSaves.map(cloneJson),savedActivityLedger:()=>savedActivityLedger===null?null:cloneJson(savedActivityLedger),statusUpdates,changeSelection:()=>{selectedHead++;},setOpen:(value:boolean)=>{panelOpen=value;if(value)requestId++;dirty=true;},text:()=>text(tree),progressText:()=>text(nodes().find(n=>n.type==='ProviderConnection')?.props.progress),press,finishReservation,background:()=>listeners.forEach(f=>f('background')),resume:()=>listeners.forEach(f=>f('active')),
    verify:()=>{c.visible=false;c.connection={phase:'observed',confirmed:true,observed:{accountNumber:'101',clubLabel:'Example'}};dirty=true;},
    pendingTimers:()=>timers.size,expire:()=>{for(const [id,fn] of timers){timers.delete(id);fn();}},
    finishRead:()=>finishRead(),
    finishActivityCancel:()=>finishActivityCancel(),finishActivityWrite:()=>finishActivityWrite(),activityOrder,
    admitSource:()=>admitSource(),
    complete:()=>{c.busy=false;c.result='captured';c.completedFlightSource=input;dirty=true;},
    dispose:()=>{for(const hook of hooks)hook?.cleanup?.();},
  };
}

test('non-header administration cannot start provider work or expose login, even with a retained visible controller',async()=>{
  for(const intent of ['options','connect','update','development']){
    const f=fixture({providerAllowed:false,intent});
    try{
      f.render();await f.flush();f.c.visible=true;f.render();await f.flush();
      assert.deepEqual(f.calls,[],intent);
      assert.equal(f.nodes().find(n=>n.type==='ProviderConnection')!.props.open,false,intent);
      assert.equal(f.nodes().some(n=>n.type==='Action'&&n.children.includes('Anmelden & Daten laden')),false);
      assert.match(f.text(),/Kopfzeile/);
    }finally{f.dispose();}
  }
});

test('opening options does no retrieval; one explicit action verifies, loads, saves and returns a result',async()=>{
  const f=fixture();try{
    f.render();await f.flush();assert.deepEqual(f.calls,[]);
    assert.equal(f.nodes().find(n=>n.type==='ProviderConnection')!.props.guided,false);
    assert.equal(f.text().includes('Quellzeilen'),false);assert.equal(f.text().includes('Geräteordner'),false);
    f.press('Daten synchronisieren');await f.flush();
    assert.deepEqual(f.calls,['session','retrieve']);
    f.complete();await f.flush();assert.deepEqual(f.calls,['session','retrieve','save','medical','events','document-notices','work-summary','work-hours','tasks']);
    assert.equal(f.closed.length,1);assert.match(f.progressText(),/3 Flüge auf diesem Gerät gespeichert/);assert.match(f.progressText(),/Medical-Angaben geladen/);;
    assert.equal(f.nodes().find(n=>n.type==='ProviderConnection')!.props.open,true);
    assert.ok(f.nodes().some(n=>n.type==='ScrollView'&&n.props.importantForAccessibility==='no-hide-descendants'&&n.props.style?.display==='none'));
    await f.flush();
    assert.equal(f.closed.length,1);assert.equal(f.closed[0].added,2);assert.equal(f.closed[0].from,'2025-01-01');assert.equal(f.closed[0].dutyStatus,'partial');assert.equal(f.journal.snapshot().at(-1)!.outcome,'success');
    assert.equal(f.closed[0].ownerId,'owner');assert.equal(f.closed[0].storeId,'store');assert.equal(f.closed[0].accountRef,'101');
    assert.equal(new Date(f.closed[0].completedAt).toISOString(),f.closed[0].completedAt,'The coordinator records an actual completion time');
  }finally{f.dispose();}
});

test('library refresh waits for an activity request to cancel before reading or updating', async () => {
  const f=fixture({deferActivityCancel:true});
  try {
    f.render(); await f.flush();
    assert.deepEqual(f.activityOrder,['cancel-start']);
    assert.equal(f.activityOrder.includes('refresh-read'),false,'Stored flight state must not be read while provider activity still owns the browser');
    f.finishActivityCancel(); await f.flush();
    assert.deepEqual(f.activityOrder.slice(0,3),['cancel-start','cancel-finish','refresh-read']);
  } finally { f.dispose(); }
});

test('explicit entry waits for a pending quiet-activity cache write before reading stored flights', async () => {
  const f=fixture({initialOpen:false,priorConnection:'verified',activityEnabled:true,activityBaselineCount:3,activityResultCount:4,deferActivityWrite:true});
  try {
    f.render(); await f.flush();
    assert.equal(f.activityChecks(),1,'The confirmed, bound quiet pipeline starts its baseline comparison');
    assert.equal(f.activityWriteCalls(),1,'The hourly-attempt cache write is still pending');
    assert.deepEqual(f.activityOrder,['activity-cache-load','activity-probe','activity-cache-save-pending']);

    f.setOpen(true); await f.flush();
    assert.ok(f.activityOrder.includes('cancel-finish'),'Explicit entry completes provider cancellation');
    assert.equal(f.activityOrder.includes('refresh-read'),false,'Stored state must wait for the pending native cache write even after cancellation resolves');

    f.finishActivityWrite(); await f.flush();
    const cacheWriteDone=f.activityOrder.indexOf('activity-cache-save');
    const refreshRead=f.activityOrder.indexOf('refresh-read');
    assert.ok(cacheWriteDone>=0,'The deferred scoped cache write completes after release');
    assert.ok(refreshRead>cacheWriteDone,'Stored flights are read only after the in-flight activity write settles');
  } finally { f.dispose(); }
});

test('quiet activity observation updates the scoped ledger and reports a later count change', async () => {
  const f=fixture({initialOpen:false,priorConnection:'verified',activityEnabled:true,activityBaselineCount:3,activityResultCount:4});
  try {
    f.render(); await f.flush();
    assert.equal(f.pendingRestoreChecks(),1);
    assert.equal(f.activityChecks(),1);
    assert.deepEqual(f.activityOrder.slice(0,4),['activity-cache-load','activity-probe','activity-cache-save','activity-cache-save']);
    assert.equal(f.activityLedgerSaves().length,2,'The hourly attempt and resulting observation are both persisted in the scoped cache');
    const ledger=activityLedger.decodeActivityLedger(f.savedActivityLedger(),fixtureActivityIdentity);
    assert.equal(ledger.entries.length,1);
    assert.equal(ledger.entries[0]!.signal.baseline?.markers.count,4);
    assert.notEqual(ledger.entries[0]!.signal.hintSince,null,'A later count difference becomes an advisory hint');
    assert.equal(f.statusUpdates[0]?.activity.changed,false);
    assert.equal(f.statusUpdates.some(status=>status.activity.changed===true),true,'The later hint change is published through provider status');
  } finally { f.dispose(); }
});

test('pending user-backup restore blocks the quiet activity probe for a confirmed session', async () => {
  const f=fixture({initialOpen:false,priorConnection:'verified',activityEnabled:true,pendingRestore:true});
  try {
    f.render(); await f.flush();
    assert.equal(f.pendingRestoreChecks(),1,'The Core guard checks the owner-scoped pending restore before asking the provider');
    assert.equal(f.activityChecks(),0,'A confirmed session still cannot start a quiet probe during restore');
    assert.equal(f.activityLedgerSaves().length,0,'No hourly-attempt or observation state is saved when restore blocks admission');
    assert.equal(f.statusUpdates.some(status=>status.activity.changed===true),false);
  } finally { f.dispose(); }
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
    assert.deepEqual(f.calls,['session','retrieve','save','medical','events','document-notices','work-summary','work-hours','tasks']);
    assert.equal(f.closed.length,1);assert.match(f.progressText(),/Medical konnte nicht geladen werden/);
    assert.equal(f.closed.length,1);assert.equal(f.closed[0].added,2);assert.equal(f.closed[0].medicalStatus,'failed');assert.equal(f.journal.snapshot().at(-1)!.outcome,'partial');assert.equal(f.journal.snapshot().at(-1)!.code,'medical-failed');
  }finally{f.dispose();}
});

test('annual work refresh failure leaves the saved flight receipt intact and does not block own-task retrieval',async()=>{
  const f=fixture({startUpdate:true});try{
    f.c.retrieveFeatureInformation=async(category:string)=>{f.calls.push(category);if(category==='work-summary')throw new Error('Synthetic unavailable');return {rows:category==='tasks'||category==='work-hours'?[]:[{}]};};
    f.render();await f.flush();f.complete();await f.flush();
    assert.deepEqual(f.calls,['session','retrieve','save','medical','events','document-notices','work-summary','work-hours','tasks']);
    assert.equal(f.closed.length,1);assert.equal(f.closed[0].added,2);assert.equal(f.closed[0].workSummaryStatus,'failed');assert.equal(f.closed[0].workHoursStatus,'partial');assert.equal(f.closed[0].tasksStatus,'partial');
    assert.match(f.progressText(),/Arbeitsstunden · Jahresübersicht: Abruf fehlgeschlagen/);assert.match(f.progressText(),/Erfasste Arbeitsstunden: Quelle erfasst/);assert.match(f.progressText(),/Eigene Aufgaben: Quelle erfasst/);
    assert.equal(f.journal.snapshot().at(-1)!.outcome,'partial');assert.equal(f.journal.snapshot().at(-1)!.code,'operation-failed');
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
    f.expire();await f.flush();assert.equal(f.closed.length,0);assert.match(f.progressText(),/Bitte anmelden/);
    f.background();f.background();await f.flush();assert.equal(f.calls.includes('retrieve'),false);assert.match(f.progressText(),/Anmeldung pausiert/);
    f.resume();await f.flush();assert.deepEqual(f.calls,['session','resume']);assert.equal(f.pendingTimers(),0);
    f.verify();await f.flush();assert.deepEqual(f.calls,['session','resume','retrieve']);assert.equal(f.pendingTimers(),1);
    f.complete();await f.flush();assert.equal(f.pendingTimers(),0);assert.equal(f.closed.length,1);
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
      assert.match(f.progressText(),/Bitte anmelden/);
      f.verify();await f.flush();assert.deepEqual(f.calls,['session','session','retrieve']);
      f.complete();await f.flush();assert.deepEqual(f.calls,['session','session','retrieve','save','medical','events','document-notices','work-summary','work-hours','tasks']);
    }finally{f.dispose();}
  });
}

test('completion returns once even if a retained screen receives duplicate source events',async()=>{
  const f=fixture({startUpdate:true});try{
    f.render();await f.flush();f.complete();await f.flush();assert.equal(f.closed.length,1);
    f.complete();f.render();await f.flush();assert.equal(f.closed.length,1);
    assert.equal(f.calls.filter(x=>x==='save').length,1);
  }finally{f.dispose();}
});

test('interruption before browser readiness starts guided login once readiness returns',async()=>{
  const f=fixture({startUpdate:true,loginPending:true,deferProvider:true});try{
    f.render();await f.flush();assert.deepEqual(f.calls,[]);
    f.background();f.resume();await f.flush();assert.deepEqual(f.calls,[]);
    f.c.viewReady=true;f.render();await f.flush();assert.deepEqual(f.calls,['session']);
    assert.match(f.progressText(),/Bitte anmelden/);assert.equal(f.pendingTimers(),0);
  }finally{f.dispose();}
});

test('a preserved login form returns to sign-in guidance even without a provider state change',async()=>{
  const f=fixture({startUpdate:true,loginPending:true,quietResume:true});try{
    f.render();await f.flush();f.background();await f.flush();f.resume();await f.flush();
    assert.deepEqual(f.calls,['session','resume']);assert.match(f.progressText(),/Bitte anmelden/);
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
      assert.match(f.progressText(),/Bitte anmelden/);
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
    assert.match(f.progressText(),/Bitte anmelden/);assert.equal(f.pendingTimers(),0);
    f.expire();await f.flush();assert.deepEqual(f.calls,['session']);assert.equal(f.closed.length,0);
    f.verify();await f.flush();assert.deepEqual(f.calls,['session','retrieve']);
  }finally{f.dispose();}
});


test('legacy connection entry continues from successful login through all jobs without another action',async()=>{
  const f=fixture({intent:'connect',loginPending:true});try{
    f.render();await f.flush();assert.deepEqual(f.calls,['session']);
    const panel=f.nodes().find(n=>n.type==='ProviderConnection')!;
    assert.equal(panel.props.open,true);assert.equal(panel.props.guided,true);
    f.verify();await f.flush();assert.deepEqual(f.calls,['session','retrieve']);
    f.complete();await f.flush();assert.deepEqual(f.calls,['session','retrieve','save','medical','events','document-notices','work-summary','work-hours','tasks']);
    assert.equal(f.closed.length,1);assert.equal(f.closed[0].added,2);
  }finally{f.dispose();}
});

test('slow local preparation never exposes the manual connection panel for any session state',async()=>{
  for(const priorConnection of ['unknown','verified','login-required','error']){
    const f=fixture({intent:'update',deferRead:true,priorConnection});try{
      f.render();await f.flush();
      const panel=f.nodes().find(n=>n.type==='ProviderConnection')!;
      assert.equal(panel.props.open,true);assert.equal(panel.props.guided,true);assert.ok(panel.props.progress);
      assert.equal(panel.props.title,'Daten synchronisieren');assert.match(f.progressText(),/Synchronisierung wird vorbereitet/);
      assert.deepEqual(f.calls,[]);
      f.finishRead();await f.flush();assert.deepEqual(f.calls,['session','retrieve']);
      f.complete();await f.flush();assert.equal(f.closed.length,1);
    }finally{f.dispose();}
  }
});

test('recovery gate stays in the sync frame and offers recovery instead of connection verification',async()=>{
  const f=fixture({intent:'update',readOnly:true});try{
    f.render();await f.flush();const panel=f.nodes().find(n=>n.type==='ProviderConnection')!;
    assert.equal(panel.props.guided,true);assert.ok(panel.props.progress);assert.match(f.progressText(),/Wiederherstellung/);
    assert.deepEqual(f.calls,[]);f.press('Wiederherstellung ansehen');await f.flush();
    assert.equal(f.nodes().find(n=>n.type==='ProviderConnection')!.props.open,false);
  }finally{f.dispose();}
});

test('closing and reopening retains the controller and admits only quiet session checks while hidden',async()=>{
  const f=fixture({intent:'connect',loginPending:true});try{
    f.render();await f.flush();const first=f.nodes().find(n=>n.type==='ProviderConnection')!.props.controller;
    f.c.dismissLogin();f.setOpen(false);await f.flush();assert.equal(f.nodes().find(n=>n.type==='ProviderConnection')!.props.open,false);
    assert.deepEqual(f.calls,['session','quiet-session']);
    f.setOpen(true);await f.flush();const reopened=f.nodes().find(n=>n.type==='ProviderConnection')!.props.controller;
    assert.equal(reopened.retrieval,first.retrieval);assert.deepEqual(f.calls,['session','quiet-session','session']);
    assert.equal(reopened.visible,true);assert.equal(f.calls.includes('save'),false);
  }finally{f.dispose();}
});


test('Medical-only retry verifies the account again and never repeats a confirmed flight save',async()=>{
  const f=fixture({startUpdate:true,medicalFailure:true});try{
    f.render();await f.flush();f.complete();await f.flush();
    f.press('Nur Medical erneut laden');await f.flush();assert.deepEqual(f.calls,['session','retrieve','save','medical','events','document-notices','work-summary','work-hours','tasks','verify-job']);
    f.verify();await f.flush();assert.deepEqual(f.calls,['session','retrieve','save','medical','events','document-notices','work-summary','work-hours','tasks','verify-job','medical']);
    assert.match(f.progressText(),/3 Flüge auf diesem Gerät gespeichert/);assert.match(f.progressText(),/Erneuter Abruf nicht abgeschlossen/);
    assert.equal(f.calls.filter(x=>x==='save').length,1);assert.equal(f.journal.snapshot().at(-1)!.code,'medical-failed');
  }finally{f.dispose();}
});


test('foreign-account proof blocks an independent retry while preserving the confirmed flight result',async()=>{
  const f=fixture({startUpdate:true,medicalFailure:true});try{
    f.render();await f.flush();f.complete();await f.flush();f.press('Nur Medical erneut laden');await f.flush();
    f.c.connection={phase:'mismatch',confirmed:false};f.render();await f.flush();
    assert.deepEqual(f.calls,['session','retrieve','save','medical','events','document-notices','work-summary','work-hours','tasks','verify-job']);
    assert.match(f.progressText(),/3 Flüge auf diesem Gerät gespeichert/);assert.equal(f.closed.length,1);
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


test('a rejected retrieval admission is retried after readiness, without arming a timeout or losing the request',async()=>{
  const f=fixture({startUpdate:true,loginPending:true});try{
    f.render();await f.flush();const check=f.c.checkConnection;
    f.c.checkConnection=()=>false;f.verify();await f.flush();
    assert.equal(f.pendingTimers(),0);assert.equal(f.calls.includes('retrieve'),false);
    f.c.checkConnection=check;f.render();await f.flush();
    assert.equal(f.calls.filter(x=>x==='retrieve').length,1);assert.equal(f.pendingTimers(),1);
    f.complete();await f.flush();assert.equal(f.closed.length,1);
  }finally{f.dispose();}
});

test('confirmed proof cannot start retrieval during binding or saving and duplicate verification does not repeat it',async()=>{
  for(const gate of ['binding','saving','loginBusy']){
    const f=fixture({startUpdate:true,loginPending:true});try{
      f.render();await f.flush();f.c[gate]=true;f.verify();await f.flush();
      assert.equal(f.calls.includes('retrieve'),false);assert.equal(f.pendingTimers(),0);
      f.c[gate]=false;f.render();await f.flush();f.verify();await f.flush();
      assert.equal(f.calls.filter(x=>x==='retrieve').length,1);
    }finally{f.dispose();}
  }
});


test('Close during optional retrieval skips remaining sources and returns the owner-scoped saved-flight receipt once',async()=>{
  const f=fixture({startUpdate:true});try{
    let rejectMedical!:(error:Error)=>void;
    f.c.retrieveMedical=()=>{f.calls.push('medical');f.c.busy=true;f.c.informationBusy=true;return new Promise((_resolve,reject)=>{rejectMedical=reject;});};
    f.c.stopInformation=()=>{f.calls.push('stop-medical');f.c.busy=false;f.c.informationBusy=false;f.c.connection={phase:'unknown',confirmed:false};rejectMedical(new Error('Cancelled'));};
    f.render();await f.flush();f.complete();await f.flush();
    assert.equal(f.calls.filter(x=>x==='save').length,1);assert.equal(f.closed.length,0);
    f.nodes().find(n=>n.type==='ProviderConnection')!.props.close();await f.flush();
    assert.deepEqual(f.calls,['session','retrieve','save','medical','stop-medical']);
    assert.equal(f.closed.length,1);
    assert.equal(f.closed[0].ownerId,'owner');assert.equal(f.closed[0].added,2);assert.equal(f.closed[0].verifiedConnection,undefined);
    for(const status of ['medicalStatus','dutyStatus','eventsStatus','documentNoticesStatus','workSummaryStatus','workHoursStatus','tasksStatus'])assert.equal(f.closed[0][status],'skipped');
    f.render();await f.flush();assert.equal(f.closed.length,1);
  }finally{f.dispose();}
});

test('Close queues cancellation during optional saving and waits for its safe completion',async()=>{
  const f=fixture({startUpdate:true});try{
    let finishMedical!:(value:{rows:unknown[]})=>void;
    f.c.retrieveMedical=()=>{f.calls.push('medical');f.c.busy=true;f.c.informationBusy=true;f.c.informationSaving=true;return new Promise(resolve=>{finishMedical=resolve;});};
    f.c.stopInformation=()=>{throw new Error('Must not interrupt a save');};
    f.render();await f.flush();f.complete();await f.flush();
    const panel=f.nodes().find(n=>n.type==='ProviderConnection')!;
    assert.equal(panel.props.closeDisabled,false);panel.props.close();await f.flush();
    assert.equal(f.closed.length,0);assert.equal(f.c.informationSaving,true);
    f.c.busy=false;f.c.informationBusy=false;f.c.informationSaving=false;finishMedical({rows:[{}]});f.render();await f.flush();
    assert.deepEqual(f.calls,['session','retrieve','save','medical']);assert.equal(f.closed.length,1);
    assert.equal(f.closed[0].ownerId,'owner');assert.equal(f.closed[0].added,2);
    assert.equal(f.closed[0].eventsStatus,'skipped');assert.equal(f.closed[0].documentNoticesStatus,'skipped');assert.equal(f.closed[0].workSummaryStatus,'skipped');assert.equal(f.closed[0].workHoursStatus,'skipped');assert.equal(f.closed[0].tasksStatus,'skipped');
  }finally{f.dispose();}
});

test('explicit per-source skip still continues the other supported sources',async()=>{
  const f=fixture({startUpdate:true});try{
    let rejectMedical!:(error:Error)=>void;
    f.c.retrieveMedical=()=>{f.calls.push('medical');f.c.busy=true;f.c.informationBusy=true;return new Promise((_resolve,reject)=>{rejectMedical=reject;});};
    f.c.stopInformation=()=>{f.c.busy=false;f.c.informationBusy=false;rejectMedical(new Error('Skip source'));};
    f.render();await f.flush();f.complete();await f.flush();
    const skip=f.nodes().find(n=>n.type==='Action'&&n.children.some(v=>typeof v==='string'&&v.startsWith('Diesen Abruf')))!;
    assert.ok(skip);skip.props.onPress();await f.flush();
    assert.deepEqual(f.calls,['session','retrieve','save','medical','events','document-notices','work-summary','work-hours','tasks']);
    assert.equal(f.closed.length,1);assert.equal(f.closed[0].medicalStatus,'failed');assert.equal(f.closed[0].eventsStatus,'partial');
  }finally{f.dispose();}
});


test('pending aggregate restore is reachable before owner setup and cannot create a replacement owner',async()=>{
  const f=fixture({root:true,existingOwner:true,pendingRestore:true});
  try {
    f.render();await f.flush();
    assert.match(f.text(),/Eine Datensicherung wird noch wiederhergestellt/);
    assert.doesNotMatch(f.text(),/neue lokale Bibliothek/);
    assert.ok(!f.calls.includes('create'));
    f.press('Sicherungsdatei auswählen und fortsetzen');await f.flush();
    assert.ok(f.calls.includes('resume-pending'));
    assert.doesNotMatch(f.text(),/Eine Datensicherung wird noch wiederhergestellt/);
  }finally{f.dispose();}
});

test('cancelling the pending aggregate picker retains the recovery screen',async()=>{
  const f=fixture({root:true,existingOwner:true,pendingRestore:true,cancelRestore:true});
  try {
    f.render();await f.flush();f.press('Sicherungsdatei auswählen und fortsetzen');await f.flush();
    assert.match(f.text(),/Eine Datensicherung wird noch wiederhergestellt/);
    assert.ok(!f.calls.includes('create'));
  }finally{f.dispose();}
});


test('an unactivated backup candidate cannot block fresh sync against a verified writable active library',async()=>{
 const f=fixture({intent:'update',unactivatedPreparation:true});try{
  f.render();await f.flush();assert.ok(f.calls.includes('session'));
  assert.ok(!f.progressUpdates.some(p=>p.state==='failed'));
  f.verify();await f.flush();f.complete();await f.flush();assert.equal(f.closed.length,1);
 }finally{f.dispose();}
});


test('a renewed lease during deferred preparation waits for the obsolete service and starts exactly one current login',async()=>{
 const f=fixture({intent:'update',deferRead:true,loginPending:true});try{
  f.render();await f.flush();f.renewLease();await f.flush();f.finishRead();await f.flush();
  assert.equal(f.calls.filter(v=>v==='session').length,1,'Current preparation must restart after the old locked operation settles');
  assert.equal(f.c.visible,true);assert.ok(!f.progressUpdates.some(p=>p.state==='failed'),'An obsolete preparation failure cannot fail the new attempt');
 }finally{f.dispose();}
});


test('an explicit sync cancellation is recorded as cancellation rather than an unexplained failure',async()=>{
 const f=fixture({startUpdate:true,loginPending:true});try{
  f.render();await f.flush();f.nodes().find(n=>n.type==='ProviderConnection')!.props.close();await f.flush();
  const operation=f.journal.snapshot().find(entry=>entry.action==='update-flights')!;
  assert.equal(operation.outcome,'cancelled');assert.equal(operation.code,'cancelled');
 }finally{f.dispose();}
});

test('cancel then reopening with a renewed owner cannot consume the new attempt using old ready state',async()=>{
 const f=fixture({intent:'update',loginPending:true});try{
  f.render();await f.flush();assert.equal(f.calls.filter(v=>v==='session').length,1);
  f.nodes().find(n=>n.type==='ProviderConnection')!.props.close();await f.flush();
  f.setOpen(false);await f.flush();const retryProgress=f.progressUpdates.length;f.setOpen(true);f.render();f.renewLease();await f.flush();
  assert.ok(!f.progressUpdates.slice(retryProgress).some(p=>p.state==='failed'),'The previous cancellation cannot be forwarded as failure of the new root attempt');
  assert.equal(f.calls.filter(v=>v==='session').length,2,'New preparation must finish before consuming the initiating action');
  assert.equal(f.c.visible,true);
 }finally{f.dispose();}
});

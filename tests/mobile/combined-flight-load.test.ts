import { AI_BACKUP_NOTICE } from '../../apps/platform-lab/src/ai/backup-notice';
import * as syncProgress from '../../apps/platform-lab/src/mobile/sync-progress.ts';
import * as syncEstimate from '../../apps/platform-lab/src/mobile/sync-estimate.ts';
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
import * as syncRecovery from '../../apps/platform-lab/src/mobile/sync-recovery.ts';
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
function fixture({failRestoreMetadata=false,deferGraph=false,graphReady=true,admissionPending=false,entryProofFails=false,backupFails=false,destination='sources',providerAllowed=true,deferRead=false,deferRecoveryClear=false,startUpdate=false,root=false,readOnly=false,deferReservation=false,deferActivityCancel=false,deferActivityWrite=false,failStartup=false,medicalFailure=false,pendingFlightCount=0,cleanupAfterTasks=false,loginPending=false,deferProvider=false,quietResume=false,deferSource=false,sameWindow=false,deferVerification=false,priorConnection='unknown',existingOwner=false,pendingRestore=false,cancelRestore=false,initialOpen=true,initialFlightsSaved=false,initialSavedSync=null as syncRecovery.SyncRecoveryRecord|null,initialEstimateHistory=null as unknown,unactivatedPreparation=false,activityEnabled=false,activityBaselineCount=1,activityResultCount=2,onStatus:statusCallback=undefined as ((status:any)=>void)|undefined,intent:requestedIntent=undefined as string|undefined}={}) {
  let panelOpen=initialOpen,requestId=0;
  let backupAttempt: (() => Promise<{state:'saved'|'cancelled'}>) | null = null;
  let finishGraph!:()=>void;const graphPreparation=new Promise<void>(resolve=>{finishGraph=resolve;});
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
  const listeners=new Set<(state:string)=>void>(),backListeners=new Set<()=>boolean>();
  let saved=initialFlightsSaved,timerId=0,holdNextRead=false;
  let finishRecoveryClear!:()=>void;
  const recoveryClear=new Promise<void>(resolve=>{finishRecoveryClear=resolve;});
  let persistedSync:syncRecovery.SyncRecoveryRecord|null=initialSavedSync;
  let persistedEstimates:unknown=initialEstimateHistory,estimateClock=0;
  const estimateSaves:syncEstimate.SyncEstimateHistory[]=[];
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
  const registry={currentOwner:async()=>existingOwner?{...lease,selectionSeq:selectedHead,leaseId:'proof-'+(++ownerProof)}:null,createFreshOwner:async()=>{calls.push('create');return lease;},assertCurrent:async()=>{if(entryProofFails)throw new Error('Foreign or expired owner lease');},close:async()=>{}};
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
    retrieveFeatureInformation:async(category:string)=>{calls.push(category);if(cleanupAfterTasks&&category==='tasks'){c.recovery=true;dirty=true;await new Promise<void>(resolve=>{setImmediate(resolve);});}return {rows:[{}]};},
    retrieveMedical:async()=>{calls.push('medical');if(medicalFailure)throw new Error('Synthetic Medical failure');return {rows:[{}]};},
    cancelActivity:async()=>{activityOrder.push('cancel-start');if(deferActivityCancel)await activityCancel;activityOrder.push('cancel-finish');},
    checkConnection:(action?:string)=>{if(action==='check'){calls.push('verify-job');c.connection={phase:'checking',confirmed:false};}else{calls.push('retrieve');c.busy=true;}dirty=true;return true;},
    dismissLogin:()=>{c.visible=false;c.busy=false;dirty=true;},backWithinProvider:()=>false,cancelRetrieval:()=>{c.busy=false;dirty=true;},
  };
  class Service {
    disposed=false;
    constructor(...args:any[]) { this.ports=args[3]; }
    ports:any;
    async readStored(){activityOrder.push('refresh-read');if(deferRead||holdNextRead){holdNextRead=false;await storedRead;}return {snapshot:await this.storedSnapshot(),flights:saved?[{},{},{}]:[]};}
    async snapshot(){calls.push('snapshot');return this.storedSnapshot();}
    async storedSnapshot(){return {...snapshot,ownerId:'owner',storeId:'store',
      account:saved?{provider:'vereinsflieger',accountRef:'101'}:null,
      latestSavedResult:saved?{kind:'import-unassigned',captureId:'fresh',counts:{added:2,changed:1,pending:0}}:null,
      coverage:saved?[{captureId:'fresh',coverage:{displayedWindow:{from:'2025-01-01',to:'2026-10-21'}}}]:[],
      savedRetrievals:saved?[{from:'2025-01-01',to:'2026-10-21',retrievedAt:'2026-10-21T12:00:00.000Z',savedAt:'2026-10-21T12:00:01.000Z'}]:[]};}
    async list(){return saved?[{},{},{}]:[];}
    async recoverPending(){return {status:'none'};}
    async prepareFreshFetch(){return {status:'none'};}
    async retrieveUpdate(){if(deferSource)await new Promise<void>(resolve=>{admitSource=resolve;});abort=new AbortController();if(deferProvider)c.viewReady=false;const value=await this.ports.retrieve({from:'2025-01-01',to:'2026-10-21'},abort.signal);if(!abort.signal.aborted)this.ports.onReviewStart?.();await new Promise<void>(resolve=>{setImmediate(resolve);});return {state:'confirm-account',accountRef:'101',source:value};}
    async retrieveUpdateWithStoredReadback(hooks:any){const review=await this.retrieveUpdate();const verified=await hooks.beforeSave(review);return {...await this.saveVerifiedReviewWithStoredReadback(review,verified,hooks.beforeReadback),review};}
    async saveVerifiedReviewWithStoredReadback(_review:any,context:any,beforeReadback?:()=>Promise<void>){assert.equal(context.accountNumber,'101');calls.push('save');saved=true;await beforeReadback?.();return {result:{counts:{added:2,changed:1,pending:pendingFlightCount}},stored:{snapshot:await this.storedSnapshot(),flights:[{},{},{}]}};}
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
    '../ai/backup-notice':{AI_BACKUP_NOTICE},
    '../user-backup-native':{getPendingUserBackupRestoreNative:async()=>{pendingRestoreChecks++;return pendingRestore?{operationId:'pending',ownerId:'owner',storeId:'store'}:null;},
      saveUserBackupToFolder:async()=>{calls.push('backup-save');if(backupAttempt)return backupAttempt();if(backupFails)throw new Error('Synthetic backup failure');return {state:'saved'};},
      restoreUserBackupFromPickerNative:async(_scope:any,_gate:any,id?:string)=>{calls.push(id?'resume-'+id:'restore-whole');if(cancelRestore)return {state:'cancelled'};pendingRestore=false;return {state:'restored'};}},
    './sync-progress':syncProgress,'./session-monitor':{startSessionMonitor},
    './sync-estimate':{...syncEstimate,syncEstimateNow:()=>{estimateClock+=10;return estimateClock;}},
    './sync-estimate-native':{
      readSyncEstimateHistory:async(_scope:unknown,context:string)=>syncEstimate.parseSyncEstimateHistory(cloneJson(persistedEstimates),context),
      saveSyncEstimateHistory:async(_scope:unknown,history:syncEstimate.SyncEstimateHistory)=>{persistedEstimates=cloneJson(history);estimateSaves.push(cloneJson(history));},
    },
    './sync-recovery':syncRecovery,
    './sync-recovery-native':{
      readSyncRecovery:async()=>persistedSync===null?null:cloneJson(persistedSync),
      saveSyncRecovery:async(_scope:unknown,record:syncRecovery.SyncRecoveryRecord)=>{persistedSync=cloneJson(record);},
      clearSyncRecovery:async()=>{if(deferRecoveryClear)await recoveryClear;persistedSync=null;},
    },
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
    'react-native':{...leaves(['ActivityIndicator','KeyboardAvoidingView','Pressable','ScrollView','Text','View']),Platform:{OS:'android'},AppState:{currentState:'active',addEventListener:(_:string,f:(state:string)=>void)=>{listeners.add(f);return {remove:()=>listeners.delete(f)};}},BackHandler:{addEventListener:(_:string,f:()=>boolean)=>{backListeners.add(f);return {remove:()=>backListeners.delete(f)};}}},
    'react-native-safe-area-context':leaves(['SafeAreaView']), 'expo-crypto':{randomUUID:()=> 'uuid'},'../storage':{hash:async()=>''},
    '../vereinsflieger/flight-diagnostics':{timeFlightStage:(_:string,work:()=>unknown)=>work()},
    '../vereinsflieger/use-access-controller':{useAccessController:()=>({...c})},
    '../vereinsflieger/real-flight-native':{openOwnerRegistry:async()=>{calls.push('registry');if(failStartup)throw new Error('Startup interrupted');return registry;},openRealFlightSelection:async()=>({listRestorePreparations:async()=>{if(failRestoreMetadata)throw new Error('Unreadable restore metadata');return unactivatedPreparation?[{operationId:"prepared",status:"pending"}]:[];},close:async()=>{}})},
    '../vereinsflieger/real-flight-owner-setup':{continueRealFlightOwnerSetup:async()=>{activityOrder.push('owner-setup');return true;}},
    '../vereinsflieger/real-flight-service':{RealFlightService:Service,PendingRealFlightOperation:class extends Error{}},
    './core-flight-review-policy':policy,'../vereinsflieger/real-flight-backup-native':{restoreRealFlightBackup:async()=>{calls.push('legacy-restore');return {state:'cancelled'};},resumeRealFlightBackup:async()=>{calls.push('legacy-resume');return {state:'cancelled'};}},
    './own-flight-reader-native':{ownFlightReadPorts:{suspend:async()=>{calls.push('reserve');if(deferReservation)await reservation;return ()=>calls.push('release');}}},
    './MaintenancePageHeader':leaves(['MaintenancePageHeader']),'./BackupRestoreConfirmationDialog':leaves(['BackupRestoreConfirmationDialog']),
    './ConnectionSettings':{ConnectionSettings:'ConnectionSettings'},'./ProviderConnection':leaves(['ProviderConnection']),'./theme':{...leaves(['Action','Card','Label','Section']),colors:{}},
    '../vereinsflieger/retrieval-policy':{planFlightRetrieval},'./data-freshness':{dataFreshness},
  };
  c.beginFreshFlightConnection=()=>{c.beginGuidedFlightConnection();return true;};
  const progressUpdates:syncProgress.SyncProgress[]=[];
  const exports:any={};runInNewContext(source,{exports,require:(name:string)=>{assert.ok(name in modules,name);return modules[name];},setTimeout:(fn:()=>void)=>{timers.set(++timerId,fn);return timerId;},clearTimeout:(id:number)=>timers.delete(id),console,Error});
  function render(){dirty=false;index=0;tree=root?exports.CoreFlightFoundation({destination,providerEntryAllowed:providerAllowed,startUpdate,intent:requestedIntent,open:panelOpen,requestId,onProgress:(value:syncProgress.SyncProgress)=>progressUpdates.push(value),close:(v:any)=>closed.push(v),onStatus:statusCallback}):exports.OwnerFlightLibrary({destination,prepareSelectedLibrary:async()=>{activityOrder.push('graph-preparation');if(deferGraph)await graphPreparation;return graphReady;},preparing:admissionPending,providerEntryAllowed:providerAllowed,lease,registry,startUpdate,intent:requestedIntent,open:panelOpen,requestId,onProgress:(value:syncProgress.SyncProgress)=>progressUpdates.push(value),close:(v:any)=>closed.push(v),onStatus:(status:any)=>{statusUpdates.push(cloneJson(status));statusCallback?.(status);},takeInitialRepository:()=>null,diagnosis});while(effects.length)effects.shift()!();return tree;}
  async function flush(){for(let n=0;n<12;n++){if(dirty)render();await new Promise<void>(resolve=>{setImmediate(resolve);});}if(dirty)render();}
  function nodes(){const result:Element[]=[];function visit(value:any){if(value&&typeof value==='object'&&'children'in value){result.push(value);value.children.forEach(visit);if(value.props.progress)visit(value.props.progress);}}visit(tree);return result;}
  const text=(node:any):string=>node&&typeof node==='object'&&'children'in node?node.children.map(text).join(''):typeof node==='string'?node:'';
  function press(label:string){const node=nodes().find(n=>n.type==='Action'&&text(n)===label);assert.ok(node,label);assert.ok(!node.props.disabled,label);node.props.onPress();}
  return {beginPendingRestore:()=>{pendingRestore=true;},recoverRestoreMetadata:()=>{failRestoreMetadata=false;},finishGraph,denyEntryProof:()=>{entryProofFails=true;},recoverStartup:()=>{failStartup=false;},allowEntryProof:()=>{entryProofFails=false;},finishRecoveryClear,deferNextStoredRead:()=>{holdNextRead=true;},advanceEstimateTime:(milliseconds:number)=>{estimateClock+=milliseconds;},estimateSaves:()=>estimateSaves.map(cloneJson),estimateHistory:()=>cloneJson(persistedEstimates),renewLease:()=>{lease={...lease,leaseId:'renewed'};dirty=true;},progressUpdates,journal,render,flush,c,calls,closed,nodes,activityChecks:()=>activityChecks,activityWriteCalls:()=>activityWriteCalls,pendingRestoreChecks:()=>pendingRestoreChecks,activityLedgerSaves:()=>activityLedgerSaves.map(cloneJson),savedActivityLedger:()=>savedActivityLedger===null?null:cloneJson(savedActivityLedger),statusUpdates,changeSelection:()=>{selectedHead++;},setOpen:(value:boolean)=>{panelOpen=value;if(value)requestId++;dirty=true;},text:()=>text(tree),progressText:()=>text(nodes().find(n=>n.type==='ProviderConnection')?.props.progress),press,finishReservation,background:()=>listeners.forEach(f=>f('background')),resume:()=>listeners.forEach(f=>f('active')),
    onBackup:(work:()=>Promise<{state:'saved'|'cancelled'}>)=>{backupAttempt=work;},
    verify:()=>{c.visible=false;c.connection={phase:'observed',confirmed:true,observed:{accountNumber:'101',clubLabel:'Example'}};dirty=true;},
    pendingTimers:()=>timers.size,expire:()=>{for(const [id,fn] of timers){timers.delete(id);fn();}},
    finishRead:()=>finishRead(),
    finishActivityCancel:()=>finishActivityCancel(),finishActivityWrite:()=>finishActivityWrite(),activityOrder,
    admitSource:()=>admitSource(),
    complete:()=>{c.busy=false;c.result='captured';c.completedFlightSource=input;dirty=true;},
    hardwareBack:()=>[...backListeners].reverse().some(handler=>handler()),
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
    assert.equal(f.journal.snapshot().at(-1)!.outcome,'partial');assert.equal(f.journal.snapshot().at(-1)!.code,'work-summary-failed');
  }finally{f.dispose();}
});

test('a calendar failure names Termine in header progress and diagnostics while later jobs retain their saves',async()=>{
 const f=fixture({intent:'update'});try{
  f.c.retrieveFeatureInformation=async(category:string)=>{f.calls.push(category);if(category==='events')throw new Error('Synthetic unavailable');return {rows:[]};};
  f.render();await f.flush();f.verify();await f.flush();f.complete();await f.flush();
  assert.equal(f.closed.length,1);assert.equal(f.closed[0].added,2);assert.equal(f.closed[0].eventsStatus,'failed');assert.equal(f.closed[0].tasksStatus,'partial');
  assert.equal(f.progressUpdates.at(-1)!.message,'Nicht aktualisiert: Termine.');assert.equal(f.journal.snapshot().at(-1)!.code,'events-failed');
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
    f.press('Neu synchronisieren');await f.flush();assert.equal(f.calls.filter(v=>v==='session').length,2);
  }finally{f.dispose();}
});

for(const status of ['Provider page failed to load. Previous captures preserved.','Provider returned an HTTP error. Previous captures preserved.']){
  test(`failed fresh login opening exposes guidance and explicit retry: ${status}`,async()=>{
    const f=fixture({startUpdate:true,loginPending:true});try{
      f.render();await f.flush();assert.deepEqual(f.calls,['session']);assert.equal(f.pendingTimers(),0);
      f.c.visible=false;f.c.result='failed';f.c.status=status;f.render();await f.flush();
      assert.match(f.progressText(),/Anbieterseite/);assert.equal(f.pendingTimers(),0);
      assert.deepEqual(f.calls,['session']);assert.equal(f.closed.length,0);
      f.press('Neu synchronisieren');await f.flush();
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
    f.press('Neu synchronisieren');await f.flush();f.admitSource();await f.flush();
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

test('idle provider recovery exposes the guarded restoration panel instead of a Sync preparation loop',async()=>{
 const f=fixture({intent:'update'});f.c.recovery=true;
 try{
  f.render();await f.flush();const panel=f.nodes().find(n=>n.type==='ProviderConnection')!;
  assert.equal(panel.props.open,true);assert.equal(panel.props.minimal,false);
  assert.equal(panel.props.progress,undefined,'the existing provider restoration controls must own this idle surface');
  assert.equal(f.progressUpdates.at(-1)?.state,'waiting','the root must show the recovery surface instead of hiding it behind active preparation');
  assert.deepEqual(f.calls,[],'opening recovery cannot start another provider job');
 }finally{f.dispose();}
});

test('an active retrieval keeps Sync progress while its original-view journal is armed',async()=>{
 const f=fixture({intent:'update'});
 try{
  f.render();await f.flush();assert.ok(f.calls.includes('retrieve'));
  f.c.recovery=true;f.render();const panel=f.nodes().find(n=>n.type==='ProviderConnection')!;
  assert.equal(panel.props.minimal,true);assert.ok(panel.props.progress);
  assert.equal(f.calls.filter(call=>call==='retrieve').length,1);
 }finally{f.dispose();}
});

test('restoring the provider view returns a persisted interruption to an explicit continuation choice',async()=>{
 const f=fixture({intent:'update',initialFlightsSaved:true,initialSavedSync:{version:1,ownerId:'owner',storeId:'store',accountRef:'101',clubLabel:'Example',startedAt:'2026-10-29T08:00:00Z',flightCaptureId:null,sources:{}}});
 f.c.recovery=true;
 try{
  f.render();await f.flush();assert.equal(f.nodes().find(n=>n.type==='ProviderConnection')!.props.progress,undefined);
  f.c.recovery=false;f.render();await f.flush();const panel=f.nodes().find(n=>n.type==='ProviderConnection')!;
  assert.equal(panel.props.minimal,true);assert.match(f.progressText(),/Synchronisierung fortsetzen/);
  assert.deepEqual(f.calls,[],'restoration cannot silently resume a cancelled attempt');
 }finally{f.dispose();}
});

test('closing and reopening retains the controller and offers recovery without starting another provider request',async()=>{
  const f=fixture({intent:'connect',loginPending:true});try{
    f.render();await f.flush();const first=f.nodes().find(n=>n.type==='ProviderConnection')!.props.controller;
    f.c.dismissLogin();f.setOpen(false);await f.flush();assert.equal(f.nodes().find(n=>n.type==='ProviderConnection')!.props.open,false);
    assert.deepEqual(f.calls,['session','quiet-session']);
    f.setOpen(true);await f.flush();const reopened=f.nodes().find(n=>n.type==='ProviderConnection')!.props.controller;
    assert.equal(reopened.retrieval,first.retrieval);assert.deepEqual(f.calls,['session','quiet-session']);
    assert.match(f.progressText(),/Synchronisierung fortsetzen/);assert.equal(f.calls.includes('save'),false);
  }finally{f.dispose();}
});

test('background interruption resumes unfinished sources after fresh account proof without saving flights again',async()=>{
  const f=fixture({startUpdate:true});try{
    f.c.retrieveMedical=async()=>{f.calls.push('medical');f.background();return {rows:[{}]};};
    f.render();await f.flush();f.complete();await f.flush();
    assert.equal(f.calls.filter(v=>v==='save').length,1);assert.equal(f.closed.length,0);
    f.resume();f.render();await f.flush();
    f.c.retrieveMedical=async()=>{f.calls.push('medical');return {rows:[{}]};};
    f.press('Gespeicherten Fortschritt fortsetzen');await f.flush();
    assert.equal(f.calls.includes('verify-job'),true);assert.equal(f.calls.filter(v=>v==='save').length,1);
    f.verify();await f.flush();
    assert.equal(f.calls.filter(v=>v==='save').length,1);
    assert.equal(f.calls.filter(v=>v==='medical').length,2);
    assert.equal(f.closed.length,1);
  }finally{f.dispose();}
});

test('a restarted Sync reads durable progress, skips committed flights and saved Medical, and checks the account',async()=>{
  const progress:syncRecovery.SyncRecoveryRecord={version:1,ownerId:'owner',storeId:'store',accountRef:'101',clubLabel:'Example',
    startedAt:'2026-10-26T10:00:00Z',flightCaptureId:'fresh',sources:{medical:'updated'}};
  const f=fixture({startUpdate:true,initialFlightsSaved:true,initialSavedSync:progress});try{
    f.render();await f.flush();
    assert.equal(f.calls.length,0);assert.match(f.progressText(),/Synchronisierung fortsetzen/);
    f.press('Synchronisierung fortsetzen');await f.flush();assert.deepEqual(f.calls,['verify-job']);
    f.verify();await f.flush();
    assert.equal(f.calls.includes('retrieve'),false);assert.equal(f.calls.includes('save'),false);
    assert.equal(f.calls.includes('medical'),false);assert.equal(f.calls.includes('events'),true);
    assert.equal(f.closed.length,1);
  }finally{f.dispose();}
});

test('header Sync opens the recovery offer even though ordinary Settings keeps its provider hidden',async()=>{
  const progress:syncRecovery.SyncRecoveryRecord={version:1,ownerId:'owner',storeId:'store',accountRef:'101',clubLabel:'Example',
    startedAt:'2026-10-26T10:00:00Z',flightCaptureId:'fresh',sources:{medical:'updated'}};
  const f=fixture({intent:'update',destination:'settings',initialFlightsSaved:true,initialSavedSync:progress});try{
    f.render();await f.flush();
    const panel=f.nodes().find(n=>n.type==='ProviderConnection')!;
    assert.equal(panel.props.open,true);assert.match(f.progressText(),/Synchronisierung fortsetzen/);
  }finally{f.dispose();}
});

test('a changed provider account blocks saved-flight continuation and optional retrieval',async()=>{
  const progress:syncRecovery.SyncRecoveryRecord={version:1,ownerId:'owner',storeId:'store',accountRef:'101',clubLabel:'Example',
    startedAt:'2026-10-26T10:00:00Z',flightCaptureId:'fresh',sources:{medical:'updated'}};
  const f=fixture({startUpdate:true,initialFlightsSaved:true,initialSavedSync:progress});try{
    f.render();await f.flush();f.press('Synchronisierung fortsetzen');await f.flush();
    f.c.connection={phase:'observed',confirmed:true,observed:{accountNumber:'other',clubLabel:'Example'}};f.render();await f.flush();
    assert.equal(f.calls.includes('events'),false);assert.equal(f.calls.includes('save'),false);
    assert.equal(f.closed.length,0);assert.match(f.progressText(),/bisherige Vereinsflieger-Konto/);
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


test('dedicated backup opens whole-user actions immediately without credentials or old-format export',async()=>{
  const f=fixture({providerAllowed:false,destination:'backup'});
  try{
    f.render();await f.flush();
    assert.ok(f.text().includes('In Geräteordner sichern'));
    assert.ok(f.text().includes('Sicherungsdatei auswählen'));
    assert.ok(f.nodes().some(n=>n.type==='MaintenancePageHeader'));
    assert.ok(!f.text().includes('Details & weitere Optionen'));
    assert.ok(!f.nodes().some(n=>n.type==='ConnectionSettings'));
    assert.ok(!f.text().includes('Flugbibliothek in Geräteordner sichern'));
    assert.ok(!f.calls.some(call=>['login','retrieve','save'].includes(call)));
    f.nodes().find(n=>n.props.accessibilityLabel==='Ältere Flugbibliothek-Sicherung')!.props.onPress();await f.flush();
    assert.ok(f.text().includes('Sicherung dieser Bibliothek wiederherstellen'));
    assert.ok(!f.text().includes('Flugbibliothek in Geräteordner sichern'));
  }finally{f.dispose();}
});

test('backup restore requires a current one-use confirmation; Cancel and Back never open the picker',async()=>{
  const f=fixture({providerAllowed:false,destination:'backup',cancelRestore:true});
  try{
    f.render();await f.flush();
    f.press('Sicherungsdatei auswählen');f.render();
    const cancelled=f.nodes().find(n=>n.type==='BackupRestoreConfirmationDialog')!;
    assert.ok(cancelled);assert.ok(!f.calls.includes('restore-whole'));
    cancelled.props.onCancel();f.render();cancelled.props.onConfirm();await f.flush();
    assert.ok(!f.calls.includes('restore-whole'));
    f.press('Sicherungsdatei auswählen');f.render();
    const backDismissed=f.nodes().find(n=>n.type==='BackupRestoreConfirmationDialog')!;
    assert.equal(f.hardwareBack(),true);f.render();
    assert.equal(f.closed.length,0);backDismissed.props.onConfirm();await f.flush();
    assert.ok(!f.calls.includes('restore-whole'));
    f.press('Sicherungsdatei auswählen');f.render();
    const current=f.nodes().find(n=>n.type==='BackupRestoreConfirmationDialog')!;
    cancelled.props.onConfirm();await f.flush();assert.ok(!f.calls.includes('restore-whole'));
    current.props.onConfirm();current.props.onConfirm();await f.flush();
    assert.equal(f.calls.filter(call=>call==='restore-whole').length,1);
    assert.match(f.text(),/Dateiauswahl abgebrochen/);
    assert.equal(f.closed.length,0);
    assert.ok(!f.progressUpdates.some(p=>p.state==='failed'),'Picker cancellation does not become a Sync failure');
    f.hardwareBack();assert.equal(f.closed.length,1,'A second Back returns to the calling page');
  }finally{f.dispose();}
});

test('backup confirmation is invalidated by background and close/reopen',async()=>{
  const f=fixture({providerAllowed:false,destination:'backup'});
  try{
    f.render();await f.flush();f.press('Sicherungsdatei auswählen');f.render();
    const old=f.nodes().find(n=>n.type==='BackupRestoreConfirmationDialog')!;
    f.background();f.render();f.resume();old.props.onConfirm();await f.flush();
    assert.ok(!f.calls.includes('restore-whole'));
    f.press('Sicherungsdatei auswählen');f.render();
    const closed=f.nodes().find(n=>n.type==='BackupRestoreConfirmationDialog')!;
    f.setOpen(false);await f.flush();f.setOpen(true);await f.flush();closed.props.onConfirm();await f.flush();
    assert.ok(!f.calls.includes('restore-whole'));
  }finally{f.dispose();}
});

test('backup disclosure remains available without contextual help and no-owner backup creates no identity',async()=>{
  const f=fixture({providerAllowed:false,destination:'backup'});
  try{
    f.render();await f.flush();
    const disclosure=f.nodes().find(n=>n.props.accessibilityLabel==='Inhalt und Ausschlüsse')!;
    assert.equal(disclosure.props.accessibilityState.expanded,false);disclosure.props.onPress();f.render();
    assert.match(f.text(),/KI-Chats/);assert.match(f.text(),/Foto- und Anhangdateien werden nicht gesichert/);
  }finally{f.dispose();}
  const empty=fixture({root:true,providerAllowed:false,destination:'backup'});
  try{empty.render();await empty.flush();assert.match(empty.text(),/Noch keine eigene lokale Bibliothek/);assert.ok(!empty.calls.includes('create'));assert.ok(!empty.text().includes('neue lokale Bibliothek anlegen'));assert.ok(empty.nodes().some(n=>n.type==='MaintenancePageHeader'));}finally{empty.dispose();}
});

test('backup pending-restore page resumes the same operation and retains it after picker cancellation',async()=>{
  const f=fixture({root:true,existingOwner:true,providerAllowed:false,destination:'backup',pendingRestore:true,cancelRestore:true});
  try{
    f.render();await f.flush();
    const header=f.nodes().find(n=>n.type==='MaintenancePageHeader')!;assert.equal(header.props.syncDisabled,true);
    f.press('Datensicherung fortsetzen');await f.flush();assert.ok(f.calls.includes('resume-pending'));
    assert.match(f.text(),/Eine Datensicherung wird noch wiederhergestellt/);
    assert.ok(!f.nodes().some(n=>n.type==='BackupRestoreConfirmationDialog'));
    assert.ok(!f.calls.includes('create'));
  }finally{f.dispose();}
});

test('explicit backup preparation guards Back and a failed export stays a backup error rather than a Sync failure',async()=>{
  const preparing=fixture({providerAllowed:false,destination:'backup',deferGraph:true});
  try{preparing.render();await preparing.flush();preparing.press('In Geräteordner sichern');await preparing.flush();assert.equal(preparing.nodes().find(n=>n.type==='MaintenancePageHeader')!.props.busy,true);preparing.hardwareBack();assert.equal(preparing.closed.length,0);preparing.finishGraph();await preparing.flush();preparing.hardwareBack();assert.equal(preparing.closed.length,1);}finally{preparing.dispose();}
  const failed=fixture({providerAllowed:false,destination:'backup',backupFails:true});
  try{failed.render();await failed.flush();failed.press('In Geräteordner sichern');await failed.flush();assert.ok(failed.calls.includes('backup-save'));assert.match(failed.text(),/Dieser Schritt wurde nicht bestätigt/);assert.ok(!failed.progressUpdates.some(p=>p.state==='failed'));assert.equal(failed.closed.length,0);}finally{failed.dispose();}
});
test('settings admits only an explicit administration surface and returns after verified sign-out',async()=>{
  const f=fixture({providerAllowed:false,destination:'settings'});
  try{
    f.render();await f.flush();
    assert.equal(f.nodes().find(n=>n.type==='ProviderConnection')!.props.open,false);
    assert.equal(f.nodes().find(n=>n.type==='MaintenancePageHeader')!.props.title,'Vereinsflieger');
    assert.equal(f.calls.length,0);
    assert.equal(f.nodes().find(n=>n.type==='KeyboardAvoidingView')!.props.enabled,true);
    f.c.startDisconnect=()=>{f.c.visible=true;f.c.disconnecting=true;f.calls.push('signout');};f.render();
    f.nodes().find(n=>n.type==='ConnectionSettings')!.props.onSignOut();f.render();
    const provider=f.nodes().find(n=>n.type==='ProviderConnection')!;
    assert.equal(provider.props.open,true);assert.equal(provider.props.administration,true);assert.equal(provider.props.minimal,true);
    assert.ok(!f.nodes().some(n=>n.type==='MaintenancePageHeader'),'Provider frame exposes its own Close/history controls');
    assert.ok(!f.calls.includes('retrieve'));
    f.c.visible=false;f.c.disconnecting=false;f.render();await f.flush();
    assert.equal(f.nodes().find(n=>n.type==='ProviderConnection')!.props.open,false);
    assert.ok(f.nodes().some(n=>n.type==='ConnectionSettings'));
    assert.equal(f.nodes().find(n=>n.type==='MaintenancePageHeader')!.props.title,'Vereinsflieger');
    f.nodes().find(n=>n.type==='MaintenancePageHeader')!.props.onBack();assert.equal(f.closed.length,1);
  }finally{f.dispose();}
});


test('Sync forwards measured flight counts and ignores late updates after cancellation',async()=>{
  const f=fixture({intent:'update'});try{
    f.render();await f.flush();f.verify();await f.flush();
    f.c.flightProgress={done:4,total:101};f.render();await f.flush();
    assert.deepEqual(f.progressUpdates.at(-1)?.count,{done:4,total:101,unit:'flights'});
    f.background();await f.flush();
    f.c.flightProgress={done:101,total:101};f.render();await f.flush();
    assert.notEqual(f.progressUpdates.at(-1)?.count?.done,101);
    assert.ok(!f.progressUpdates.some(p=>p.last==='flights'));
  }finally{f.dispose();}
});

test('Sync publishes confirmed save counts and an optional-source retry cannot recount flights',async()=>{
  const f=fixture({intent:'update',medicalFailure:true});
  let finishMedical!:()=>void;const medicalWait=new Promise<void>(resolve=>{finishMedical=resolve;});
  const medical=f.c.retrieveMedical;f.c.retrieveMedical=async()=>{await medicalWait;return medical();};try{
    f.render();await f.flush();f.verify();await f.flush();
    f.c.flightProgress={done:1,total:3};f.render();await f.flush();
    assert.deepEqual(f.progressUpdates.at(-1)?.count,{done:1,total:3,unit:'flights'});
    assert.ok(!f.progressUpdates.some(p=>p.last==='save'));
    f.complete();f.c.completedFlightSource.capture.rows=[{},{},{}];await f.flush();
    assert.ok(f.progressUpdates.some(p=>p.last==='flights'&&p.lastCount?.done===3&&p.lastCount.total===3));
    assert.ok(f.progressUpdates.some(p=>p.last==='save'&&p.lastCount?.done===3&&p.lastCount.total===3));
    finishMedical();await f.flush();
    assert.equal(f.progressUpdates.at(-1)?.state,'partial');
    const boundary=f.progressUpdates.length;
    f.press('Nur Medical erneut laden');await f.flush();f.verify();await f.flush();
    assert.ok(!f.progressUpdates.slice(boundary).some(p=>p.current==='flights'||p.current==='save'));
    assert.equal(f.calls.filter(value=>value==='save').length,1);
  }finally{finishMedical();f.dispose();}
});

test('a complete sync learns local stage hints and the next comparable attempt has an estimate',async()=>{
 const first=fixture({initialFlightsSaved:true,intent:'update'});let history:unknown;
 try{
  first.render();await first.flush();first.complete();await first.flush();
  assert.equal(first.closed.length,1);assert.equal(first.estimateSaves().length,1);
  history=first.estimateHistory();const saved=first.estimateSaves()[0]!;
  assert.ok(saved.samples.some(sample=>sample.stage==='review'));
  assert.ok(first.progressUpdates.some(progress=>progress.current==='review'));
  assert.ok(first.journal.journey().some(event=>event.target==='sync-review'));
  assert.ok(saved.samples.every(sample=>sample.durationsMs.length===1&&sample.durationsMs[0]!>=1));
 }finally{first.dispose();}
 const second=fixture({initialFlightsSaved:true,intent:'update',initialEstimateHistory:history});
 try{
  second.render();await second.flush();
  const estimated=second.progressUpdates.map(progress=>progress.estimate).filter((value):value is syncEstimate.SyncEstimateState=>!!value);
  assert.ok(estimated.length>0);assert.ok(estimated.some(value=>value.fraction!==null));
  assert.ok(estimated.every(value=>value.units.every(unit=>unit.expectedMs!==null)));
  second.complete();await second.flush();assert.equal(second.estimateSaves().length,1);
  assert.ok(second.estimateSaves()[0]!.samples.every(sample=>sample.durationsMs.length===2));
 }finally{second.dispose();}
});

test('failed and background-interrupted sync attempts never train duration hints',async()=>{
 for(const mode of ['failure','background'] as const){
  const f=fixture({intent:'update',medicalFailure:mode==='failure'});
  try{
   f.render();await f.flush();
   if(mode==='background'){f.background();await f.flush();}
   f.complete();await f.flush();
   assert.equal(f.estimateSaves().length,0,mode);assert.equal(f.estimateHistory(),null,mode);
   if(mode==='failure')assert.equal(f.closed[0]?.medicalStatus,'failed');
   else assert.equal(f.closed.length,0);
  }finally{f.dispose();}
 }
});

test('recovered sync estimates only remaining sources and never relearns committed flights',async()=>{
 const record:syncRecovery.SyncRecoveryRecord={version:1,ownerId:'owner',storeId:'store',accountRef:'101',clubLabel:'Example',
  startedAt:'2026-10-26T10:00:00Z',flightCaptureId:'fresh',sources:{medical:'updated'}};
 const f=fixture({startUpdate:true,initialFlightsSaved:true,initialSavedSync:record});
 try{
  f.render();await f.flush();f.press('Synchronisierung fortsetzen');await f.flush();f.verify();await f.flush();
  assert.equal(f.closed.length,1);assert.ok(!f.calls.some(call=>['retrieve','save','medical'].includes(call)));
  const estimates=f.progressUpdates.map(progress=>progress.estimate).filter((value):value is syncEstimate.SyncEstimateState=>!!value);
  assert.ok(estimates.length>0);assert.ok(estimates.every(value=>value.mode==='resume'));
  assert.ok(estimates.every(value=>value.units.every(unit=>!['flights','review','save','medical'].includes(unit.stage))));
  assert.equal(f.estimateSaves().length,1);
  assert.ok(f.estimateSaves()[0]!.samples.every(sample=>sample.mode==='resume'&&!['flights','review','save','medical'].includes(sample.stage)));
 }finally{f.dispose();}
});

test('retry preparation excludes elapsed time from the previous failed attempt',async()=>{
 const f=fixture({intent:'update'});
 try{
  f.render();await f.flush();const original=f.progressUpdates.find(progress=>progress.estimate)?.estimate;
  assert.ok(original);f.expire();await f.flush();assert.equal(f.estimateSaves().length,0);
  // The real provider settles cancellation before admitting another capture.
  f.c.busy=false;f.render();await f.flush();
  f.advanceEstimateTime(60_000);const boundary=f.progressUpdates.length;
  f.press('Neu synchronisieren');await f.flush();
  const retry=f.progressUpdates.slice(boundary).find(progress=>progress.estimate)?.estimate;
  assert.ok(retry);assert.notEqual(retry.runId,original.runId);
  assert.ok(retry.units.find(unit=>unit.stage==='prepare')!.elapsedMs<1000);
  f.complete();await f.flush();assert.equal(f.closed.length,1);assert.equal(f.estimateSaves().length,1);
  assert.ok(f.estimateSaves()[0]!.samples.find(sample=>sample.stage==='prepare')!.durationsMs.every(duration=>duration<1000));
 }finally{f.dispose();}
});

test('preparation crossing background permits successful sync without learning the paused duration',async()=>{
 const f=fixture({intent:'update',deferRead:true});
 try{
  f.render();await f.flush();assert.equal(f.calls.includes('session'),false);
  f.background();f.advanceEstimateTime(60_000);await f.flush();f.resume();await f.flush();
  f.finishRead();await f.flush();f.complete();await f.flush();
  assert.equal(f.closed.length,1);assert.ok(f.calls.includes('save'));
  const estimates=f.progressUpdates.map(progress=>progress.estimate).filter((value):value is syncEstimate.SyncEstimateState=>!!value);
  assert.ok(estimates.length>0);assert.ok(estimates.every(value=>!value.learnable));
  assert.ok(f.estimateSaves().every(history=>history.samples.length===0));
  assert.equal((f.estimateHistory() as syncEstimate.SyncEstimateHistory).samples.length,0);
 }finally{f.dispose();}
});

test('pending flight decisions and provider cleanup use partial outcome and never train success hints',async()=>{
 for(const options of [{pendingFlightCount:1},{cleanupAfterTasks:true}]){
  const f=fixture({intent:'update',...options});
  try{
   f.render();await f.flush();f.complete();await f.flush();
   assert.equal(f.closed.length,1);assert.equal(syncProgress.completedSyncProgress(f.closed[0]).state,'partial');
   assert.equal(f.estimateSaves().length,0);
   assert.ok(!f.progressUpdates.some(progress=>progress.estimate?.status==='success'));
  }finally{f.dispose();}
 }
});

test('learned preparation progress is available before the existing stored read finishes',async()=>{
 const first=fixture({initialFlightsSaved:true,intent:'update'});let history:unknown;
 try{first.render();await first.flush();first.complete();await first.flush();history=first.estimateHistory();}finally{first.dispose();}
 const second=fixture({initialFlightsSaved:true,intent:'update',initialEstimateHistory:history,deferRead:true});
 try{
  second.render();await second.flush();
  const preparing=second.progressUpdates.find(progress=>progress.current==='prepare'&&progress.estimate?.fraction!==null&&progress.estimate);
  assert.ok(preparing?.estimate);assert.equal(preparing.estimate.contextVerified,false);
  assert.equal(preparing.estimate.current,'prepare');assert.equal(second.calls.includes('session'),false);
  second.finishRead();await second.flush();second.complete();await second.flush();
  assert.equal(second.closed.length,1);assert.equal(second.estimateSaves().length,1);
 }finally{second.dispose();}
});

test('a warm preparation interrupted by background still completes the actual stage plan without learning',async()=>{
 const first=fixture({intent:'update'});let history:unknown;
 try{first.render();await first.flush();first.complete();await first.flush();history=first.estimateHistory();}finally{first.dispose();}
 const second=fixture({intent:'update',initialEstimateHistory:history,deferRead:true});
 try{
  second.render();await second.flush();second.background();second.advanceEstimateTime(60_000);await second.flush();second.resume();second.finishRead();await second.flush();
  assert.ok(second.progressUpdates.some(progress=>progress.current==='flights'&&progress.estimate?.current==='flights'));
  second.complete();await second.flush();assert.equal(second.closed.length,1);
  assert.ok(second.estimateSaves().every(saved=>saved.samples.every(sample=>sample.durationsMs.length===1)));
 }finally{second.dispose();}
});

test('stale cached preparation context becomes indeterminate after real context proof and learns actual bucket',async()=>{
 const first=fixture({intent:'update'});let history:syncEstimate.SyncEstimateHistory;
 try{first.render();await first.flush();first.complete();await first.flush();history=first.estimateHistory() as syncEstimate.SyncEstimateHistory;}finally{first.dispose();}
 history!.context={mode:'first',volume:'large'};
 history!.samples=history!.samples.map(sample=>({...sample,volume:'large'}));
 const second=fixture({intent:'update',initialEstimateHistory:history!});
 try{
  second.render();await second.flush();
  const active=second.progressUpdates.filter(progress=>progress.current==='flights').map(progress=>progress.estimate).filter(Boolean);
  assert.ok(active.length);assert.ok(active.every(value=>value!.volume==='small'&&value!.fraction===null&&value!.contextVerified));
  second.complete();await second.flush();
  assert.equal(second.estimateSaves().length,1);assert.equal(second.estimateSaves()[0]!.context?.volume,'small');
  assert.ok(second.estimateSaves()[0]!.samples.some(sample=>sample.volume==='small'));
 }finally{second.dispose();}
});

test('Continue measures recovery reads while excluding the earlier user decision wait',async()=>{
 const record:syncRecovery.SyncRecoveryRecord={version:1,ownerId:'owner',storeId:'store',accountRef:'101',clubLabel:'Example',startedAt:'2026-10-26T10:00:00Z',flightCaptureId:'fresh',sources:{medical:'updated'}};
 const f=fixture({startUpdate:true,initialFlightsSaved:true,initialSavedSync:record});
 try{
  f.render();await f.flush();f.advanceEstimateTime(60_000);f.deferNextStoredRead();f.press('Synchronisierung fortsetzen');await f.flush();
  assert.ok(f.progressUpdates.some(progress=>progress.current==='prepare'&&progress.estimate?.mode==='resume'));
  f.advanceEstimateTime(4000);f.finishRead();await f.flush();f.verify();await f.flush();
  assert.equal(f.closed.length,1);assert.equal(f.estimateSaves().length,1);
  const measured=f.estimateSaves()[0]!.samples.find(sample=>sample.stage==='prepare')!.durationsMs[0]!;
  assert.ok(measured>=4000&&measured<5000,`Preparation measured ${measured}ms`);
  assert.ok(!f.calls.some(call=>['retrieve','save','medical'].includes(call)));
 }finally{f.dispose();}
});

test('background during Continue recovery reads cannot admit provider work after foreground returns',async()=>{
 for(const recovered of [false,true]){
  const record:syncRecovery.SyncRecoveryRecord={version:1,ownerId:'owner',storeId:'store',accountRef:recovered?'101':null,clubLabel:recovered?'Example':null,
    startedAt:'2026-10-26T10:00:00Z',flightCaptureId:recovered?'fresh':null,sources:{}};
  const f=fixture({intent:'update',initialFlightsSaved:recovered,initialSavedSync:record});
  try{
   f.render();await f.flush();f.deferNextStoredRead();f.press('Synchronisierung fortsetzen');await f.flush();
   f.background();f.resume();f.finishRead();await f.flush();
   assert.ok(!f.calls.some(call=>['session','verify-job','retrieve','save','medical'].includes(call)),`Late provider work for recovered=${recovered}: ${f.calls}`);
   assert.equal(f.closed.length,0);
   f.press('Gespeicherten Fortschritt fortsetzen');await f.flush();
   if(recovered){f.verify();await f.flush();}else{f.complete();await f.flush();}
   assert.equal(f.closed.length,1,'An explicit new attempt can finish preserved recovery');
  }finally{f.dispose();}
 }
});

test('a delayed fresh source cannot enter the provider after a background round trip',async()=>{
 const f=fixture({intent:'update',deferSource:true});
 try{
  f.render();await f.flush();assert.deepEqual(f.calls,[]);
  f.background();f.resume();f.admitSource();await f.flush();
  assert.ok(!f.calls.some(call=>['session','retrieve','save'].includes(call)));
  assert.equal(f.closed.length,0);assert.equal(f.pendingTimers(),0);
 }finally{f.dispose();}
});

test('a pending optional source cannot restart cancelled Sync jobs after a background round trip',async()=>{
 const f=fixture({intent:'update'});let finishMedical!:()=>void;
 const pendingMedical=new Promise<void>(resolve=>{finishMedical=resolve;});
 f.c.retrieveMedical=async()=>{f.calls.push('medical');await pendingMedical;return {rows:[{}]};};
 try{
  f.render();await f.flush();f.complete();await f.flush();assert.ok(f.calls.includes('medical'));
  f.background();f.resume();finishMedical();await f.flush();
  assert.ok(!f.calls.some(call=>['events','document-notices','work-summary','work-hours','tasks'].includes(call)));
  assert.equal(f.closed.length,0);assert.equal(f.estimateSaves().length,0);
  assert.equal(f.calls.filter(call=>call==='save').length,1,'The completed durable flight save is preserved');
 }finally{f.dispose();}
});

test('background during final recovery cleanup cannot publish a cancelled attempt as successful',async()=>{
 const f=fixture({intent:'update',deferRecoveryClear:true});
 try{
  f.render();await f.flush();f.complete();await f.flush();
  assert.ok(f.calls.includes('tasks'));assert.equal(f.closed.length,0);
  f.background();f.resume();f.finishRecoveryClear();await f.flush();
  assert.equal(f.closed.length,0);assert.equal(f.estimateSaves().length,0);
  assert.equal(f.calls.filter(call=>call==='save').length,1);
 }finally{f.dispose();}
});

test('explicit cancel during final recovery cleanup never publishes success or trains timing',async()=>{
 const f=fixture({intent:'update',deferRecoveryClear:true});
 try{
  f.render();await f.flush();f.complete();await f.flush();
  assert.ok(f.calls.includes('tasks'));assert.equal(f.closed.length,0);
  f.nodes().find(n=>n.type==='ProviderConnection')!.props.close();await f.flush();
  assert.equal(f.closed.length,0);f.finishRecoveryClear();await f.flush();
  assert.equal(f.closed.length,1,'settling cleanup returns only the already-saved flight receipt');
  assert.equal(f.closed[0].added,2);assert.equal(f.closed[0].verifiedConnection,undefined);
  assert.equal(f.closed[0].cancelled,true);assert.equal(syncProgress.completedSyncProgress(f.closed[0]).state,'failed');
  assert.ok(!f.closed.some(result=>result?.completedAt),'cancel never emits a completed Sync result');
  assert.equal(f.estimateSaves().length,0);
  assert.equal(f.calls.filter(call=>call==='save').length,1,'confirmed flight save remains durable');
  assert.ok(!f.journal.journey().some(event=>event.kind==='sync'&&event.target==='sync-success'));
 }finally{f.dispose();}
});

test('explicit cancel while an optional source settles cannot start later jobs or publish completion',async()=>{
 const f=fixture({intent:'update'});let finishMedical!:()=>void;
 const pending=new Promise<void>(resolve=>{finishMedical=resolve;});
 f.c.retrieveMedical=async()=>{f.calls.push('medical');await pending;return {rows:[{}]};};
 try{
  f.render();await f.flush();f.complete();await f.flush();
  f.nodes().find(n=>n.type==='ProviderConnection')!.props.close();await f.flush();
  finishMedical();await f.flush();
  assert.ok(!f.calls.some(call=>['events','document-notices','work-summary','work-hours','tasks'].includes(call)));
  assert.ok(!f.closed.some(result=>result?.completedAt));assert.equal(f.estimateSaves().length,0);
  assert.equal(f.calls.filter(call=>call==='save').length,1);
 }finally{finishMedical();f.dispose();}
});


test('saved readback updates the coordinator without a second stored read',async()=>{
 const f=fixture({intent:'update'});
 try{
  f.render();await f.flush();
  const reads=f.activityOrder.filter(v=>v==='refresh-read').length;
  f.complete();await f.flush();
  assert.equal(f.closed.length,1);assert.equal(f.calls.filter(v=>v==='save').length,1);
  assert.equal(f.activityOrder.filter(v=>v==='refresh-read').length,reads);
 }finally{f.dispose();}
});


test('interrupted dialog names both choices and Continue reuses its fresh preparation snapshot',async()=>{
 const f=fixture({intent:'update',initialFlightsSaved:true,initialSavedSync:{version:1,ownerId:'owner',storeId:'store',accountRef:'101',clubLabel:'Example',startedAt:'2026-10-21T12:00:00.000Z',flightCaptureId:'fresh',sources:{}}});
 try{
  f.render();await f.flush();
  assert.match(f.progressText(),/Die letzte Synchronisierung wurde nicht abgeschlossen/);
  assert.match(f.progressText(),/Alle Daten erneut abrufen/);
  assert.match(f.progressText(),/Bitte lass MoFlight/);
  f.press('Synchronisierung fortsetzen');await f.flush();
  assert.equal(f.calls.filter(v=>v==='snapshot').length,0);
 }finally{f.dispose();}
});


test('provider settings without an owner stays a child page and cannot create an identity by browsing',async()=>{
  const f=fixture({root:true,intent:'options',providerAllowed:false,destination:'settings'});
  try{f.render();await f.flush();assert.equal(f.nodes().find(n=>n.type==='MaintenancePageHeader')!.props.title,'Vereinsflieger');assert.match(f.text(),/Noch keine lokale Vereinsflieger/);assert.ok(!f.calls.includes('create'));assert.ok(!f.text().includes('neue lokale Bibliothek anlegen'));}finally{f.dispose();}
});


test('Settings entry does not reserve or materialize the unrelated flight history',async()=>{
 const root=fixture({root:true,existingOwner:true,destination:'settings',providerAllowed:false,deferReservation:true});
 try{root.render();await root.flush();assert.equal(root.calls.includes('reserve'),false);assert.equal(root.activityOrder.includes('owner-setup'),false);assert.ok(root.nodes().some(n=>typeof n.type==='function'&&n.props.open===true));}
 finally{root.dispose();root.finishReservation();await root.flush();}
 const settings=fixture({destination:'settings',providerAllowed:false,deferRead:true});
 try{settings.render();await settings.flush();assert.equal(settings.activityOrder.includes('refresh-read'),false);assert.equal(settings.nodes().find(n=>n.type==='ConnectionSettings')!.props.busy,false);assert.equal(settings.nodes().find(n=>n.type==='MaintenancePageHeader')!.props.syncDisabled,false);}
 finally{settings.dispose();settings.finishRead();await settings.flush();}
});

test('retained local page exposes preparation while admission is queued, with cancellable read-only Back',async()=>{
 const root=fixture({root:true,existingOwner:true,initialOpen:false,destination:'sources',providerAllowed:false,deferReservation:true});
 try{root.render();await root.flush();root.setOpen(true);await root.flush();const owner=root.nodes().find(n=>typeof n.type==='function')!;assert.equal(owner.props.open,false);assert.equal(owner.props.preparing,true);root.hardwareBack();assert.equal(root.closed.length,1);}
 finally{root.dispose();root.finishReservation();await root.flush();}
 const page=fixture({destination:'backup',providerAllowed:false,initialOpen:false,admissionPending:true});
 try{page.render();assert.ok(page.nodes().some(n=>n.props.testID==='local-page-preparation'));assert.match(page.text(),/Gespeicherte Daten werden geprüft/);assert.equal(page.nodes().find(n=>n.type==='MaintenancePageHeader')!.props.syncDisabled,true);}
 finally{page.dispose();}
});

test('first local page entry shows preparation instead of an unproved missing-owner state and retries failures without creating storage',async()=>{
 const pending=fixture({root:true,destination:'backup',providerAllowed:false,deferReservation:true});
 try{pending.render();assert.match(pending.text(),/Gespeicherte Daten werden geprüft/);assert.doesNotMatch(pending.text(),/Noch keine eigene lokale Bibliothek/);pending.hardwareBack();assert.equal(pending.closed.length,1);}
 finally{pending.dispose();pending.finishReservation();await pending.flush();}
 const failed=fixture({root:true,destination:'settings',providerAllowed:false,failStartup:true});
 try{failed.render();await failed.flush();assert.match(failed.text(),/konnte nicht bestätigt/);assert.ok(!failed.calls.includes('create'));failed.recoverStartup();failed.press('Erneut versuchen');await failed.flush();assert.doesNotMatch(failed.text(),/konnte nicht bestätigt/);assert.ok(!failed.calls.includes('create'));}
 finally{failed.dispose();await failed.flush();}
});

test('lightweight administration retains owner-proof failure, retry and closed-entry guards',async()=>{
 const failed=fixture({destination:'settings',providerAllowed:false,entryProofFails:true});
 try{failed.render();await failed.flush();assert.equal(failed.nodes().find(n=>n.type==='ConnectionSettings')!.props.busy,true);assert.equal(failed.nodes().find(n=>n.type==='MaintenancePageHeader')!.props.syncDisabled,true);assert.match(failed.text(),/Einstellungen konnten nicht geöffnet/);failed.allowEntryProof();failed.press('Erneut versuchen');await failed.flush();assert.equal(failed.nodes().find(n=>n.type==='ConnectionSettings')!.props.busy,false);assert.equal(failed.activityOrder.includes('refresh-read'),false);assert.ok(!failed.calls.includes('retrieve'));assert.ok(!failed.calls.includes('create'));}
 finally{failed.dispose();await failed.flush();}
});


test('Settings rejects a changed owner before showing retained administration, and a closed preparation cannot admit its stale result',async()=>{
 const foreign=fixture({root:true,existingOwner:true,destination:'settings',providerAllowed:false,entryProofFails:true});
 try{foreign.render();await foreign.flush();assert.match(foreign.text(),/konnte nicht bestätigt/);assert.equal(foreign.nodes().some(n=>typeof n.type==='function'),false);assert.ok(!foreign.calls.includes('create'));}
 finally{foreign.dispose();await foreign.flush();}
 const closed=fixture({destination:'settings',providerAllowed:false,deferActivityCancel:true});
 try{closed.render();await closed.flush();closed.setOpen(false);await closed.flush();closed.finishActivityCancel();await closed.flush();assert.equal(closed.nodes().find(n=>n.type==='ConnectionSettings')!.props.busy,true);assert.equal(closed.activityOrder.includes('refresh-read'),false);closed.setOpen(true);await closed.flush();assert.equal(closed.nodes().find(n=>n.type==='ConnectionSettings')!.props.busy,false);assert.ok(closed.calls.every(call=>call==='quiet-session'),'Only the existing closed-surface session monitor may run');}
 finally{closed.dispose();await closed.flush();}
});


test('Backup opens without reserving the history reader or checking the full graph',async()=>{
 const root=fixture({root:true,existingOwner:true,destination:'backup',providerAllowed:false,deferReservation:true});
 try{root.render();await root.flush();assert.equal(root.calls.includes('reserve'),false);assert.equal(root.activityOrder.includes('owner-setup'),false);assert.ok(root.nodes().some(n=>typeof n.type==='function'&&n.props.open===true));}
 finally{root.dispose();root.finishReservation();await root.flush();}
 const page=fixture({destination:'backup',providerAllowed:false,deferRead:true,deferGraph:true});
 try{page.render();await page.flush();assert.equal(page.activityOrder.includes('refresh-read'),false);assert.equal(page.activityOrder.includes('graph-preparation'),false);assert.equal(page.calls.includes('reserve'),false);assert.equal(page.nodes().find(n=>n.type==='MaintenancePageHeader')!.props.busy,false);assert.equal(page.nodes().find(n=>n.type==='Action'&&n.children.includes('In Geräteordner sichern'))!.props.disabled,false);}
 finally{page.dispose();page.finishRead();page.finishGraph();await page.flush();}
});

test('Backup save waits for serialized graph validation and releases admission after success',async()=>{
 const f=fixture({destination:'backup',providerAllowed:false,deferReservation:true,deferGraph:true});
 try{f.render();await f.flush();f.press('In Geräteordner sichern');await f.flush();assert.ok(f.calls.includes('reserve'));assert.equal(f.activityOrder.includes('graph-preparation'),false);assert.equal(f.calls.includes('backup-save'),false);f.finishReservation();await f.flush();assert.ok(f.activityOrder.includes('graph-preparation'));assert.equal(f.calls.includes('backup-save'),false);f.finishGraph();await f.flush();assert.ok(f.calls.includes('backup-save'));assert.ok(f.calls.includes('release'));assert.equal(f.activityOrder.includes('refresh-read'),false);}
 finally{f.dispose();f.finishReservation();f.finishGraph();await f.flush();}
});

test('Backup actions reject unreadable or changed ownership before opening their native operation',async()=>{
 for(const readOnly of [false,true]){
  const f=fixture({destination:'backup',providerAllowed:false,deferGraph:true,readOnly});
  try{f.render();await f.flush();f.press('In Geräteordner sichern');await f.flush();if(!readOnly)f.denyEntryProof();f.finishGraph();await f.flush();assert.equal(f.calls.includes('backup-save'),false);assert.ok(f.calls.includes('release'));assert.ok(!f.calls.includes('create'));}
  finally{f.dispose();f.finishGraph();await f.flush();}
 }
 const closed=fixture({destination:'backup',providerAllowed:false,deferGraph:true});
 try{closed.render();await closed.flush();closed.press('In Geräteordner sichern');await closed.flush();closed.setOpen(false);await closed.flush();closed.finishGraph();await closed.flush();assert.equal(closed.calls.includes('backup-save'),false);assert.ok(closed.calls.includes('release'));}
 finally{closed.dispose();closed.finishGraph();await closed.flush();}
});

test('Backup restore waits for explicit confirmation and graph admission and preserves cancel behavior',async()=>{
 const f=fixture({destination:'backup',providerAllowed:false,deferGraph:true,cancelRestore:true});
 try{f.render();await f.flush();assert.equal(f.calls.includes('reserve'),false);f.press('Sicherungsdatei auswählen');f.render();const prompt=f.nodes().find(n=>n.type==='BackupRestoreConfirmationDialog')!;assert.equal(f.calls.includes('reserve'),false);prompt.props.onConfirm();await f.flush();assert.ok(f.calls.includes('reserve'));assert.equal(f.calls.includes('restore-whole'),false);f.finishGraph();await f.flush();assert.ok(f.calls.includes('restore-whole'));assert.ok(f.calls.includes('release'));assert.match(f.text(),/Dateiauswahl abgebrochen/);assert.equal(f.closed.length,0);}
 finally{f.dispose();f.finishGraph();await f.flush();}
});


test('Backup metadata errors can be retried without reading history, and pending recovery stays discoverable',async()=>{
 const failed=fixture({destination:'backup',providerAllowed:false,failRestoreMetadata:true});
 try{failed.render();await failed.flush();assert.ok(failed.nodes().some(n=>n.type==='Section'&&n.props.title==='Sicherung erstellen'));assert.match(failed.text(),/nicht gelesen/);failed.recoverRestoreMetadata();failed.press('Sicherungsstatus erneut prüfen');await failed.flush();assert.doesNotMatch(failed.text(),/nicht gelesen/);assert.equal(failed.calls.includes('reserve'),false);assert.equal(failed.activityOrder.includes('refresh-read'),false);}
 finally{failed.dispose();await failed.flush();}
 const pending=fixture({destination:'backup',providerAllowed:false,unactivatedPreparation:true});
 try{pending.render();await pending.flush();assert.match(pending.text(),/Vorbereitete Sicherung fortsetzen/);assert.equal(pending.activityOrder.includes('refresh-read'),false);}
 finally{pending.dispose();await pending.flush();}
});

test('a newly pending aggregate restore blocks export and remains resumable through its exact operation',async()=>{
 const f=fixture({destination:'backup',providerAllowed:false,cancelRestore:true});
 try{f.render();await f.flush();f.beginPendingRestore();f.press('In Geräteordner sichern');await f.flush();assert.equal(f.calls.includes('backup-save'),false);assert.ok(f.nodes().some(n=>n.type==='Section'&&n.props.title==='Fortsetzen erforderlich'));f.press('Datensicherung fortsetzen');await f.flush();assert.ok(f.calls.includes('resume-pending'));assert.equal(f.activityOrder.includes('graph-preparation'),false);assert.ok(!f.calls.includes('create'));}
 finally{f.dispose();await f.flush();}
});

test('legacy Backup restore uses the same explicit graph admission and leaves cancellation local',async()=>{
 const f=fixture({destination:'backup',providerAllowed:false,deferGraph:true});
 try{f.render();await f.flush();f.nodes().find(n=>n.props.accessibilityLabel==='Ältere Flugbibliothek-Sicherung')!.props.onPress();f.render();f.press('Sicherung dieser Bibliothek wiederherstellen');await f.flush();assert.equal(f.calls.includes('legacy-restore'),false);f.finishGraph();await f.flush();assert.ok(f.calls.includes('legacy-restore'));assert.ok(f.calls.includes('release'));assert.match(f.text(),/Dateiauswahl abgebrochen/);}
 finally{f.dispose();f.finishGraph();await f.flush();}
});


test('failed graph validation releases Backup admission without opening a picker or creating an owner',async()=>{
 const f=fixture({destination:'backup',providerAllowed:false,graphReady:false});
 try{f.render();await f.flush();f.press('In Geräteordner sichern');await f.flush();assert.equal(f.calls.includes('backup-save'),false);assert.ok(f.calls.includes('release'));assert.ok(!f.calls.includes('create'));assert.match(f.text(),/Dieser Schritt wurde nicht bestätigt/);}
 finally{f.dispose();await f.flush();}
});


test('pending aggregate recovery reserves the reader only after explicit Resume and preserves picker cancellation',async()=>{
 const f=fixture({root:true,existingOwner:true,destination:'backup',providerAllowed:false,pendingRestore:true,cancelRestore:true,deferReservation:true});
 try{f.render();await f.flush();assert.equal(f.calls.includes('reserve'),false);f.press('Datensicherung fortsetzen');await f.flush();assert.ok(f.calls.includes('reserve'));assert.equal(f.calls.includes('resume-pending'),false);f.finishReservation();await f.flush();assert.ok(f.calls.includes('resume-pending'));assert.ok(f.calls.includes('release'));assert.match(f.text(),/Eine Datensicherung wird noch wiederhergestellt/);}
 finally{f.dispose();f.finishReservation();await f.flush();}
});

test('backgrounding during Backup validation cannot open a native picker or save',async()=>{
 const f=fixture({destination:'backup',providerAllowed:false,deferGraph:true});
 try{f.render();await f.flush();f.press('In Geräteordner sichern');await f.flush();f.background();f.finishGraph();await f.flush();assert.equal(f.calls.includes('backup-save'),false);assert.ok(f.calls.includes('release'));}
 finally{f.dispose();f.finishGraph();await f.flush();}
});

test('a prior successful picker round trip cannot label a later backup failure as interrupted Sync',async()=>{
 const f=fixture({destination:'backup',providerAllowed:false});
 try{
  f.render();await f.flush();
  f.onBackup(async()=>{f.background();f.resume();return {state:'saved'};});
  f.press('In Geräteordner sichern');await f.flush();assert.match(f.text(),/Datensicherung gespeichert und zurückgelesen/);
  f.onBackup(async()=>{throw new Error('Synthetic database failure');});
  f.press('In Geräteordner sichern');await f.flush();
  assert.match(f.text(),/Dieser Schritt wurde nicht bestätigt/);
  assert.doesNotMatch(f.text(),/Abruf unterbrochen/);
  assert.equal(f.closed.length,0);assert.equal(f.calls.filter(c=>c==='release').length,2);
 }finally{f.dispose();}
});

test('a failed backup after an expected picker round trip does not report interrupted provider retrieval',async()=>{
 const f=fixture({destination:'backup',providerAllowed:false});
 try{
  f.render();await f.flush();
  f.onBackup(async()=>{f.background();f.resume();throw new Error('Synthetic native read failure');});
  f.press('In Geräteordner sichern');await f.flush();
  assert.match(f.text(),/Dieser Schritt wurde nicht bestätigt/);assert.doesNotMatch(f.text(),/Abruf unterbrochen/);
  assert.equal(f.closed.length,0);assert.ok(f.calls.includes('release'));
 }finally{f.dispose();}
});

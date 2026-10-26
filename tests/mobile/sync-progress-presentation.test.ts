import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {idleSyncNotice,idleSyncProgress,syncStageText} from '../../apps/platform-lab/src/mobile/sync-progress.ts';
import * as syncEstimate from '../../apps/platform-lab/src/mobile/sync-estimate.ts';

function fixture(component='SyncProgress'){
  const source=ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/mobile/SyncProgress.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
  const react={createElement:(type:unknown,props:any,...children:any[]):any=>typeof type==='function'?type({...props,children}):({type,props:props??{},children}),useState:(initial:unknown)=>[initial,()=>{}],useEffect(){},useRef:(initial:unknown)=>({current:initial})};
  class Value{constructor(_value:number){}interpolate(){return 0;}setValue(){}}
  const modules:Record<string,unknown>={react:{default:react,...react},'react-native':{View:'View',Pressable:'Pressable',Animated:{View:'Animated.View',Value},AppState:{currentState:'active'},StyleSheet:{create:(v:unknown)=>v}},'./theme':{Label:'Label',colors:{card:'navy',border:'gray',text:'white',muted:'gray',cyan:'cyan'}},'./SymbolIcon':{SymbolIcon:'SymbolIcon'},'./sync-progress':{syncStageText},'./sync-estimate':syncEstimate};
  const exports:any={};
  runInNewContext(source,{exports,require:(name:string)=>{assert.ok(name in modules,name);return modules[name];}});
  return exports[component] as (props:any)=>any;
}
function nodes(tree:any):any[]{return tree&&typeof tree==='object'?[tree,...(tree.children??[]).flat(Infinity).flatMap(nodes)]:[];}
function text(tree:any):string{return typeof tree==='string'?tree:(tree?.children??[]).flat(Infinity).map(text).join(' ');}
const at='2026-10-22T12:00:00.000Z',now=Date.parse(at)+4*86_400_000;
const advice=idleSyncNotice({receivedAt:at,readState:'ready',now})!;
const readError=idleSyncNotice({receivedAt:at,readState:'failed',now})!;

test('quiet idle has no acknowledgement and idle notice exposes a specific Details action',()=>{
  const render=fixture();let opened=0,retried=0;
  const props={progress:idleSyncProgress,retry:()=>retried++,details:()=>opened++};
  assert.equal(render(props),null);
  const tree=render({...props,notice:advice}),buttons=nodes(tree).filter(n=>n.type==='Pressable');
  assert.match(text(tree),/Aktualisierung empfohlen.*Details/);
  assert.equal(buttons.length,1);buttons[0].props.onPress();assert.equal(opened,1);assert.equal(retried,0);
  assert.ok(buttons[0].props.style.minHeight>=48);assert.ok(buttons[0].props.style.minWidth>=48);
  assert.equal(tree.props.style[1].flexWrap,'wrap');
});

test('local read error wins over settled sync failures and exposes no provider retry',()=>{
  for(const state of ['failed','partial']){
    const tree=fixture()({progress:{state,last:'save',current:null,message:'Optional source failed'},notice:readError,retry(){assert.fail('provider retry');},details(){}});
    assert.match(text(tree),/Gespeicherte Daten nicht lesbar/);
    assert.doesNotMatch(text(tree),/Teilweise aktualisiert|Synchronisierung fehlgeschlagen/);
    assert.equal(nodes(tree).filter(n=>n.type==='Pressable').length,1);
  }
});

test('failed and partial results keep distinct captions, source details and independent retry',()=>{
  for(const [state,caption] of [['failed','Synchronisierung fehlgeschlagen'],['partial','Teilweise aktualisiert']] as const){
    let opened=0,retried=0;
    const tree=fixture()({progress:{state,last:'save',current:null,message:'Nicht aktualisiert: Termine.'},notice:advice,retry(){retried++;},details(){opened++;}});
    assert.ok(text(tree).includes(caption));assert.doesNotMatch(text(tree),/Aktualisierung empfohlen/);
    const buttons=nodes(tree).filter(n=>n.type==='Pressable');assert.equal(buttons.length,2);
    assert.match(buttons[0].props.accessibilityLabel,/Nicht aktualisiert: Termine/);
    buttons[0].props.onPress();buttons[1].props.onPress();assert.equal(opened,1);assert.equal(retried,1);
  }
});

test('active and login-waiting work outrank idle errors and retain guarded cancellation',()=>{
  for(const state of ['active','waiting'])for(const canCancel of [false,true]){
    const tree=fixture()({progress:{state,last:'account',current:state==='waiting'?'sign-in':'flights'},notice:readError,canCancel,cancel(){},retry(){},details(){}});
    assert.equal(tree.props.testID,'sync-progress');assert.match(text(tree),/Anmeldung bestätigt/);
    assert.match(text(tree),state==='waiting'?/Anmeldung erforderlich/:/Flüge werden abgerufen/);
    assert.doesNotMatch(text(tree),/Gespeicherte Daten nicht lesbar|Details/);
    const cancel=nodes(tree).find(n=>n.type==='Pressable');assert.equal(cancel.props.disabled,!canCancel);
    assert.equal(cancel.props.accessibilityState.disabled,!canCancel);assert.ok(cancel.props.style.minHeight>=48);
  }
});


test('both visible rows and accessibility text expose measured counts with honest request units',()=>{
  const tree=fixture()({progress:{state:'active',last:'flights',lastCount:{done:101,total:101,unit:'flights'},current:'duties',count:{done:1,total:2,unit:'requests'}},retry(){},details(){}});
  assert.match(text(tree),/abgerufen \(101\/101\).*Dienste werden abgerufen \(1\/2 Anfragen\)/);
  const spoken=nodes(tree).find(n=>n.props.accessibilityLiveRegion==='polite').props.accessibilityLabel;
  assert.match(spoken,/101\/101.*1\/2 Anfragen/);
});

function estimate(){
  let state=syncEstimate.createSyncEstimate({runId:'presentation',scope:'synthetic',mode:'repeat',volume:'small',stages:['save'],now:0,
    history:{version:syncEstimate.SYNC_ESTIMATE_MODEL_VERSION,scope:'synthetic',samples:[{stage:'save',mode:'repeat',volume:'small',durationsMs:[1000]}]}});
  state=syncEstimate.reduceSyncEstimate(state,{type:'start',stage:'save',runId:state.runId,at:0});
  return syncEstimate.reduceSyncEstimate(state,{type:'tick',runId:state.runId,at:500});
}
test('learned estimates label approximate overall progress while measured stage counts remain exact',()=>{
  const tree=fixture()({progress:{state:'active',last:'flights',current:'save',count:{done:0,total:100,unit:'flights'},estimate:estimate()},retry(){},details(){}});
  assert.match(text(tree),/Flüge werden gespeichert \(0\/100\).*Gesamt ca\. 45 %/);
  const spoken=nodes(tree).find(n=>n.props.accessibilityLiveRegion==='polite').props.accessibilityLabel;
  assert.match(spoken,/0\/100.*Gesamt ca\. 45 %/);
  assert.equal(nodes(tree).filter(n=>n.type==='Label').length,2,'The existing two rows remain');
});
test('cold estimates retain the existing indeterminate ring and emit no invented percentage',()=>{
  const ring=fixture('SyncActivityIndicator')({progress:{state:'active'}});
  assert.equal(ring.props.testID,'sync-activity-ring');
  const tree=fixture()({progress:{state:'active',last:null,current:'save'},retry(){},details(){}});
  assert.doesNotMatch(text(tree),/Gesamt|%|Sekunden/);
});
test('determinate ring uses actual clipped fractions and stays static with reduced motion',()=>{
  const render=fixture('SyncActivityIndicator');
  for(const [fraction,halves] of [[0,0],[.25,1],[.5,1],[.75,2],[.99,2]]){
    const tree=render({progress:{state:'active',estimate:{...estimate(),fraction}}});
    assert.equal(tree.props.testID,'sync-estimated-ring');
    assert.equal(tree.children.flat().filter((node:any)=>node?.props?.style?.[0]?.overflow==='hidden').length,halves);
    assert.equal(nodes(tree).some(n=>n.type==='Animated.View'),false);
  }
});
test('waiting and terminal displays have no countdown and partial/cancelled estimates never show 100',()=>{
  let state=estimate();
  state=syncEstimate.reduceSyncEstimate(state,{type:'pause',reason:'sign-in',runId:state.runId,at:500});
  const tree=fixture()({progress:{state:'waiting',last:'account',current:'sign-in',estimate:state},retry(){},details(){}});
  assert.match(text(tree),/Anmeldung erforderlich.*Gesamt ca\. 45 %/);assert.doesNotMatch(text(tree),/Sekunden|verbleib/);
  for(const outcome of ['partial','cancelled','failed'] as const){
    const terminal=syncEstimate.reduceSyncEstimate(estimate(),{type:'terminal',outcome,runId:state.runId,at:10000});
    const settled=fixture()({progress:{state:'failed',last:'flights',current:null,message:'Nicht abgeschlossen',estimate:terminal},retry(){},details(){}});
    assert.doesNotMatch(text(settled),/100 %|Sekunden|verbleib/);
  }
});
test('capped opaque stages explain a longer wait without a precise remaining-time claim',()=>{
  const state=estimate(),late=syncEstimate.reduceSyncEstimate(state,{type:'tick',runId:state.runId,at:10000});
  const tree=fixture()({progress:{state:'active',last:'flights',current:'save',estimate:late},retry(){},details(){}});
  assert.match(text(tree),/Gesamt ca\. 90 %.*Dauert länger als erwartet/);
  assert.doesNotMatch(text(tree),/Sekunden|verbleib/);
});

test('leaf timers advance only foreground determinate work, exclude hidden time and release obsolete callbacks',()=>{
  const slots:any[]=[],effects:Array<()=>void>=[],timers=new Map<number,()=>void>();let index=0,clock=500,nextTimer=0;
  const react={
    useState(initial:any){const slot=index++;if(!(slot in slots))slots[slot]=initial;return [slots[slot],(value:any)=>{slots[slot]=typeof value==='function'?value(slots[slot]):value;}];},
    useRef(initial:any){const slot=index++;return slots[slot]??=( {current:initial});},
    useEffect(effect:()=>undefined|(()=>void),dependencies:any[]){
      const slot=index++,old=slots[slot];
      if(!old||dependencies.some((value,i)=>value!==old.dependencies[i]))effects.push(()=>{old?.cleanup?.();slots[slot]={dependencies,cleanup:effect()};});
    },
  };
  const modules:Record<string,unknown>={react:{default:react,...react},'react-native':{StyleSheet:{create:(value:unknown)=>value}},'./theme':{colors:{}},'./SymbolIcon':{},'./sync-progress':{},'./sync-estimate':{...syncEstimate,syncEstimateNow:()=>clock}};
  const source=ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/mobile/SyncProgress.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
  const exports:any={};
  runInNewContext(source,{exports,require:(name:string)=>modules[name],
    setInterval:(callback:()=>void,delay:number)=>{assert.equal(delay,500);const id=++nextTimer;timers.set(id,callback);return id;},clearInterval:(id:number)=>timers.delete(id)});
  const render=(state:syncEstimate.SyncEstimateState|undefined,foreground=true)=>{index=0;const result=exports.useSyncEstimateDisplay(state,foreground);while(effects.length)effects.shift()!();return result;};
  const initial=estimate();assert.equal(render(initial).fraction,.45);assert.equal(timers.size,1);
  clock=750;for(const timer of timers.values())timer();assert.equal(render(initial).fraction,.675);
  render(initial,false);assert.equal(timers.size,0);
  clock=10_000;assert.equal(render(initial,false).fraction,.675);
  render(initial);clock=10_100;for(const timer of timers.values())timer();assert.equal(render(initial).fraction,.765);
  const paused=syncEstimate.reduceSyncEstimate(initial,{type:'pause',reason:'sign-in',runId:initial.runId,at:500});
  assert.equal(render(paused).fraction,.765,'A new paused snapshot retains the displayed estimate');assert.equal(timers.size,0);
  const nextRun={...initial,runId:'next-attempt'};
  assert.equal(render(nextRun).fraction,.45,'A fresh run resets the visual floor');
  assert.equal(render({...nextRun,now:600,fraction:.1}).fraction,.45,'Delayed same-run evidence cannot move the visual estimate backwards');
  assert.equal(render(undefined),null);assert.equal(timers.size,0);
});

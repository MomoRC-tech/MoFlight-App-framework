import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {idleSyncNotice,idleSyncProgress,syncStageText} from '../../apps/platform-lab/src/mobile/sync-progress.ts';

function fixture(){
  const source=ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/mobile/SyncProgress.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
  const react={createElement:(type:unknown,props:any,...children:any[])=>({type,props:props??{},children}),useState:(initial:unknown)=>[initial,()=>{}],useEffect(){},useRef:(initial:unknown)=>({current:initial})};
  class Value{constructor(_value:number){}interpolate(){return 0;}setValue(){}}
  const modules:Record<string,unknown>={react:{default:react,...react},'react-native':{View:'View',Pressable:'Pressable',Animated:{View:'Animated.View',Value},AppState:{currentState:'active'},StyleSheet:{create:(v:unknown)=>v}},'./theme':{Label:'Label',colors:{card:'navy',border:'gray',text:'white',muted:'gray',cyan:'cyan'}},'./SymbolIcon':{SymbolIcon:'SymbolIcon'},'./sync-progress':{syncStageText}};
  const exports:any={};
  runInNewContext(source,{exports,require:(name:string)=>{assert.ok(name in modules,name);return modules[name];}});
  return exports.SyncProgress as (props:any)=>any;
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

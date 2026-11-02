import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import * as ringModel from '../../apps/platform-lab/src/mobile/season-model.ts';

interface Node {type:any;props:Record<string,any>;children:any[]}
const element=(type:any,props:any,...children:any[]):Node=>({type,props:props??{},children:children.flat(Infinity)});
function nodes(tree:Node):Node[]{return [tree,...tree.children.filter(v=>v&&typeof v==='object'&&'children'in v).flatMap(nodes)];}
function source(name:string,modules:Record<string,any>){
  const code=ts.transpileModule(readFileSync(new URL(`../../apps/platform-lab/src/mobile/${name}.tsx`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
  const exports:any={};runInNewContext(code,{exports,JSON,Error,require:(name:string)=>{assert.ok(name in modules,name);return modules[name];}});return exports;
}
function costFixture(){
  let index=0,state='active',owner='owner-a',active=true;
  const hooks:any[]=[],effects:(()=>void)[]=[],listeners=new Set<(state:string)=>void>();
  const reads:{owner:any;gate:()=>void;resolve:(v:unknown)=>void;reject:(e:Error)=>void}[]=[];
  const react={createElement:element,useState:(initial:any)=>{const n=index++;if(!(n in hooks))hooks[n]=initial;return[hooks[n],(v:any)=>{hooks[n]=v;}];},useEffect:(effect:()=>any,deps:any[])=>{const n=index++,old=hooks[n];if(!old||deps.some((v,i)=>v!==old.deps[i]))effects.push(()=>{old?.cleanup?.();hooks[n]={deps,cleanup:effect()};});}};
  const leaves=Object.fromEntries(['Card','Label','Section'].map(n=>[n,n]));
  const component=source('HomeCosts',{'react':react,'react-native':{View:'View',AppState:{get currentState(){return state;},addEventListener:(_event:string,fn:(state:string)=>void)=>{listeners.add(fn);return{remove:()=>listeners.delete(fn)};}}},'./theme':{...leaves,colors:{}},'./SymbolIcon':{SymbolIcon:'SymbolIcon'},
    '../vereinsflieger/expense-analysis-native':{readFinancialAnalysisNative:(owner:any,gate:()=>void)=>new Promise((resolve,reject)=>{reads.push({owner,gate,resolve,reject});})},
    '../expenses/expense-projection':{projectExpenses:()=>({state:'partial',flying:{knownMinor:12345}})},'./financial-analysis-model':{expenseMoney:()=> '123,45 €'}}).HomeCosts;
  const render=()=>{index=0;return component({view:{snapshot:{ownerId:owner,storeId:`store-${owner}`,account:{accountRef:`account-${owner}`}}},active,reload:0,year:2026,onOpen(){}}) as Node;};
  return {render,reads,effect:()=>{while(effects.length)effects.shift()!();},owner:(v:string)=>{owner=v;},active:(v:boolean)=>{active=v;},background:(v:string)=>{state=v;listeners.forEach(fn=>fn(v));},unmount:()=>hooks.forEach(h=>h?.cleanup?.())};
}
const settle=()=>new Promise(resolve=>{setImmediate(resolve);});
const text=(tree:Node)=>nodes(tree).flatMap(n=>n.children.filter(c=>typeof c==='string')).join(' ');
test('Start costs never flashes a previous account amount and revokes delayed reads',async()=>{
  const f=costFixture();f.render();f.effect();assert.equal(f.reads[0]!.owner.ownerId,'owner-a');
  f.reads[0]!.resolve({snapshot:{scope:{}}});await settle();assert.match(text(f.render()),/123,45/);
  f.owner('owner-b');assert.doesNotMatch(text(f.render()),/123,45/);f.effect();assert.throws(f.reads[0]!.gate);
  assert.equal(f.reads[1]!.owner.accountRef,'account-owner-b');f.reads[1]!.reject(Error('unreadable'));await settle();assert.doesNotMatch(text(f.render()),/123,45/);assert.match(text(f.render()),/nicht lesbar/);f.unmount();
});
test('Start costs background/unmount invalidate callbacks; foreground retries locally',async()=>{
  const f=costFixture();f.render();f.effect();const old=f.reads[0]!;f.background('background');assert.throws(old.gate);old.resolve({snapshot:{scope:{}}});await settle();assert.doesNotMatch(text(f.render()),/123,45/);
  f.background('active');assert.equal(f.reads.length,2);f.reads[1]!.resolve(null);await settle();assert.match(text(f.render()),/Noch keine/);f.unmount();assert.throws(f.reads[1]!.gate);
  const hidden=costFixture();hidden.active(false);hidden.render();hidden.effect();assert.equal(hidden.reads.length,0);hidden.unmount();
});
test('all six persistent module controls route independently and expose selection',()=>{
  const selected:string[]=[];let home=0;
  const module=source('SubappNavigation',{'react':{createElement:element},'react-native':{Pressable:'Pressable',Text:'Text',View:'View',StyleSheet:{create:(v:any)=>v},useWindowDimensions:()=>({fontScale:1.6})},'./theme':{colors:{},ui:{}},'./SymbolIcon':{SymbolIcon:'SymbolIcon'}});
  const tree=module.SubappNavigation({selected:'costs',rail:false,onSelect:(id:string)=>selected.push(id),onHome:()=>home++});
  const buttons=nodes(tree).filter(n=>n.props.accessibilityRole==='tab');assert.equal(buttons.length,6);
  assert.deepEqual(buttons.filter(n=>n.props.accessibilityState.selected).map(n=>n.props.accessibilityLabel),['Kosten']);
  buttons.forEach(n=>n.props.onPress());assert.deepEqual(selected,['flights','logbook','club','costs','statistics','ai']);assert.equal(home,0);
  nodes(module.SubappNavigation({selected:null,rail:true,onSelect(){},onHome:()=>home++})).find(n=>n.props.accessibilityLabel==='Start öffnen')!.props.onPress();assert.equal(home,1);
});

function instrument(values:any,aircraft:any[]=[]){
  const component=source('PilotSeasonInstrument',{'react':{createElement:element},'react-native':{Pressable:'Pressable',View:'View',StyleSheet:{create:(v:any)=>v},useWindowDimensions:()=>({fontScale:1})},'./theme':{Label:'Label',colors:{cyan:'#43c9ff'},ui:{}},'./season-model':ringModel,'./real-flight-statistics':{formatReportedMinutes:(v:number)=>`${Math.floor(v/60)}:${String(v%60).padStart(2,'0')}`},'./SymbolIcon':{SymbolIcon:'SymbolIcon'}}).PilotSeasonInstrument;
  return component({year:2026,values,aircraft,onOpen(){},onFlights(){},onAircraft(){}}) as Node;
}
test('season instrument aligns known aircraft time sections with exact values and the prior count marker',()=>{
  const tree=instrument({current:{starts:'68',time:'42:18'},prior:{starts:'52',time:'31:42'}},[{aircraft:'A',color:'cyan',knownMinutes:120,count:2},{aircraft:'B',color:'blue',knownMinutes:60,count:1}]);
  const arcs=nodes(tree).filter(n=>n.type?.name==='Arc');assert.equal(arcs.length,2);
  assert.equal(arcs[0]!.props.slices[0].sweep,240);assert.equal(arcs[0]!.props.slices[1].sweep,120);
  assert.equal(arcs[1]!.props.slices[0].sweep,360);
  assert.match(text(tree),/\+16 zum Vorjahr/);assert.match(text(tree),/2:00/);
  assert.ok(nodes(tree).some(n=>n.type==='Pressable'&&String(n.props.accessibilityLabel).includes('kein Ziel')));
  assert.ok(nodes(tree).some(n=>n.type==='View'&&n.props.style?.backgroundColor==='#f7c46b'&&typeof n.props.style.left==='number'));
});
test('unknown and zero season counts never draw a false progress arc or previous-year marker',()=>{
  for(const starts of ['—','0']){
    const tree=instrument({current:{starts,time:starts==='0'?'0:00':'—'},prior:{starts,time:'—'}});
    const arcs=nodes(tree).filter(n=>n.type?.name==='Arc');assert.equal(arcs[0]!.props.slices.length,0);assert.equal(arcs[1]!.props.slices.length,0);
    assert.equal(nodes(tree).some(n=>n.type==='View'&&n.props.style?.backgroundColor==='#f7c46b'&&typeof n.props.style.left==='number'),false);
  }
});

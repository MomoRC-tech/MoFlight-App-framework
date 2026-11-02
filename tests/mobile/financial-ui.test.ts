import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as model from '../../apps/platform-lab/src/mobile/financial-analysis-model.ts';
import { validStatisticsRange } from '../../apps/platform-lab/src/mobile/statistics-overlay-model.ts';
import type { FinancialAnalysisData } from '../../apps/platform-lab/src/mobile/financial-analysis-model.ts';
import { evidenceSnapshot } from './fixtures/expense-evidence.ts';
const source=ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/mobile/ExpensesView.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
interface Node{type:unknown;props:Record<string,any>;children:any[]}
function fixture(){
 let index=0,state='active',back=()=>false,refresh=0,period:any={mode:'year',year:2026},expected:any={ownerId:'owner-a',storeId:'store-a',accountRef:'account-a'};
 const hooks:any[]=[],effects:(()=>void)[]=[],pending:{expected:unknown;current:()=>void;resolve:(data:FinancialAnalysisData|null)=>void;reject:(error:Error)=>void}[]=[],listeners=new Set<(state:string)=>void>();
 const react={createElement:(type:unknown,props:any,...children:any[])=>({type,props:props??{},children:children.flat(Infinity)}) as Node,
 useState:(initial:unknown)=>{const i=index++;if(!(i in hooks))hooks[i]=initial;return [hooks[i],(v:any)=>{hooks[i]=typeof v==='function'?v(hooks[i]):v;}];},
 useRef:(initial:unknown)=>{const i=index++;if(!(i in hooks))hooks[i]={current:initial};return hooks[i];},
 useMemo:(fn:()=>unknown)=>{index++;return fn();},
 useEffect:(fn:()=>void|(()=>void),deps:any[])=>{const i=index++,old=hooks[i];if(!old||deps.some((v,j)=>v!==old.deps[j])){effects.push(()=>{old?.cleanup?.();const cleanup=fn();hooks[i]={deps,cleanup};});}},
 };
 const leaves=(names:string[])=>Object.fromEntries(names.map(n=>[n,n]));
 const modules:Record<string,unknown>={react:{default:react,...react},'react-native':{...leaves(['ActivityIndicator','KeyboardAvoidingView','Modal','Pressable','ScrollView','TextInput','View']),Platform:{OS:'android'},StyleSheet:{create:(v:unknown)=>v},AppState:{get currentState(){return state;},addEventListener:(_event:string,fn:(v:string)=>void)=>{listeners.add(fn);return{remove:()=>listeners.delete(fn)};}}},
 '../vereinsflieger/expense-analysis-native':{readFinancialAnalysisNative:(e:unknown,current:()=>void)=>new Promise((resolve,reject)=>{pending.push({expected:e,current,resolve,reject});})},
 './ExpenseMonthlyChart':{ExpenseMonthlyChart:'ExpenseMonthlyChart'},'./financial-analysis-model':model,'./statistics-overlay-model':{validStatisticsRange},'./theme':{...leaves(['Action','Card','Chip','Empty','Label','Section']),colors:{}}};
 const exports:any={};runInNewContext(source,{exports,JSON,Date,Math,Error,require:(name:string)=>{assert.ok(name in modules,name);return modules[name];}});
 const render=()=>{index=0;return exports.ExpensesView({expected,reloadKey:0,period,onPeriod:(v:unknown)=>{period=v;},onRefresh:()=>refresh++,onBackHandler:(v:()=>boolean)=>{back=v;}}) as Node;};
 const nodes=(tree=render()):Node[]=>{const all:Node[]=[];function walk(v:any){if(v&&typeof v==='object'&&'children'in v){all.push(v);v.children.forEach(walk);}}walk(tree);return all;};
 return {render,nodes,pending,back:()=>back(),refresh:()=>refresh,period:()=>period,setOwner:(v:any)=>{expected=v;},effect:()=>{while(effects.length)effects.shift()!();},appState:(v:string)=>{state=v;listeners.forEach(fn=>fn(v));},unmount:()=>hooks.forEach(v=>v?.cleanup?.())};
}
async function data():Promise<FinancialAnalysisData>{const evidence=await evidenceSnapshot();return {snapshot:{version:2,sourceBasis:'unversioned-billed-flight',scope:{ownerId:'owner-a',storeId:'store-a',connectionId:'connection',accountRef:'account-a',clubContext:'club'},coverage:{state:'partial',from:null,through:null,evidenceRefs:[]},facts:[]},evidence:[evidence],receipts:[]};}
const settle=()=>new Promise(resolve=>{setImmediate(resolve);});
test('Costs opens locally, refresh is explicit, and account changes hide previous private source values before effects',async()=>{
 const f=fixture();f.render();f.effect();assert.equal(f.pending.length,1);assert.equal(f.refresh(),0);f.pending[0]!.resolve(await data());await settle();let nodes=f.nodes();assert.ok(nodes.some(n=>n.type==='Section'&&n.props.title==='Verein & Konten'));assert.ok(nodes.some(n=>n.type==='Label'&&n.children.includes('Bekannter Teilbetrag'))===false);
 const chart=nodes.find(n=>n.type==='ExpenseMonthlyChart')!;chart.props.onMonth(chart.props.months[5]);assert.equal(f.period().mode,'month');assert.equal(f.period().month,6);assert.equal(f.refresh(),0);
 nodes.find(n=>n.type==='Action'&&n.children.includes('Belege abrufen'))!.props.onPress();assert.equal(f.refresh(),1);
 f.setOwner({ownerId:'owner-b',storeId:'store-b',accountRef:'account-b'});nodes=f.nodes();assert.equal(nodes.some(n=>n.type==='Section'&&n.props.title==='Verein & Konten'),false);f.effect();assert.equal(f.pending.length,2);f.pending[1]!.reject(Error('foreign'));await settle();nodes=f.nodes();assert.ok(nodes.some(n=>n.type==='Empty'&&n.props.title==='Kosten nicht lesbar'));nodes.find(n=>n.type==='Action'&&n.children.includes('Lokal erneut prüfen'))!.props.onPress();f.render();f.effect();assert.equal(f.pending.length,3);assert.equal(f.refresh(),1);f.unmount();
});
test('background, unmount and stale native reads cannot publish; returning starts a fresh local read',async()=>{
 const f=fixture();f.render();f.effect();const old=f.pending[0]!;f.appState('background');assert.throws(old.current);old.resolve(await data());await settle();assert.equal(f.nodes().some(n=>n.type==='Section'&&n.props.title==='Verein & Konten'),false);f.appState('active');assert.equal(f.pending.length,2);f.unmount();assert.throws(f.pending[1]!.current);f.pending[1]!.resolve(await data());await settle();
});
test('custom range validates real calendar dates and sheet Back preserves period without provider activity',async()=>{
 const f=fixture();f.render();f.effect();f.pending[0]!.resolve(null);await settle();f.nodes().find(n=>n.type==='Chip'&&n.props.title==='2026')!.props.onPress();f.nodes().find(n=>n.type==='Chip'&&n.props.title==='Eigener Zeitraum')!.props.onPress();let nodes=f.nodes();nodes.find(n=>n.type==='TextInput'&&n.props.accessibilityLabel==='Kosten von')!.props.onChangeText('2026-02-30');nodes=f.nodes();assert.equal(nodes.find(n=>n.type==='Action'&&n.children.includes('Anwenden'))!.props.disabled,true);nodes.find(n=>n.type==='TextInput'&&n.props.accessibilityLabel==='Kosten von')!.props.onChangeText('2026-02-01');nodes=f.nodes();nodes.find(n=>n.type==='Action'&&n.children.includes('Anwenden'))!.props.onPress();assert.equal(f.period().mode,'custom');assert.equal(f.refresh(),0);f.render();assert.equal(f.back(),false);f.unmount();
});

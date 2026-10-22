import * as diagnostics from '../../apps/platform-lab/src/diagnostics';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as model from '../../apps/platform-lab/src/mobile/own-flight-model.ts';
import * as review from '../../apps/platform-lab/src/vereinsflieger/capture-review.ts';
import { planFlightRetrieval } from '../../apps/platform-lab/src/vereinsflieger/retrieval-policy.ts';
import { dataFreshness } from '../../apps/platform-lab/src/mobile/data-freshness.ts';
import { ownFlightFixture } from './own-flight-fixture.ts';

interface Element {type:string;props:Record<string,any>;children:any[]}
const source=ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/mobile/OwnFlights.tsx',import.meta.url),'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:false},
}).outputText;
function fixture() {
  const f=ownFlightFixture(),data:any={view:{snapshot:f.snapshot,flights:f.flights,pendingCommand:false},phase:'ready',detail:null,detailBusy:false,clearDetail(){},reload(){},openDetail(){}};
  let index=0,active=true;let filterRequest:model.OwnFlightRequest|null=null;const hooks:any[]=[],effects:(()=>void)[]=[],restores:number[]=[];
  const react={
    createElement:(type:string,props:Element['props'],...children:any[]):Element=>{
      if(type==='FlatList'&&props?.ref)props.ref.current={scrollToOffset:({offset}:{offset:number})=>restores.push(offset)};
      return{type,props:props??{},children:children.flat(Infinity)};
    },
    useState(initial:unknown){const i=index++;if(!(i in hooks))hooks[i]=initial;return[hooks[i],(next:unknown)=>{hooks[i]=next;}];},
    useRef(initial:unknown){const i=index++;if(!(i in hooks))hooks[i]={current:initial};return hooks[i];},
    useMemo(fn:()=>unknown){return fn();},useCallback(fn:unknown){return fn;},
    useEffect(fn:()=>void,deps:unknown[]){const i=index++;if(!hooks[i]||deps.some((v,n)=>v!==hooks[i][n])){hooks[i]=deps;effects.push(fn);}},
  };
  const leaves=(names:string[])=>Object.fromEntries(names.map(n=>[n,n]));
  const modules:Record<string,unknown>={'../diagnostics':diagnostics,react:{default:react,...react},'react-native':{
    ...leaves(['ActivityIndicator','FlatList','Pressable','ScrollView','TextInput','View']),Keyboard:{dismiss(){}},StyleSheet:{create:(x:unknown)=>x},useWindowDimensions:()=>({width:390,fontScale:1}),
  },'./theme':{...leaves(['Action','Card','Chip','Empty','GliderMark','IconLabel','Label','Section']),colors:{},ui:{}},'./SymbolIcon':leaves(['SymbolIcon']),
  './use-own-flights':{useOwnFlights:()=>{throw new Error('Presentation must reuse the shell reader');}},'./own-flight-reader-native':{ownFlightReadPorts:{}},'./own-flight-model':model,
  '../vereinsflieger/retrieval-policy':{planFlightRetrieval},'./data-freshness':{dataFreshness},'../vereinsflieger/capture-review':review};
  const exports:any={};runInNewContext(source,{exports,require:(name:string)=>{assert.ok(name in modules,name);return modules[name];}});
  let tree:Element;const header=()=>{};
  function render(){index=0;tree=exports.OwnFlights({active,filterRequest,data,onUpdate:()=>false,onHeaderChange:header});effects.splice(0).forEach(fn=>fn());return tree;}
  function nodes(){const result:Element[]=[];const visit=(n:any)=>{if(n?.children){result.push(n);n.children.forEach(visit);if(n.type==='FlatList')visit(n.props.ListHeaderComponent);}};visit(tree);return result;}
  function find(type:string,label?:string){const node=nodes().find(n=>n.type===type&&(!label||n.props.accessibilityLabel===label));assert.ok(node,`${type} ${label}`);return node;}
  render();return{data,render,find,nodes,restores,request:(year:number|null, extras:Partial<model.OwnFlightRequest>={})=>{filterRequest={year,...extras};render();render();},setActive:(value:boolean)=>{active=value;render();}};
}
test('native zero-offset events while loading, hidden or inactive cannot erase the saved list return position',()=>{
  const f=fixture(),view=f.data.view;
  const scroll=(y:number)=>f.find('FlatList').props.onScroll({nativeEvent:{contentOffset:{y}}});
  const restore=()=>f.find('FlatList').props.onContentSizeChange();
  scroll(240);f.data.phase='loading';f.data.view=null;f.render();scroll(0);
  f.data.phase='ready';f.data.view=view;f.render();restore();assert.equal(f.restores.at(-1),240);
  f.find('Pressable','Flugfilter öffnen').props.onPress();f.render();scroll(0);restore();assert.equal(f.restores.at(-1),240);
  f.setActive(false);scroll(0);f.setActive(true);restore();assert.equal(f.restores.at(-1),240);
});
test('changing the search deliberately resets position and combines with the saved source projection',()=>{
  const f=fixture();f.find('FlatList').props.onScroll({nativeEvent:{contentOffset:{y:240}}});
  f.find('TextInput','Flüge durchsuchen').props.onChangeText('D-T001');f.render();
  assert.equal(f.restores.at(-1),0);assert.deepEqual(f.find('FlatList').props.data.map((x:any)=>x.flightId),['flight-1']);
});

test('season drill-down replaces stale filters, repeats after edits and survives ordinary tab return',()=>{
  const f=fixture();
  f.find('TextInput','Flüge durchsuchen').props.onChangeText('no match');f.render();
  f.request(2025);
  assert.equal(f.find('TextInput','Flüge durchsuchen').props.value,'');
  assert.deepEqual(f.find('FlatList').props.data.map((x:any)=>x.flightId),['flight-1']);
  f.find('TextInput','Flüge durchsuchen').props.onChangeText('no match');f.render();
  f.request(2025);assert.equal(f.find('FlatList').props.data.length,1);
  f.find('TextInput','Flüge durchsuchen').props.onChangeText('no match');f.render();
  f.setActive(false);f.setActive(true);f.render();
  assert.equal(f.find('TextInput','Flüge durchsuchen').props.value,'no match');
  f.request(2099);assert.equal(f.find('FlatList').props.data.length,0);
  f.request(null);assert.equal(f.find('FlatList').props.data.length,3);
});

test('deferred season request applies after loading, but consumed requests cannot leak across owners',()=>{
  const f=fixture(),view=f.data.view;f.data.view=null;f.data.phase='loading';f.render();
  f.request(2025);f.data.view=view;f.data.phase='ready';f.render();f.render();
  assert.equal(f.find('FlatList').props.data.length,1);
  f.data.view={...view,snapshot:{...view.snapshot,ownerId:'other-owner'}};f.render();f.render();
  assert.equal(f.find('FlatList').props.data.length,3);
});


test('actual filter controls record action kinds without search text, year or registration values',()=>{
 diagnostics.diagnosticJournal.clear();const f=fixture();f.find('TextInput','Flüge durchsuchen').props.onChangeText('Private secret crew D-PRIVATE');f.render();
 f.find('Pressable','Flugfilter öffnen').props.onPress();f.render();
 const report=diagnostics.diagnosticJournal.export();assert.ok(!report.includes('Private secret crew'));assert.ok(!report.includes('D-PRIVATE'));
 assert.ok(diagnostics.diagnosticJournal.journey().some(e=>e.kind==='filter'&&e.target==='search'));assert.ok(diagnostics.diagnosticJournal.journey().some(e=>e.kind==='screen'&&e.target==='flight-filter'));
});

function visibleText(node:any):string {
  if(node?.children)return node.children.map(visibleText).join(' ');
  return typeof node==='string'||typeof node==='number'?String(node):'';
}
test('ordinary flight rows expose useful saved facts while technical provenance and absent-track explanation remain in detail',()=>{
  const f=fixture(),list=f.find('FlatList'),item=f.data.view.flights[0];
  const row=list.props.renderItem({item});const text=visibleText(row);
  assert.ok(text.includes(review.reviewParsedField(item.facts.assessment.date)));
  for(const field of ['registration','departure','arrival'])assert.ok(text.includes(review.reviewRawField(item.facts.assessment.fields[field])));
  assert.ok(text.includes(review.reviewDuration(item.facts.assessment.durations.flight)));
  assert.ok(!/Quellflug|Fassung|Track/.test(text));
  f.data.detail={...item,factHistory:[item.facts],pending:[]};
  const detailText=visibleText(f.render()).replace(/\s+/g,' ');
  assert.ok(detailText.includes(item.sourceFlightRef));assert.ok(detailText.includes('Fassung 1'));
  assert.ok(detailText.includes('Kein gespeicherter Track'));assert.ok(f.nodes().some(n=>n.type==='Section'&&n.props.title==='Originale Anbieterfelder'));assert.ok(detailText.includes(item.facts.assessment.observation.row.values[0]));
});

test('original provider fields paginate across three pages and return to the filtered list',()=>{
  const f=fixture();
  f.find('TextInput','Flüge durchsuchen').props.onChangeText('D-T001');f.render();
  const item=f.find('FlatList').props.data[0];
  const total=19;
  const headers=Array.from({length:total},(_,i)=>`Synthetic provider field ${i+1}`);
  const values=Array.from({length:total},(_,i)=>`Synthetic value ${i+1}`);
  const makeDetail=()=>({...item,factHistory:[],captures:[],pending:[],facts:{...item.facts,assessment:{...item.facts.assessment,observation:{...item.facts.assessment.observation,headers,row:{...item.facts.assessment.observation.row,values}}}}});
  f.data.detail=makeDetail();
  f.data.clearDetail=()=>{f.data.detail=null;};
  f.render();
  const action=(caption:string)=>{
    const node=f.nodes().find(n=>n.type==='Action'&&visibleText(n).trim()===caption);
    assert.ok(node,`Action ${caption}`);return node;
  };
  const detailText=()=>visibleText(f.render()).replace(/\s+/g,' ');
  const assertRange=(from:number,to:number)=>assert.match(detailText(),new RegExp(`Felder ${from}\\s*–\\s*${to} von ${total}`));
  const previous=()=>action('Zurück');
  const next=()=>action('Weiter');

  assert.equal(previous().props.label,'Vorherige Anbieterfelder');assert.equal(previous().props.disabled,true);
  assert.equal(next().props.label,'Weitere Anbieterfelder');assert.equal(next().props.disabled,false);
  assertRange(1,8);
  assert.ok(detailText().includes('Synthetic value 1')&&detailText().includes('Synthetic value 8'));
  assert.ok(!detailText().includes('Synthetic value 9'));

  next().props.onPress();
  assertRange(9,16);
  assert.ok(detailText().includes('Synthetic value 9')&&detailText().includes('Synthetic value 16'));
  assert.equal(previous().props.disabled,false);assert.equal(next().props.disabled,false);

  next().props.onPress();
  assertRange(17,19);
  assert.ok(detailText().includes('Synthetic value 17')&&detailText().includes('Synthetic value 19'));
  assert.equal(previous().props.disabled,false);assert.equal(next().props.disabled,true);

  previous().props.onPress();
  assertRange(9,16);
  action('Zur gefilterten Flugliste').props.onPress();
  const listText=detailText();
  assert.ok(f.nodes().some(n=>n.type==='Section'&&n.props.title==='Eigene gespeicherte Flüge'));
  assert.ok(!listText.includes('Originale Anbieterfelder'));
  assert.equal(f.find('TextInput','Flüge durchsuchen').props.value,'D-T001');
  assert.deepEqual(f.find('FlatList').props.data.map((flight:any)=>flight.flightId),['flight-1']);

  f.data.detail=makeDetail();
  assertRange(1,8);
  assert.ok(detailText().includes('Synthetic value 1'));
});


test('month request clears stale search and opens only the exact saved identity with a day range',()=>{
  const f=fixture();const chosen=f.data.view.flights[1];const day=chosen.facts.assessment.date.value;
  const other=structuredClone(chosen);other.flightId='same-provider-reference';
  f.data.view={...f.data.view,flights:[...f.data.view.flights,other]};f.render();
  const opened:any[]=[];f.data.openDetail=(flight:any)=>opened.push(flight);
  f.find('TextInput','Flüge durchsuchen').props.onChangeText('no match');f.render();
  f.request(2025,{dateRange:{from:day,to:day},flightId:chosen.flightId});
  assert.deepEqual(f.find('FlatList').props.data.map((flight:any)=>flight.flightId),[chosen.flightId,other.flightId]);
  assert.deepEqual(opened.map(flight=>flight.flightId),[chosen.flightId]);
  f.request(2025,{dateRange:{from:day,to:day},flightId:'foreign-flight'});
  assert.equal(opened.length,1);
  f.find('Pressable','Zeitraumfilter entfernen').props.onPress();f.render();
  assert.ok(!f.nodes().some(n=>n.props.accessibilityLabel==='Zeitraumfilter entfernen'));
});


test('search clear preserves year; one-step filter reset restores all saved rows',()=>{
 const f=fixture();f.request(2025);
 f.find('TextInput','Flüge durchsuchen').props.onChangeText('absent');f.render();assert.equal(f.find('FlatList').props.data.length,0);
 f.find('Pressable','Suche löschen').props.onPress();f.render();assert.equal(f.find('FlatList').props.data.length,1);
 const reset=f.nodes().find(n=>n.type==='Action'&&visibleText(n).includes('Alle Filter zurücksetzen'));assert.ok(reset);reset.props.onPress();f.render();assert.equal(f.find('FlatList').props.data.length,f.data.view.flights.length);
 assert.ok(!f.nodes().some(n=>n.props.accessibilityLabel==='Suche löschen'));
});


test('latest dashboard request waits for a locked detail reader before consuming it',()=>{
 const f=fixture(),opened:string[]=[];let clears=0;
 f.data.clearDetail=()=>{assert.equal(f.data.detailBusy,false,'must not invalidate a busy read');clears++;};
 f.data.openDetail=(flight:any)=>{assert.equal(f.data.detailBusy,false,'reader must have released lock');opened.push(flight.flightId);};
 f.data.detailBusy=true;f.render();
 f.request(null,{flightId:f.data.view.flights[0].flightId});
 f.request(null,{flightId:f.data.view.flights[1].flightId});
 assert.deepEqual(opened,[]);assert.equal(clears,0);
 f.data.detailBusy=false;f.render();assert.deepEqual(opened,[f.data.view.flights[1].flightId]);assert.equal(clears,1);
 f.render();assert.equal(opened.length,1);
});

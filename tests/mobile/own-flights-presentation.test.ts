import * as diagnostics from '../../apps/platform-lab/src/diagnostics';
import { loadFlightPresentation } from './flight-presentation-fixture';
import * as ownFlightModel from '../../apps/platform-lab/src/mobile/own-flight-model';
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
import * as statistics from '../../apps/platform-lab/src/mobile/real-flight-statistics.ts';

interface Element {type:string;props:Record<string,any>;children:any[]}
const source=ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/mobile/OwnFlights.tsx',import.meta.url),'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:false},
}).outputText;
function fixture() {
  const f=ownFlightFixture(),data:any={view:{snapshot:f.snapshot,flights:f.flights,pendingCommand:false},phase:'ready',detail:null,detailBusy:false,clearDetail(){},reload(){},openDetail(){}};
  let index=0,active=true;let filterRequest:model.OwnFlightRequest|null=null;const hooks:any[]=[],effects:(()=>void)[]=[],restores:number[]=[];
  const react={
    createElement:(type:any,props:Element['props'],...children:any[]):Element=>{
      if(typeof type==='function')return type({...props,children});
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
    ...leaves(['ActivityIndicator','FlatList','KeyboardAvoidingView','Modal','Pressable','ScrollView','Text','TextInput','View']),Platform:{OS:'android'},Keyboard:{dismiss(){}},StyleSheet:{create:(x:unknown)=>x},useWindowDimensions:()=>({width:390,height:800,fontScale:1}),
  },'./theme':{...leaves(['Action','Card','Chip','Empty','GliderMark','IconLabel','Label','Section']),colors:{},ui:{}},'./SymbolIcon':leaves(['SymbolIcon']),
  './use-own-flights':{useOwnFlights:()=>{throw new Error('Presentation must reuse the shell reader');}},'./own-flight-reader-native':{ownFlightReadPorts:{}},'./own-flight-model':model,
  '../vereinsflieger/retrieval-policy':{planFlightRetrieval},'./data-freshness':{dataFreshness},'../vereinsflieger/capture-review':review,'./real-flight-statistics':statistics};
  Object.assign(modules,loadFlightPresentation(modules));
  const exports:any={};runInNewContext(source,{exports,require:(name:string)=>{assert.ok(name in modules,name);return modules[name];}});
  let tree:Element;const header=()=>{};
  function render(){index=0;tree=exports.OwnFlights({active,filterRequest,data,onUpdate:()=>false,onHeaderChange:header});effects.splice(0).forEach(fn=>fn());return tree;}
  function nodes(){const result:Element[]=[];const visit=(n:any)=>{if(n?.children){result.push(n);n.children.forEach(visit);if(n.type==='FlatList')visit(n.props.ListHeaderComponent);}};visit(tree);return result;}
  function find(type:string,label?:string){const node=nodes().find(n=>n.type===type&&(!label||n.props.accessibilityLabel===label));assert.ok(node,`${type} ${label}`);return node;}
  const search=()=>{if(!nodes().some(n=>n.type==='TextInput'&&n.props.accessibilityLabel==='Flüge durchsuchen')){find('Pressable','Flugsuche öffnen').props.onPress();render();}return find('TextInput','Flüge durchsuchen');};
  const expand=()=>{if(!find('Pressable','Flugfilter öffnen').props.accessibilityState.expanded){find('Pressable','Flugfilter öffnen').props.onPress();render();}};
  const pick=(field:string,option:string)=>{expand();const control=nodes().find(n=>n.type==='Pressable'&&n.props.accessibilityLabel?.startsWith(`${field}:`));assert.ok(control,field);control.props.onPress();render();find('Pressable',option).props.onPress();render();};
  render();return{data,render,find,nodes,restores,search,expand,pick,request:(year:number|null, extras:Partial<model.OwnFlightRequest>={})=>{filterRequest={year,...extras};render();render();},setActive:(value:boolean)=>{active=value;render();}};
}
test('native zero-offset events while loading, hidden or inactive cannot erase the saved list return position',()=>{
  const f=fixture(),view=f.data.view;
  const scroll=(y:number)=>f.find('FlatList').props.onScroll({nativeEvent:{contentOffset:{y}}});
  const restore=()=>f.find('FlatList').props.onContentSizeChange();
  scroll(240);f.data.phase='loading';f.data.view=null;f.render();scroll(0);
  f.data.phase='ready';f.data.view=view;f.render();restore();assert.equal(f.restores.at(-1),240);
  f.expand();restore();assert.equal(f.restores.at(-1),240);
  f.setActive(false);scroll(0);f.setActive(true);restore();assert.equal(f.restores.at(-1),240);
});
test('changing the search deliberately resets position and combines with the saved source projection',()=>{
  const f=fixture();f.find('FlatList').props.onScroll({nativeEvent:{contentOffset:{y:240}}});
  f.search().props.onChangeText('D-T001');f.render();
  assert.equal(f.restores.at(-1),0);assert.deepEqual(f.find('FlatList').props.data.map((x:any)=>x.flightId),['flight-1']);
});

test('season drill-down replaces stale filters, repeats after edits and survives ordinary tab return',()=>{
  const f=fixture();
  f.search().props.onChangeText('no match');f.render();
  f.request(2025);
  assert.equal(f.search().props.value,'');
  assert.deepEqual(f.find('FlatList').props.data.map((x:any)=>x.flightId),['flight-1']);
  f.search().props.onChangeText('no match');f.render();
  f.request(2025);assert.equal(f.find('FlatList').props.data.length,1);
  f.search().props.onChangeText('no match');f.render();
  f.setActive(false);f.setActive(true);f.render();
  assert.equal(f.search().props.value,'no match');
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
 diagnostics.diagnosticJournal.clear();const f=fixture();f.search().props.onChangeText('Private secret crew D-PRIVATE');f.render();
 f.find('Pressable','Flugfilter öffnen').props.onPress();f.render();
 const report=diagnostics.diagnosticJournal.export();assert.ok(!report.includes('Private secret crew'));assert.ok(!report.includes('D-PRIVATE'));
 assert.ok(diagnostics.diagnosticJournal.journey().some(e=>e.kind==='filter'&&e.target==='search'));assert.ok(diagnostics.diagnosticJournal.journey().some(e=>e.kind==='screen'&&e.target==='flight-filter'));
});

function visibleText(node:any):string {
  if(node?.children)return node.children.map(visibleText).join(' ');
  return typeof node==='string'||typeof node==='number'?String(node):'';
}
test('overview omits unavailable facts while details retain source uncertainty',()=>{
  const f=fixture(),item=structuredClone(f.data.view.flights[0]),a=item.facts.assessment;
  for(const key of Object.keys(a.fields))a.fields[key]={state:'not-captured'};
  a.date={state:'missing',value:null,source:{state:'not-captured'}};a.clocks.start={state:'missing',value:null,source:{state:'not-captured'}};
  a.durations.flight={state:'unknown',minutes:null,evidence:[]};
  a.observation.headers=[];a.observation.row.values=[];
  const row=f.find('FlatList').props.renderItem({item});
  assert.doesNotMatch(visibleText(row),/unbekannt|unklar|nicht erfasst|—/i);
  assert.doesNotMatch(row.props.label,/unbekannt|unklar|nicht erfasst/i);
  f.data.detail={...item,factHistory:[item.facts],pending:[]};
  assert.match(visibleText(f.render()),/unbekannt|unklar|nicht erfasst|nicht angegeben/i);
});
test('ordinary flight rows expose useful saved facts while technical provenance and absent-track explanation remain in detail',()=>{
  const f=fixture(),list=f.find('FlatList'),item=f.data.view.flights[0];
  const row=list.props.renderItem({item});const text=visibleText(row);
  const card=model.ownFlightCard(item);
  assert.ok(text.includes(card.date));
  for(const fact of [card.registration,card.model,card.start,card.route,...card.crew.map(person=>person.name)])assert.ok(text.includes(fact));
  assert.ok(text.includes(card.duration));
  assert.ok(row.props.label.includes(review.reviewParsedField(item.facts.assessment.date)));
  assert.ok(!/Quellflug|Fassung|Track/.test(text));
  f.data.detail={...item,factHistory:[item.facts],pending:[]};
  f.data.detail.facts.assessment.fields.instructorTime={...f.data.detail.facts.assessment.fields.instructorTime,state:'not-captured'};
  const detailText=visibleText(f.render()).replace(/\s+/g,' ');
  assert.match(detailText,/Lehrer-Zeit\s*:/);assert.doesNotMatch(detailText,/instructorTime\s*:/);
  assert.ok(detailText.includes(item.sourceFlightRef));assert.ok(detailText.includes('Fassung 1'));
  assert.ok(detailText.includes('Kein gespeicherter Track'));assert.ok(f.nodes().some(n=>n.type==='Section'&&n.props.title==='Originale Anbieterfelder'));assert.ok(detailText.includes(item.facts.assessment.observation.row.values[0]));
});

test('original provider fields paginate across three pages and return to the filtered list',()=>{
  const f=fixture();
  f.search().props.onChangeText('D-T001');f.render();
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
  assert.ok(f.nodes().some(n=>n.props.testID==='flight-filter-bar'));
  assert.ok(!listText.includes('Originale Anbieterfelder'));
  assert.equal(f.search().props.value,'D-T001');
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
  f.search().props.onChangeText('no match');f.render();
  f.request(2025,{dateRange:{from:day,to:day},flightId:chosen.flightId});
  assert.deepEqual(f.find('FlatList').props.data.map((flight:any)=>flight.flightId),[chosen.flightId,other.flightId]);
  assert.deepEqual(opened.map(flight=>flight.flightId),[chosen.flightId]);
  f.request(2025,{dateRange:{from:day,to:day},flightId:'foreign-flight'});
  assert.equal(opened.length,1);
  f.pick('Zeitraum','Alle Jahre');assert.equal(f.find('FlatList').props.data.length,4);
});


test('search clear preserves year; one-step filter reset restores all saved rows',()=>{
 const f=fixture();f.request(2025);
 f.search().props.onChangeText('absent');f.render();assert.equal(f.find('FlatList').props.data.length,0);
 f.find('Pressable','Suche löschen').props.onPress();f.render();assert.equal(f.find('FlatList').props.data.length,1);
 f.expand();const reset=f.nodes().find(n=>n.type==='Pressable'&&n.props.accessibilityLabel==='Alle Filter zurücksetzen');assert.ok(reset);reset.props.onPress();f.render();assert.equal(f.find('FlatList').props.data.length,f.data.view.flights.length);
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
test('visible filtered totals follow exact rows, distinguish zero/unknown/empty and reset on owner change',()=>{
  const f=fixture();
  f.data.view.flights[0].facts.assessment.durations.flight={state:'known',minutes:75};
  f.data.view.flights[1].facts.assessment.durations.flight={state:'known',minutes:0};
  f.data.view.flights[2].facts.assessment.durations.flight={state:'unknown',minutes:null};
  const summary=()=>{f.render();return visibleText(f.nodes().find(n=>n.props.testID==='filtered-flight-summary')).replace(/\s+/g,' ');};
  assert.match(summary(),/1:15 h/);assert.match(summary(),/h bekannt/);
  f.request(2025);assert.match(summary(),/0:00 h/);assert.ok(!summary().includes('bekannt'));
  f.search().props.onChangeText('absent query');assert.match(summary(),/Flüge · —/);
  assert.equal(f.find('FlatList').props.data.length,0);
  f.find('Pressable','Suche löschen').props.onPress();
  assert.match(summary(),/0:00 h/);
  assert.equal(f.find('FlatList').props.data.length,1,'search clear retains the selected year and its known-zero total');
  f.expand();const reset=f.nodes().find(n=>n.type==='Pressable'&&n.props.accessibilityLabel==='Alle Filter zurücksetzen');
  assert.ok(reset);reset.props.onPress();
  assert.match(summary(),/1:15 h/);
  assert.match(summary(),/h bekannt/);
  assert.equal(f.find('FlatList').props.data.length,3);
  assert.equal(f.find('Pressable','Flugfilter öffnen').props.accessibilityState.selected,false);
  f.search().props.onChangeText('absent query');summary();
  f.data.view={...f.data.view,snapshot:{...f.data.view.snapshot,ownerId:'new-owner',storeId:'new-store'},flights:[f.data.view.flights[2]]};
  f.render();assert.match(summary(),/— h/);
  assert.equal(f.search().props.value,'');
  assert.equal(f.find('FlatList').props.data.length,1);
});

test('filter bar remains outside list scrolling; active values persist when search is collapsed',()=>{
  const f=fixture();
  assert.equal(f.find('FlatList').props.ListHeaderComponent,undefined);
  assert.ok(f.nodes().some(node=>node.props.testID==='flight-filter-bar'));
  assert.ok(!f.nodes().some(node=>node.type==='TextInput'));
  f.search().props.onChangeText('D-T001');f.render();
  f.find('Pressable','Flugsuche öffnen').props.onPress();f.render();
  assert.ok(!f.nodes().some(node=>node.type==='TextInput'));
  assert.ok(f.nodes().some(node=>node.props.accessibilityLabel==='Aktive Filter: Suche: D-T001'));
  assert.deepEqual(f.find('FlatList').props.data.map((flight:any)=>flight.flightId),['flight-1']);
  f.search();f.find('Pressable','Suche löschen').props.onPress();f.render();
  assert.equal(f.find('FlatList').props.data.length,3);
});

test('compact selectors apply immediately, retain other filters and dismiss without changes',()=>{
  const f=fixture();f.pick('Zeitraum','2025');f.pick('Kennzeichen','D-T001');
  assert.deepEqual(f.find('FlatList').props.data.map((flight:any)=>flight.flightId),['flight-1']);
  assert.equal(f.find('Pressable','Flugfilter öffnen').props.accessibilityState.selected,true);
  f.pick('Zeitraum','Alle Jahre');
  assert.deepEqual(f.find('FlatList').props.data.map((flight:any)=>flight.flightId),['flight-1']);
  const selector=f.nodes().find(n=>n.props.accessibilityLabel==='Kennzeichen: D-T001, auswählen')!;
  selector.props.onPress();f.render();assert.equal(f.find('Modal').props.transparent,true);
  f.find('Modal').props.onRequestClose();f.render();assert.ok(!f.nodes().some(n=>n.type==='Modal'));
  assert.equal(f.find('FlatList').props.data.length,1);
  selector.props.onPress();f.render();f.setActive(false);f.render();
  assert.ok(!f.nodes().some(n=>n.type==='Modal'),'hidden tabs do not retain a native modal');
});

test('information is opt-in and preserves list position and filters on return',()=>{
  const f=fixture();f.request(2025);
  f.find('FlatList').props.onScroll({nativeEvent:{contentOffset:{y:240}}});
  assert.ok(!visibleText(f.render()).includes('keine Rollen-Anrechnung'));
  f.find('Pressable','Abdeckung & Datenstand').props.onPress();f.render();
  assert.ok(visibleText(f.render()).includes('keine Rollen-Anrechnung'));
  f.find('FlatList').props.onScroll({nativeEvent:{contentOffset:{y:0}}});
  f.nodes().find(node=>node.type==='Action'&&visibleText(node)==='Zurück')!.props.onPress();f.render();
  f.find('FlatList').props.onContentSizeChange();assert.equal(f.restores.at(-1),240);
  assert.deepEqual(f.find('FlatList').props.data.map((flight:any)=>flight.flightId),['flight-1']);
});


test('category and launch controls combine, recover empty results and clear on account switch',()=>{
  const f=fixture();
  for (const [index,flight] of f.data.view.flights.entries()) {
    const observation=flight.facts.assessment.observation;
    observation.headers.push('Luftfahrzeugart','S-Art');
    observation.row.values.push(index===0?'Segelflugzeug':'Motorsegler',index===0?'W':'E');
  }
  f.render();
  const choose=(title:string)=>f.pick(title==='Segelflugzeug'?'Kategorie':'Startart',title);
  choose('Segelflugzeug');choose('Winde');
  assert.deepEqual(f.find('FlatList').props.data.map((flight:any)=>flight.flightId),['flight-0']);
  choose('Selbststart');assert.equal(f.find('FlatList').props.data.length,0);
  const empty=f.find('FlatList').props.ListEmptyComponent;
  const reset=empty.children.find((n:any)=>n?.type==='Action');assert.ok(reset);reset.props.onPress();f.render();
  assert.equal(f.find('FlatList').props.data.length,3);
  choose('Segelflugzeug');choose('Winde');
  f.data.view={...f.data.view,snapshot:{...f.data.view.snapshot,ownerId:'other'}};f.render();f.render();
  assert.equal(f.find('FlatList').props.data.length,3);
  assert.equal(f.find('Pressable','Flugfilter öffnen').props.accessibilityState.selected,false);
});

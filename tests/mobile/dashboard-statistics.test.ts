import * as dashboardModel from '../../apps/platform-lab/src/mobile/season-dashboard-model.ts';
import * as processedResults from '../../apps/platform-lab/src/mobile/processed-result.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as statistics from '../../apps/platform-lab/src/mobile/real-flight-statistics.ts';
import * as season from '../../apps/platform-lab/src/mobile/season-model.ts';
import { planFlightRetrieval } from '../../apps/platform-lab/src/vereinsflieger/retrieval-policy.ts';
import { dataFreshness } from '../../apps/platform-lab/src/mobile/data-freshness.ts';
import { ownFlightFixture } from './own-flight-fixture.ts';

interface Element {type:string;props:Record<string,any>;children:any[]}
const source=ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/mobile/Dashboard.tsx',import.meta.url),'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:false},
}).outputText;
function render(flights:any[], phase='ready', fontScale=1) {
  const leaves=(names:string[])=>Object.fromEntries(names.map(n=>[n,n]));
  const react={createElement:(type:string,props:Element['props'],...children:any[]):Element=>({type,props:props??{},children:children.flat(Infinity)})};
  let calculations=0,monthlyCalculations=0;
  let hookIndex=0; const memos:{deps:unknown[];value:unknown}[]=[];
  const useMemo=(fn:()=>unknown,deps:unknown[])=>{const i=hookIndex++;if(!memos[i]||deps.some((v,n)=>v!==memos[i]!.deps[n]))memos[i]={deps,value:fn()};return memos[i]!.value;};
  const states:any[]=[];let stateIndex=0;const useState=(initial:any)=>{const i=stateIndex++;if(!(i in states))states[i]=initial;return [states[i],(value:any)=>{states[i]=value;}];};
  const modules:Record<string,unknown>={react:{default:react,useMemo,useState},'react-native':{...leaves(['ActivityIndicator','Pressable','Text','View']),StyleSheet:{create:(x:unknown)=>x}},
    './theme':{...leaves(['Action','Card','GliderMark','IconLabel','Label','Photo','Section']),colors:{},ui:{}},'./SymbolIcon':leaves(['SymbolIcon']),
    './SeasonMonthlyCharts':leaves(['SeasonMonthlyCharts']), './season-dashboard-model':{...dashboardModel,monthlySeasonForCoverage:(...args:Parameters<typeof dashboardModel.monthlySeasonForCoverage>)=>{monthlyCalculations++;return dashboardModel.monthlySeasonForCoverage(...args);}}, './SeasonRing':leaves(['SeasonRing']),'./season-model':season,'./real-flight-statistics':{...statistics,summarizeRealFlights:(...args:Parameters<typeof statistics.summarizeRealFlights>)=>{calculations++;return statistics.summarizeRealFlights(...args);}},
    './processed-result':processedResults,'./data-freshness':{dataFreshness},'../vereinsflieger/retrieval-policy':{planFlightRetrieval}};
  const exports:any={};runInNewContext(source,{exports,Date:class extends Date {getFullYear(){return 2026;}},require:(name:string)=>{
    if(name.startsWith('../../assets/'))return name;assert.ok(name in modules,name);return modules[name];}});
  const calls:(number|undefined)[]=[];const opened:string[]=[];
  const props:any={ownFlights:{flights,snapshot:{account:{accountRef:'101'},savedRetrievals:[]}},ownFlightPhase:phase,pending:null,width:390,fontScale,
    onFlight:(id:string)=>opened.push(id),onFlights:(year?:number)=>calls.push(year)};
  const tree=exports.Dashboard(props);
  const nodes:Element[]=[];function visit(n:any){if(n?.children){nodes.push(n);n.children.forEach(visit);}}visit(tree);
  return {nodes,calls,opened,text:JSON.stringify(tree), calculations:()=>calculations, monthlyCalculations:()=>monthlyCalculations, rerender(nextFlights=flights){hookIndex=0;stateIndex=0;if(nextFlights!==props.ownFlights.flights)props.ownFlights={...props.ownFlights,flights:nextFlights};return exports.Dashboard(props);}, changeView(next:any){hookIndex=0;stateIndex=0;props.ownFlights=next;return exports.Dashboard(props);}, view:()=>props.ownFlights};
}

test('identical refresh receipt timestamps do not recalculate monthly statistics; coverage and facts changes do',()=>{
 const f=render(ownFlightFixture().flights);
 const receipt={from:'2026-01-01',to:'2026-10-21',retrievedAt:'2026-10-21T00:00:00.000Z',savedAt:'2026-10-21T00:00:00.000Z'};
 const view={...f.view(),snapshot:{...f.view().snapshot,savedRetrievals:[receipt]}};
 f.changeView(view);const initial=f.monthlyCalculations();
 const sameCoverage={...view,snapshot:{...view.snapshot,savedRetrievals:[receipt,{...receipt,retrievedAt:'2026-10-22T00:00:00.000Z',savedAt:'2026-10-22T01:00:00.000Z'}]}};
 f.changeView(sameCoverage);assert.equal(f.monthlyCalculations(),initial);
 f.changeView({...sameCoverage,medical:{updated:true}});assert.equal(f.monthlyCalculations(),initial);
 const changedCoverage={...view,snapshot:{...view.snapshot,savedRetrievals:[{...receipt,to:'2026-10-22'}]}};
 f.changeView(changedCoverage);assert.equal(f.monthlyCalculations(),initial+1);
 const flights=structuredClone(view.flights);flights[0].facts.assessment.durations.flight={state:'known',minutes:999,evidence:[]};
 f.changeView({...changedCoverage,flights});assert.equal(f.monthlyCalculations(),initial+2);
});

test('season KPIs deduplicate flights and retain aircraft/unknown-time totals',()=>{
  const flights=ownFlightFixture().flights;
  const a=structuredClone(flights[0]!);
  a.facts.assessment.date={...a.facts.assessment.date,state:'parsed',value:'2026-01-01'};
  a.facts.assessment.durations.flight={state:'known',minutes:90,evidence:[]};
  const b=structuredClone(a);b.flightId='second';b.facts.assessment.fields.registration={state:'value',raw:'D-OTHER',label:'Kennzeichen'};
  b.facts.assessment.durations.flight={state:'unknown',minutes:null,evidence:[]};
  const f=render([a,a,b]);
  assert.deepEqual(f.nodes.filter(n=>n.type==='Text'&&n.props.style?.fontSize===36).map(n=>n.children[0]),[2,'1:30']);
  assert.match(f.text,/D-OTHER/);assert.match(f.text,/Saisonzeiten unbekannt/);
  assert.ok(f.nodes.filter(n=>n.type==='Card').every(n=>!n.props.onPress));
  f.nodes.find(n=>n.type==='Section'&&n.props.action)!.props.onPress();
  assert.deepEqual(f.calls,[undefined]);
});

test('empty and unknown-only seasons show unknown time at normal and enlarged text',()=>{
  for(const scale of [1,1.6]) {
    const empty=render([],'ready',scale);
    const values=empty.nodes.filter(n=>n.type==='Text'&&n.props.style?.fontSize===36).map(n=>n.children[0]);
    assert.deepEqual(values,[0,'—']);
    assert.ok(!empty.text.includes('Saisonzeiten unbekannt'));
    const flights=structuredClone(ownFlightFixture().flights);
    flights.forEach(f=>{f.facts.assessment.date={...f.facts.assessment.date,state:'parsed',value:'2026-01-01'};f.facts.assessment.durations.flight={state:'unknown',minutes:null,evidence:[]};});
    assert.match(render(flights,'ready',scale).text,/Saisonzeiten unbekannt/);
  }
});

test('cloned identical flight values reuse processed results and a same-count correction recomputes',()=>{
  const flights=ownFlightFixture().flights;const f=render(flights);const before=f.calculations();
  f.rerender(structuredClone(flights));assert.equal(f.calculations(),before);
  const changed=structuredClone(flights);changed[0]!.facts.assessment.durations.flight={state:'known',minutes:999,evidence:[]};
  f.rerender(changed);assert.equal(f.calculations(),before+1);
  f.rerender(structuredClone(changed));assert.equal(f.calculations(),before+1);
});

test('retrieval or Medical changes and temporary unavailability do not reprocess unchanged flight statistics',()=>{
  const flights=ownFlightFixture().flights;const f=render(flights);const count=f.calculations();
  const next={...f.view(),flights:structuredClone(flights),snapshot:{...f.view().snapshot,savedRetrievals:[{from:'2026-01-01',to:'2026-10-21',retrievedAt:'2026-10-21T00:00:00.000Z',savedAt:'2026-10-21T00:00:00.000Z'}]},medical:{text:'updated'}};
  f.changeView(next);assert.equal(f.calculations(),count);
  f.changeView(null);assert.equal(f.calculations(),count);
  f.changeView(structuredClone(next));assert.equal(f.calculations(),count);
  f.changeView({...next,snapshot:{...next.snapshot,ownerId:'other'}});assert.equal(f.calculations(),count+1);
});

test('first-use/loading/failure dashboard avoids empty promotions; returning dashboard leads with saved season and flights',()=>{
  for(const phase of ['failed','missing']) assert.equal(render([],phase).nodes.length,0);
  const f=render(ownFlightFixture().flights);
  assert.deepEqual(f.nodes.filter(n=>n.type==='Section').map(n=>n.props.title),['Meine Saison','Letzte Flüge']);
  const season=f.nodes.findIndex(n=>n.type==='Text'&&n.props.style?.fontSize===36);
  const paper=f.nodes.findIndex(n=>n.props.accessibilityLabel==='Informationen zum Papierflugbuch ansehen');
  assert.ok(season>=0&&paper>season);assert.ok(!f.text.includes('Kein gespeicherter Track'));
  assert.ok(!f.nodes.some(n=>n.props.accessibilityLabel?.startsWith('Gespeicherten Flug ')));
  assert.deepEqual(f.calls,[]);
});

test('cancelled first login leaves no empty dashboard while a returning empty account keeps truthful zero and unknown time',()=>{
  const f=render([]);assert.equal(f.changeView({flights:[],snapshot:{account:null,savedRetrievals:[]}}),null);
  const tree=f.changeView({flights:[],snapshot:{account:{accountRef:'101'},savedRetrievals:[]}});
  const values:any[]=[];const visit=(n:any)=>{if(n?.type==='Text'&&n.props.style?.fontSize===36)values.push(n.children[0]);n?.children?.forEach(visit);};visit(tree);
  assert.deepEqual(values,[0,'—']);
});

 test('Start shows preparation feedback without publishing unverified cached totals',()=>{
  for(const flights of [[],ownFlightFixture().flights]) {
    const f=render(flights,'loading');
    assert.equal(f.nodes.filter(n=>n.type==='ActivityIndicator').length,1);
    assert.ok(f.nodes.some(n=>n.props.accessibilityState?.busy));
    assert.match(f.text,/Gespeicherte Flugdaten werden vorbereitet/);
    assert.ok(!f.nodes.some(n=>n.type==='SeasonRing'||n.type==='SeasonMonthlyCharts'));
  }
});

test('recent-flight boxes show date, aircraft, crew and reported duration with explicit navigation',()=>{
 const flights=structuredClone(ownFlightFixture().flights);
 flights[0]!.facts.assessment.durations.flight={state:'known',minutes:95,evidence:[]};
 flights.forEach(f=>{f.facts.assessment.fields.companion={state:'blank',raw:'',label:'Begleitung'};});
 const f=render(flights);
 assert.match(f.text,/Letzte Flüge/);assert.match(f.text,/1:35 h/);
 assert.match(f.text,/Pilot: /);assert.ok(!f.text.includes('Begleitung: '));
 assert.equal(f.nodes.filter(n=>n.props.onPress&&n.type!=='Pressable'&&n.type!=='Section').length,0);
 assert.ok(!f.nodes.some(n=>n.props.accessibilityLabel?.startsWith('Gespeicherten Flug ')));
});

test('recent summary includes a known companion without inventing an identity',()=>{
 const flights=structuredClone(ownFlightFixture().flights);
 flights.forEach(f=>{f.facts.assessment.fields.companion={state:'value',raw:'Alex Example',label:'Begleitung'};});
 assert.match(render(flights).text,/Begleitung: /);
 flights.forEach(f=>{f.facts.assessment.fields.companion={state:'value',raw:'   ',label:'Begleitung'};});
 assert.ok(!render(flights).text.includes('Begleitung: '));
});


test('recent flight opens its exact saved identity and secondary statistics expand without a provider operation',()=>{
 const f=render(ownFlightFixture().flights);
 const expected=dashboardModel.latestSavedFlights(ownFlightFixture().flights);
 const rows=f.nodes.filter(n=>n.type==='Pressable'&&n.props.accessibilityLabel?.startsWith('Flug '));
 assert.equal(rows.length,expected.length);rows[0]!.props.onPress();assert.deepEqual(f.opened,[expected[0]!.flightId]);assert.deepEqual(f.calls,[]);
 assert.ok(!f.nodes.some(n=>n.type==='SeasonMonthlyCharts'));
 const expand=f.nodes.find(n=>n.props.accessibilityLabel==='Saison im Detail')!;assert.equal(expand.props.accessibilityState.expanded,false);
 expand.props.onPress();const expanded=JSON.stringify(f.rerender());assert.match(expanded,/SeasonMonthlyCharts/);assert.match(expanded,/Abdeckung kann unvollständig sein/);
});

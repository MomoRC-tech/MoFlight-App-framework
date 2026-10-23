import * as dashboardModel from '../../apps/platform-lab/src/mobile/season-dashboard-model.ts';
import * as processedResults from '../../apps/platform-lab/src/mobile/processed-result.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as statistics from '../../apps/platform-lab/src/mobile/real-flight-statistics.ts';
import * as season from '../../apps/platform-lab/src/mobile/season-model.ts';
import * as cockpit from '../../apps/platform-lab/src/mobile/cockpit-season.ts';
import * as workHours from '../../apps/platform-lab/src/mobile/season-work-hours.ts';
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
  const modules:Record<string,unknown>={react:{default:react,useMemo,useState},'react-native':{...leaves(['ActivityIndicator','ImageBackground','Pressable','ScrollView','Text','View']),StyleSheet:{create:(x:unknown)=>x}},
    './season-work-hours':workHours, './cockpit-season':cockpit,'./DutyTarget':{useDutyTarget:()=>({hours:25}),DutyTargetEditor:'DutyTargetEditor'},
    './theme':{...leaves(['Action','Card','GliderMark','IconLabel','Label','Photo','Section']),colors:{},ui:{}},'./SymbolIcon':leaves(['SymbolIcon']),
    './FlightScene':leaves(['FlightScene']),'./SeasonMonthlyCharts':leaves(['SeasonMonthlyCharts']), './season-dashboard-model':{...dashboardModel,monthlySeasonForCoverage:(...args:Parameters<typeof dashboardModel.monthlySeasonForCoverage>)=>{monthlyCalculations++;return dashboardModel.monthlySeasonForCoverage(...args);}}, './SeasonRing':leaves(['SeasonRing']),'./season-model':season,'./real-flight-statistics':{...statistics,summarizeRealFlights:(...args:Parameters<typeof statistics.summarizeRealFlights>)=>{calculations++;return statistics.summarizeRealFlights(...args);}},
    './processed-result':processedResults,'./data-freshness':{dataFreshness},'../vereinsflieger/retrieval-policy':{planFlightRetrieval}};
  const exports:any={};runInNewContext(source,{exports,Date:class extends Date {getFullYear(){return 2026;}},require:(name:string)=>{
    if(name.startsWith('../../assets/'))return name;assert.ok(name in modules,name);return modules[name];}});
  const calls:(number|undefined)[]=[];const opened:string[]=[];const statisticsCalls:number[]=[];
  const props:any={ownFlights:{flights,snapshot:{account:{accountRef:'101'},savedRetrievals:[]}},ownFlightPhase:phase,pending:null,width:390,fontScale,now:Date.parse('2026-10-22T12:00:00Z'),
    onFlight:(id:string)=>opened.push(id),onFlights:(year?:number)=>calls.push(year),onStatistics:()=>statisticsCalls.push(statisticsCalls.length+1)};
  const tree=exports.Dashboard(props);
  const nodes:Element[]=[];function visit(n:any){if(n?.type?.name==='StatisticsEntry'){visit(n.type(n.props));return;}if(n?.children){nodes.push(n);n.children.forEach(visit);}}visit(tree);
  return {nodes,calls,opened,statisticsCalls,text:JSON.stringify(tree), calculations:()=>calculations, monthlyCalculations:()=>monthlyCalculations, rerender(nextFlights=flights){hookIndex=0;stateIndex=0;if(nextFlights!==props.ownFlights.flights)props.ownFlights={...props.ownFlights,flights:nextFlights};return exports.Dashboard(props);}, changeView(next:any){hookIndex=0;stateIndex=0;props.ownFlights=next;return exports.Dashboard(props);}, view:()=>props.ownFlights};
}

test('Start routes saved analytics to the overlay and keeps it available before and after flights load',()=>{
 const f=render(ownFlightFixture().flights);
 assert.equal(f.monthlyCalculations(),0,'Date-window calculations belong to the Statistics overlay');
 const entry=f.nodes.find(n=>n.type==='Pressable'&&n.props.accessibilityLabel==='Statistik')!;
 assert.ok(entry);entry.props.onPress();assert.deepEqual(f.statisticsCalls,[1]);
 for(const phase of ['loading','missing','failed']) {
   const state=render([],phase);
   assert.ok(state.nodes.some(n=>n.type==='Pressable'&&n.props.accessibilityLabel==='Statistik'),`${phase} state keeps the statistics route available`);
 }
});

test('compact metrics use selected annual hours and keep financial values out of the target',()=>{
 const f=render(ownFlightFixture().flights);
 const tree=f.changeView({...f.view(),featureInformation:{workSummary:{status:'partial',items:[{period:'2026',hours:'07:25',obligation:'90,00 EUR'}]}}});
 assert.match(JSON.stringify(tree),/7:25 geleistet/);assert.match(JSON.stringify(tree),/Soll vorläufig 25/);assert.doesNotMatch(JSON.stringify(tree),/90,00/);
 const next=f.changeView({...f.view(),snapshot:{...f.view().snapshot,ownerId:'other'},featureInformation:undefined});assert.doesNotMatch(JSON.stringify(next),/7:25/);
});
test('compact season deduplicates flights and keeps missing durations explicit',()=>{
 const a=structuredClone(ownFlightFixture().flights[0]!);a.facts.assessment.date={...a.facts.assessment.date,state:'parsed',value:'2026-01-01'};a.facts.assessment.durations.flight={state:'known',minutes:90,evidence:[]};
 const b=structuredClone(a);b.flightId='second';b.facts.assessment.durations.flight={state:'unknown',minutes:null,evidence:[]};
 const f=render([a,a,b]);assert.match(f.text,/1:30/);assert.match(f.text,/Starts 2026: 2/);assert.match(f.text,/Saisonzeiten unbekannt/);
 f.nodes.find(n=>n.type==='Pressable'&&n.children.some(c=>c?.children?.includes('Alle Flüge')))!.props.onPress();assert.deepEqual(f.calls,[undefined]);
});
test('unknown cached season remains unknown and loading never publishes cached totals',()=>{
 for(const scale of [1,1.6]){
  const empty=render([],'ready',scale);assert.match(empty.text,/Starts 2026: —/);
  const loading=render(ownFlightFixture().flights,'loading',scale);assert.match(loading.text,/werden vorbereitet/);assert.ok(loading.nodes.some(n=>n.props.accessibilityState?.busy));
 }
});

test('cloned identical flight values reuse processed results and a same-count correction recomputes',()=>{
  const flights=ownFlightFixture().flights;const f=render(flights);const before=f.calculations();
  f.rerender(structuredClone(flights));assert.equal(f.calculations(),before);
  const changed=structuredClone(flights);changed[0]!.facts.assessment.durations.flight={state:'known',minutes:999,evidence:[]};
  f.rerender(changed);assert.equal(f.calculations(),before+2);
  f.rerender(structuredClone(changed));assert.equal(f.calculations(),before+2);
});

test('retrieval or Medical changes and temporary unavailability do not reprocess unchanged flight statistics',()=>{
  const flights=ownFlightFixture().flights;const f=render(flights);const count=f.calculations();
  const next={...f.view(),flights:structuredClone(flights),snapshot:{...f.view().snapshot,savedRetrievals:[{from:'2026-01-01',to:'2026-10-21',retrievedAt:'2026-10-21T00:00:00.000Z',savedAt:'2026-10-21T00:00:00.000Z'}]},medical:{text:'updated'}};
  f.changeView(next);assert.equal(f.calculations(),count);
  f.changeView(null);assert.equal(f.calculations(),count);
  f.changeView(structuredClone(next));assert.equal(f.calculations(),count);
  f.changeView({...next,snapshot:{...next.snapshot,ownerId:'other'}});assert.equal(f.calculations(),count+2);
});

test('latest flight and statistics preserve exact destinations without provider work',()=>{
 const f=render(ownFlightFixture().flights);
 const row=f.nodes.find(n=>n.type==='Pressable'&&n.props.accessibilityLabel?.startsWith('Letzten Flug'))!;
 row.props.onPress();assert.deepEqual(f.opened,[dashboardModel.latestSavedFlights(ownFlightFixture().flights)[0]!.flightId]);
 assert.match(f.text,/PIC/);assert.doesNotMatch(f.text,/Kein gespeicherter Track/);
});

test('shared starts and time ring renderer fades only the prior year while preserving hues and unknown tracks',()=>{
 const ringSource=ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/mobile/SeasonRing.tsx',import.meta.url),'utf8'),{
   compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:false},
 }).outputText;
 const react={createElement:(type:string,props:Element['props'],...children:any[]):Element=>({type,props:props??{},children:children.flat(Infinity)})};
 let fontScale=1;
 const modules:Record<string,unknown>={react:{default:react,memo:(component:unknown)=>component},'react-native':{View:'View',StyleSheet:{create:(s:unknown)=>s,absoluteFill:{position:'absolute'}},useWindowDimensions:()=>({fontScale})},'./theme':{Label:'Label',colors:{border:'#334455'}}};
 const exports:any={};runInNewContext(ringSource,{exports,require:(name:string)=>modules[name]});
 const style=(node:Element)=>Object.assign({},...[node.props.style].flat().filter(Boolean));
 const colors=['#46ccff','#f9b65b'];
 const slices=colors.map((color,index)=>({color,start:-90+index*180,sweep:180}));
 for(const scale of [1,1.6]) for(const label of ['Starts','Flugzeit']) {
   fontScale=scale;
   const layers=[2026,2025].map(year=>({year,slices,value:'2',description:`${year}: 2 ${label}`}));
   const before=JSON.stringify(layers);
   const difference=season.seasonDifference(300,60,label==='Starts'?'starts':'minutes');
   const tree=exports.SeasonRing({layers,label,difference}) as Element;
   const body=tree.children[1] as Element, ring=body.children[0] as Element;
   const [outer,inner]=ring.children as Element[];
   assert.equal(style(outer!).opacity??1,1);
   assert.ok(style(inner!).opacity>0&&style(inner!).opacity<1,'Prior year remains visible but subdued');
   assert.equal(inner!.props.needsOffscreenAlphaCompositing,true,'Overlapping strips fade together without seams');
   for(const layer of [outer!,inner!]) assert.deepEqual([...new Set(layer.children.slice(1).map((arc:Element)=>style(arc).backgroundColor))],colors);
   assert.match(tree.props.accessibilityLabel,/Außen, Wert in der Mitte 2026.*Innen 2025/);
   assert.match(tree.props.accessibilityLabel,/Differenz gespeicherter Jahreswerte.*Zeiträume können unterschiedlich oder unvollständig sein/);
   const center=ring.children[2] as Element, outside=body.children[1] as Element;
   assert.equal(center.children[0].children[0],2026);
   assert.equal(center.children[1].children[0],'2');
   assert.equal(style(center).position,'absolute');
   assert.equal(style(ring).width,88*scale,'The center grows with system text size');
   assert.equal(outside.children[0].children[0],2025);
   assert.equal(outside.children[1].children[0],'2');
   assert.equal(outside.children[2].children.join(''),'↑ '+difference.text);
   assert.equal(outside.children.some((node:Element)=>node.props.numberOfLines),false);
   assert.equal(JSON.stringify(layers),before,'Visual emphasis cannot change share data or aircraft colors');
   const unknown=exports.SeasonRing({layers:layers.map(layer=>({...layer,slices:[],value:'—',description:`${layer.year}: unbekannt`})),label,difference:season.seasonDifference(null,null,'minutes')}) as Element;
   const unknownRing=(unknown.children[1] as Element).children[0] as Element;
   assert.ok(unknownRing.children.slice(0,2).every((layer:Element)=>layer.children.length===1),'Unknown values retain unfilled tracks');
   assert.match(unknown.props.accessibilityLabel,/unbekannt/);
 }
});

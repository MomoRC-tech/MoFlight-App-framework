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
    './FlightScene':leaves(['FlightScene']),'./SeasonMonthlyCharts':leaves(['SeasonMonthlyCharts']), './season-dashboard-model':{...dashboardModel,monthlySeasonForCoverage:(...args:Parameters<typeof dashboardModel.monthlySeasonForCoverage>)=>{monthlyCalculations++;return dashboardModel.monthlySeasonForCoverage(...args);}}, './SeasonRing':leaves(['SeasonRing']),'./season-model':season,'./real-flight-statistics':{...statistics,summarizeRealFlights:(...args:Parameters<typeof statistics.summarizeRealFlights>)=>{calculations++;return statistics.summarizeRealFlights(...args);}},
    './processed-result':processedResults,'./data-freshness':{dataFreshness},'../vereinsflieger/retrieval-policy':{planFlightRetrieval}};
  const exports:any={};runInNewContext(source,{exports,Date:class extends Date {getFullYear(){return 2026;}},require:(name:string)=>{
    if(name.startsWith('../../assets/'))return name;assert.ok(name in modules,name);return modules[name];}});
  const calls:(number|undefined)[]=[];const opened:string[]=[];
  const props:any={ownFlights:{flights,snapshot:{account:{accountRef:'101'},savedRetrievals:[]}},ownFlightPhase:phase,pending:null,width:390,fontScale,now:Date.parse('2026-10-22T12:00:00Z'),
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

test('season rings deduplicate flights and retain aircraft/unknown-time totals',()=>{
  const flights=ownFlightFixture().flights;
  const a=structuredClone(flights[0]!);
  a.facts.assessment.date={...a.facts.assessment.date,state:'parsed',value:'2026-01-01'};
  a.facts.assessment.durations.flight={state:'known',minutes:90,evidence:[]};
  const b=structuredClone(a);b.flightId='second';b.facts.assessment.fields.registration={state:'value',raw:'D-OTHER',label:'Kennzeichen'};
  b.facts.assessment.durations.flight={state:'unknown',minutes:null,evidence:[]};
  const f=render([a,a,b]);
  assert.deepEqual(f.nodes.filter(n=>n.type==='SeasonRing').flatMap(n=>n.props.layers.map((layer:any)=>layer.value)),['1:30','—','2','0']);
  assert.match(f.text,/D-OTHER/);assert.match(f.text,/Saisonzeiten unbekannt/);
  assert.ok(f.nodes.filter(n=>n.type==='Card').every(n=>!n.props.onPress));
  f.nodes.find(n=>n.type==='Pressable'&&n.children.some(c=>c?.children?.includes('Alle Flüge ansehen')))!.props.onPress();
  assert.deepEqual(f.calls,[undefined]);
});

test('empty and unknown-only seasons show unknown time at normal and enlarged text',()=>{
  for(const scale of [1,1.6]) {
    const empty=render([],'ready',scale);
    const values=empty.nodes.filter(n=>n.type==='SeasonRing').flatMap(n=>n.props.layers.map((layer:any)=>layer.value));
    assert.deepEqual(values,['—','—','0','0']);
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

test('first-use/loading/failure dashboard avoids empty promotions; returning dashboard leads with saved season and flights',()=>{
  for(const phase of ['failed','missing']) {const empty=render([],phase);assert.match(empty.text,/Meine Saison/);assert.match(empty.text,/Verbindung oben/);assert.ok(!empty.nodes.some(n=>n.type==='SeasonRing'));}
  const f=render(ownFlightFixture().flights);
  assert.deepEqual(f.nodes.filter(n=>n.type==='Section').map(n=>n.props.title),['Meine Saison']);
  const season=f.nodes.findIndex(n=>n.type==='SeasonRing');
  const paper=f.nodes.findIndex(n=>n.props.accessibilityLabel==='Informationen zum Papierflugbuch ansehen');
  assert.ok(season>=0&&paper>season);assert.ok(!f.text.includes('Kein gespeicherter Track'));
  assert.ok(!f.nodes.some(n=>n.props.accessibilityLabel?.startsWith('Gespeicherten Flug ')));
  assert.deepEqual(f.calls,[]);
});

test('cancelled first login leaves no empty dashboard while a returning empty account keeps truthful zero and unknown time',()=>{
  const f=render([]);assert.match(JSON.stringify(f.changeView({flights:[],snapshot:{account:null,savedRetrievals:[]}})),/sobald eigene Flüge gespeichert/);
  const tree=f.changeView({flights:[],snapshot:{account:{accountRef:'101'},savedRetrievals:[]}});
  const values:any[]=[];const visit=(n:any)=>{if(n?.type==='SeasonRing')values.push(...n.props.layers.map((layer:any)=>layer.value));n?.children?.forEach(visit);};visit(tree);
  assert.deepEqual(values,['—','—','0','0']);
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
 assert.match(f.text,/Letzter Flug/);assert.match(f.text,/1:35 h/);
 assert.match(f.text,/PIC: /);assert.ok(!f.text.includes('Begleitung: '));
 assert.equal(f.nodes.filter(n=>n.props.onPress&&n.type!=='Pressable'&&n.type!=='Section').length,0);
 assert.ok(!f.nodes.some(n=>n.props.accessibilityLabel?.startsWith('Gespeicherten Flug ')));
});

test('latest summary prioritizes recorded PIC without displaying companion as PIC',()=>{
 const flights=structuredClone(ownFlightFixture().flights);
 flights.forEach(f=>{f.facts.assessment.fields.pic={state:'blank',raw:'',label:'PIC'};f.facts.assessment.fields.companion={state:'value',raw:'Alex Example',label:'Begleitung'};});
 const f=render(flights);assert.match(f.text,/PIC: /);assert.match(f.text,/unbekannt/);assert.ok(!f.text.includes('Alex E.'));
 assert.equal(f.nodes.filter(n=>n.type==='Pressable'&&n.props.accessibilityLabel?.startsWith('Flug ')).length,1);
});

test('recent flight opens its exact saved identity and secondary statistics expand without a provider operation',()=>{
 const f=render(ownFlightFixture().flights);
 const expected=dashboardModel.latestSavedFlights(ownFlightFixture().flights);
 const rows=f.nodes.filter(n=>n.type==='Pressable'&&n.props.accessibilityLabel?.startsWith('Flug '));
 assert.equal(rows.length,1);rows[0]!.props.onPress();assert.deepEqual(f.opened,[expected[0]!.flightId]);assert.deepEqual(f.calls,[]);
 assert.ok(!f.nodes.some(n=>n.type==='SeasonMonthlyCharts'));
 const expand=f.nodes.find(n=>n.props.accessibilityLabel==='Saison im Detail')!;assert.equal(expand.props.accessibilityState.expanded,false);
 expand.props.onPress();const expanded=JSON.stringify(f.rerender());assert.match(expanded,/SeasonMonthlyCharts/);
});

test('ordinary retained Start rerenders preserve summary and monthly computations',()=>{
 const f=render(ownFlightFixture().flights),counts=[f.calculations(),f.monthlyCalculations()];
 for(let i=0;i<5;i++) f.rerender();
 assert.deepEqual([f.calculations(),f.monthlyCalculations()],counts);
});


test('each concentric comparison keeps current outside and prior inside without mixing measures or aircraft',()=>{
 const first=structuredClone(ownFlightFixture().flights[0]!);
 first.facts.assessment.date={...first.facts.assessment.date,state:'parsed',value:'2026-04-03'};
 first.facts.assessment.durations.flight={state:'known',minutes:95,evidence:[]};
 const prior=structuredClone(first);prior.flightId='prior';prior.facts.assessment.date.value='2025-04-03';prior.facts.assessment.durations.flight={state:'known',minutes:30,evidence:[]};
 const rings=render([first,prior]).nodes.filter(n=>n.type==='SeasonRing');
 assert.equal(rings.length,2);
 assert.deepEqual(rings.map(n=>Array.from(n.props.layers,(l:any)=>[l.year,l.value])),[[[2026,'1:35'],[2025,'0:30']],[[2026,'1'],[2025,'1']]]);
 assert.equal(rings[0]!.props.layers[0].slices[0].color,rings[0]!.props.layers[1].slices[0].color);
 assert.match(rings[0]!.props.layers[0].description,/2026.*1:35/);
 assert.deepEqual(rings.map(ring=>ring.props.difference),[season.seasonDifference(95,30,'minutes'),season.seasonDifference(1,1,'starts')]);
 const unknown=structuredClone(first);unknown.flightId='unknown';unknown.facts.assessment.durations.flight={state:'unknown',minutes:null,evidence:[]};
 const partial=render([first,unknown,prior]);
 assert.equal(partial.nodes.find(n=>n.type==='SeasonRing')!.props.difference.value,null,'A partly unknown year cannot produce a flight-time delta');
 assert.match(partial.text,/Zeiträume können unterschiedlich oder unvollständig sein/);
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

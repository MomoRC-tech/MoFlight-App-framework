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
  const modules:Record<string,unknown>={react:{default:react},'react-native':{...leaves(['Pressable','Text','View']),StyleSheet:{create:(x:unknown)=>x}},
    './theme':{...leaves(['Card','GliderMark','IconLabel','Label','Photo','Section']),colors:{},ui:{}},'./SymbolIcon':leaves(['SymbolIcon']),
    './SeasonRing':leaves(['SeasonRing']),'./season-model':season,'./real-flight-statistics':statistics,
    './data-freshness':{dataFreshness},'../vereinsflieger/retrieval-policy':{planFlightRetrieval}};
  const exports:any={};runInNewContext(source,{exports,Date:class extends Date {getFullYear(){return 2026;}},require:(name:string)=>{
    if(name.startsWith('../../assets/'))return name;assert.ok(name in modules,name);return modules[name];}});
  const calls:(number|undefined)[]=[];
  const tree=exports.Dashboard({ownFlights:{flights,snapshot:{savedRetrievals:[]}},ownFlightPhase:phase,pending:null,width:390,fontScale,
    onFlights:(year?:number)=>calls.push(year)});
  const nodes:Element[]=[];function visit(n:any){if(n?.children){nodes.push(n);n.children.forEach(visit);}}visit(tree);
  return {nodes,calls,text:JSON.stringify(tree)};
}

test('real season rings use deduplicated aircraft shares and the card supplies its year',()=>{
  const flights=ownFlightFixture().flights;
  const a={...flights[0]!,facts:structuredClone(flights[0]!.facts)};
  a.facts.assessment.date={...a.facts.assessment.date,state:'parsed',value:'2026-01-01'};
  a.facts.assessment.durations.flight={state:'known',minutes:90,evidence:[]};
  const b=structuredClone(a);b.flightId='second';b.facts.assessment.fields.registration={state:'value',raw:'D-OTHER',label:'Kennzeichen'};
  b.facts.assessment.durations.flight={state:'unknown',minutes:null,evidence:[]};
  const f=render([a,a,b,...flights.slice(1)]),rings=f.nodes.filter(n=>n.type==='SeasonRing');
  assert.equal(rings.length,2);assert.equal(rings[0]!.props.value,'2');assert.equal(rings[1]!.props.value,'1:30');
  assert.equal(rings[0]!.props.slices.length,2);assert.equal(rings[1]!.props.slices.length,1);
  assert.equal(rings[0]!.props.slices.reduce((sum:number,s:any)=>sum+s.sweep,0),360);
  f.nodes.find(n=>n.type==='Card'&&n.props.label?.startsWith('Eigene gespeicherte Flüge.'))!.props.onPress();
  assert.deepEqual(f.calls,[2026]);
});

test('empty/unknown-only rings invent no time; unavailable states and enlarged text keep honest alternatives',()=>{
  const empty=render([]),rings=empty.nodes.filter(n=>n.type==='SeasonRing');
  assert.equal(rings[0]!.props.value,'0');assert.equal(rings[1]!.props.value,'—');
  assert.deepEqual(rings[1]!.props.slices,[]);
  for(const phase of ['loading','failed','missing'])assert.equal(render([],phase).nodes.filter(n=>n.type==='SeasonRing').length,0);
  assert.equal(render([],'ready',1.4).nodes.filter(n=>n.type==='SeasonRing').length,0);
});

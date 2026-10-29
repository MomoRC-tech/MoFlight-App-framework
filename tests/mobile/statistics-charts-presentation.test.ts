import test from 'node:test';
import assert from 'node:assert/strict';
import { statisticsPresentation } from './statistics-presentation-fixture';
import { ownFlightFixture } from './own-flight-fixture';
import { chartOrder, chartNames } from '../../apps/platform-lab/src/mobile/statistics-charts-model';
function fixture(chart='monthly'){
  const flights=structuredClone(ownFlightFixture().flights.slice(0,2));
  flights.forEach((f,i)=>{f.facts.assessment.date={...f.facts.assessment.date,state:'parsed',value:`202${6-i}-03-01`};f.facts.assessment.durations.flight={state:'known',minutes:60*(i+1),evidence:[]};});
  const opened:any[]=[],changed:string[]=[];let back=()=>false;
  const f=statisticsPresentation('StatisticsCharts',{flights,saved:[],today:'2026-10-29',period:{kind:'year',year:2026},initialChart:chart,onFlights:(...args:any[])=>opened.push(args),onChartChange:(kind:string)=>changed.push(kind),onBackHandler:(h:()=>boolean)=>{back=h;}});
  return{...f,opened,changed,back:()=>back()};
}
test('every chart is selectable in the same viewport and has a meaningful symbol and information',()=>{
  const f=fixture();
  for(const kind of chartOrder){f.press('Diagramm auswählen').props.onPress();f.nodes().find(n=>n.type==='Chip'&&n.props.title===chartNames[kind])!.props.onPress();assert.ok(f.nodes().some(n=>n.type==='SymbolIcon'));assert.ok(f.press(`Information zu ${chartNames[kind]}`));assert.doesNotMatch(JSON.stringify(f.render()),/NaN/);}
  assert.deepEqual(f.changed,chartOrder);
});
test('monthly tap shows current and prior facts and opens only current contributors',()=>{
  const f=fixture();f.nodes().find(n=>n.props.accessibilityLabel?.startsWith('Mär:'))!.props.onPress();
  assert.match(JSON.stringify(f.render()),/2026: 1 Flüge/);assert.match(JSON.stringify(f.render()),/2025: 1 Flüge/);
  f.action('Flüge ansehen · 1').props.onPress();assert.deepEqual([...f.opened[0][1]],['flight-0']);
  f.render();assert.equal(f.back(),true);assert.equal(f.nodes().some(n=>n.props.accessibilityLabel==='Auswahl schließen'),false);
});
test('previous-year accessible values keep their explicit contributor scope',()=>{
  const f=fixture();f.press('Werte und Flüge anzeigen').props.onPress();
  f.nodes().find(n=>n.type==='Action'&&n.children.some((c:any)=>typeof c==='string'&&c.startsWith('03.2025')))!.props.onPress();
  f.action('Flüge ansehen · 1').props.onPress();assert.deepEqual([...f.opened[0][1]],['flight-1']);assert.equal(f.opened[0][2].from,'2025-03-01');
});
test('timeline overlap selection exposes every matching flight without clipping longest values',()=>{
  const f=fixture('timeline');const clone=structuredClone(f.props.flights[0]);clone.flightId='other';f.props.flights=[...f.props.flights,clone];
  const point=f.press('Diagrammpunkt auswählen. Alternativ Werte und Flüge öffnen.');
  const x=5+(Date.parse('2026-03-01')-Date.parse('2026-01-01'))/(Date.parse('2026-12-31')-Date.parse('2026-01-01'))*(242-10);
  point.props.onPress({nativeEvent:{locationX:x,locationY:5+185-60/63.6*185}});
  assert.ok(f.action('Flüge ansehen · 2'));f.action('Flüge ansehen · 2').props.onPress();assert.deepEqual([...f.opened[0][1]],['flight-0','other']);
});
test('filters edit drafts, Cancel preserves results, Apply and Reset update all charts',()=>{
  const rows=ownFlightFixture().flights;let applied:any={kind:'year',year:2026},back=()=>false;
  const f=statisticsPresentation('StatisticsExplorer',{flights:rows,saved:[],today:'2026-10-29',period:applied,initialChart:'timeline',onPeriod:(p:any)=>{applied=p;f.props.period=p;},onFlights:()=>{},onBackHandler:(h:()=>boolean)=>{back=h;}});
  const chip=(title:string)=>f.nodes().find(n=>n.type==='Chip'&&n.props.title===title)!;
  f.press('Statistikfilter öffnen').props.onPress();chip('Alle Jahre').props.onPress();f.action('Abbrechen').props.onPress();assert.equal(applied.kind,'year');
  f.press('Statistikfilter öffnen').props.onPress();chip('Alle Jahre').props.onPress();f.action('Filter anwenden').props.onPress();assert.equal(applied.kind,'all');
  assert.equal(f.nodes().find(n=>n.type==='StatisticsCharts')!.props.initialChart,'timeline');
  f.press('Statistikfilter öffnen').props.onPress();chip('Eigener Zeitraum').props.onPress();f.nodes().find(n=>n.type==='TextInput'&&n.props.accessibilityLabel==='Zeitraum von')!.props.onChangeText('bad');assert.equal(f.action('Filter anwenden').props.disabled,true);f.render();assert.equal(back(),true);assert.equal(applied.kind,'all');
  f.press('Statistikfilter öffnen').props.onPress();f.action('Auswahl zurücksetzen').props.onPress();f.action('Filter anwenden').props.onPress();assert.equal(applied.kind,'year');assert.equal(applied.year,2026);
});
test('role analysis preserves the exact supervised-solo subset',()=>{
  const f=fixture('roles'),row=f.props.flights[0];
  const field=(key:string,raw:string)=>{row.facts.assessment.fields[key]={state:raw?'value':'blank',raw,label:key};};
  field('pilot','Example Pilot');field('pic','Example Pilot');field('companion','');field('companion2','');field('companion3','');field('sic','');field('dualTime','');field('flightPermission','Example Instructor');
  f.action('Davon Solo mit Fluggenehmigung · 1').props.onPress();assert.deepEqual([...f.opened[0][1]],['flight-0']);
});
test('summary and annual Info preserve current and same-date previous contributor routes',()=>{
  const rows=structuredClone(ownFlightFixture().flights.slice(0,2));rows[0]!.facts.assessment.date={...rows[0]!.facts.assessment.date,state:'parsed',value:'2026-03-01'};rows[1]!.facts.assessment.date={...rows[1]!.facts.assessment.date,state:'parsed',value:'2025-03-01'};
  const opened:any[]=[];
  const f=statisticsPresentation('StatisticsExplorer',{flights:rows,saved:[],today:'2026-10-29',period:{kind:'year',year:2026},initialChart:'monthly',onPeriod:()=>{},onFlights:(...args:any[])=>opened.push(args),onBackHandler:()=>{}});
  f.press('Alle gefilterten Flüge ansehen').props.onPress();assert.deepEqual([...opened[0][1]],['flight-0']);
  f.press('Statistikdatenstand').props.onPress();f.action('Vorjahresflüge ansehen').props.onPress();assert.deepEqual([...opened[1][1]],['flight-1']);assert.equal(opened[1][2].to,'2025-10-29');
});

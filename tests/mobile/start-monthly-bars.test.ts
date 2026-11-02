import test from 'node:test';
import assert from 'node:assert/strict';
import { statisticsPresentation } from './statistics-presentation-fixture';
import { ownFlightFixture } from './own-flight-fixture';

function fixture() {
  const flights=structuredClone(ownFlightFixture().flights.slice(0,2));
  flights.forEach((flight,index)=>{
    flight.facts.assessment.date={...flight.facts.assessment.date,state:'parsed',value:`202${6-index}-03-01`};
    flight.facts.assessment.durations.flight={state:'known',minutes:60*(index+1),evidence:[]};
  });
  let opened=0;
  const f=statisticsPresentation('StartSeasonCharts',{scope:'synthetic',flights,saved:[],year:2026,today:'2026-10-29',persistent:false,onStatistics:()=>opened++});
  return {...f,plot:()=>f.nodes().find(node=>node.type==='MonthlyBars')!,opened:()=>opened};
}
test('compact Start compares monthly known time and counts and opens detailed statistics',()=>{
  const f=fixture();
  assert.equal(f.plot().props.values.length,12);assert.equal(f.plot().props.values[2],60);assert.equal(f.plot().props.prior[2],120);
  assert.equal(f.plot().props.values[0],null,'uncovered empty month stays unknown');
  assert.equal(f.plot().props.future[11],true,'future month remains empty');
  f.press('Fluganzahl im Diagramm').props.onPress();
  assert.equal(f.plot().props.values[2],1);assert.equal(f.plot().props.prior[2],1);
  f.plot().props.onOpen();assert.equal(f.opened(),1);
  f.press('Saisondiagramme').props.onPress();assert.equal(f.nodes().some(node=>node.type==='MonthlyBars'),false);
  f.press('Saisondiagramme').props.onPress();assert.equal(f.plot().props.values[2],1,'collapse keeps the selected measure');
  f.props.year=2025;assert.equal(f.plot().props.values[2],1);assert.equal(f.plot().props.prior[2],null,'year change uses its own comparison');
});
test('compact Start keeps known zero, unknown duration and captured zero-flight months distinct',()=>{
  const f=fixture();
  f.props.flights[0].facts.assessment.durations.flight={state:'known',minutes:0,evidence:[]};
  assert.equal(f.plot().props.values[2],0);
  f.props.flights[0].facts.assessment.durations.flight={state:'unknown',minutes:null,evidence:[]};
  assert.equal(f.plot().props.values[2],null);
  f.press('Fluganzahl im Diagramm').props.onPress();assert.equal(f.plot().props.values[2],1,'unknown time still has one flight');
  f.props.saved=[{from:'2025-01-01',to:'2026-10-29',savedAt:'2026-10-29T10:00:00Z',retrievedAt:'2026-10-29T10:00:00Z'}];
  assert.equal(f.plot().props.values[0],0,'captured empty January is a real zero');
});

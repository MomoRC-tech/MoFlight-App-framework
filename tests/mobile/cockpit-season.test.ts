import test from 'node:test';
import assert from 'node:assert/strict';
import {cockpitSeason, parseDutyTarget} from '../../apps/platform-lab/src/mobile/cockpit-season.ts';
import {ownFlightFixture} from './own-flight-fixture.ts';
const saved=(from:string,to:string)=>({from,to,retrievedAt:'2026-10-24T10:00:00.000Z',savedAt:'2026-10-24T10:00:00.000Z'});
test('season zero requires confirmed coverage through today; gaps and wrong years stay unknown',()=>{
  for(const coverage of [[],[saved('2026-06-01','2026-10-24')],[saved('2026-01-01','2026-10-23')],[saved('2025-01-01','2025-12-31')]]){
    const value=cockpitSeason([],coverage,2026,'2026-10-24');assert.equal(value.starts,'—');assert.equal(value.time,'—');
  }
  const zero=cockpitSeason([],[saved('2026-01-01','2026-10-24')],2026,'2026-10-24');assert.equal(zero.starts,'0');assert.equal(zero.time,'0:00');
  assert.equal(cockpitSeason([],[saved('2025-01-01','2025-10-24')],2025,'2026-10-24').time,'—');
});
test('known zero durations remain known, missing duration and previous seasons stay separate',()=>{
  const f=structuredClone(ownFlightFixture().flights[0]!);f.facts.assessment.date={...f.facts.assessment.date,state:'parsed',value:'2026-01-01'};
  f.facts.assessment.durations.flight={state:'known',minutes:0,evidence:[]};
  assert.equal(cockpitSeason([f,f],[],2026,'2026-10-24').time,'0:00');
  assert.equal(cockpitSeason([f,f],[],2026,'2026-10-24').starts,'1');
  assert.equal(cockpitSeason([f],[],2025,'2026-10-24').starts,'—');
  f.facts.assessment.durations.flight={state:'unknown',minutes:null,evidence:[]};assert.equal(cockpitSeason([f],[],2026,'2026-10-24').time,'—');
});
test('provisional target accepts explicit zero and decimal hours without interpreting money or clocks',()=>{
  for(const [input,expected] of [['0',0],['25',25],['12,50',12.5],[' 12.5 ',12.5]] as const)assert.equal(parseDutyTarget(input),expected);
  for(const input of ['','-1','1000','25 €','25:00','NaN','Infinity','1.234'])assert.equal(parseDutyTarget(input),null);
});

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

test('complete retrieval coverage cannot confirm an empty season while dates are unassigned',()=>{
  const undated=ownFlightFixture().flights[2]!;
  const coverage=[saved('2025-01-01','2026-10-24')];
  for(const year of [2025,2026]){
    const value=cockpitSeason([undated],coverage,year,'2026-10-24');
    assert.equal(value.starts,'—');assert.equal(value.time,'—');assert.equal(value.unknownDateCount,1);
    const empty=cockpitSeason([],coverage,year,'2026-10-24');
    assert.equal(empty.starts,'0');assert.equal(empty.time,'0:00');
  }
  const known=structuredClone(ownFlightFixture().flights[0]!);
  known.facts.assessment.date={...known.facts.assessment.date,state:'parsed',value:'2026-04-01'};
  known.facts.assessment.durations.flight={state:'known',minutes:0,evidence:[]};
  const partial=cockpitSeason([known,undated],coverage,2026,'2026-10-24');
  assert.equal(partial.starts,'1');assert.equal(partial.time,'0:00');assert.equal(partial.unknownDateCount,1);
});

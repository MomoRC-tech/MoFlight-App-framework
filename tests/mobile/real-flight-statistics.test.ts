import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeRealFlights } from '../../apps/platform-lab/src/mobile/real-flight-statistics.ts';
import type { RealFlightListItem } from '../../apps/platform-lab/src/vereinsflieger/real-flight-library.ts';

function row(id: string, date: {state: 'parsed'|'blank'|'invalid'|'not-captured'; value: string|null}, registration: string|null, duration: {state:'known'|'unknown'|'conflict'|'invalid'; minutes:number|null}): RealFlightListItem {
  return { flightId:id, bindingId:'binding', accountRef:'account', sourceFlightRef:id, firstCaptureId:'capture', factsRevision:1, unassigned:true,
    facts:{ mapping:'vf-history-facts-v1', authority:'unverified-source-facts', scope:{ownerId:'owner',scopeId:'store'}, candidateId:id,
      assessment:{ date, fields:{registration:registration===null||registration===''?{state:'blank',raw:''}:{state:'value',raw:registration}}, durations:{flight:duration}, observation:{} } } } as unknown as RealFlightListItem;
}

test('counts distinct current rows and groups by exact recorded year and registration', () => {
  const a = row('a',{state:'parsed',value:'2026-01-01'},' D-ABC ',{state:'known',minutes:75});
  const b = row('b',{state:'parsed',value:'2025-12-31'},'D-ABC',{state:'unknown',minutes:null});
  const result = summarizeRealFlights([a,a,b]);
  assert.equal(result.count,2); assert.equal(result.knownMinutes,75); assert.equal(result.unknownDurationCount,1);
  assert.deepEqual(result.years,[{year:'2026',flights:1},{year:'2025',flights:1}]);
  assert.deepEqual(result.aircraft,[{registration:' D-ABC ',flights:1},{registration:'D-ABC',flights:1}]);
});

test('keeps unknown dates, aircraft, invalid/conflicting duration out of reported totals', () => {
  const result = summarizeRealFlights([
    row('a',{state:'invalid',value:null},null,{state:'conflict',minutes:null}),
    row('b',{state:'blank',value:null},'',{state:'invalid',minutes:null}),
  ]);
  assert.equal(result.count,2); assert.equal(result.knownMinutes,0); assert.equal(result.unknownDurationCount,2);
  assert.equal(result.conflictingDurationCount,2); assert.equal(result.unknownDateCount,2); assert.equal(result.unknownAircraftCount,2);
  assert.deepEqual(result.years,[]); assert.deepEqual(result.aircraft,[{registration:'Kennzeichen unbekannt',flights:2}]);
});

test('season count/time and aircraft shares use the same unique recorded-year facts', () => {
  const known = row('a', {state:'parsed',value:'2026-01-01'}, 'D-A', {state:'known',minutes:90});
  const result = summarizeRealFlights([known, {...known, facts: row('a',{state:'parsed',value:'2025-01-01'},'D-B',{state:'known',minutes:500}).facts},
    row('b',{state:'parsed',value:'2026-12-31'},'D-B',{state:'known',minutes:30}),
    row('c',{state:'parsed',value:'2026-12-31'},'D-B',{state:'conflict',minutes:null}),
    row('d',{state:'parsed',value:'2025-12-31'},'D-A',{state:'known',minutes:600}),
    row('e',{state:'invalid',value:'2026-01-01'},null,{state:'known',minutes:60}),
    row('f',{state:'parsed',value:'2026-01-02'},null,{state:'known',minutes:0}),
  ], 2026);
  assert.equal(result.count,6); assert.equal(result.knownMinutes,780);
  assert.equal(result.season.count,4); assert.equal(result.season.knownMinutes,120);
  assert.equal(result.season.knownDurationCount,3); assert.equal(result.season.unknownDurationCount,1);
  assert.equal(result.season.conflictingDurationCount,1);
  assert.deepEqual(result.season.aircraft.map(({color,...share})=>share),[
    {aircraft:'D-A',count:1,knownMinutes:90,unknownDurationCount:0},
    {aircraft:'D-B',count:2,knownMinutes:30,unknownDurationCount:1},
    {aircraft:'Kennzeichen unbekannt',count:1,knownMinutes:0,unknownDurationCount:0},
  ]);
});

test('unknown-only, zero-time and empty seasons remain distinguishable', () => {
  const unknown = summarizeRealFlights([row('a',{state:'parsed',value:'2026-01-01'},null,{state:'unknown',minutes:null})],2026).season;
  assert.equal(unknown.knownDurationCount,0); assert.equal(unknown.aircraft[0]?.knownMinutes,null);
  const zero = summarizeRealFlights([row('a',{state:'parsed',value:'2026-01-01'},null,{state:'known',minutes:0})],2026).season;
  assert.equal(zero.knownDurationCount,1); assert.equal(zero.aircraft[0]?.knownMinutes,0);
  assert.equal(summarizeRealFlights([],2026).season.count,0);
  assert.equal(summarizeRealFlights([row('a',{state:'parsed',value:'2025-01-01'},null,{state:'known',minutes:60})],2026).season.count,0);
});

test('rejects unsafe reported minutes and totals before publishing library or season statistics', () => {
  const flight = (id:string, minutes:number) => row(id,{state:'parsed',value:'2026-01-01'},'D-A',{state:'known',minutes});
  for (const minutes of [Number.MAX_SAFE_INTEGER+1,NaN,Infinity,-1,1.5]) {
    assert.throws(()=>summarizeRealFlights([flight('a',minutes)],2026),/safe integer/);
  }
  assert.throws(()=>summarizeRealFlights([flight('a',Number.MAX_SAFE_INTEGER),flight('b',1)],2026),/safe integer/);
  assert.equal(summarizeRealFlights([flight('a',Number.MAX_SAFE_INTEGER),flight('a',1)],2026).season.knownMinutes,Number.MAX_SAFE_INTEGER);
});

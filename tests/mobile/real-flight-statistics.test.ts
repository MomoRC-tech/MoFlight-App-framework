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

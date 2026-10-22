import test from 'node:test';
import assert from 'node:assert/strict';
import { selectOwnFlights, allOwnFlights } from '../../apps/platform-lab/src/mobile/own-flight-model.ts';
import { summarizeRealFlights } from '../../apps/platform-lab/src/mobile/real-flight-statistics.ts';
import { ownFlightFixture } from './own-flight-fixture.ts';

test('filtered aircraft/year/date/text summary has exactly the contributing saved rows and unknowns', () => {
  const {flights} = ownFlightFixture();
  const a = flights[0]!, b = flights[1]!, c = flights[2]!;
  for (const row of flights) row.facts.assessment.fields.registration = {state:'value',raw:'D-SYN1',label:'Lfz.'};
  a!.facts.assessment.durations.flight = {state:'known',minutes:75} as typeof a.facts.assessment.durations.flight;
  b!.facts.assessment.durations.flight = {state:'known',minutes:0} as typeof b.facts.assessment.durations.flight;
  c!.facts.assessment.durations.flight = {state:'unknown',minutes:null} as typeof c.facts.assessment.durations.flight;
  const rows = [...flights,a!];
  const selected = selectOwnFlights(rows,{...allOwnFlights,registration:'D-SYN1'});
  assert.equal(selected.length,3);
  assert.equal(summarizeRealFlights(selected).knownMinutes,75);
  assert.equal(summarizeRealFlights(selected).knownDurationCount,2);
  assert.equal(summarizeRealFlights(selected).unknownDurationCount,1);
  assert.deepEqual(selectOwnFlights(rows,{...allOwnFlights,registration:'D-SYN1',year:2025}).map(f=>f.flightId),[b!.flightId]);
  assert.deepEqual(selectOwnFlights(rows,{...allOwnFlights,registration:'D-SYN1',dateRange:{from:'2025-01-01',to:'2025-01-01'},search:b!.sourceFlightRef}).map(f=>f.flightId),[b!.flightId]);
  assert.equal(summarizeRealFlights(selectOwnFlights(rows,{...allOwnFlights,search:'not recorded'})).count,0);
});

test('same-model registrations and missing/unknown durations remain separate in exact aircraft results', () => {
  const {flights} = ownFlightFixture();
  flights[0]!.facts.assessment.fields.registration = {state:'value',raw:'D-SYN1',label:'Lfz.'};
  flights[1]!.facts.assessment.fields.registration = {state:'value',raw:'D-SYN2',label:'Lfz.'};
  for (const row of flights) row.facts.assessment.fields.model = {state:'value',raw:'Same model',label:'Muster'};
  assert.deepEqual(selectOwnFlights(flights,{...allOwnFlights,registration:'D-SYN1'}).map(f=>f.flightId),['flight-0']);
  assert.deepEqual(selectOwnFlights(flights,{...allOwnFlights,registration:'D-SYN2'}).map(f=>f.flightId),['flight-1']);
  const missing = selectOwnFlights(flights,{...allOwnFlights,registration:null});
  assert.deepEqual(missing.map(f=>f.flightId),['flight-2']);
  assert.equal(summarizeRealFlights(missing).knownDurationCount,0);
  assert.equal(summarizeRealFlights(missing).unknownDurationCount,1);
});

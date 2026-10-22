import test from 'node:test';
import assert from 'node:assert/strict';
import { ownFlightFixture } from './own-flight-fixture.ts';
import { monthlySeason, latestSavedFlights, abbreviatedCrew } from '../../apps/platform-lab/src/mobile/season-dashboard-model.ts';
import { selectOwnFlights, allOwnFlights, requestedOwnFlight } from '../../apps/platform-lab/src/mobile/own-flight-model.ts';
function flight(id:string,date:string,minutes:number|null=60,start:string|null='12:00') {
  const f=structuredClone(ownFlightFixture().flights[0]!);f.flightId=id;
  f.facts.assessment.date={...f.facts.assessment.date,state:'parsed',value:date};
  f.facts.assessment.clocks.start=start===null?{state:'blank',value:null,source:{state:'blank',raw:'',label:'Start'}}:{state:'parsed',value:start,source:{state:'value',raw:start,label:'Start'}};
  f.facts.assessment.durations.flight=minutes===null?{state:'unknown',minutes:null,evidence:[]}:{state:'known',minutes,evidence:[]};return f;
}
const saved=(from:string,to:string)=>({from,to,retrievedAt:'2026-10-22T10:00:00Z',savedAt:'2026-10-22T10:00:01Z'});
test('paired months use complete prior months and equal current calendar cutoffs; future stays blank',()=>{
 const rows=[flight('old','2025-10-22',30),flight('old-after','2025-10-23',90),flight('new','2026-10-22',120),flight('new-after','2026-10-23',90),flight('sep','2025-09-30',60),flight('future','2026-11-01')];
 const [current,prior]=monthlySeason(rows,[saved('2025-01-01','2026-10-22')],'2026-10-22');
 assert.deepEqual([current![9]!.count,current![9]!.knownMinutes,prior![9]!.count,prior![9]!.knownMinutes],[1,120,1,30]);
 assert.equal(prior![8]!.count,1);assert.equal(prior![8]!.to,'2025-09-30');
 assert.equal(current![10]!.count,null);assert.equal(prior![10]!.count,null);assert.equal(current![10]!.future,true);
 assert.equal(prior![0]!.count,0);assert.equal(prior![0]!.knownMinutes,0);
});
test('coverage gaps and missing durations retain unknown, repeated saved identity is counted once',()=>{
 const row=flight('one','2026-03-01',null),other=flight('other','2026-03-02',0);
 const [current]=monthlySeason([row,row,other],[saved('2026-01-01','2026-01-31'),saved('2026-03-01','2026-03-10')],'2026-10-22');
 assert.equal(current![0]!.count,0);assert.equal(current![1]!.count,null);assert.equal(current![1]!.knownMinutes,null);
 assert.deepEqual([current![2]!.count,current![2]!.knownMinutes,current![2]!.unknownDurationCount,current![2]!.covered],[2,0,1,false]);
 assert.equal(monthlySeason([row],[],'2026-10-22')[0]![2]!.knownMinutes,null);
 const merged=monthlySeason([],[saved('2026-01-01','2026-01-15'),saved('2026-01-16','2026-01-31')],'2026-10-22');assert.equal(merged[0]![0]!.covered,true);
});
test('leap day comparison clamps prior cutoff and drilldown selects exactly the reported bucket',()=>{
 const rows=[flight('leap','2024-02-29'),flight('prior','2023-02-28'),flight('march','2023-03-01')];
 const pair=monthlySeason(rows,[],'2024-02-29');assert.equal(pair[1]![1]!.to,'2023-02-28');
 const bucket=pair[1]![1]!;
 assert.deepEqual(selectOwnFlights(rows,{...allOwnFlights,year:2023,dateRange:bucket}).map(f=>f.flightId),['prior']);
 assert.equal(requestedOwnFlight(rows,{year:2023,dateRange:bucket,flightId:'march'}),null);
 assert.equal(requestedOwnFlight(rows,{year:2023,dateRange:bucket,flightId:'prior'})?.flightId,'prior');
});
test('latest uses parsed date/clock and exposes all ambiguous day candidates without fabricated order',()=>{
 const first=flight('a','2026-10-21',60,'12:00'),later=flight('b','2026-10-21',60,'13:00');
 assert.deepEqual(latestSavedFlights([first,later,later]).map(f=>f.flightId),['b']);
 const tie=flight('c','2026-10-21',60,'13:00');assert.deepEqual(latestSavedFlights([first,later,tie]).map(f=>f.flightId),['b','c']);
 const unknown=flight('d','2026-10-21',60,null);assert.equal(latestSavedFlights([first,later,unknown]).length,3);
 assert.deepEqual(latestSavedFlights([later,flight('older','2026-10-20',60,'23:59')]).map(f=>f.flightId),['b']);
 const invalid=flight('invalid','2026-10-22');invalid.facts.assessment.date={...invalid.facts.assessment.date,state:'invalid',value:null};assert.deepEqual(latestSavedFlights([later,invalid]).map(f=>f.flightId),['b']);
});
test('crew labels abbreviate source names without filling blank or missing roles',()=>{
 assert.equal(abbreviatedCrew({state:'value',label:'PIC',raw:'Ada Marie Example'}),'Ada E.');
 assert.equal(abbreviatedCrew({state:'value',label:'PIC',raw:'Example, Ada Marie'}),'Ada E.');
 assert.equal(abbreviatedCrew({state:'value',label:'PIC',raw:'Example'}),'E.');
 const multiline = {state:'value' as const,label:'PIC',raw:'Example, Ada\r\n\r\nBob Synthetic'};
 assert.equal(abbreviatedCrew(multiline),'Ada E. · Bob S.');
 assert.equal(multiline.raw,'Example, Ada\r\n\r\nBob Synthetic');
 assert.equal(abbreviatedCrew({state:'blank',label:'PIC',raw:''}),'unbekannt');assert.equal(abbreviatedCrew({state:'not-captured'}),'unbekannt');
});

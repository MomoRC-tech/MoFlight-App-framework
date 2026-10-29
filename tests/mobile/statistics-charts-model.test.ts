import test from 'node:test';
import assert from 'node:assert/strict';
import { ownFlightFixture } from './own-flight-fixture';
import { chartDataset, emptyChartFilters, groupChartFlights, monthlyChartGroups, calendarChartDays, nearestChartPoints, quantile } from '../../apps/platform-lab/src/mobile/statistics-charts-model';
const today='2026-10-29', year={kind:'year' as const,year:2026};
function flight(id:string,date:string,minutes:number|null,category='Segelflugzeug',launch='Winde') {
  const row=structuredClone(ownFlightFixture().flights[0]!);row.flightId=id;
  row.facts.assessment.date={...row.facts.assessment.date,state:'parsed',value:date};
  row.facts.assessment.durations.flight=minutes===null?{state:'unknown',minutes:null,evidence:[]}:{state:'known',minutes,evidence:[]};
  for(const [label,raw] of [['Luftfahrzeugart',category],['S.-Art',launch]]){
    const observation=row.facts.assessment.observation, index=observation.headers.indexOf(label!);
    if(index>=0)observation.row.values[index]=raw!;else {observation.headers.push(label!);observation.row.values.push(raw!);}
  }
  return row;
}
const saved=[{from:'2025-01-01',to:'2026-10-29',retrievedAt:'2026-10-29T10:00:00Z',savedAt:'2026-10-29T10:00:00Z'}];
test('known zero, unknown durations, distinct same-day flights and exact repeats reconcile',()=>{
  const rows=[flight('a','2026-03-01',0),flight('b','2026-03-01',20),flight('c','2026-04-01',null)];
  const result=chartDataset([...rows,structuredClone(rows[1]!)],year,today);
  assert.equal(result.summary.count,3);assert.equal(result.summary.knownMinutes,20);
  assert.equal(result.summary.unknownDurationCount,1);assert.equal(result.flyingDays,2);
  assert.deepEqual(result.points.map(p=>p.id),['a','b']);
  const conflict=flight('b','2026-03-01',90);
  assert.deepEqual(chartDataset([...rows,conflict],year,today).points.map(p=>p.id),['a']);
});
test('duration summaries use actual median and interpolated quartiles',()=>{
  assert.equal(quantile([40,10,30,20],.5),25);assert.equal(quantile([40,10,30,20],.25),17.5);assert.equal(quantile([40,10,30,20],.75),32.5);
  assert.equal(quantile([],.5),null);assert.equal(quantile([0],.5),0);assert.equal(quantile([12,12],.75),12);
  const groups=groupChartFlights([10,20,30,40].map((v,i)=>flight(String(i),'2026-03-01',v)),'launch');
  assert.equal(groups[0]!.knownMinutes,100);assert.equal(groups[0]!.median,25);assert.equal(groups[0]!.q1,17.5);
});
test('combined filters and period use the same contributor set for totals and points',()=>{
  const rows=[flight('glider','2026-03-01',10),flight('powered','2026-03-01',30,'Motorflugzeug'),flight('prior','2025-03-01',50)];
  const result=chartDataset(rows,year,today,{...emptyChartFilters,category:'glider',launch:'winch'});
  assert.deepEqual(result.summary.supportingIds,['glider']);assert.equal(result.points[0]!.minutes,10);
  assert.equal(chartDataset(rows,year,today,{...emptyChartFilters,category:'powered',launch:'aerotow'}).summary.count,0);
});
test('monthly comparisons clip both October periods and retain full historical years',()=>{
  const rows=[flight('a','2026-10-29',10),flight('future','2026-10-30',20),flight('b','2025-10-29',30),flight('later','2025-10-30',40)];
  const months=monthlyChartGroups(rows,saved,2026,today,emptyChartFilters);
  assert.deepEqual(months[9]!.map(g=>g.supportingIds),[['a'],['b']]);
  assert.ok(months[10]!.every(g=>g.future));assert.ok(months[0]![0]!.covered);
  const historical=monthlyChartGroups(rows,saved,2025,today,emptyChartFilters);
  assert.deepEqual(historical[9]![0]!.supportingIds,['b','later']);assert.equal(historical[11]![0]!.future,false);
});
test('leap cutoff remains explicitly noncomparable; empty missing coverage differs from zero',()=>{
  const months=monthlyChartGroups([],[],2024,'2024-02-29',emptyChartFilters);
  assert.equal(months[1]![1]!.validComparison,false);assert.equal(months[0]![0]!.covered,false);
  assert.equal(monthlyChartGroups([],saved,2026,today,emptyChartFilters)[0]![0]!.covered,true);
});
test('calendar service dates survive timezone boundaries, leap years, gaps and future days',()=>{
  const days=calendarChartDays([flight('a','2024-02-29',30)],[] ,2024,'2024-03-01',emptyChartFilters);
  assert.equal(days.length,366);assert.equal(days.find(d=>d.date==='2024-02-29')!.count,1);
  assert.equal(days.find(d=>d.date==='2024-02-29')!.covered,false);assert.equal(days.find(d=>d.date==='2024-03-02')!.future,true);
});
test('overlapping points retain every record; category groups retain unknown classifications',()=>{
  const rows=[flight('a','2026-03-01',10),flight('b','2026-03-01',10),flight('unknown','2026-04-01',null,'unmapped')];
  const points=chartDataset(rows,year,today).points;
  assert.deepEqual(nearestChartPoints(points,'2026-03-01',10).map(p=>p.id),['a','b']);
  const groups=groupChartFlights(rows,'category');assert.equal(groups.reduce((n,g)=>n+g.count,0),3);
  assert.equal(groups.find(g=>g.key==='unknown')!.unknownDurationCount,1);
});
test('all-history charts keep malformed parsed dates outside points and day counts',()=>{
  const rows=[flight('invalid','2026-02-30',10),flight('known','2026-03-01',20)];
  const result=chartDataset(rows,{kind:'all'},today);
  assert.equal(result.summary.count,2);assert.equal(result.unknownDateCount,1);
  assert.deepEqual(result.points.map(p=>p.id),['known']);assert.equal(result.flyingDays,1);
});

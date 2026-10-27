import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planFlightRetrieval, type SavedFlightRetrieval } from '../../apps/platform-lab/src/vereinsflieger/retrieval-policy.ts';
import { dataFreshness } from '../../apps/platform-lab/src/mobile/data-freshness.ts';
const now = new Date(2026, 9, 20, 12);
const saved = (from: string, to: string): SavedFlightRetrieval => ({from,to,retrievedAt:'2026-10-20T10:00:00.000Z',savedAt:'2026-10-20T10:01:00.000Z'});

test('first use requests previous January through local today, without a flight-count dependency', () => {
  const plan = planFlightRetrieval([],now);
  assert.deepEqual(plan.request,{from:'2025-01-01',to:'2026-10-20'});
  assert.equal(plan.firstRetrieval,true); assert.equal(plan.lastSuccessfulRetrievalAt,null);
  assert.deepEqual(planFlightRetrieval([saved('2025-01-01','2026-10-19')],now).request,{from:'2026-07-20',to:'2026-10-20'});
});
test('long absence repeats its inclusive coverage end, while recent coverage uses three months', () => {
  assert.deepEqual(planFlightRetrieval([saved('2025-01-01','2026-02-10')],now).request,{from:'2026-02-10',to:'2026-10-20'});
  assert.deepEqual(planFlightRetrieval([saved('2025-01-01','2026-06-20')],now).request,{from:'2026-06-20',to:'2026-10-20'});
  assert.deepEqual(planFlightRetrieval([saved('2025-01-01','2026-10-20')],now).request,{from:'2026-07-20',to:'2026-10-20'});
});
test('month subtraction clamps leap and non-leap February and thirty-day months', () => {
  for (const [year,month,day,from] of [[2024,4,31,'2024-02-29'],[2025,4,31,'2025-02-28'],[2026,6,31,'2026-04-30']] as const) {
    const through=`${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    assert.equal(planFlightRetrieval([saved('2023-01-01',through)],new Date(year,month,day,12)).request.from,from);
  }
});
test('year rollover changes the request without dropping saved historical coverage', () => {
  const history=[saved('2020-01-01','2026-12-31')];
  const plan=planFlightRetrieval(history,new Date(2027,0,1,0,15));
  assert.deepEqual(plan.request,{from:'2026-10-01',to:'2027-01-01'});
  assert.deepEqual(plan.periods,[{from:'2020-01-01',to:'2026-12-31'}]);
  assert.equal(planFlightRetrieval([],new Date(2027,0,1)).request.from,'2026-01-01');
});
test('custom historical imports cannot hide known gaps or move an older checkpoint forward', () => {
  const history=[saved('2026-09-01','2026-10-20'),saved('2025-01-01','2026-02-10')];
  const before=structuredClone(history),plan=planFlightRetrieval(history,now);
  assert.deepEqual(plan.request,{from:'2026-02-10',to:'2026-10-20'});
  assert.deepEqual(plan.gaps,[{from:'2026-02-11',to:'2026-08-31'}]);
  assert.deepEqual(history,before);
});
test('overlapping and adjacent complete intervals merge independent of save order', () => {
  const plan=planFlightRetrieval([saved('2026-02-11','2026-10-20'),saved('2025-01-01','2026-02-10'),saved('2026-01-01','2026-03-01')],now);
  assert.deepEqual(plan.periods,[{from:'2025-01-01',to:'2026-10-20'}]);assert.deepEqual(plan.gaps,[]);
  assert.equal(plan.request.from,'2026-07-20');
});
test('future-only coverage cannot suppress initial historical retrieval; invalid dates fail', () => {
  assert.equal(planFlightRetrieval([saved('2027-01-01','2027-12-31')],now).firstRetrieval,true);
  assert.throws(()=>planFlightRetrieval([saved('2026-02-30','2026-03-01')],now));
  assert.throws(()=>planFlightRetrieval([saved('2026-10-20','2026-01-01')],now));
});
test('freshness uses source retrieval time independently of save time and only reminds after 72 hours', () => {
  const plan=planFlightRetrieval([saved('2025-01-01','2026-10-20')],now),stamp=Date.parse(plan.lastSuccessfulRetrievalAt!);
  assert.notEqual(plan.lastSavedAt,plan.lastSuccessfulRetrievalAt);
  assert.equal(dataFreshness(plan.lastSuccessfulRetrievalAt,'ready',stamp+3*86400000).reminder,false);
  assert.equal(dataFreshness(plan.lastSuccessfulRetrievalAt,'ready',stamp+3*86400000+1).reminder,true);
});

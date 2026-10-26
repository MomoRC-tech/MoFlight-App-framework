import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptHistoryFacts } from '../../apps/platform-lab/src/vereinsflieger/history-facts.ts';
import type { RealFlightListItem } from '../../apps/platform-lab/src/vereinsflieger/real-flight-library.ts';
import { classifyFlightRoleMetric } from '../../apps/platform-lab/src/mobile/flight-role-metric.ts';
import { groupStatisticsFlightRoles, selectStatisticsFlights } from '../../apps/platform-lab/src/mobile/statistics-overlay-model.ts';
import { cockpitRoleMetrics } from '../../apps/platform-lab/src/mobile/cockpit-season.ts';
import { allOwnFlights, ownFlightFilterTags, ownFlightRoleOptions, removeOwnFlightFilter, selectOwnFlights } from '../../apps/platform-lab/src/mobile/own-flight-model.ts';
import { captureFixture } from './capture-review-fixture.ts';

interface CrewEvidence { pilot?: string; pic?: string; companion?: string; dual?: string; picTime?: string; permission?: string; extra?: string; extra3?: string; sic?: string; fi?: string }
function flight(id: number, evidence: CrewEvidence = {}): RealFlightListItem {
  const capture = captureFixture(1);
  const row = capture.rows[0]!;
  row.sourceFlightId = String(2000 + id);
  for (const [label, value] of [['Pilot', evidence.pilot ?? 'Student Example'], ['PIC', evidence.pic ?? 'Instructor Example'],
    ['Begleiter/FI', evidence.companion ?? 'Instructor Example']] as const) row.values[capture.headers.indexOf(label)] = value;
  for (const [label, value] of [['Dual-Time', evidence.dual ?? '00:12'], ['PIC-Time', evidence.picTime ?? ''], ['Fluggenehmigung von', evidence.permission ?? ''],
    ['Begleiter 2', evidence.extra ?? ''], ['Begleiter 3', evidence.extra3 ?? ''], ['SIC', evidence.sic ?? '']] as const) { capture.headers.push(label); row.values.push(value); }
  if (evidence.fi !== undefined) { capture.headers.push('Fluglehrer'); row.values.push(evidence.fi); }
  const facts = adaptHistoryFacts({ ownerId: 'synthetic-owner', scopeId: 'synthetic-scope' }, capture, 0);
  return { flightId: `flight-${id}`, bindingId: 'synthetic-binding', accountRef: 'synthetic-account',
    sourceFlightRef: row.sourceFlightId, firstCaptureId: capture.captureId, factsRevision: 1, facts, unassigned: true };
}

test('role metric identifies DI from SIC, companion PIC and dual time without a probability tier', () => {
  const derived = classifyFlightRoleMetric(flight(1, { sic: 'Student Example' }).facts.assessment);
  assert.equal(derived.key, 'dualInstruction'); assert.equal('confidence' in derived, false);
  const explicit = classifyFlightRoleMetric(flight(2, { dual: '', fi: 'Example, Instructor' }).facts.assessment);
  assert.equal(explicit.key, 'unresolved');
  assert.equal(classifyFlightRoleMetric(flight(5).facts.assessment).key, 'unresolved');
  assert.equal(classifyFlightRoleMetric(flight(3, { dual: '' }).facts.assessment).key, 'unresolved');
  assert.equal(classifyFlightRoleMetric(flight(4, { dual: 'not-a-time' }).facts.assessment).key, 'unresolved');
  assert.equal(classifyFlightRoleMetric(flight(6, { sic: 'Student Example', picTime: '00:12' }).facts.assessment).key, 'unresolved');
});

test('solo permission remains separate from onboard instructor and recorded PIC', () => {
  const supervised = classifyFlightRoleMetric(flight(1, { pic: 'Student Example', companion: '', dual: '', permission: 'Instructor Example' }).facts.assessment);
  assert.equal(supervised.key, 'solo'); assert.equal(supervised.soloWithPermission, true);
  const solo = classifyFlightRoleMetric(flight(2, { pic: 'Student Example', companion: '', dual: '' }).facts.assessment);
  assert.equal(solo.key, 'solo'); assert.equal(solo.soloWithPermission, false);
  assert.equal(classifyFlightRoleMetric(flight(3, { pic: 'Student Example', companion: '', permission: 'Instructor Example' }).facts.assessment).key, 'unresolved');
  assert.equal(classifyFlightRoleMetric(flight(4, { pic: 'Other Person', companion: '', dual: '', permission: 'Instructor Example' }).facts.assessment).key, 'unresolved');
});

test('pilot PIC with companion is distinct from DI and conflicts remain unresolved', () => {
  const pic = classifyFlightRoleMetric(flight(1, { pic: 'Student Example', dual: '' }).facts.assessment);
  assert.equal(pic.key, 'picWithCompanion');
  assert.equal(classifyFlightRoleMetric(flight(2, { pic: 'Student Example' }).facts.assessment).key, 'unresolved');
  assert.equal(classifyFlightRoleMetric(flight(3, { pic: 'Student Example', dual: '', extra: 'Third Person', extra3: 'Fourth Person' }).facts.assessment).key, 'picWithCompanion');
  assert.equal(classifyFlightRoleMetric(flight(6, { extra: 'Third Person' }).facts.assessment).key, 'unresolved');
  assert.equal(classifyFlightRoleMetric(flight(7, { pic: 'Student Example', dual: '', extra: 'Instructor Example' }).facts.assessment).key, 'unresolved');
  assert.equal(classifyFlightRoleMetric(flight(8, { pic: 'Student Example', dual: '', sic: 'Instructor Example' }).facts.assessment).key, 'unresolved');
  assert.equal(classifyFlightRoleMetric(flight(4, { pic: 'Unknown Other', dual: '' }).facts.assessment).key, 'unresolved');
  assert.equal(classifyFlightRoleMetric(flight(5, { sic: 'Unknown Other' }).facts.assessment).key, 'unresolved');
});

test('selected-period role groups are exclusive, deduplicated and drill down to exact flights', () => {
  const rows = [flight(1, { sic: 'Student Example' }), flight(2, { pic: 'Student Example', companion: '', dual: '', permission: 'Instructor Example' }),
    flight(3, { pic: 'Student Example', dual: '' }), flight(4, { dual: '' })];
  const duplicate = structuredClone(rows[0]!);
  const conflict = structuredClone(rows[1]!);
  conflict.facts.assessment.fields.pic = { state: 'value', label: 'PIC', raw: 'Different PIC' };
  const selected = selectStatisticsFlights([...rows, duplicate, conflict], { kind: 'year', year: 2026 }, '2026-10-26');
  const result = groupStatisticsFlightRoles(selected.flights);
  assert.deepEqual(result.groups.map(group => group.count), [1, 0, 1, 1]);
  assert.deepEqual(result.groups[0]!.supportingIds, ['flight-1']);
  assert.deepEqual(result.groups[2]!.supportingIds, ['flight-3']);
  assert.deepEqual(result.groups[3]!.supportingIds, ['flight-4']);
  assert.equal(result.soloWithPermission.count, 0);
  assert.deepEqual(selected.conflictingIds, ['flight-2']);
  const withoutConflict = groupStatisticsFlightRoles(rows);
  assert.deepEqual(withoutConflict.groups.map(group => group.count), [1, 1, 1, 1]);
  assert.deepEqual(withoutConflict.soloWithPermission.supportingIds, ['flight-2']);
});

test('Start role hours and counts use selected saved year, distinct IDs and known duration only', () => {
  const dual=flight(1,{sic:'Student Example'}),solo=flight(2,{pic:'Student Example',companion:'',dual:''});
  const accompanied=flight(3,{pic:'Student Example',dual:'',extra:'Third Person'}),prior=flight(4,{sic:'Student Example'});
  for(const row of [dual,solo,accompanied,prior]) row.facts.assessment.date={...row.facts.assessment.date,state:'parsed',value:row===prior?'2025-08-01':'2026-08-01'};
  dual.facts.assessment.durations.flight={state:'known',minutes:12,evidence:[]};
  solo.facts.assessment.durations.flight={state:'known',minutes:6,evidence:[]};
  accompanied.facts.assessment.durations.flight={state:'unknown',minutes:null,evidence:[]};
  const groups=cockpitRoleMetrics([dual,dual,solo,accompanied,prior],2026,'2026-10-26');
  assert.deepEqual(groups.map(group=>[group.key,group.count,group.knownMinutes,group.unknownDurationCount]),[
    ['dualInstruction',1,12,0],['solo',1,6,0],['picWithCompanion',1,0,1],
  ]);
  assert.deepEqual(cockpitRoleMetrics([dual,prior],2025,'2026-10-26').map(group=>group.count),[1,0,0]);
});

test('ordinary role filter combines with year and clears without changing other filters', () => {
  const dual=flight(1,{sic:'Student Example'}),solo=flight(2,{pic:'Student Example',companion:'',dual:''});
  const accompanied=flight(3,{pic:'Student Example',dual:'',extra:'Third Person'}),review=flight(4,{dual:''});
  const rows=[dual,solo,accompanied,review];
  assert.deepEqual(ownFlightRoleOptions(rows).map(option=>option.label),['Solo','Dual','PIC+','Prüfen']);
  const filters={...allOwnFlights,year:2026,flightRole:'picWithCompanion' as const};
  assert.deepEqual(selectOwnFlights(rows,filters).map(row=>row.flightId),['flight-3']);
  assert.ok(ownFlightFilterTags(filters).some(tag=>tag.key==='flightRole'&&tag.label==='PIC+'));
  const cleared=removeOwnFlightFilter(filters,'flightRole');
  assert.equal(cleared.year,2026);assert.equal(cleared.flightRole,undefined);
  assert.equal(selectOwnFlights(rows,{...filters,flightRole:'unresolved'}).length,1);
  assert.equal(selectOwnFlights(rows,{...filters,year:2025}).length,0);
});

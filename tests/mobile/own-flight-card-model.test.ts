import test from 'node:test';
import assert from 'node:assert/strict';
import { ownFlightFixture } from './own-flight-fixture.ts';
import { allOwnFlights, ownFlightCard, ownFlightCrew, ownFlightFilterTags, removeOwnFlightFilter } from '../../apps/platform-lab/src/mobile/own-flight-model.ts';

test('dense card preserves source data, abbreviates all given names and shows all recorded companions',()=>{
  const flight=ownFlightFixture().flights[0]!;
  const fields=flight.facts.assessment.fields;
  fields.pilot={state:'value',label:'Pilot',raw:'Winter, Jonas Alexander'};
  fields.pic={...fields.pilot,label:'PIC'};
  fields.companion={state:'value',label:'Begleiter/FI',raw:'Lea Marie Berger'};
  fields.companion2={state:'value',label:'Begleiter 2',raw:'Mira Koch'};
  fields.companion3={state:'value',label:'Begleiter 3',raw:'Alex'};
  const before=structuredClone(flight),card=ownFlightCard(flight);
  assert.equal(card.date,'18.10.26');assert.equal(card.start,'23:55');assert.equal(card.duration,'0:12');
  assert.deepEqual(card.crew,[{role:'PIC',name:'Jonas Alexander W.'},{role:'Begl.',name:'Lea Marie B.'},{role:'Begl.',name:'Mira K.'},{role:'Begl.',name:'Alex'}]);
  assert.equal(card.solo,false);assert.deepEqual(flight,before);
});

test('pilot without PIC requires an explicit Solo mode and never guesses source codes',()=>{
  const flight=ownFlightFixture().flights[0]!,fields=flight.facts.assessment.fields;
  fields.pic={state:'blank',label:'PIC',raw:''};
  fields.companion={state:'blank',label:'Begleiter/FI',raw:''};
  assert.equal(ownFlightCard(flight).solo,false);
  fields.companion={state:'not-captured'};assert.equal(ownFlightCard(flight).solo,false);
  fields.flightMode={state:'value',label:'Flugmodus',raw:'Solo'};
  assert.equal(ownFlightCard(flight).solo,true);assert.equal(ownFlightCard(flight).crew.length,1);
  fields.flightMode={state:'not-captured'};
  fields.flightType={state:'value',label:'Flugart',raw:' Alleinflug '};
  assert.equal(ownFlightCard(flight).solo,true);
  fields.flightType={state:'value',label:'Flugart',raw:'S'};
  assert.equal(ownFlightCard(flight).solo,false,'unverified source codes are not guessed');
});

test('recorded companion, SIC, different PIC or missing pilot blocks the solo badge',()=>{
  const original=ownFlightFixture().flights[0]!;
  original.facts.assessment.fields.pic={state:'blank',label:'PIC',raw:''};
  original.facts.assessment.fields.companion={state:'blank',label:'Begleiter/FI',raw:''};
  original.facts.assessment.fields.flightMode={state:'value',label:'Flugmodus',raw:'Solo'};
  for(const key of ['companion','companion2','companion3','sic','pic'] as const){
    const flight=structuredClone(original);
    flight.facts.assessment.fields[key]={state:'value',label:key,raw:'Other Person'};
    assert.equal(ownFlightCard(flight).solo,false,key);
    assert.ok(ownFlightCard(flight).crew.some(person=>person.name.includes('Other P.')),key);
  }
  original.facts.assessment.fields.pilot={state:'not-captured'};
  assert.equal(ownFlightCard(original).solo,false);
});

test('card distinguishes known zero, unknown and conflicting time without calculating from clocks',()=>{
  const flight=ownFlightFixture().flights[0]!;
  flight.facts.assessment.durations.flight={state:'known',minutes:0,evidence:[]};
  assert.equal(ownFlightCard(flight).duration,'0:00');assert.equal(ownFlightCard(flight).knownDuration,true);
  flight.facts.assessment.durations.flight={state:'unknown',minutes:null,evidence:[]};
  assert.equal(ownFlightCard(flight).duration,'');assert.equal(ownFlightCard(flight).knownDuration,false);
  flight.facts.assessment.durations.flight={state:'conflict',minutes:null,evidence:[]};
  assert.equal(ownFlightCard(flight).duration,'');
});

test('one named PIC without companions is Solo and duplicated source names appear once',()=>{
  const flight=ownFlightFixture().flights[0]!,f=flight.facts.assessment.fields;
  f.pilot={state:'value',label:'Pilot',raw:'Winter, Jonas'};
  f.pic={state:'value',label:'PIC',raw:'Jonas Winter'};
  f.companion={state:'not-captured'};
  assert.equal(ownFlightCrew(flight).solo,true);
  assert.deepEqual(ownFlightCrew(flight).crew,[{role:'PIC',name:'Jonas W.'}]);
  f.pilot={state:'not-captured'};assert.equal(ownFlightCrew(flight).solo,true);
  f.sic={state:'value',label:'SIC',raw:'Jonas Winter'};
  assert.equal(ownFlightCrew(flight).solo,false);
  assert.deepEqual(ownFlightCrew(flight).crew,[{role:'PIC/SIC',name:'Jonas W.'}]);
});

test('explicit named instructors merge roles but shared initials and Begleiter/FI do not identify an instructor',()=>{
  const flight=ownFlightFixture().flights[0]!,a=flight.facts.assessment,f=a.fields;
  f.pilot={state:'value',label:'Pilot',raw:'Jonas Winter'};f.pic={...f.pilot,label:'PIC'};
  f.companion={state:'value',label:'Begleiter/FI',raw:'Jonas Weber'};
  f.companion2={...f.companion};
  assert.equal(ownFlightCrew(flight).instructor,'unknown');
  assert.deepEqual(ownFlightCrew(flight).crew.map(p=>p.name),['Jonas Winter','Jonas Weber']);
  a.observation.headers.push('Fluglehrer');a.observation.row.values.push('Weber, Jonas');
  const before=structuredClone(flight);
  assert.deepEqual(ownFlightCrew(flight).crew,[{role:'PIC',name:'Jonas Winter'},{role:'FI',name:'Jonas Weber'}]);
  assert.equal(ownFlightCrew(flight).instructor,'recorded');assert.deepEqual(flight,before);
});

test('each visible active tag removes only its own filter, including unknown registration and custom ranges',()=>{
  const filters={...allOwnFlights,year:2026,dateRange:{from:'2026-10-01',to:'2026-10-24'},registration:null,search:' Jonas '};
  const before=structuredClone(filters);
  assert.deepEqual(ownFlightFilterTags(filters).map(tag=>tag.key),['year','dateRange','registration','search']);
  assert.equal(ownFlightFilterTags(filters).at(-1)?.label,'Suche: Jonas');
  for(const {key} of ownFlightFilterTags(filters)){
    const cleared=removeOwnFlightFilter(filters,key);
    assert.ok(!ownFlightFilterTags(cleared).some(tag=>tag.key===key));
    assert.equal(ownFlightFilterTags(cleared).length,3);
  }
  assert.deepEqual(filters,before);assert.deepEqual(ownFlightFilterTags(allOwnFlights),[]);
});

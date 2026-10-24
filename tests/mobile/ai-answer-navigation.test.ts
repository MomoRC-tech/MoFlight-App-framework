import test from 'node:test';
import assert from 'node:assert/strict';
import {aiAnswerFlightIds} from '../../apps/platform-lab/src/ai/answer-navigation.ts';
import {projectAiFlights} from '../../apps/platform-lab/src/ai/projection.ts';
import {selectOwnFlights,allOwnFlights,ownFlightFilterTags,removeOwnFlightFilter} from '../../apps/platform-lab/src/mobile/own-flight-model.ts';
import {aiSourceContext,aiSourceFlight} from './fixtures/ai-source.ts';
import type {ChatMessage} from '../../apps/platform-lab/src/ai/chat-model.ts';
test('saved answer navigation resolves exact current facts and shows only those contributors',()=>{
  const flights=[aiSourceFlight('1','01.08.2026','1:00'),aiSourceFlight('2','02.08.2026','2:00'),aiSourceFlight('3','03.08.2026','3:00')];
  const p=projectAiFlights(flights,aiSourceContext),refs=p.references;
  const message:ChatMessage={id:'m1',input:'Synthetic question',context:aiSourceContext,status:'complete',createdAt:'2026-10-24T12:00:00.000Z',attempt:null,
    answer:{version:1,text:'Saved evidence',evidence:[refs[0]!,refs[1]!],actions:[],metrics:[]}};
  const ids=aiAnswerFlightIds(message,[refs[0]!.id,refs[1]!.id],aiSourceContext,refs);
  assert.deepEqual(selectOwnFlights(flights,{...allOwnFlights,flightIds:ids}).map(f=>f.flightId).sort(),ids.slice().sort());
  assert.equal(selectOwnFlights(flights,{...allOwnFlights,flightIds:[]}).length,0);
  const filters={...allOwnFlights,flightIds:ids};assert.ok(ownFlightFilterTags(filters).some(t=>t.key==='flightIds'));
  assert.equal(selectOwnFlights(flights,removeOwnFlightFilter(filters,'flightIds')).length,3);
  for(const requested of [[],['foreign'],[refs[0]!.id,refs[0]!.id]])assert.throws(()=>aiAnswerFlightIds(message,requested,aiSourceContext,refs));
  assert.throws(()=>aiAnswerFlightIds(message,[refs[0]!.id],{...aiSourceContext,accountRef:'999'},refs));
  assert.throws(()=>aiAnswerFlightIds(message,[refs[0]!.id],aiSourceContext,[{...refs[0]!,factsRevision:'changed'}]));
});
test('source observations and historical contexts never impersonate a saved-flight action',()=>{
  const message:ChatMessage={id:'m1',input:'Synthetic question',context:aiSourceContext,status:'partial',createdAt:'2026-10-24T12:00:00.000Z',attempt:null,
    answer:{version:1,text:'Source observation',evidence:[{kind:'source-row',id:'s1',captureId:'cap1',captureSha256:'a'.repeat(64),rowIndex:0,context:aiSourceContext}],actions:[],metrics:[]}};
  assert.throws(()=>aiAnswerFlightIds(message,['s1'],aiSourceContext,[]));
  assert.throws(()=>aiAnswerFlightIds(message,['s1'],{...aiSourceContext,contextVersion:2},[]));
});

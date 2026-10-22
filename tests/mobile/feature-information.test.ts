import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFeatureInformation } from '../../apps/platform-lab/src/mobile/feature-information';
import type { InformationCapture } from '../../apps/platform-lab/src/vereinsflieger/information';
import type { ProviderScope } from '../../apps/platform-lab/src/vereinsflieger/scope-store';
const scope:ProviderScope={version:1,owner:'owner',connectionId:'connection',context:{accountNumber:'101',clubLabel:'Synthetic Club',clubIdentity:'display-label-only',verification:'observed-profile-number'}};
const event:InformationCapture={version:1,id:'event',retrievedAt:'2026-10-22T12:00:00.000Z',owner:scope.owner,connectionId:scope.connectionId,sourceIdentity:'provisional-observed-profile',category:'events',path:'/member/community/appointment/',columns:[{key:'date',label:'Datum',index:2},{key:'time',label:'Zeit',index:3},{key:'kind',label:'Kategorie',index:4},{key:'info',label:'Info \u00b7 Titel/Ort',index:5}],rows:[{position:3,values:['26.10.2026','Ganzt\u00e4gig','Termine','Synthetic event\nOrt: Synthetic field']}],filters:['Quellkategorie: Termine','Ab 22.10.2026','Ansicht: 3 Monate'],empty:false,coverage:{kind:'visible-page',truncated:true,pagination:'unverified'}};
const notice:InformationCapture={...event,id:'notice',category:'document-notices',path:'/member/overview/overview',columns:[{key:'notice',label:'Hinweis \u00b7 Originaltext',index:0}],rows:[{position:0,values:['Synthetic document 22.10.2026']}],filters:[]};
test('offline feature projection retains source text, selected filters and partial coverage without manufacturing news',()=>{
 const result=buildFeatureInformation(scope,JSON.parse(JSON.stringify([event,notice])));
 assert.equal(result.events.status,'partial');assert.equal(result.events.truncated,true);assert.deepEqual(result.events.filters,event.filters);
 assert.deepEqual(result.events.items,[{key:'event:3',date:'26.10.2026',time:'Ganzt\u00e4gig',kind:'Termine',title:'Synthetic event',location:'Synthetic field'}]);
 assert.equal(result.documentNotices.items[0]!.text,'Synthetic document 22.10.2026');
 assert.equal(result.documentNotices.retrievedAt,event.retrievedAt);
});
test('missing, foreign owner/connection, malformed, unsupported empty and ambiguous captures stay unavailable',()=>{
 for(const captures of [[],[{...event,owner:'foreign'}],[{...event,connectionId:'foreign'}],[{...event,rows:[],empty:true}],[event,event],[{...event,filters:[]}]] as InformationCapture[][]){
   const result=buildFeatureInformation(scope,captures);assert.equal(result.events.status,'unavailable');assert.deepEqual(result.events.items,[]);
 }
});

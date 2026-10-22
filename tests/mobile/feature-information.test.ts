import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFeatureInformation } from '../../apps/platform-lab/src/mobile/feature-information';
import type { InformationCapture } from '../../apps/platform-lab/src/vereinsflieger/information';
import type { ProviderScope } from '../../apps/platform-lab/src/vereinsflieger/scope-store';
const scope:ProviderScope={version:1,owner:'owner',connectionId:'connection',context:{accountNumber:'101',clubLabel:'Synthetic Club',clubIdentity:'display-label-only',verification:'observed-profile-number'}};
const event:InformationCapture={version:1,id:'event',retrievedAt:'2026-10-22T12:00:00.000Z',owner:scope.owner,connectionId:scope.connectionId,sourceIdentity:'provisional-observed-profile',category:'events',path:'/member/community/appointment/',columns:[{key:'date',label:'Datum',index:2},{key:'time',label:'Zeit',index:3},{key:'kind',label:'Kategorie',index:4},{key:'info',label:'Info \u00b7 Titel/Ort',index:5}],rows:[{position:3,values:['26.10.2026','Ganzt\u00e4gig','Termine','Synthetic event\nOrt: Synthetic field']}],filters:['Quellkategorie: Termine','Ab 22.10.2026','Ansicht: 3 Monate'],empty:false,coverage:{kind:'visible-page',truncated:true,pagination:'unverified'}};
const notice:InformationCapture={...event,id:'notice',category:'document-notices',path:'/member/overview/overview',columns:[{key:'notice',label:'Hinweis \u00b7 Originaltext',index:0}],rows:[{position:0,values:['Synthetic document 22.10.2026']}],filters:[]};
const workSummary:InformationCapture={...event,id:'work',category:'work-summary',path:'/member/profile/viewprofile',columns:[{key:'period',label:'Zeitraum',index:0},{key:'obligation',label:'Pflicht',index:1},{key:'performed',label:'Geleistet',index:2},{key:'hours',label:'Geleistet Stunden',index:3}],rows:[{position:0,values:['2026','90,00 €','21,50 €','07:25']},{position:1,values:['2025','0,00 €','0,00 €','0']}],filters:[],empty:false};
const workHours:InformationCapture={...event,id:'work-hours',category:'work-hours',path:'/member/profile/workhours/list',columns:[{key:'date',label:'Datum',index:0},{key:'activity',label:'Tätigkeit',index:1},{key:'hours',label:'Stunden',index:2},{key:'category',label:'Kategorie',index:3},{key:'status',label:'Status',index:4}],rows:[{position:2,values:['22.10.2026','Synthetic maintenance','02:30','Werkstatt','Erfasst']}],filters:[],empty:false};
const ownTasks:InformationCapture={...event,id:'tasks',category:'tasks',path:'/member/community/tasklist/tasklist',columns:[{key:'title',label:'Titel',index:0},{key:'due',label:'Zu erledigen bis',index:1},{key:'days',label:'Anzahl Tage',index:2},{key:'status',label:'Status',index:3},{key:'priority',label:'Priorität',index:4}],rows:[{position:4,values:['Synthetic task','31.10.2026','9','Offen','Hoch']}],filters:['Meine nicht beendeten Aufgaben'],empty:false};

test('offline feature projection retains source text, selected filters and partial coverage without manufacturing news',()=>{
 const result=buildFeatureInformation(scope,JSON.parse(JSON.stringify([event,notice])));
 assert.equal(result.events.status,'partial');assert.equal(result.events.truncated,true);assert.deepEqual(result.events.filters,event.filters);
 assert.deepEqual(result.events.items,[{key:'event:3',date:'26.10.2026',time:'Ganzt\u00e4gig',kind:'Termine',title:'Synthetic event',location:'Synthetic field'}]);
 assert.equal(result.documentNotices.items[0]!.text,'Synthetic document 22.10.2026');
 assert.equal(result.documentNotices.retrievedAt,event.retrievedAt);
});
test('missing, foreign owner/connection, malformed, unsupported empty and ambiguous captures stay unavailable',()=>{
 for(const captures of [[],[{...event,owner:'foreign'}],[{...event,connectionId:'foreign'}],[{...event,rows:[],empty:true,filters:[]}],[event,event],[{...event,filters:[]}]] as InformationCapture[][]){
   const result=buildFeatureInformation(scope,captures);assert.equal(result.events.status,'unavailable');assert.deepEqual(result.events.items,[]);
 }
});

test('confirmed empty calendar excerpt stays partial and distinct from unavailable data',()=>{
 const empty:InformationCapture={...event,id:'empty-event',retrievedAt:'2026-10-23T12:00:00.000Z',rows:[],empty:true,coverage:{...event.coverage,truncated:false},filters:['Quellkategorie: Termine','Ab 23.10.2026','Ansicht: 1 Tag']};
 const captured=buildFeatureInformation(scope,[empty]);
 assert.equal(captured.events.status,'partial');assert.equal(captured.events.empty,true);assert.deepEqual(captured.events.items,[]);
 assert.deepEqual(captured.events.filters,empty.filters);assert.equal(captured.events.truncated,false);
 const missing=buildFeatureInformation(scope,[]);assert.equal(missing.events.status,'unavailable');assert.equal(missing.events.empty,undefined);
});

test('work summary projects bounded annual source rows faithfully and keeps EUR and hours in separate values',()=>{
 const result=buildFeatureInformation(scope,[workSummary]);
 assert.equal(result.workSummary?.status,'partial');assert.equal(result.workSummary?.truncated,true);
 assert.deepEqual(result.workSummary?.items,[
   {key:'work:0',period:'2026',obligation:'90,00 €',performed:'21,50 €',hours:'07:25'},
   {key:'work:1',period:'2025',obligation:'0,00 €',performed:'0,00 €',hours:'0'},
 ]);
 assert.deepEqual(result.workSummary?.filters,workSummary.filters);
});

test('own tasks preserve source fields and an explicitly empty source remains distinct from missing or failed',()=>{
 const populated=buildFeatureInformation(scope,[ownTasks]);
 assert.deepEqual(populated.tasks?.items,[{key:'tasks:4',title:'Synthetic task',due:'31.10.2026',days:'9',status:'Offen',priority:'Hoch'}]);
 assert.deepEqual(populated.tasks?.filters,['Meine nicht beendeten Aufgaben']);
 const empty:InformationCapture={...ownTasks,id:'empty-tasks',rows:[],empty:true};
 const capturedEmpty=buildFeatureInformation(scope,[empty]);
 assert.equal(capturedEmpty.tasks?.status,'partial');assert.equal(capturedEmpty.tasks?.empty,true);assert.deepEqual(capturedEmpty.tasks?.items,[]);
 const missing=buildFeatureInformation(scope,[]);
 const failed=buildFeatureInformation(scope,[{...ownTasks,columns:ownTasks.columns.filter(c=>c.key!=='status')}]);
 assert.equal(missing.tasks?.status,'unavailable');assert.equal(missing.tasks?.empty,undefined);
 assert.equal(failed.tasks?.status,'unavailable');assert.equal(failed.tasks?.empty,undefined);
});

test('task projection handles optional days and priority without making up values',()=>{
 const capture:InformationCapture={...ownTasks,columns:ownTasks.columns.filter(column=>!['days','priority'].includes(column.key)),rows:[{position:1,values:['Synthetic task','Unbekannt','Offen']}]};
 const result=buildFeatureInformation(scope,[capture]);
 assert.deepEqual(result.tasks?.items,[{key:'tasks:1',title:'Synthetic task',due:'Unbekannt',status:'Offen'}]);
});

test('work-hour detail preserves only the captured date, activity, hours, status and optional category',()=>{
 const result=buildFeatureInformation(scope,[workHours]);
 assert.deepEqual(result.workHours?.items,[{key:'work-hours:2',date:'22.10.2026',activity:'Synthetic maintenance',hours:'02:30',status:'Erfasst',category:'Werkstatt'}]);
 assert.equal(result.workHours?.status,'partial');assert.equal(result.workHours?.truncated,true);
 const withoutCategory:InformationCapture={...workHours,columns:workHours.columns.filter(column=>column.key!=='category'),rows:[{position:1,values:['21.10.2026','Synthetic tow','00:45','Offen']}]};
 assert.deepEqual(buildFeatureInformation(scope,[withoutCategory]).workHours?.items,[{key:'work-hours:1',date:'21.10.2026',activity:'Synthetic tow',hours:'00:45',status:'Offen'}]);
});

test('work summary and tasks reject foreign, duplicate and malformed source captures independently',()=>{
 for(const captures of [[{...workSummary,owner:'foreign'}],[{...workSummary,connectionId:'foreign'}],[workSummary,workSummary],[{...workSummary,columns:workSummary.columns.slice(0,3)}]] as InformationCapture[][]){
   const result=buildFeatureInformation(scope,captures);assert.equal(result.workSummary?.status,'unavailable');assert.deepEqual(result.workSummary?.items,[]);
 }
 const result=buildFeatureInformation(scope,[workSummary,{...ownTasks,connectionId:'foreign'}]);
 assert.equal(result.workSummary?.status,'partial');assert.equal(result.tasks?.status,'unavailable');
});

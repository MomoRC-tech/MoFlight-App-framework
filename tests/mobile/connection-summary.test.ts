import * as processedResults from '../../apps/platform-lab/src/mobile/processed-result.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { dataFreshness } from '../../apps/platform-lab/src/mobile/data-freshness.ts';
import { flightReminder, snoozeFlightReminder } from '../../apps/platform-lab/src/mobile/flight-reminder.ts';
import { planFlightRetrieval } from '../../apps/platform-lab/src/vereinsflieger/retrieval-policy.ts';
import { connectionGuidance } from '../../apps/platform-lab/src/mobile/connection-guidance.ts';

interface Element {type:string;props:Record<string,any>;children:any[]}
const source=ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/mobile/ConnectionSummary.tsx',import.meta.url),'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:false},
}).outputText;
const now=Date.parse('2026-10-22T12:00:00.000Z');
function accountView(retrievedAt='2026-10-22T11:00:00.000Z', savedAt=retrievedAt, extra:any={}) {
  return {flights:[{},{}],...extra,snapshot:{ownerId:'owner-1',storeId:'store-1',account:{accountRef:'101'},savedRetrievals:[{from:'2025-01-01',to:'2026-10-19',retrievedAt,savedAt}],...(extra.snapshot??{})}};
}
function render(ownFlights:any, options:{phase?:string;compact?:boolean;now?:number;reminderSnooze?:{scopeKey:string;until:string|null}|null;newOrChangedObservation?:boolean}={}){
  const calls:any[]=[],exports:any={};
  const react={createElement:(type:string,props:any,...children:any[]):Element=>({type,props:props??{},children:children.flat(Infinity)})};
  const modules:Record<string,any>={react:{default:react,useMemo:(fn:()=>unknown)=>fn()},'./theme':{Action:'Action',Card:'Card',Label:'Label',Section:'Section'},
    './processed-result':processedResults,'./data-freshness':{dataFreshness},'./flight-reminder':{flightReminder,snoozeFlightReminder},
    '../vereinsflieger/retrieval-policy':{planFlightRetrieval},'./connection-guidance':{connectionGuidance}};
  runInNewContext(source,{exports,require:(name:string)=>{assert.ok(name in modules,name);return modules[name];}});
  const tree:Element|null=exports.ConnectionSummary({ownFlights,phase:options.phase??'ready',compact:options.compact??false,now:options.now??now,
    reminderSnooze:options.reminderSnooze??null,newOrChangedObservation:options.newOrChangedObservation??false,
    controller:{connection:{phase:'unknown'},browserActive:false,snapshot:{retrievedAt:'2026-10-21T00:00:00.000Z'}},
    onUpdate:()=>calls.push('load'),onOpen:()=>calls.push('options'),onSnoozeReminder:(scopeKey:string,until:string)=>calls.push(['snooze',scopeKey,until])});
  const nodes:Element[]=[];function visit(v:any){if(v&&typeof v==='object'&&'children'in v){nodes.push(v);v.children.forEach(visit);}}visit(tree);
  const text=(v:any):string=>v&&typeof v==='object'&&'children'in v?v.children.map(text).join(''):typeof v==='string'||typeof v==='number'?String(v):'';
  return {tree,nodes,calls,text:text(tree),button:(label:string)=>nodes.find(n=>n.type==='Action'&&text(n)===label)!,section:(title:string)=>nodes.find(n=>n.type==='Section'&&n.props.title===title)!};
}

test('profile summary uses committed library freshness and the shared 72-hour policy',()=>{
  const retrievedAt='2026-10-19T09:00:00.000Z';
  const f=render(accountView(retrievedAt,retrievedAt));
  assert.ok(f.text.includes(dataFreshness(retrievedAt,'ready',now).label));
  assert.ok(f.text.includes('mehr als drei Tage'));
  assert.ok(!f.text.includes(dataFreshness('2026-10-21T00:00:00.000Z','ready',now).label));
  assert.deepEqual(f.calls,[]);f.button('Daten aktualisieren').props.onPress();assert.deepEqual(f.calls,['load']);
});

test('first use shows the ordinary combined login action; compact loading stays absent',()=>{
  const f=render(null,{phase:'missing',compact:true});
  assert.equal(f.nodes.filter(n=>n.type==='Action').length,1);assert.ok(!f.text.includes('Bibliothek anlegen'));
  assert.ok(f.text.includes('Bei Bedarf meldest du dich auf der Originalseite von Vereinsflieger an.'));
  assert.ok(f.text.includes('Medical-Angaben')&&f.text.includes('Offline-Nutzung'));
  f.button('Anmelden & Daten laden').props.onPress();assert.deepEqual(f.calls,['load']);
  assert.equal(render(null,{phase:'loading',compact:true}).tree,null);
});

test('an associated account with no successful retrieval still offers its first data load',()=>{
  const f=render({flights:[],snapshot:{ownerId:'owner-1',storeId:'store-1',account:{accountRef:'101'},savedRetrievals:[]}}, {phase:'ready',compact:true});
  assert.ok(f.text.includes('Für dieses zugeordnete Konto wurden noch keine Flugdaten gespeichert.'));
  assert.ok(f.button('Daten laden'));
  assert.equal(f.nodes.some(n=>n.type==='Action'&&f.text.includes('Anmelden & Daten laden')),false);
});

test('failed own-flight reads show an error without displaying stale scoped data',()=>{
  const f=render(accountView('2026-10-01T12:00:00.000Z'),{phase:'failed',compact:true});
  assert.ok(f.text.includes('Gespeicherte Flugdaten konnten nicht gelesen werden.'));
  assert.equal(f.text.includes('2 Flüge auf diesem Gerät gespeichert'),false);
  assert.equal(f.nodes.filter(n=>n.type==='Action').length,1);
});

test('compact recovery remains visible regardless of snooze and exposes options without an update shortcut',()=>{
  const retrievedAt='2026-10-18T09:00:00.000Z';
  const f=render(accountView(retrievedAt,retrievedAt,{pendingCommand:true,snapshot:{recovery:{readOnly:true}}}),{compact:true,reminderSnooze:{scopeKey:'wrong-account',until:'2026-10-23T12:00:00.000Z'}});
  assert.ok(f.text.includes('Wiederherstellung muss geprüft werden'));assert.deepEqual(f.calls,[]);
  assert.equal(f.nodes.filter(n=>n.type==='Action').length,1);
  f.button('Verbindung & Optionen').props.onPress();assert.deepEqual(f.calls,['options']);
});

test('compact reminder starts only after a successful retrieval receipt is older than 72 hours and snoozes for its account',()=>{
  const retrievedAt=new Date(now-72*60*60*1000-1).toISOString();
  const recentSaveAt=new Date(now-1000).toISOString();
  const f=render(accountView(retrievedAt,recentSaveAt),{compact:true});
  assert.ok(f.text.includes('mehr als 72 Stunden'));
  assert.ok(!f.text.includes('2 Flüge'));
  f.button('Daten aktualisieren').props.onPress();
  f.section('Flugdaten').props.onPress();
  assert.deepEqual(f.calls,[ 'load', ['snooze',JSON.stringify(['owner-1','store-1','101']),new Date(now+24*60*60*1000).toISOString()] ]);
  const snoozed=render(accountView(retrievedAt,recentSaveAt),{compact:true,reminderSnooze:{scopeKey:JSON.stringify(['owner-1','store-1','101']),until:new Date(now+24*60*60*1000).toISOString()}});
  assert.equal(snoozed.tree,null);
  const otherAccount=render(accountView(retrievedAt,recentSaveAt),{compact:true,reminderSnooze:{scopeKey:'other-account',until:new Date(now+24*60*60*1000).toISOString()}});
  assert.ok(otherAccount.text.includes('mehr als 72 Stunden'));
});

test('fresh data stays quiet unless there is a positive new or changed observation',()=>{
  const fresh=render(accountView('2026-10-22T11:00:00.000Z'),{compact:true});
  assert.equal(fresh.tree,null);
  const changed=render(accountView('2026-10-22T11:00:00.000Z'),{compact:true,newOrChangedObservation:true});
  assert.ok(changed.text.includes('Neue oder geänderte Fluginformationen wurden erkannt.'));
  const oldLocalSave=render(accountView('2026-10-22T11:00:00.000Z','2026-10-01T12:00:00.000Z'),{compact:true});
  assert.equal(oldLocalSave.tree,null);
});

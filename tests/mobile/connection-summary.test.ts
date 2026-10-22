import * as processedResults from '../../apps/platform-lab/src/mobile/processed-result.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { dataFreshness } from '../../apps/platform-lab/src/mobile/data-freshness.ts';
import { planFlightRetrieval } from '../../apps/platform-lab/src/vereinsflieger/retrieval-policy.ts';
import { connectionGuidance } from '../../apps/platform-lab/src/mobile/connection-guidance.ts';

interface Element {type:string;props:Record<string,any>;children:any[]}
const source=ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/mobile/ConnectionSummary.tsx',import.meta.url),'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:false},
}).outputText;
function render(ownFlights:any,phase='ready',compact=false){
  const calls:string[]=[],exports:any={};
  const react={createElement:(type:string,props:any,...children:any[]):Element=>({type,props:props??{},children:children.flat(Infinity)})};
  const modules:Record<string,any>={react:{default:react,useMemo:(fn:()=>unknown)=>fn()},'./theme':{Action:'Action',Card:'Card',Label:'Label',Section:'Section'},
    './processed-result':processedResults,'./data-freshness':{dataFreshness},'../vereinsflieger/retrieval-policy':{planFlightRetrieval},'./connection-guidance':{connectionGuidance}};
  runInNewContext(source,{exports,require:(name:string)=>{assert.ok(name in modules,name);return modules[name];}});
  const tree:Element=exports.ConnectionSummary({ownFlights,phase,compact,controller:{connection:{phase:'unknown'},snapshot:{retrievedAt:'2026-10-21T00:00:00.000Z'}},onUpdate:()=>calls.push('load'),onOpen:()=>calls.push('options')});
  const nodes:Element[]=[];function visit(v:any){if(v&&typeof v==='object'&&'children'in v){nodes.push(v);v.children.forEach(visit);}}visit(tree);
  const text=(v:any):string=>v&&typeof v==='object'&&'children'in v?v.children.map(text).join(''):typeof v==='string'||typeof v==='number'?String(v):'';
  return {nodes,calls,text:text(tree),button:(label:string)=>nodes.find(n=>n.type==='Action'&&text(n)===label)!};
}

test('summary uses committed library freshness instead of a more recent raw capture',()=>{
  const retrievedAt='2026-10-19T09:00:00.000Z';
  const f=render({flights:[{}],snapshot:{account:{accountRef:'101'},savedRetrievals:[{from:'2025-01-01',to:'2026-10-19',retrievedAt,savedAt:retrievedAt}]}});
  assert.ok(f.text.includes(dataFreshness(retrievedAt,'ready').label));
  assert.ok(!f.text.includes(dataFreshness('2026-10-21T00:00:00.000Z','ready').label));
  assert.deepEqual(f.calls,[]);f.button('Daten aktualisieren').props.onPress();assert.deepEqual(f.calls,['load']);
});

test('zero-book first use exposes a single combined load action and no technical setup',()=>{
  const f=render(null,'missing',true);
  assert.equal(f.nodes.filter(n=>n.type==='Action').length,1);assert.ok(!f.text.includes('Bibliothek anlegen'));
  assert.ok(f.text.includes('Bei Bedarf meldest du dich auf der Originalseite von Vereinsflieger an.'));
  assert.ok(f.text.includes('Medical-Angaben')&&f.text.includes('Offline-Nutzung'));
  f.button('Anmelden & Daten laden').props.onPress();assert.deepEqual(f.calls,['load']);
  const failed=render(null,'failed');assert.ok(!failed.text.includes('Noch keine Flugdaten abgerufen'));
});

test('compact returning summary retains saved facts and recovery warning without starting work',()=>{
  const retrievedAt='2026-10-19T09:00:00.000Z';
  const f=render({flights:[{},{}],pendingCommand:true,snapshot:{account:{accountRef:'101'},recovery:{readOnly:true},savedRetrievals:[{from:'2025-01-01',to:'2026-10-19',retrievedAt,savedAt:retrievedAt}]}},'ready',true);
  assert.ok(f.text.includes('2 Flüge'));assert.ok(f.text.includes(dataFreshness(retrievedAt,'ready').label));
  assert.ok(f.text.includes('Wiederherstellung muss geprüft werden'));assert.deepEqual(f.calls,[]);
  assert.equal(f.nodes.filter(n=>n.type==='Action').length,2);
  assert.equal(f.text.includes('Bei Bedarf meldest du dich auf der Originalseite'),false);
  f.button('Verbindung & Optionen').props.onPress();assert.deepEqual(f.calls,['options']);
  f.button('Daten aktualisieren').props.onPress();assert.deepEqual(f.calls,['options','load']);
});

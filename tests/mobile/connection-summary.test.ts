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
function render(ownFlights:any,phase='ready'){
  const calls:string[]=[],exports:any={};
  const react={createElement:(type:string,props:any,...children:any[]):Element=>({type,props:props??{},children:children.flat(Infinity)})};
  const modules:Record<string,any>={react:{default:react,useMemo:(fn:()=>unknown)=>fn()},'./theme':{Action:'Action',Card:'Card',Label:'Label',Section:'Section'},
    './processed-result':processedResults,'./data-freshness':{dataFreshness},'../vereinsflieger/retrieval-policy':{planFlightRetrieval},'./connection-guidance':{connectionGuidance}};
  runInNewContext(source,{exports,require:(name:string)=>{assert.ok(name in modules,name);return modules[name];}});
  const tree:Element=exports.ConnectionSummary({ownFlights,phase,controller:{connection:{phase:'unknown'},snapshot:{retrievedAt:'2026-10-21T00:00:00.000Z'}},onUpdate:()=>calls.push('load'),onOpen:()=>calls.push('options')});
  const nodes:Element[]=[];function visit(v:any){if(v&&typeof v==='object'&&'children'in v){nodes.push(v);v.children.forEach(visit);}}visit(tree);
  const text=(v:any):string=>v&&typeof v==='object'&&'children'in v?v.children.map(text).join(''):typeof v==='string'?v:'';
  return {nodes,calls,text:text(tree),button:(label:string)=>nodes.find(n=>n.type==='Action'&&text(n)===label)!};
}

test('summary uses committed library freshness instead of a more recent raw capture',()=>{
  const retrievedAt='2026-10-19T09:00:00.000Z';
  const f=render({flights:[{}],snapshot:{account:{accountRef:'101'},savedRetrievals:[{from:'2025-01-01',to:'2026-10-19',retrievedAt,savedAt:retrievedAt}]}});
  assert.ok(f.text.includes(dataFreshness(retrievedAt,'ready').label));
  assert.ok(!f.text.includes(dataFreshness('2026-10-21T00:00:00.000Z','ready').label));
  assert.deepEqual(f.calls,[]);f.button('Flüge aktualisieren').props.onPress();assert.deepEqual(f.calls,['load']);
});

test('zero-book first use exposes a single combined load action and no technical setup',()=>{
  const f=render(null,'missing');
  assert.ok(f.text.includes('Noch keine Flugdaten abgerufen'));assert.ok(!f.text.includes('Bibliothek anlegen'));
  f.button('Mit Vereinsflieger anmelden & Flüge laden').props.onPress();assert.deepEqual(f.calls,['load']);
  const failed=render(null,'failed');assert.ok(!failed.text.includes('Noch keine Flugdaten abgerufen'));
});

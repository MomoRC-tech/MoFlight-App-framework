import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source=ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/mobile/UpdateResult.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
const exports:Record<string,any>={};
const react={createElement:(type:unknown,props:unknown,...children:unknown[])=>({type,props,children:children.flat(Infinity)})};
runInNewContext(source,{exports,require:(id:string)=>id==='react'?{default:react,...react}:id==='react-native'?{Pressable:'Pressable',View:'View'}:{Label:'Label',colors:{},ui:{}}});
const text=(node:any):string=>typeof node==='string'||typeof node==='number'?String(node):(node?.children??[]).map(text).join(' ').replace(/\s+/g,' ');
test('automatic completion preserves failures, skipped sources and partial coverage in its receipt',()=>{
 const result={added:2,changed:1,pending:3,from:'2025-01-01',to:'2026-10-22',medicalStatus:'empty',dutyStatus:'partial',eventsStatus:'failed',documentNoticesStatus:'skipped'};
 const statuses=exports.updateSourceResults(result);assert.equal(statuses.length,4);assert.equal(statuses.filter((s:any)=>s.incomplete).length,2);
 const compact=text(exports.UpdateResult({result}));assert.match(compact,/2 Quellen nicht aktualisiert/);assert.match(compact,/3 ungeklärte Beobachtungen/);
 const full=text(exports.UpdateResult({result,detail:true}));assert.match(full,/Status unbekannt/);assert.match(full,/teilweise geprüft/);assert.match(full,/bisherige Angaben erhalten/);assert.match(full,/Dokumenthinweise\s*: nicht aktualisiert/);
});
test('successful completion does not invent missing job results or coverage completeness',()=>{
 const result={added:0,changed:0,pending:0,from:'2026-01-01',to:'2026-10-22',medicalStatus:'updated',dutyStatus:'partial'};
 assert.equal(exports.updateSourceResults(result).length,2);
 assert.doesNotMatch(text(exports.UpdateResult({result})),/nicht aktualisiert/);
 assert.doesNotMatch(text(exports.UpdateResult({result,detail:true})),/vollständig|Termine|Dokumenthinweise/);
});


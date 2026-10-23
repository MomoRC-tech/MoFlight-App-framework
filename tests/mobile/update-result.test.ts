import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source=ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/mobile/UpdateResult.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
const exports:Record<string,any>={};
const react={createElement:(type:unknown,props:unknown,...children:unknown[])=>({type,props,children:children.flat(Infinity)})};
runInNewContext(source,{exports,require:(id:string)=>id==='react'?{default:react,...react}:id==='react-native'?{Pressable:'Pressable',View:'View',StyleSheet:{create:(styles:unknown)=>styles}}:id==='./SymbolIcon'?{SymbolIcon:'SymbolIcon'}:{Label:'Label',colors:{}}});
const text=(node:any):string=>typeof node==='string'||typeof node==='number'?String(node):(node?.children??[]).map(text).join(' ').replace(/\s+/g,' ');
const nodes=(node:any):any[]=>node&&typeof node==='object'?[node,...(node.children??[]).flatMap(nodes)]:[];
test('automatic completion preserves failures, skipped sources and partial coverage in its receipt',()=>{
 const result={added:2,changed:1,pending:3,from:'2025-01-01',to:'2026-10-22',medicalStatus:'empty',dutyStatus:'partial',eventsStatus:'failed',documentNoticesStatus:'skipped',workSummaryStatus:'failed',workHoursStatus:'partial',tasksStatus:'partial'};
 const statuses=exports.updateSourceResults(result);assert.equal(statuses.length,7);assert.equal(statuses.filter((s:any)=>s.incomplete).length,3);
 const compact=text(exports.UpdateResult({result}));assert.match(compact,/Teilweise/);assert.doesNotMatch(compact,/Quellen|Beobachtungen|neue Flüge|geändert/);
 const full=text(exports.UpdateResult({result,detail:true}));assert.match(full,/3 Quellen nicht aktualisiert/);assert.match(full,/3 ungeklärte Beobachtungen/);assert.match(full,/2 neue Flüge · 1 geändert/);assert.match(full,/Status unbekannt/);assert.match(full,/teilweise geprüft/);assert.match(full,/bisherige Angaben erhalten/);assert.match(full,/Dokumenthinweise\s*: nicht aktualisiert/);assert.match(full,/Arbeitsstunden · Jahresübersicht\s*: Abruf fehlgeschlagen/);assert.match(full,/Erfasste Arbeitsstunden\s*: sichtbare Quelle gespeichert/);assert.match(full,/Eigene Aufgaben\s*: sichtbare Quelle gespeichert/);
});
test('successful completion does not invent missing job results or coverage completeness',()=>{
 const result={added:0,changed:0,pending:0,from:'2026-01-01',to:'2026-10-22',medicalStatus:'updated',dutyStatus:'partial'};
 assert.equal(exports.updateSourceResults(result).length,2);
 assert.doesNotMatch(text(exports.UpdateResult({result})),/nicht aktualisiert/);
 assert.doesNotMatch(text(exports.UpdateResult({result,detail:true})),/vollständig|Termine|Dokumenthinweise/);
});

test('new optional-source receipt rows appear only when their combined refresh jobs returned a status',()=>{
 const result={added:0,changed:0,pending:0,from:'2026-01-01',to:'2026-10-22',workSummaryStatus:'partial' as const,workHoursStatus:'failed' as const,tasksStatus:'skipped' as const};
 const statuses=exports.updateSourceResults(result);assert.deepEqual(Array.from(statuses,(status:any)=>status.name),['Arbeitsstunden · Jahresübersicht','Erfasste Arbeitsstunden','Eigene Aufgaben']);
 const detail=text(exports.UpdateResult({result,detail:true}));assert.match(detail,/Arbeitsstunden · Jahresübersicht\s*: sichtbare Quelle gespeichert/);assert.match(detail,/Erfasste Arbeitsstunden\s*: Abruf fehlgeschlagen/);assert.match(detail,/Eigene Aufgaben\s*: nicht aktualisiert/);
});


test('compact receipt summarizes the whole sync and leaves per-source results behind Details',()=>{
 const result={added:2,changed:1,pending:0,medicalStatus:'updated',dutyStatus:'partial',eventsStatus:'partial',documentNoticesStatus:'partial',workSummaryStatus:'partial',workHoursStatus:'partial',tasksStatus:'partial'};
 const compact=text(exports.UpdateResult({result,onDetails(){},onDismiss(){}}));
 assert.match(compact,/Synchronisiert/);
 assert.doesNotMatch(compact,/neue Flüge|geändert|Beobachtungen|Quellen/);
 assert.doesNotMatch(compact,/Medical|Dienste|Arbeitsstunden|Aufgaben|Zeitraum/);
 assert.match(compact,/Details/);
 assert.match(text(exports.UpdateResult({result:{...result,tasksStatus:'failed'}})),/Teilweise/);
});

test('receipt shows recorded local completion time and never fabricates missing or invalid time',()=>{
 const completedAt='2026-10-23T14:32:00';
 const result={added:0,changed:0,pending:0,from:'2026-01-01',to:'2026-10-23',completedAt};
 assert.match(text(exports.UpdateResult({result})),/Synchronisiert · 14:32/);
 assert.match(text(exports.UpdateResult({result:{...result,pending:1}})),/Teilweise · 14:32/);
 for(const missing of [undefined,'invalid']) assert.equal(text(exports.UpdateResult({result:{...result,completedAt:missing}})).trim(),'Synchronisiert');
 assert.match(text(exports.UpdateResult({result,detail:true})),/0 ungeklärte Beobachtungen/);
});

test('actual receipt exposes independent Details and dismiss actions with shared refresh and close glyphs',()=>{
 let details=0,dismissals=0;
 const receipt=exports.UpdateResult({result:{added:0,changed:0,pending:0},onDetails(){details++;},onDismiss(){dismissals++;}});
 const tree=nodes(receipt),buttons=tree.filter(node=>node.type==='Pressable');
 assert.equal(buttons.length,2);
 assert.equal(buttons[0].props.accessibilityLabel,'Ergebnis der Aktualisierung ansehen');
 assert.equal(buttons[1].props.accessibilityLabel,'Aktualisierungshinweis schließen');
 buttons[0].props.onPress();assert.equal(details,1);assert.equal(dismissals,0);
 buttons[1].props.onPress();assert.equal(dismissals,1);
 assert.deepEqual(tree.filter(node=>node.type==='SymbolIcon').map(node=>node.props.name),['refresh','close']);
 for(const button of buttons){assert.ok(button.props.style.minWidth>=48);assert.ok(button.props.style.minHeight>=48);}
 assert.equal(receipt.props.style.flexWrap,'wrap');
 assert.equal(receipt.props.style.borderWidth,1);
 assert.ok(!tree.some(node=>node.props?.numberOfLines||node.props?.maxFontSizeMultiplier));
});

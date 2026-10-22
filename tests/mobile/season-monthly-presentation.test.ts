import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { monthlySeason } from '../../apps/platform-lab/src/mobile/season-dashboard-model.ts';
import { formatReportedMinutes } from '../../apps/platform-lab/src/mobile/real-flight-statistics.ts';
const compiled=ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/mobile/SeasonMonthlyCharts.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:false}}).outputText;
interface Element {type:string;props:Record<string,any>;children:any[]}
function fixture() {
 let selected:any='count';const calls:any[]=[];let selectionScope="owner/store/account";
 const react={createElement:(type:string,props:Element['props'],...children:any[]):Element=>({type,props:props??{},children:children.flat(Infinity)}),useState:()=>[selected,(next:unknown)=>{selected=next;}]};
 const leaves=(names:string[])=>Object.fromEntries(names.map(n=>[n,n]));
 const modules:Record<string,unknown>={react:{default:react,...react},'react-native':{...leaves(['Pressable','ScrollView','View']),StyleSheet:{create:(v:unknown)=>v}},'./theme':{...leaves(['Chip','Label']),colors:{}},'./real-flight-statistics':{formatReportedMinutes}};
 const exports:any={};runInNewContext(compiled,{exports,require:(name:string)=>{assert.ok(name in modules,name);return modules[name];}});
 let series=monthlySeason([],[],'2026-10-22');
 const render=()=>{const tree=exports.SeasonMonthlyCharts({series,selectionScope,onFlights:(...args:any[])=>calls.push(args)});const nodes:Element[]=[];const visit=(node:any)=>{if(node?.children){nodes.push(node);node.children.forEach(visit);}};visit(tree);return nodes;};
 return {render,calls,series,setDate:(today:string)=>{series=monthlySeason([],[],today);},setScope:(next:string)=>{selectionScope=next;}};
}
test('one monthly chart switches count and hours without offering drilldowns',()=>{
 const f=fixture(),initial=f.render();
 assert.equal(initial.filter(n=>n.type==='ScrollView').length,1);
 const months=initial.filter(n=>n.props.accessible);assert.equal(months.length,12);
 assert.equal(months.filter(n=>n.props.accessibilityLabel.includes('zukünftig')).length,2);
 assert.ok(months.every(n=>n.props.style.width===48));
 assert.equal(initial.filter(n=>n.type==='Pressable'||n.type==='Action').length,0);
 assert.equal(initial.filter(n=>n.type==='Chip').length,2);
 assert.equal(initial.filter(n=>n.type==='Chip'&&n.props.selected)[0]!.props.title,'Flüge');
 assert.match(JSON.stringify(initial),/Flüge pro Monat/);
 initial.find(n=>n.type==='Chip'&&n.props.title==='Flugstunden')!.props.onPress();
 const hours=f.render();assert.equal(hours.filter(n=>n.type==='ScrollView').length,1);
 assert.match(JSON.stringify(hours),/Flugstunden pro Monat/);
 assert.match(JSON.stringify(hours),/h bekannt/);
 assert.equal(hours.filter(n=>n.type==='Chip'&&n.props.selected)[0]!.props.title,'Flugstunden');
 assert.deepEqual(f.calls,[]);
 assert.match(JSON.stringify(hours),/Abdeckung unvollständig/);
 assert.match(JSON.stringify(hours),/Flugzahl unbekannt/);
 hours.find(n=>n.type==='Chip'&&n.props.title==='Flüge')!.props.onPress();
 assert.equal(f.render().filter(n=>n.type==='Chip'&&n.props.selected)[0]!.props.title,'Flüge');
});

test('year rollover and account changes leave no stale month selection or actions',()=>{
 const f=fixture();f.render();f.setDate('2027-01-01');f.setScope('other-owner/store/account');
 const next=f.render();assert.match(JSON.stringify(next),/2027/);
 assert.equal(next.filter(n=>n.type==='Action'||n.type==='Pressable').length,0);
 assert.equal(next.filter(n=>n.props.accessible&&n.props.accessibilityLabel.includes('zukünftig')).length,11);
});

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
 let selected:any=null;const calls:any[]=[];let selectionScope="owner/store/account";
 const react={createElement:(type:string,props:Element['props'],...children:any[]):Element=>({type,props:props??{},children:children.flat(Infinity)}),useState:()=>[selected,(next:unknown)=>{selected=next;}]};
 const leaves=(names:string[])=>Object.fromEntries(names.map(n=>[n,n]));
 const modules:Record<string,unknown>={react:{default:react,...react},'react-native':{...leaves(['Pressable','ScrollView','View']),StyleSheet:{create:(v:unknown)=>v}},'./theme':{...leaves(['Action','Label']),colors:{}},'./real-flight-statistics':{formatReportedMinutes}};
 const exports:any={};runInNewContext(compiled,{exports,require:(name:string)=>{assert.ok(name in modules,name);return modules[name];}});
 let series=monthlySeason([],[],'2026-10-22');
 const render=()=>{const tree=exports.SeasonMonthlyCharts({series,selectionScope,onFlights:(...args:any[])=>calls.push(args)});const nodes:Element[]=[];const visit=(node:any)=>{if(node?.children){nodes.push(node);node.children.forEach(visit);}};visit(tree);return nodes;};
 return {render,calls,series,setDate:(today:string)=>{series=monthlySeason([],[],today);},setScope:(next:string)=>{selectionScope=next;}};
}
test('both aligned charts stay rendered; month selection shows both exact cutoffs and separate drilldowns',()=>{
 const f=fixture(),initial=f.render();
 assert.equal(initial.filter(n=>n.type==='ScrollView').length,1);
 const months=initial.filter(n=>n.type==='Pressable');assert.equal(months.length,24);
 assert.equal(months.filter(n=>n.props.disabled).length,4);
 assert.ok(months.every(n=>n.props.style[0].width===48));
 assert.equal(initial.filter(n=>n.type==='Action').length,0);
 months.find(n=>n.props.accessibilityLabel.startsWith('Okt:'))!.props.onPress();
 const selected=f.render();assert.equal(selected.filter(n=>n.type==='Pressable').length,24);
 const actions=selected.filter(n=>n.type==='Action');assert.equal(actions.length,2);
 actions[0]!.props.onPress();actions[1]!.props.onPress();
 assert.deepEqual(JSON.parse(JSON.stringify(f.calls)),[[2026,{year:2026,dateRange:{from:'2026-10-01',to:'2026-10-22'}}],[2025,{year:2025,dateRange:{from:'2025-10-01',to:'2025-10-22'}}]]);
 const text=JSON.stringify(selected);assert.match(text,/Abdeckung unvollständig/);assert.match(text,/Flugzahl unbekannt/);assert.ok(!text.includes('0 gespeicherte Flüge'));
});


test('year rollover, calendar reversal and account switch suppress stale month actions',()=>{
 for (const change of [(f:ReturnType<typeof fixture>)=>f.setDate('2027-01-01'),(f:ReturnType<typeof fixture>)=>f.setDate('2026-01-01'),(f:ReturnType<typeof fixture>)=>f.setScope('other-owner/store/account')]) {
   const f=fixture();f.render().find(n=>n.type==='Pressable'&&n.props.accessibilityLabel.startsWith('Okt:'))!.props.onPress();
   assert.equal(f.render().filter(n=>n.type==='Action').length,2);
   change(f);const next=f.render();assert.equal(next.filter(n=>n.type==='Action').length,0);
   assert.ok(next.filter(n=>n.type==='Pressable').every(n=>!n.props.accessibilityState.selected));
   next.find(n=>n.type==='Pressable'&&n.props.accessibilityLabel.startsWith('Jan:'))!.props.onPress();assert.equal(f.render().filter(n=>n.type==='Action').length,2);
 }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { monthlySeason } from '../../apps/platform-lab/src/mobile/season-dashboard-model.ts';
import { formatReportedMinutes } from '../../apps/platform-lab/src/mobile/real-flight-statistics.ts';
const compiled=ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/mobile/SeasonMonthlyCharts.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:false}}).outputText;
interface Element {type:string;props:Record<string,any>;children:any[]}
function fixture(fontScale=1) {
 let selected:any='count';const calls:any[]=[];let selectionScope="owner/store/account";
 const react={createElement:(type:string,props:Element['props'],...children:any[]):Element=>({type,props:props??{},children:children.flat(Infinity)}),useState:()=>[selected,(next:unknown)=>{selected=next;}]};
 const leaves=(names:string[])=>Object.fromEntries(names.map(n=>[n,n]));
 const modules:Record<string,unknown>={react:{default:react,...react},'react-native':{...leaves(['Pressable','ScrollView','View','Text']),StyleSheet:{create:(v:unknown)=>v}},'./theme':{...leaves(['Chip','Label','Section']),colors:{}},'./real-flight-statistics':{formatReportedMinutes}};
 const exports:any={};runInNewContext(compiled,{exports,require:(name:string)=>{assert.ok(name in modules,name);return modules[name];}});
 let series=monthlySeason([],[],'2026-10-22');
 const render=()=>{const tree=exports.SeasonMonthlyCharts({series,fontScale,selectionScope,onFlights:(...args:any[])=>calls.push(args)});const nodes:Element[]=[];const visit=(node:any)=>{if(node?.children){nodes.push(node);node.children.forEach(visit);}};visit(tree);return nodes;};
 return {render,calls,series,setDate:(today:string)=>{series=monthlySeason([],[],today);},setScope:(next:string)=>{selectionScope=next;}};
}
test('one monthly chart switches count and hours without offering drilldowns',()=>{
 const f=fixture(),initial=f.render();
 assert.equal(initial.filter(n=>n.type==='ScrollView').length,0);
 const months=initial.filter(n=>n.props.accessible);assert.equal(months.length,12);
 assert.equal(months.filter(n=>n.props.accessibilityLabel.includes('zukünftig')).length,2);
 assert.ok(months.every(n=>n.props.style.flex===1));
 assert.ok(initial.some(n=>n.props.style?.flexWrap==='nowrap'&&n.props.style?.width==='100%'));
 assert.equal(initial.filter(n=>n.type==='Pressable'||n.type==='Action').length,0);
 assert.equal(initial.filter(n=>n.type==='Chip').length,2);
 assert.equal(initial.filter(n=>n.type==='Chip'&&n.props.selected)[0]!.props.title,'Flüge');
 assert.match(JSON.stringify(initial),/Flüge/);
 initial.find(n=>n.type==='Chip'&&n.props.title==='Flugstunden')!.props.onPress();
 const hours=f.render();assert.equal(hours.filter(n=>n.type==='ScrollView').length,0);
 assert.match(JSON.stringify(hours),/Flugstunden/);
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

test('enlarged text keeps all twelve month labels in one bounded non-scrollable row',()=>{
 const f=fixture(1.6),nodes=f.render();
 const months=nodes.filter(n=>n.props.accessible);
 assert.equal(months.length,12);assert.ok(months.every(n=>n.props.style.flex===1));
 assert.equal(nodes.filter(n=>n.type==='ScrollView').length,0);
 assert.ok(nodes.some(n=>n.props.style?.flexWrap==='nowrap'&&n.props.style?.width==='100%'));
 const axis=nodes.filter(n=>n.type==='Text'&&n.props.style?.lineHeight===16);assert.equal(axis.length,12);
 assert.ok(axis.every(n=>n.props.maxFontSizeMultiplier===1),'Compact axis labels retain all months at enlarged system text; full values remain on each accessible month');
 assert.match(months[0]!.props.accessibilityLabel,/Jan/);assert.match(months[11]!.props.accessibilityLabel,/Dez/);
});

test('current and previous years share each month and one comparison scale',()=>{
 const f=fixture();
 Object.assign(f.series[0]![0]!,{count:4,knownMinutes:120,covered:true});
 Object.assign(f.series[1]![0]!,{count:2,knownMinutes:60,covered:true});
 const nodes=f.render(),jan=nodes.find(n=>n.props.accessibilityLabel?.startsWith('Jan:'))!;
 assert.match(jan.props.accessibilityLabel,/2026: 4 Flüge/);assert.match(jan.props.accessibilityLabel,/2025: 2 Flüge/);
 const pair=jan.children[0] as Element;assert.equal(pair.children.length,2);
 const heights=pair.children.map((slot:Element)=>slot.children[0].props.style[1].height);
 assert.equal(heights[0],heights[1]*2,'Both years use the same scale, not separate normalized bars');
 assert.equal(nodes.filter(n=>n.props.accessible).length,12,'Both years are combined into twelve month groups');
 assert.equal(nodes.filter(n=>n.type==='ScrollView').length,0);
});


test('bar values preserve known zero, exact hours, partial and unknown values while future months stay blank',()=>{
 const f=fixture();
 Object.assign(f.series[0]![0]!,{count:4,knownMinutes:95,covered:false});
 Object.assign(f.series[1]![0]!,{count:0,knownMinutes:0,covered:true});
 Object.assign(f.series[0]![1]!,{count:null,knownMinutes:null,covered:false});
 const values=(nodes:Element[],month:string)=>nodes.find(n=>n.props.accessibilityLabel?.startsWith(month+':'))!.children[0].children.map((slot:Element)=>slot.children[1]);
 const captions=(nodes:Element[],month:string)=>values(nodes,month).map((v:Element)=>v?.children.filter((c:any)=>typeof c==='string').join(''));
 const counts=f.render();assert.deepEqual(captions(counts,'Jan'),['4·','0']);assert.equal(captions(counts,'Feb')[0],'?');
 assert.ok(values(counts,'Nov').every((v:any)=>!v),'Future months show no numeric label');
 counts.find(n=>n.type==='Chip'&&n.props.title==='Flugstunden')!.props.onPress();
 const hours=f.render();assert.deepEqual(captions(hours,'Jan'),['1:35·','0:00']);
 assert.ok(values(hours,'Jan').every((v:Element)=>v.props.maxFontSizeMultiplier===1));
 assert.match(JSON.stringify(hours),/Stunden:Minuten/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { AI_BACKUP_NOTICE } from '../../apps/platform-lab/src/ai/backup-notice';

interface Element {type:string;props:Record<string,any>;children:any[]}
const source=ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/mobile/ProfileSettings.tsx',import.meta.url),'utf8'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:false},
}).outputText;
function fixture(){
 const calls:string[]=[],exports:any={};
 let stateCursor=0;const state:any[]=[];
 const react={createElement:(type:any,props:any,...children:any[]):Element=>typeof type==='function'?type({...props,children:children.flat(Infinity)}):({type,props:props??{},children:children.flat(Infinity)}),useEffect:()=>{},useRef:(value:any)=>({current:value}),useState:(value:any)=>{const index=stateCursor++;if(!(index in state))state[index]=value;return [state[index],(next:any)=>{state[index]=typeof next==='function'?next(state[index]):next;}];}};
 const leaves=(names:string[])=>Object.fromEntries(names.map(n=>[n,n]));
 const modules:Record<string,any>={'../ai/backup-notice':{AI_BACKUP_NOTICE},react:{default:react,...react},'react-native':{...leaves(['ActivityIndicator','Pressable','Switch','Text','TextInput','View']),Keyboard:{dismiss(){}},StyleSheet:{create:(x:unknown)=>x}},'./theme':{...leaves(['Action','Card','Label','Section']),colors:{}}};
 runInNewContext(source,{exports,require:(name:string)=>{assert.ok(name in modules,name);return modules[name];}});
 const props={displayName:'Synthetic saved name',nameDraft:'Retained draft',busy:false,error:null,onNameDraftChange:()=>{},onSaveName:async()=>true,onRetry:()=>{},onStatus:()=>calls.push('status'),onConnections:()=>calls.push('connection'),onBackup:()=>calls.push('backup'),onDiagnostics:()=>calls.push('diagnostics'),onHelp:(id?:string)=>calls.push('help:'+id),helpEnabled:true as boolean|null,helpSaving:false,helpError:false,onToggleHelp:()=>calls.push('toggle-help'),onCredits:()=>calls.push('credits'),onTools:()=>calls.push('development')};
 const nodes=(tree:any)=>{const result:Element[]=[];const visit=(n:any)=>{if(n?.children){result.push(n);n.children.forEach(visit);}};visit(tree);return result;};
 const text=(n:any):string=>n?.children?n.children.map(text).join(''):typeof n==='string'?n:'';
 const renderOrdinary=()=>{stateCursor=0;return exports.ProfileSettings(props);};
 return {calls,props,nodes,text,renderOrdinary,ordinary:renderOrdinary(),synthetic:exports.SyntheticProfileSettings(props)};
}
test('ordinary settings exposes real administration and backup exclusions while synthetic editing stays in Development',()=>{
 const f=fixture(),synthetic=f.nodes(f.synthetic);
 assert.equal(f.text(f.ordinary).includes(AI_BACKUP_NOTICE),false);
 const disclosure=f.nodes(f.ordinary).find(n=>n.type==='Pressable'&&f.text(n).startsWith('Was wird gesichert?'))!;
 assert.equal(disclosure.props.accessibilityState.expanded,false);disclosure.props.onPress();
 const expanded=f.renderOrdinary(),ordinary=f.nodes(expanded);
 assert.equal(ordinary.find(n=>n.type==='Pressable'&&f.text(n).startsWith('Was wird gesichert?'))!.props.accessibilityState.expanded,true);
 assert.equal(ordinary.some(n=>n.type==='TextInput'),false);
 const text=f.text(expanded);assert.ok(text.includes('einschließlich Medical'));assert.ok(text.includes('Unverschlüsselt'));assert.ok(text.includes('Dienstpläne und temporäre Dateien sind ausgeschlossen'));
 assert.ok(text.includes(AI_BACKUP_NOTICE));
 for(const term of ['unverschlüsselte','KI-Chats','Entwürfe','Vereinsflieger-Kennungen','Version 4','Beträgen, Empfängern und Quelltexten','keine vollständige Abrechnungshistorie','Ältere Sicherungen lassen bestehende Finanzbelege unverändert','dieselbe Installation','Foto- und Anhangdateien werden nicht gesichert','Textverweise darauf können enthalten sein','serverseitige Budget'])assert.ok(AI_BACKUP_NOTICE.includes(term));
 assert.equal(ordinary.some(n=>n.type==='Section'&&n.props.title==='Lokales Demoprofil'),false);
 assert.equal(synthetic.find(n=>n.type==='TextInput')!.props.value,'Retained draft');
 assert.ok(synthetic.some(n=>n.type==='Section'&&n.props.title==='Lokales Demoprofil'));
 assert.deepEqual(f.calls,[]);
 ordinary.find(n=>n.type==='Pressable'&&f.text(n).startsWith('Daten sichern & wiederherstellen'))!.props.onPress();
 ordinary.find(n=>n.type==='Pressable'&&f.text(n).startsWith('Hilfe zur Sicherung'))!.props.onPress();
 ordinary.find(n=>n.props.testID==='help-entry')!.props.onPress();
 ordinary.find(n=>n.props.testID==='diagnostics-entry')!.props.onPress();
 ordinary.find(n=>n.props.testID==='development-entry')!.props.onPress();
 assert.deepEqual(f.calls,['backup','help:backup','help:undefined','diagnostics','development']);
});
test('Profile keeps Help available when contextual guidance is disabled',()=>{
 const f=fixture();f.props.helpEnabled=false;
 const off=f.nodes(f.renderOrdinary());
 assert.ok(off.some(n=>n.props.testID==='help-entry'));
 assert.ok(off.some(n=>n.props.testID==='help-toggle'));
 const toggle=off.find(n=>n.props.testID==='help-toggle')!;
 assert.equal(toggle.type,'Switch');assert.equal(toggle.props.value,false);assert.equal(toggle.props.disabled,false);
 toggle.props.onValueChange(true);
 assert.deepEqual(f.calls,['toggle-help']);
 off.find(n=>n.type==='Pressable'&&f.text(n).startsWith('Was wird gesichert?'))!.props.onPress();
 assert.ok(f.text(f.renderOrdinary()).includes(AI_BACKUP_NOTICE));
 assert.equal(f.text(f.renderOrdinary()).includes('Hilfe zur Sicherung'),false);
});

test('context help switch disables loading and saving, keeps failures actionable and routes enabled changes',()=>{
 const f=fixture();
 for(const [enabled,saving] of [[null,false],[true,true],[false,true]] as const){
  f.props.helpEnabled=enabled;f.props.helpSaving=saving;
  const toggle=f.nodes(f.renderOrdinary()).find(n=>n.type==='Switch')!;
  assert.equal(toggle.props.disabled,true);toggle.props.onValueChange(!enabled);assert.deepEqual(f.calls,[]);
 }
 f.props.helpEnabled=true;f.props.helpSaving=false;f.props.helpError=true;
 const nodes=f.nodes(f.renderOrdinary()),toggle=nodes.find(n=>n.type==='Switch')!;
 assert.equal(toggle.props.value,true);assert.equal(toggle.props.disabled,false);
 assert.match(f.text(nodes.find(n=>n.props.accessibilityRole==='alert')),/nicht gespeichert/);
 toggle.props.onValueChange(false);assert.deepEqual(f.calls,['toggle-help']);
});

test('Settings navigation preserves status, provider and credits callbacks without starting work on render',()=>{
 const f=fixture(),nodes=f.nodes(f.ordinary);assert.deepEqual(f.calls,[]);
 for(const title of ['Verbindung & Datenstatus','Vereinsflieger-Einstellungen','Über MoFlight']){
  nodes.find(n=>n.type==='Pressable'&&f.text(n).startsWith(title))!.props.onPress();
 }
 assert.deepEqual(f.calls,['status','connection','credits']);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

interface Element {type:string;props:Record<string,any>;children:any[]}
const source=ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/mobile/ProfileSettings.tsx',import.meta.url),'utf8'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:false},
}).outputText;
function fixture(){
 const calls:string[]=[],exports:any={};
 const react={createElement:(type:string,props:any,...children:any[]):Element=>({type,props:props??{},children:children.flat(Infinity)}),useEffect:()=>{},useRef:(value:any)=>({current:value}),useState:(value:any)=>[value,()=>{}]};
 const leaves=(names:string[])=>Object.fromEntries(names.map(n=>[n,n]));
 const modules:Record<string,any>={react:{default:react,...react},'react-native':{...leaves(['ActivityIndicator','Text','TextInput','View']),Keyboard:{dismiss(){}},StyleSheet:{create:(x:unknown)=>x}},'./theme':{...leaves(['Action','Card','Label','Section']),colors:{}}};
 runInNewContext(source,{exports,require:(name:string)=>{assert.ok(name in modules,name);return modules[name];}});
 const props={displayName:'Synthetic saved name',nameDraft:'Retained draft',busy:false,error:null,onNameDraftChange:()=>{},onSaveName:async()=>true,onRetry:()=>{},onConnections:()=>calls.push('connection'),onBackup:()=>calls.push('backup'),onDiagnostics:()=>calls.push('diagnostics'),onCredits:()=>calls.push('credits'),onTools:()=>calls.push('development')};
 const nodes=(tree:any)=>{const result:Element[]=[];const visit=(n:any)=>{if(n?.children){result.push(n);n.children.forEach(visit);}};visit(tree);return result;};
 const text=(n:any):string=>n?.children?n.children.map(text).join(''):typeof n==='string'?n:'';
 return {calls,props,nodes,text,ordinary:exports.ProfileSettings(props),synthetic:exports.SyntheticProfileSettings(props)};
}
test('ordinary settings exposes real administration and backup exclusions while synthetic editing stays in Development',()=>{
 const f=fixture(),ordinary=f.nodes(f.ordinary),synthetic=f.nodes(f.synthetic);
 assert.equal(ordinary.some(n=>n.type==='TextInput'),false);
 const text=f.text(f.ordinary);assert.ok(text.includes('einschließlich Medical'));assert.ok(text.includes('Dienstpläne und temporäre Dateien sind ausgeschlossen'));
 assert.equal(ordinary.some(n=>n.type==='Section'&&n.props.title==='Lokales Demoprofil'),false);
 assert.equal(synthetic.find(n=>n.type==='TextInput')!.props.value,'Retained draft');
 assert.ok(synthetic.some(n=>n.type==='Section'&&n.props.title==='Lokales Demoprofil'));
 assert.deepEqual(f.calls,[]);
 ordinary.find(n=>n.type==='Action'&&f.text(n)==='Daten sichern & wiederherstellen')!.props.onPress();
 ordinary.find(n=>n.props.testID==='diagnostics-entry')!.props.onPress();
 ordinary.find(n=>n.props.testID==='development-entry')!.props.onPress();
 assert.deepEqual(f.calls,['backup','diagnostics','development']);
});

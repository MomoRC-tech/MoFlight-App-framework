import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { DiagnosticJournal } from '../../apps/platform-lab/src/diagnostics';

interface Element {type: string; props: Record<string, any>; children: unknown[]}
const source=ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/mobile/Diagnostics.tsx',import.meta.url),'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:false},
}).outputText;
function fixture() {
  const journal=new DiagnosticJournal(()=>10), hooks:any[]=[], shared:any[]=[];
  let index=0, fail=false;
  const react={createElement:(type:string,props:any,...children:unknown[]):Element=>({type,props:props??{},children:children.flat(Infinity)}),
    useState(initial:unknown){const i=index++;if(!(i in hooks))hooks[i]=initial;return [hooks[i],(next:any)=>{hooks[i]=typeof next==='function'?next(hooks[i]):next;}];},useEffect(){}};
  const leaves=(names:string[])=>Object.fromEntries(names.map(name=>[name,name]));
  const modules:Record<string,any>={react:{default:react,...react},'react-native':{View:'View',Share:{share:async(payload:any)=>{if(fail)throw new Error('Private native error');shared.push(payload);}}},
    '../diagnostics':{diagnosticJournal:journal},'./theme':leaves(['Action','Card','Label','Section'])};
  const exports:any={};runInNewContext(source,{exports,require:(name:string)=>{assert.ok(name in modules,name);return modules[name];}});
  let tree:Element;
  function render(){index=0;tree=exports.Diagnostics();}
  function nodes(){const result:Element[]=[];const visit=(node:any)=>{if(node&&typeof node==='object'&&'children'in node){result.push(node);node.children.forEach(visit);}};visit(tree);return result;}
  function text(){return nodes().flatMap(node=>node.children.filter(value=>typeof value==='string')).join(' ');}
  return {journal,shared,render,nodes,text,failShare:()=>{fail=true;},press:(id:string)=>nodes().find(node=>node.props.testID===id)!.props.onPress()};
}
test('empty journal disables export; populated report shares only on an explicit press and clear removes it',async()=>{
  const f=fixture();f.render();assert.equal(f.shared.length,0);assert.equal(f.nodes().find(n=>n.props.testID==='diagnostics-share')!.props.disabled,true);
  f.journal.begin('update-flights').finish('blocked','account-mismatch');f.render();
  assert.match(f.text(),/account-mismatch/);assert.ok(f.nodes().some(n=>n.props.selectable));
  f.press('diagnostics-share');await Promise.resolve();await Promise.resolve();
  assert.equal(f.shared.length,1);assert.equal(f.shared[0].message,f.journal.export());
  f.render();f.press('diagnostics-clear');f.render();assert.deepEqual(f.journal.snapshot(),[]);assert.match(f.text(),/geleert/);
});
test('failed native sharing preserves the report and offers copying without exposing the native error',async()=>{
  const f=fixture();f.journal.begin('read-flights').finish('success');f.failShare();f.render();f.press('diagnostics-share');
  await Promise.resolve();await Promise.resolve();f.render();
  assert.match(f.text(),/markieren und kopieren/);assert.ok(!f.text().includes('Private native error'));assert.equal(f.journal.snapshot().length,1);
});

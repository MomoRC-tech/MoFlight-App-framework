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
    './diagnostics-native':{shareDiagnosticFile:async()=>{if(fail)throw new Error('Private native error');shared.push({message:journal.export()});}},'../diagnostics':{diagnosticJournal:journal},'./theme':leaves(['Action','Card','Label','Section'])};
  const exports:any={};runInNewContext(source,{exports,require:(name:string)=>{assert.ok(name in modules,name);return modules[name];}});
  let tree:Element;
  function render(){index=0;tree=exports.Diagnostics();}
  function nodes(){const result:Element[]=[];const visit=(node:any)=>{if(node&&typeof node==='object'&&'children'in node){result.push(node);node.children.forEach(visit);}};visit(tree);return result;}
  function text(){return nodes().flatMap(node=>node.children.filter(value=>typeof value==='string'||typeof value==='number')).join(' ');}
  return {journal,shared,render,nodes,text,failShare:()=>{fail=true;},press:(id:string)=>nodes().find(node=>node.props.testID===id)!.props.onPress()};
}
test('empty journal disables export; populated report shares only on an explicit press and clear removes it',async()=>{
  const f=fixture();f.render();assert.equal(f.shared.length,0);assert.equal(f.nodes().find(n=>n.props.testID==='diagnostics-share')!.props.disabled,true);
  f.journal.begin('update-flights').finish('blocked','account-mismatch');f.render();
  assert.match(f.text(),/account-mismatch/);assert.ok(f.nodes().some(n=>n.props.selectable));
  f.press('diagnostics-share');await new Promise<void>(done=>{setImmediate(done);});
  assert.equal(f.shared.length,1);assert.equal(f.shared[0].message,f.journal.export());
  f.render();f.press('diagnostics-clear');f.render();assert.deepEqual(f.journal.snapshot(),[]);assert.match(f.text(),/geleert/);
});
test('failed native sharing preserves the report and offers copying without exposing the native error',async()=>{
  const f=fixture();f.journal.begin('read-flights').finish('success');f.failShare();f.render();f.press('diagnostics-share');
  await new Promise<void>(done=>{setImmediate(done);});f.render();
  assert.match(f.text(),/markieren und kopieren/);assert.ok(!f.text().includes('Private native error'));assert.equal(f.journal.snapshot().length,1);
});


test('long histories are paged and the journey view shows observations without invented intentions',()=>{
 const f=fixture();for(let i=0;i<25;i++)f.journal.begin('read-flights').finish('success');f.journal.record('screen','home');f.journal.record('screen','flights');f.render();
 assert.equal(f.nodes().filter(n=>n.props.title?.includes('Gespeicherte Flüge laden')).length,10);
 f.press('diagnostics-next');f.render();assert.match(f.text(),/Seite\s+2\s+von\s+3/);f.press('diagnostics-journey');f.render();assert.match(f.text(),/keine bestätigten Absichten/);assert.match(f.text(),/home → flights/);
});

test('short sharing uses a bounded excerpt rather than the full large report',async()=>{
 const f=fixture();for(let i=0;i<300;i++)f.journal.begin('read-flights').finish('success');f.render();f.press('diagnostics-short-share');await new Promise<void>(done=>{setImmediate(done);});
 assert.equal(f.shared.length,1);assert.ok(Buffer.byteLength(f.shared[0].message)<=32_000);assert.equal(JSON.parse(f.shared[0].message).entries.length,3);
});

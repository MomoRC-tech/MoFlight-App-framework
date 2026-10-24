import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

const source=ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/mobile/ConnectionSettings.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:false}}).outputText;
function fixture(){
  const calls:string[]=[],c:any={viewReady:true,restoring:{current:false},sessionClearingAvailable:true,clearLocalSession:async()=>calls.push('clear'),forgetLogin:()=>calls.push('forget')};
  const react={createElement:(type:any,props:any,...children:any[])=>({type,props:props??{},children:children.flat(Infinity)})};
  const exports:any={},modules:any={react:{default:react},'react-native':{TextInput:'TextInput'},'./theme':{Action:'Action',Card:'Card',Label:'Label',Section:'Section',ui:{}}};
  runInNewContext(source,{exports,require:(name:string)=>modules[name]});
  const nodes=(n:any):any[]=>n?.children?[n,...n.children.flatMap(nodes)]:[];
  const text=(n:any):string=>typeof n==='string'?n:n?.children?.map(text).join('')??'';
  const actions=()=>nodes(exports.ConnectionSettings({controller:c,busy:false,onSignOut:()=>calls.push('signout')})).filter(n=>n.type==='Action');
  const action=(label:string)=>{const found=actions().find(n=>text(n)===label);assert.ok(found,label);return found;};
  return{c,calls,action};
}
test('session administration is explicit and separate from saved credentials',async()=>{
  const f=fixture();
  f.action('Bei Vereinsflieger abmelden').props.onPress();
  await f.action('Lokale Anbietersitzung löschen').props.onPress();
  f.action('Gespeicherte Zugangsdaten vergessen').props.onPress();
  assert.deepEqual(f.calls,['signout','clear','forget']);
});
test('pending recovery, unsafe writes and unavailable native capability prevent session actions',()=>{
  const f=fixture();
  for(const key of ['recovery','busy','saving','loginBusy','binding','clearing','disconnecting']){
    f.c[key]=true;
    assert.equal(f.action('Bei Vereinsflieger abmelden').props.disabled,true,key);
    assert.equal(f.action('Lokale Anbietersitzung löschen').props.disabled,true,key);
    f.c[key]=false;
  }
  f.c.restoring.current=true;assert.equal(f.action('Bei Vereinsflieger abmelden').props.disabled,true);
  f.c.restoring.current=false;f.c.viewReady=false;assert.equal(f.action('Bei Vereinsflieger abmelden').props.disabled,true);
  f.c.viewReady=true;assert.equal(f.action('Bei Vereinsflieger abmelden').props.disabled,false);
});

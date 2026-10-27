import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

const source=ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/mobile/ConnectionSettings.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:false}}).outputText;
function fixture(){
  const calls:string[]=[],c:any={viewReady:true,restoring:{current:false},sessionClearingAvailable:true,clearLocalSession:async()=>calls.push('clear'),forgetLogin:()=>calls.push('forget'),setEditingLogin:(value:boolean)=>{c.editingLogin=value;},saveLogin:()=>calls.push('save'),setUsername:()=>{},setPassword:()=>{}};
  const react={createElement:(type:any,props:any,...children:any[])=>({type,props:props??{},children:children.flat(Infinity)})};
  const exports:any={},modules:any={react:{default:react},'react-native':{TextInput:'TextInput',View:'View'},'./theme':{Action:'Action',Card:'Card',Label:'Label',Section:'Section',ui:{},colors:{border:'#183d50'}}};
  runInNewContext(source,{exports,require:(name:string)=>modules[name]});
  const nodes=(n:any):any[]=>n?.children?[n,...n.children.flatMap(nodes)]:[];
  const text=(n:any):string=>typeof n==='string'?n:n?.children?.map(text).join('')??'';
  const tree=()=>exports.ConnectionSettings({controller:c,busy:false,onSignOut:()=>calls.push('signout')});
  const actions=()=>nodes(tree()).filter(n=>n.type==='Action');
  const action=(label:string)=>{const found=actions().find(n=>text(n)===label);assert.ok(found,label);return found;};
  return{c,calls,action,nodes:()=>nodes(tree()),text:()=>text(tree())};
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


test('administration separates the two scopes and never invokes session or credential work on entry',()=>{
  const f=fixture();
  const groups=f.nodes().filter(n=>n.type==='Card');assert.equal(groups.length,2);
  assert.deepEqual(groups.map(n=>n.children.find((child:any)=>child?.type==='Section')?.props.title),['Anbietersitzung','Gespeicherte Zugangsdaten']);
  assert.match(f.text(),/Flüge bleiben/);assert.match(f.text(),/Andere Geräte/);assert.match(f.text(),/Es meldet dich nicht/);
  assert.deepEqual(f.calls,[]);assert.ok(!f.nodes().some(n=>n.type==='TextInput'));
  f.action('Gespeicherte Zugangsdaten verwalten').props.onPress();
  const inputs=f.nodes().filter(n=>n.type==='TextInput');assert.equal(inputs.length,2);assert.equal(inputs[1].props.secureTextEntry,true);
  f.c.clearing=true;assert.ok(f.nodes().filter(n=>n.type==='TextInput').every(n=>n.props.editable===false));
  f.c.clearing=false;f.action('Bearbeitung schließen').props.onPress();assert.ok(!f.nodes().some(n=>n.type==='TextInput'));assert.deepEqual(f.calls,[]);
});

test('unavailable session clearing has no control and notices stay next to their relevant scope',()=>{
  const f=fixture();f.c.sessionClearingAvailable=false;f.c.disconnectNotice='cancelled';f.c.credentialNotice='forgotten';
  assert.ok(!f.nodes().some(n=>n.type==='Action'&&n.children.includes('Lokale Anbietersitzung löschen')));
  assert.match(f.text(),/nicht verfügbar/);assert.match(f.text(),/Schließen allein meldet dich nicht ab/);assert.match(f.text(),/Anbietersitzung bleibt unabhängig/);
});

test('disabled provider administration explains the active operation without starting work',()=>{
  const f=fixture();
  for(const [key,copy] of [['clearing','Anbietersitzung wird gelöscht'],['binding','Kontozuordnung wird gespeichert'],['saving','Belege werden gespeichert'],['disconnecting','Abmeldung wird geprüft'],['loginBusy','Anmeldung wird versucht'],['busy','Datenvorgang läuft']] as const){
    f.c[key]=true;
    assert.match(f.text(),new RegExp(copy));
    const feedback=f.nodes().find(n=>n.props.accessibilityState?.busy===true);
    assert.equal(feedback?.props.accessibilityLiveRegion,'polite');
    assert.ok(f.nodes().filter(n=>n.type==='Action').every(n=>n.props.disabled===true));
    assert.deepEqual(f.calls,[]);
    f.c[key]=false;
  }
  f.c.restoring.current=true;assert.match(f.text(),/Anbieteransicht wird wiederhergestellt/);assert.deepEqual(f.calls,[]);
});

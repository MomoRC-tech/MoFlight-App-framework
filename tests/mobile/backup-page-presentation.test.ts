import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

interface Element { type: string; props: Record<string, any>; children: unknown[] }
const compile=(file:string)=>ts.transpileModule(readFileSync(new URL(`../../apps/platform-lab/src/mobile/${file}.tsx`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:false}}).outputText;
function fixture(){
  let index=0,tree:Element,verifyCalls=0,syncCalls=0,backCalls=0;
  const hooks:any[]=[],effects:(()=>void)[]=[],listeners=new Set<(state:string)=>void>();
  let finishVerify:()=>void=()=>{},deferred=false,reject=false;
  const appState={currentState:'active',addEventListener:(_:string,listener:(state:string)=>void)=>{listeners.add(listener);return {remove:()=>listeners.delete(listener)};}};
  const react={
    createElement:(type:string,props:any,...children:unknown[]):Element=>({type,props:props??{},children:children.flat(Infinity)}),
    useRef:(initial:unknown)=>{const i=index++;return hooks[i]??={current:initial};},
    useState:(initial:unknown)=>{const i=index++;if(!(i in hooks))hooks[i]=initial;return [hooks[i],(value:unknown)=>{hooks[i]=value;}];},
    useEffect:(effect:()=>unknown,deps:unknown[])=>{const i=index++,old=hooks[i];if(!old||deps.some((v,n)=>v!==old.deps[n])){hooks[i]={deps};effects.push(()=>{old?.cleanup?.();hooks[i].cleanup=effect();});}},
  };
  const modules:Record<string,unknown>={react:{default:react,...react},'react-native':{AppState:appState,Pressable:'Pressable',Text:'Text'},'./AppHeader':{AppHeader:'AppHeader'},'./SyncConfirmationDialog':{SyncConfirmationDialog:'SyncConfirmationDialog'},'./theme':{Label:'Label',colors:{cyan:'#27d3d2'}}};
  const api:any={};runInNewContext(compile('MaintenancePageHeader'),{exports:api,require:(name:string)=>{assert.ok(name in modules,name);return modules[name];}});
  const props={title:'Datensicherung',open:true,requestKey:'owner:store:1',busy:false,syncDisabled:false,onBack:()=>{backCalls++;},onRequestSync:()=>{syncCalls++;},verifySync:async()=>{verifyCalls++;if(deferred)await new Promise<void>(resolve=>{finishVerify=resolve;});if(reject)throw new Error('Foreign selection');}};
  function render(){index=0;tree=api.MaintenancePageHeader(props);while(effects.length)effects.shift()!();return tree;}
  function nodes(){const result:Element[]=[];function visit(n:any){if(n&&typeof n==='object'&&'children'in n){result.push(n);n.children.forEach(visit);}}visit(tree);return result;}
  const find=(type:string)=>nodes().find(n=>n.type===type)!;
  const open=()=>{find('Pressable').props.onPress();render();return find('SyncConfirmationDialog');};
  return {props,render,nodes,find,open,calls:()=>({verifyCalls,syncCalls,backCalls}),defer:()=>{deferred=true;},finish:()=>finishVerify(),reject:()=>{reject=true;},background:()=>{appState.currentState='background';listeners.forEach(listener=>listener('background'));},resume:()=>{appState.currentState='active';},dispose:()=>{for(const hook of hooks)hook?.cleanup?.();}};
}

test('backup header preserves Back and admits Sync only once after its current confirmation and owner check',async()=>{
  const f=fixture();try{
    f.render();f.find('AppHeader').props.back();assert.equal(f.calls().backCalls,1);
    const cancelled=f.open();assert.deepEqual(f.calls(),{verifyCalls:0,syncCalls:0,backCalls:1});
    cancelled.props.onCancel();f.render();cancelled.props.onConfirm();await new Promise(setImmediate);
    assert.equal(f.calls().verifyCalls,0);
    const current=f.open();cancelled.props.onConfirm();assert.equal(f.calls().verifyCalls,0);
    current.props.onConfirm();current.props.onConfirm();await new Promise(setImmediate);
    assert.equal(f.calls().verifyCalls,1);assert.equal(f.calls().syncCalls,1);
  }finally{f.dispose();}
});

test('changed selection, background, unmount and busy state revoke backup-header Sync admission',async()=>{
  for(const revoke of ['selection','background','unmount'] as const){
    const f=fixture();try{
      f.render();f.defer();f.open().props.onConfirm();assert.equal(f.calls().verifyCalls,1);
      if(revoke==='selection'){f.props.requestKey='another-owner:store:2';f.render();}
      else if(revoke==='background'){f.background();f.resume();}
      else f.dispose();
      f.finish();await new Promise(setImmediate);assert.equal(f.calls().syncCalls,0,revoke);
    }finally{f.dispose();}
  }
  const busy=fixture();try{busy.props.busy=true;busy.props.syncDisabled=true;busy.render();assert.equal(busy.find('AppHeader').props.backDisabled,true);assert.equal(busy.find('Pressable').props.disabled,true);busy.find('Pressable').props.onPress();assert.ok(!busy.nodes().some(n=>n.type==='SyncConfirmationDialog'));}finally{busy.dispose();}
  const foreign=fixture();try{foreign.render();foreign.reject();foreign.open().props.onConfirm();await new Promise(setImmediate);foreign.render();assert.equal(foreign.calls().syncCalls,0);assert.ok(foreign.nodes().some(n=>n.type==='Label'));}finally{foreign.dispose();}
});

test('restore dialog uses Cancel for system/outside dismissal and leaves the picker to explicit confirmation',()=>{
  let cancelled=0,confirmed=0;
  const react={createElement:(type:string,props:any,...children:unknown[])=>({type,props:props??{},children:children.flat(Infinity)}),useEffect:(effect:()=>void)=>effect()};
  const modules:Record<string,unknown>={react:{default:react,...react},'react-native':{Keyboard:{dismiss(){}},Modal:'Modal',Pressable:'Pressable',ScrollView:'ScrollView',Text:'Text',View:'View',StyleSheet:{absoluteFill:{},create:(styles:unknown)=>styles},useWindowDimensions:()=>({width:360,fontScale:1.6})},'./theme':{colors:{},ui:{}}};
  const api:any={};runInNewContext(compile('BackupRestoreConfirmationDialog'),{exports:api,require:(name:string)=>{assert.ok(name in modules,name);return modules[name];}});
  const tree=api.BackupRestoreConfirmationDialog({onCancel:()=>{cancelled++;},onConfirm:()=>{confirmed++;}});
  tree.props.onRequestClose();assert.equal(cancelled,1);assert.equal(confirmed,0);
  const nodes:Element[]=[];function visit(n:any){if(n&&typeof n==='object'&&'children'in n){nodes.push(n);n.children.forEach(visit);}}visit(tree);
  nodes.find(n=>n.type==='Pressable'&&n.props.accessible===false)!.props.onPress();assert.equal(cancelled,2);
  nodes.find(n=>n.props.accessibilityLabel==='Datei auswählen')!.props.onPress();assert.equal(confirmed,1);
});


test('maintenance header supports provider settings without changing the confirmed Sync contract',()=>{
  const f=fixture();try{f.props.title='Vereinsflieger-Einstellungen';f.render();assert.equal(f.find('AppHeader').props.title,'Vereinsflieger-Einstellungen');assert.deepEqual(f.calls(),{verifyCalls:0,syncCalls:0,backCalls:0});}finally{f.dispose();}
});


test('short decisions dismiss the caller keyboard once and keep stacked action order aligned with reading order', () => {
  for (const [component, confirmLabel] of [['SyncConfirmationDialog', 'Abruf starten'], ['BackupRestoreConfirmationDialog', 'Datei auswählen']] as const) {
    let dismissals = 0, cancelled = 0, confirmed = 0;
    const effects: (() => void)[] = [];
    const react = { createElement: (type: string, props: any, ...children: unknown[]) => ({ type, props: props ?? {}, children: children.flat(Infinity) }), useEffect: (effect: () => void) => effects.push(effect) };
    const modules: Record<string, unknown> = {
      react: { default: react, ...react },
      'react-native': { Keyboard: { dismiss: () => { dismissals++; } }, Modal: 'Modal', Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', View: 'View', StyleSheet: { absoluteFill: {}, create: (styles: unknown) => styles }, useWindowDimensions: () => ({ width: 360, fontScale: 1.6 }) },
      './theme': { colors: {}, ui: {} },
    };
    const api: any = {}; runInNewContext(compile(component), { exports: api, require: (name: string) => { assert.ok(name in modules, name); return modules[name]; } });
    const tree = api[component]({ onCancel: () => { cancelled++; }, onConfirm: () => { confirmed++; } });
    assert.equal(dismissals, 0); effects.forEach(effect => effect()); assert.equal(dismissals, 1);
    assert.equal(cancelled, 0); assert.equal(confirmed, 0);
    const nodes: Element[] = []; const visit = (node: any) => { if (node?.children) { nodes.push(node); node.children.forEach(visit); } }; visit(tree);
    const buttons = nodes.filter(node => node.type === 'Pressable' && node.props.accessibilityRole === 'button');
    assert.deepEqual(buttons.map(node => node.props.accessibilityLabel), [confirmLabel, 'Abbrechen']);
    const actions = nodes.find(node => node.type === 'View' && Array.isArray(node.props.style))!;
    assert.equal(actions.props.style[1].flexDirection, 'column');
    assert.ok(nodes.some(node => node.type === 'ScrollView'));
    buttons[1]!.props.onPress(); assert.equal(cancelled, 1); assert.equal(confirmed, 0);
    buttons[0]!.props.onPress(); assert.equal(confirmed, 1);
  }
});

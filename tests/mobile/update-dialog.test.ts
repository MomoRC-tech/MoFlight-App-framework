import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

test('update popup stays within safe bounds and keeps its native child parent across open/close and resizing', () => {
  let width=390,height=900;
  const insets={top:24,bottom:24,left:0,right:0};
  const browser={type:'retained-browser',props:{},children:[]};
  const react={createElement:(type:unknown,props:any,...children:any[])=>({type,props:props??{},children})};
  const modules:Record<string,unknown>={react:{default:react},'react-native':{Pressable:'Pressable',View:'View',StyleSheet:{absoluteFill:{position:'absolute'},create:(v:unknown)=>v},useWindowDimensions:()=>({width,height})},'react-native-safe-area-context':{useSafeAreaInsets:()=>insets},'./theme':{colors:{background:'#000d18'}}};
  const source=ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/mobile/UpdateDialog.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:false}}).outputText;
  const exports:any={};runInNewContext(source,{exports,require:(name:string)=>{assert.ok(name in modules,name);return modules[name];}});
  let suppliedTop=0;
  const child=(top:number)=>{suppliedTop=top;return browser;};
  for(const size of [[390,900],[360,900],[600,1100],[840,450]]){
    [width,height]=size as [number,number];
    for(const [open,expanded] of [[true,false],[true,true],[false,true],[true,true],[true,false]]){
      const tree=exports.UpdateDialog({open,expanded,children:child}),frame=tree.children[1],layout=frame.props.style[1];
      assert.equal(frame.children[0],browser,'Visibility never replaces or reparents the browser tree');
      assert.equal(frame.type,'View');assert.equal(frame.props.testID,'data-update-dialog');
      assert.equal(tree.props.pointerEvents,open?'auto':'none');assert.equal(tree.props.accessibilityViewIsModal,open);
      assert.equal(suppliedTop,layout.top,'Keyboard geometry receives the actual window offset');
      assert.ok(layout.left>=12&&layout.left+layout.width<=width-12);
      assert.ok(layout.top>=insets.top+12&&layout.top+layout.height<=height-insets.bottom-12);
      assert.ok(layout.width<=720&&layout.height<=900);
      if(!expanded)assert.ok(layout.height<=420,'Progress and results stay compact');
      if(expanded&&height===900)assert.ok(layout.height>420,'The same frame grows for the original login');
      assert.equal(tree.children[0].props.accessible,false,'Scrim has no extra dismiss action that could bypass save guards');
    }
    const page=exports.UpdateDialog({open:true,fullPage:true,children:child}),frame=page.children[1];
    assert.equal(frame.children[0],browser,'The full-page task retains the same native child');
    assert.equal(frame.type,'View');assert.equal(frame.props.testID,'backup-page-host');
    assert.equal(frame.props.style.flex,1);assert.equal(frame.props.style.borderRadius,undefined);
    assert.equal(suppliedTop,undefined,'A full page delegates system insets to its SafeAreaView');
    assert.equal(page.children[0],false,'A child page has no dimmed background/scrim');
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as model from '../../apps/platform-lab/src/mobile/own-flight-model.ts';
import * as review from '../../apps/platform-lab/src/vereinsflieger/capture-review.ts';
import { planFlightRetrieval } from '../../apps/platform-lab/src/vereinsflieger/retrieval-policy.ts';
import { dataFreshness } from '../../apps/platform-lab/src/mobile/data-freshness.ts';
import { ownFlightFixture } from './own-flight-fixture.ts';

interface Element {type:string;props:Record<string,any>;children:any[]}
const source=ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/mobile/OwnFlights.tsx',import.meta.url),'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:false},
}).outputText;
function fixture() {
  const f=ownFlightFixture(),data:any={view:{snapshot:f.snapshot,flights:f.flights,pendingCommand:false},phase:'ready',detail:null,detailBusy:false,clearDetail(){},reload(){},openDetail(){}};
  let index=0,active=true;const hooks:any[]=[],effects:(()=>void)[]=[],restores:number[]=[];
  const react={
    createElement:(type:string,props:Element['props'],...children:any[]):Element=>{
      if(type==='FlatList'&&props?.ref)props.ref.current={scrollToOffset:({offset}:{offset:number})=>restores.push(offset)};
      return{type,props:props??{},children:children.flat(Infinity)};
    },
    useState(initial:unknown){const i=index++;if(!(i in hooks))hooks[i]=initial;return[hooks[i],(next:unknown)=>{hooks[i]=next;}];},
    useRef(initial:unknown){const i=index++;if(!(i in hooks))hooks[i]={current:initial};return hooks[i];},
    useMemo(fn:()=>unknown){return fn();},useCallback(fn:unknown){return fn;},
    useEffect(fn:()=>void,deps:unknown[]){const i=index++;if(!hooks[i]||deps.some((v,n)=>v!==hooks[i][n])){hooks[i]=deps;effects.push(fn);}},
  };
  const leaves=(names:string[])=>Object.fromEntries(names.map(n=>[n,n]));
  const modules:Record<string,unknown>={react:{default:react,...react},'react-native':{
    ...leaves(['ActivityIndicator','FlatList','Pressable','ScrollView','TextInput','View']),Keyboard:{dismiss(){}},StyleSheet:{create:(x:unknown)=>x},useWindowDimensions:()=>({width:390,fontScale:1}),
  },'./theme':{...leaves(['Action','Card','Chip','Empty','GliderMark','IconLabel','Label','Section']),colors:{},ui:{}},'./SymbolIcon':leaves(['SymbolIcon']),
  './use-own-flights':{useOwnFlights:()=>data},'./own-flight-reader-native':{ownFlightReadPorts:{}},'./own-flight-model':model,
  '../vereinsflieger/retrieval-policy':{planFlightRetrieval},'./data-freshness':{dataFreshness},'../vereinsflieger/capture-review':review};
  const exports:any={};runInNewContext(source,{exports,require:(name:string)=>{assert.ok(name in modules,name);return modules[name];}});
  let tree:Element;const header=()=>{};
  function render(){index=0;tree=exports.OwnFlights({active,reloadKey:0,onUpdate:()=>false,onHeaderChange:header});effects.splice(0).forEach(fn=>fn());return tree;}
  function nodes(){const result:Element[]=[];const visit=(n:any)=>{if(n?.children){result.push(n);n.children.forEach(visit);if(n.type==='FlatList')visit(n.props.ListHeaderComponent);}};visit(tree);return result;}
  function find(type:string,label?:string){const node=nodes().find(n=>n.type===type&&(!label||n.props.accessibilityLabel===label));assert.ok(node,`${type} ${label}`);return node;}
  render();return{data,render,find,restores,setActive:(value:boolean)=>{active=value;render();}};
}
test('native zero-offset events while loading, hidden or inactive cannot erase the saved list return position',()=>{
  const f=fixture(),view=f.data.view;
  const scroll=(y:number)=>f.find('FlatList').props.onScroll({nativeEvent:{contentOffset:{y}}});
  const restore=()=>f.find('FlatList').props.onContentSizeChange();
  scroll(240);f.data.phase='loading';f.data.view=null;f.render();scroll(0);
  f.data.phase='ready';f.data.view=view;f.render();restore();assert.equal(f.restores.at(-1),240);
  f.find('Pressable','Flugfilter öffnen').props.onPress();f.render();scroll(0);restore();assert.equal(f.restores.at(-1),240);
  f.setActive(false);scroll(0);f.setActive(true);restore();assert.equal(f.restores.at(-1),240);
});
test('changing the search deliberately resets position and combines with the saved source projection',()=>{
  const f=fixture();f.find('FlatList').props.onScroll({nativeEvent:{contentOffset:{y:240}}});
  f.find('TextInput','Flüge durchsuchen').props.onChangeText('D-T001');f.render();
  assert.equal(f.restores.at(-1),0);assert.deepEqual(f.find('FlatList').props.data.map((x:any)=>x.flightId),['flight-1']);
});

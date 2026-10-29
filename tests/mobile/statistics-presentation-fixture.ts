import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
import * as model from '../../apps/platform-lab/src/mobile/statistics-charts-model';
import * as overlayModel from '../../apps/platform-lab/src/mobile/statistics-overlay-model';
import * as classification from '../../apps/platform-lab/src/mobile/flight-classification';
import * as flightRoles from '../../apps/platform-lab/src/mobile/flight-role-metric';
import { formatReportedMinutes } from '../../apps/platform-lab/src/mobile/real-flight-statistics';
export interface TestElement {type:any;props:Record<string,any>;children:any[]}
export function statisticsPresentation(file:'StatisticsCharts'|'StatisticsExplorer',props:Record<string,any>){
  let index=0;const hooks:any[]=[],events:string[]=[];
  const react={Fragment:'Fragment',createElement:(type:any,p:any,...children:any[]):TestElement=>({type,props:p??{},children:children.flat(Infinity)}),
    useState:(initial:any)=>{const i=index++;if(!(i in hooks))hooks[i]=typeof initial==='function'?initial():initial;return[hooks[i],(v:any)=>{hooks[i]=typeof v==='function'?v(hooks[i]):v;}];},
    useEffect:()=>{index++;},useMemo:(fn:()=>any)=>{index++;return fn();},useRef:(initial:any)=>{const i=index++;if(!(i in hooks))hooks[i]={current:initial};return hooks[i];}};
  const leaves=(names:string[])=>Object.fromEntries(names.map(n=>[n,n]));
  const modules:Record<string,any>={react:{...react,default:react},'react-native':{...leaves(['Pressable','ScrollView','View','Modal','TextInput','KeyboardAvoidingView']),useWindowDimensions:()=>({fontScale:props.fontScale??1,width:390,height:900}),Platform:{OS:'android'},StyleSheet:{create:(s:any)=>s},Keyboard:{dismiss:()=>events.push('keyboard-dismiss')}},
    './theme':{...leaves(['Action','Card','Chip','Label']),colors:{cyan:'#69e5ed',raised:'#1a4356',text:'#f4f8fc',muted:'#acc5d2',background:'#001b29',border:'#31586b'},ui:{row:{flexDirection:'row'}}},
    './SymbolIcon':leaves(['SymbolIcon']),'./StatisticsCharts':leaves(['StatisticsCharts']),'./statistics-charts-model':model,'./statistics-overlay-model':overlayModel,'./flight-role-metric':flightRoles,'./flight-classification':classification,'./real-flight-statistics':{formatReportedMinutes}};
  const source=ts.transpileModule(readFileSync(new URL(`../../apps/platform-lab/src/mobile/${file}.tsx`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:false}}).outputText;
  const exports:any={};runInNewContext(source,{exports,require:(name:string)=>{assert.ok(name in modules,name);return modules[name];}});
  const render=()=>{index=0;return exports[file](props) as TestElement;};
  const nodes=()=>{const result:TestElement[]=[];const visit=(n:any)=>{if(!n?.children)return;if(n.type==='Modal'&&!n.props.visible)return;result.push(n);n.children.forEach(visit);};visit(render());return result;};
  return{props,render,nodes,events,action:(text:string)=>nodes().find(n=>n.type==='Action'&&n.children.join('')===text)!,press:(label:string)=>nodes().find(n=>n.props.accessibilityLabel===label)!};
}

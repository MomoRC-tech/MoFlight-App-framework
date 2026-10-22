import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import type { ClubInformationProps } from '../../apps/platform-lab/src/mobile/ClubInformation';
type Element = {type:unknown;props:Record<string,any>;children:any[]};
const source=ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/mobile/ClubInformation.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
function fixture(){
 const react={createElement:(type:any,props:any,...children:any[]):Element=>typeof type==='function'?type({...props,children}):({type,props:props??{},children:children.flat(Infinity)})};
 const exports:Record<string,(props:ClubInformationProps)=>Element>={};
 const modules:Record<string,unknown>={react:{default:react,...react},'react-native':{View:'View',StyleSheet:{create:(x:unknown)=>x}},'./theme':{Card:'Card',Label:'Label',Section:'Section',colors:{border:'border',cyan:'cyan'}}};
 runInNewContext(source,{exports,require:(id:string)=>modules[id]});
 const nodes=(n:any):Element[]=>!n||typeof n!=='object'?[]:[n,...(n.children??[]).flatMap(nodes)];
 const text=(n:any):string=>typeof n==='string'||typeof n==='number'?String(n):(n?.children??[]).map(text).join(' ');
 return {exports,nodes,text};
}
function information(){return {events:{status:'partial' as const,retrievedAt:'2026-10-22T12:00:00.000Z',filters:['Ab 22.10.2026','Ansicht: 3 Monate'],truncated:true,items:Array.from({length:3},(_,i)=>({key:String(i),date:'26.10.2026',time:'Ganztags',kind:'Termine',title:'Synthetic event '+i,location:i?'Synthetic field':null}))},documentNotices:{status:'partial' as const,retrievedAt:'2026-10-22T12:00:00.000Z',filters:[],truncated:false,items:[{key:'document',text:'Synthetic document 22.10.2026'}]}};}
test('compact events retain source filters/age/partial warning and expose full view without claiming upcoming completeness',()=>{
 const f=fixture();let opened=0;const view=f.exports.ClubEvents!({information:information(),compact:true,onOpen:()=>opened++});const text=f.text(view);
 assert.match(text,/Synthetic event 0/);assert.match(text,/Synthetic event 1/);assert.doesNotMatch(text,/Synthetic event 2/);assert.match(text,/2\s+von\s+3/);assert.match(text,/Seitenausschnitt/);assert.match(text,/Erfassungslimit/);assert.match(text,/Ab 22.10.2026/);assert.match(text,/Ansicht: 3 Monate/);assert.match(text,/2026-10-22 12:00:00 UTC/);
 f.nodes(view).find(n=>n.type==='Section')!.props.onPress();assert.equal(opened,1);
 assert.match(f.text(f.exports.ClubEvents!({information:information()})),/Synthetic event 2/);
});
test('missing or unreadable sources stay unknown; stale document text remains labelled and no download/news action is invented',()=>{
 const f=fixture();
 for(const name of ['ClubEvents','ClubDocumentNotices']){
  const missing=f.text(f.exports[name]!({readFailed:true}));assert.match(missing,/unbekannt/);assert.match(missing,/Laden fehlgeschlagen/);assert.doesNotMatch(missing,/Keine Termine|Keine Hinweise/);
 }
 const view=f.exports.ClubDocumentNotices!({information:information(),readFailed:true});const text=f.text(view);
 assert.match(text,/Synthetic document 22.10.2026/);assert.match(text,/zuletzt geladene Stand/);assert.match(text,/Seitenausschnitt/);assert.doesNotMatch(text,/News|Download/);
 assert.equal(f.nodes(view).find(n=>n.type==='Section')!.props.title,'Dokumentenhinweise');
 assert.equal(f.nodes(view).filter(n=>n.props.onPress).length,0);
});

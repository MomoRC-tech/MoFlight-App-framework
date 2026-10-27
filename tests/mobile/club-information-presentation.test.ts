import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import type { ClubInformationProps } from '../../apps/platform-lab/src/mobile/ClubInformation';
type Element = {type:unknown;props:Record<string,any>;children:any[]};
const source=ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/mobile/ClubInformation.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
function fixture(){
 let expanded=false;
 const react={Fragment:'Fragment',useState:()=>[expanded,(value:boolean)=>{expanded=value;}],createElement:(type:any,props:any,...children:any[]):Element=>typeof type==='function'?type({...props,children}):({type,props:props??{},children:children.flat(Infinity)})};
 const exports:Record<string,(props:ClubInformationProps)=>Element>={};
 const modules:Record<string,unknown>={react:{default:react,...react},'react-native':{View:'View',Pressable:'Pressable',StyleSheet:{create:(x:unknown)=>x}},'./SymbolIcon':{SymbolIcon:'SymbolIcon'},'./theme':{Card:'Card',Label:'Label',Section:'Section',colors:{border:'border',cyan:'cyan'}}};
 runInNewContext(source,{exports,require:(id:string)=>modules[id]});
 const nodes=(n:any):Element[]=>!n||typeof n!=='object'?[]:[n,...(n.children??[]).flatMap(nodes)];
 const text=(n:any):string=>typeof n==='string'||typeof n==='number'?String(n):(n?.children??[]).map(text).join(' ');
 return {exports,nodes,text};
}
function information(){return {events:{status:'partial' as const,retrievedAt:'2026-10-22T12:00:00.000Z',filters:['Ab 22.10.2026','Ansicht: 3 Monate'],truncated:true,items:Array.from({length:3},(_,i)=>({key:String(i),date:'26.10.2026',time:'Ganztags',kind:'Termine',title:'Synthetic event '+i,location:i?'Synthetic field':null}))},documentNotices:{status:'partial' as const,retrievedAt:'2026-10-22T12:00:00.000Z',filters:[],truncated:false,items:[{key:'document',text:'Synthetic document 22.10.2026'}]},workSummary:{status:'partial' as const,retrievedAt:'2026-10-22T12:00:00.000Z',filters:['Jahr 2026'],truncated:true,items:Array.from({length:3},(_,i)=>({key:'work-'+i,period:String(2026-i),obligation:i?'0,00 €':'90,00 €',performed:i?'0,00 €':'21,50 €',hours:i?'0':'07:25'}))},workHours:{status:'partial' as const,retrievedAt:'2026-10-22T12:00:00.000Z',filters:['Jahr 2026'],truncated:true,items:[{key:'entry-1',date:'22.10.2026',activity:'Synthetic maintenance',hours:'02:30',status:'Erfasst',category:'Werkstatt'},{key:'entry-2',date:'21.10.2026',activity:'Synthetic tow',hours:'00:45',status:'Offen'}]},tasks:{status:'partial' as const,retrievedAt:'2026-10-22T12:00:00.000Z',filters:['Meine nicht beendeten Aufgaben'],truncated:true,empty:false,items:Array.from({length:3},(_,i)=>({key:'task-'+i,title:'Synthetic task '+i,due:'31.10.2026',days:'9',status:'Offen',priority:'Hoch'}))}};}
test('compact events retain source filters/age/partial warning and expose full view without claiming upcoming completeness',()=>{
 const f=fixture();let opened=0;let view=f.exports.ClubEvents!({information:information(),compact:true,onOpen:()=>opened++});
 assert.doesNotMatch(f.text(view),/Ansicht: 3 Monate/);
 f.nodes(view).find(n=>n.props.accessibilityLabel==='Quellendetails')!.props.onPress();
 view=f.exports.ClubEvents!({information:information(),compact:true,onOpen:()=>opened++});const text=f.text(view);
 assert.match(text,/Synthetic event 0/);assert.match(text,/Synthetic event 1/);assert.doesNotMatch(text,/Synthetic event 2/);assert.match(text,/2\s+von\s+3/);assert.match(text,/Seitenausschnitt/);assert.match(text,/Erfassungslimit/);assert.match(text,/Ab 22.10.2026/);assert.match(text,/Ansicht: 3 Monate/);assert.match(text,/2026-10-22 12:00:00 UTC/);
 f.nodes(view).find(n=>n.type==='Section')!.props.onPress();assert.equal(opened,1);
 assert.match(f.text(f.exports.ClubEvents!({information:information()})),/Synthetic event 2/);
});
test('events label only a confirmed empty selection as an empty excerpt',()=>{
 const f=fixture(),data=information();
 const empty={...data,events:{status:'partial' as const,retrievedAt:'2026-10-23T12:00:00.000Z',filters:['Ab 23.10.2026','Ansicht: 1 Tag'],truncated:false,empty:true,items:[]}};
 const text=f.text(f.exports.ClubEvents!({information:empty}));
 assert.match(text,/Keine Termine im erfassten Kalenderausschnitt/);assert.match(text,/Vollständigkeit ungeprüft/);assert.doesNotMatch(text,/Ab 23\.10\.2026/);assert.doesNotMatch(text,/unbekannt\. Noch kein unterstützter Kalenderauszug/);
 const unknown=f.text(f.exports.ClubEvents!({readFailed:true}));assert.match(unknown,/Termine unbekannt/);assert.doesNotMatch(unknown,/Keine Termine im erfassten Kalenderausschnitt/);
});
test('missing or unreadable sources stay unknown; stale document text remains labelled and no download/news action is invented',()=>{
 const f=fixture();
 for(const name of ['ClubEvents','ClubDocumentNotices']){
  const missing=f.text(f.exports[name]!({readFailed:true}));assert.match(missing,/unbekannt/);assert.match(missing,/Laden fehlgeschlagen/);assert.doesNotMatch(missing,/Keine Termine|Keine Hinweise/);
 }
 const view=f.exports.ClubDocumentNotices!({information:information(),readFailed:true});const text=f.text(view);
 assert.match(text,/Synthetic document 22.10.2026/);assert.match(text,/zuletzt geladene Stand/);assert.match(text,/Seitenausschnitt/);assert.doesNotMatch(text,/News|Download/);
 assert.equal(f.nodes(view).find(n=>n.type==='Section')!.props.title,'Dokumentenhinweise');
 assert.equal(f.nodes(view).filter(n=>n.props.onPress).length,1);
 assert.equal(f.nodes(view).find(n=>n.props.accessibilityLabel==='Quellendetails')!.props.accessibilityState.expanded,false);
});

test('annual work rows preserve the displayed currency and hours values without deriving ratios',()=>{
 const f=fixture(),data=information();
 const compact=f.exports.ClubWorkSummary!({information:data,compact:true,onOpen:()=>{}}),text=f.text(compact);
 assert.match(text,/90,00 €/);assert.match(text,/21,50 €/);assert.match(text,/07:25/);assert.match(text,/2026/);assert.match(text,/2\s+von\s+3\s+erfassten Jahreszeilen/);
 assert.match(text,/Pflicht · EUR/);assert.match(text,/Geleistet · EUR/);assert.match(text,/Geleistet · Stunden/);assert.doesNotMatch(text,/Jahr 2026/);assert.match(text,/Vollständigkeit ungeprüft/);
 assert.doesNotMatch(text,/%|Quote|Verhältnis/);
 assert.doesNotMatch(text,/Synthetic maintenance/);assert.equal(f.nodes(compact).some(n=>n.type==='Section'&&n.props.title==='Erfasste Arbeitsstunden'),false);
 const fullNode=f.exports.ClubWorkSummary!({information:data});const full=f.text(fullNode);assert.match(full,/2024/);assert.match(full,/0,00 €/);assert.match(full,/Geleistet · Stunden\s*0/);assert.equal(f.nodes(fullNode).some(n=>n.type==='Section'&&n.props.title==='Erfasste Arbeitsstunden'),true);assert.match(full,/22\.10\.2026/);assert.match(full,/Synthetic maintenance/);assert.match(full,/Stunden\s*02:30/);assert.match(full,/Status\s*Erfasst/);assert.match(full,/Kategorie\s*Werkstatt/);assert.match(full,/Synthetic tow/);assert.match(full,/Status\s*Offen/);assert.doesNotMatch(full,/Summe|Gesamtstunden/);
 const stale=f.text(f.exports.ClubWorkSummary!({information:data,readFailed:true}));assert.match(stale,/Synthetic maintenance/);assert.match(stale,/zuletzt geladene Stand/);
});

test('own tasks show only captured rows and distinguish a verified empty excerpt from unavailable data',()=>{
 const f=fixture(),data=information();
 const compact=f.exports.ClubOwnTasks!({information:data,compact:true,onOpen:()=>{}}),text=f.text(compact);
 assert.match(text,/Synthetic task 0/);assert.match(text,/Synthetic task 1/);assert.doesNotMatch(text,/Synthetic task 2/);
 assert.match(text,/2\s+von\s+3\s+erfassten Aufgaben/);assert.doesNotMatch(text,/Meine nicht beendeten Aufgaben/);assert.ok(f.nodes(compact).some(n=>n.props.accessibilityLabel==='Quellendetails'));assert.match(text,/Seitenausschnitt/);assert.match(text,/Zu erledigen bis:\s*31\.10\.2026/);assert.match(text,/Status:\s*Offen/);assert.match(text,/Anzahl Tage:\s*9/);assert.match(text,/Priorität:\s*Hoch/);
 const empty={...data,tasks:{status:'partial' as const,retrievedAt:'2026-10-22T12:00:00.000Z',filters:['Meine nicht beendeten Aufgaben'],truncated:false,empty:true,items:[]}};
 const emptyText=f.text(f.exports.ClubOwnTasks!({information:empty}));assert.match(emptyText,/Keine eigenen offenen Aufgaben im erfassten Quellenausschnitt/);assert.match(emptyText,/Vollständigkeit ungeprüft/);
 const failed=f.text(f.exports.ClubOwnTasks!({information:empty,readFailed:true}));assert.match(failed,/zuletzt geladene Stand/);
 const missing=f.text(f.exports.ClubOwnTasks!({information:null}));assert.match(missing,/Eigene offene Aufgaben unbekannt/);assert.doesNotMatch(missing,/Keine eigenen offenen Aufgaben/);
});


test('full club pages disclose source detail on demand while keeping caveats and full captured content visible',()=>{
 for(const name of ['ClubEvents','ClubDocumentNotices','ClubWorkSummary','ClubOwnTasks']){
  const f=fixture(),data=information();
  let view=f.exports[name]!({information:data,readFailed:true});
  assert.match(f.text(view),/Vollständigkeit ungeprüft/);
  assert.match(f.text(view),/zuletzt geladene Stand/);
  assert.doesNotMatch(f.text(view),/2026-10-22 12:00:00 UTC/);
  let disclosure=f.nodes(view).find(n=>n.props.accessibilityLabel==='Quellendetails')!;
  assert.equal(disclosure.props.accessibilityState.expanded,false);
  disclosure.props.onPress();
  view=f.exports[name]!({information:data,readFailed:true});
  assert.match(f.text(view),/2026-10-22 12:00:00 UTC/);
  disclosure=f.nodes(view).find(n=>n.props.accessibilityLabel==='Quellendetails')!;
  assert.equal(disclosure.props.accessibilityState.expanded,true);
  disclosure.props.onPress();
  view=f.exports[name]!({information:data});
  assert.doesNotMatch(f.text(view),/2026-10-22 12:00:00 UTC/);
 }
 const f=fixture(),view=f.exports.ClubWorkSummary!({information:information()});
 const cards=f.nodes(view).filter(n=>n.type==='Card');
 assert.equal(cards.length,2);
 assert.match(f.text(cards[0]),/07:25/);assert.doesNotMatch(f.text(cards[0]),/Synthetic maintenance/);
 assert.match(f.text(cards[1]),/Synthetic maintenance/);assert.doesNotMatch(f.text(cards[1]),/Pflicht · EUR/);
});

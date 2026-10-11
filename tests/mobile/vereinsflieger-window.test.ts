import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {nodeDriver} from './sqlite-driver.ts';
import {FLIGHT_URL,REQUIRED_HEADERS} from '../../apps/platform-lab/src/vereinsflieger/probe.ts';
import {CAPTURE_SCHEMA} from '../../apps/platform-lab/src/vereinsflieger/capture-store.ts';
import {RUN_SCHEMA} from '../../apps/platform-lab/src/vereinsflieger/capture-run.ts';
import type {ObservedContext} from '../../apps/platform-lab/src/vereinsflieger/context.ts';
import {appendWindow,createWindow,dateKey,decodeWindow,latestWindow,persistWindow,resumeWindow,validateWindow,validateWindowPage,windowProgress,windowScript,WINDOW_SCHEMA,type WindowPage} from '../../apps/platform-lab/src/vereinsflieger/window.ts';
import {WINDOW_SELECTION_SOURCE,validateSelection,submitWindowScript} from '../../apps/platform-lab/src/vereinsflieger/window-selection.ts';
const at='2026-10-11T10:00:00.000Z', later='2026-10-11T10:01:00.000Z', nonce='synthetic-window';
const context:ObservedContext={accountNumber:'12345',clubLabel:'Synthetic club',clubIdentity:'display-label-only',verification:'observed-profile-number'};
const scope={from:'2026-01-01',through:'2026-12-31',participation:'pilot-or-companion' as const};
const headers=[...REQUIRED_HEADERS],values=['11.10.2026','D-TEST','10:00','10:06','6'];
const detail=(id:string)=>`https://vereinsflieger.de/member/profile/viewflight.php?flid=${id}`;
const row=(id:string,linked=true)=>({domId:'row'+id,detailUrl:linked?detail(id):null,values:[...values]});
function first():WindowPage{return {url:FLIGHT_URL,observedAt:at,scope,headers,rows:[row('11'),row('22',false)],page:1,first:1,last:2,total:3,next:FLIGHT_URL+'?page=2',emptyEvidence:false,filtersClear:true};}
function second():WindowPage{return {...first(),url:FLIGHT_URL+'?page=2',observedAt:later,rows:[row('33')],page:2,first:3,last:3,next:null};}
function message(page:WindowPage,extra={}){return JSON.stringify({kind:'vf-window-v1',nonce,url:page.url,page,...extra});}

test('record coverage includes rows without detail permission and never invents detail links',()=>{
  const a=createWindow(nonce,context,first(),at),b=appendWindow(a,context,second(),later);
  assert.deepEqual(windowProgress(a),{state:'partial',records:2,total:3,detailLinks:1,detailGaps:1});
  assert.deepEqual(windowProgress(b),{state:'complete-observed-window',records:3,total:3,detailLinks:2,detailGaps:1});
  assert.equal(b.sourceIdentity,'unverified');assert.equal(b.timeBasis,'unknown');assert.equal(b.pages[0]!.rows[1]!.detailUrl,null);
  assert.deepEqual(b.pages.map(p=>p.observedAt),[at,later]);
});
test('gaps, repeated references, count/column/scope changes and forged next links cannot advance coverage',()=>{
  const a=createWindow(nonce,context,first(),at);
  for(const p of [{...second(),first:2}, {...second(),rows:[row('11')]},{...second(),total:4,next:FLIGHT_URL+'?page=3'}, {...second(),headers:[...headers,'PIC'],rows:[{...row('33'),values:[...values,'']} ]},{...second(),scope:{...scope,from:'2026-02-01'}},{...second(),url:FLIGHT_URL+'?page=9'}])assert.throws(()=>appendWindow(a,context,p,later));
  for(const next of ['https://evil.test/member/profile/flightlog.php?page=2',FLIGHT_URL+'?page=2&delete=1',FLIGHT_URL+'?page=2#x',FLIGHT_URL+'?page=3'])assert.throws(()=>validateWindowPage({...first(),next}));
  assert.throws(()=>appendWindow(a,{...context,accountNumber:'54321'},second(),later));
  assert.throws(()=>createWindow(nonce,context,second(),later));
  assert.deepEqual(windowProgress(a),{state:'partial',records:2,total:3,detailLinks:1,detailGaps:1});
});
test('calendar boundaries are inclusive and malformed/empty record lists cannot pass vacuous equality',()=>{
  assert.equal(dateKey('29.02.2024'),'2024-02-29');assert.throws(()=>dateKey('29.02.2026'));assert.throws(()=>dateKey('31.04.2026'));
  const p={...first(),scope:{...scope,from:'2026-10-11',through:'2026-10-11'}};assert.equal(validateWindowPage(p).rows.length,2);
  assert.throws(()=>validateWindowPage({...p,scope:{...scope,from:'2026-10-12'}}));
  for(const change of [{rows:[]},{rows:[{...row('11'),domId:''},row('22')]},{rows:[{...row('11'),detailUrl:detail('99')},row('22')]},{rows:[row('11'),row('11')]},{filtersClear:false}])assert.throws(()=>validateWindowPage({...first(),...change}));
  const empty={...first(),rows:[],total:0,first:0,last:0,next:null,emptyEvidence:true};
  assert.equal(windowProgress(createWindow(nonce,context,empty,at)).state,'complete-observed-window');
  assert.throws(()=>validateWindowPage({...empty,emptyEvidence:false}));assert.throws(()=>validateWindowPage({...empty,next:FLIGHT_URL+'?page=2'}));
});
test('origin-only Android bridge still requires exact current query, nonce and a native observation timestamp',()=>{
  assert.equal(decodeWindow(message(second()),'https://vereinsflieger.de/',second().url,nonce,later).observedAt,later);
  for(const [sender,doc,n] of [['https://evil.test/',second().url,nonce],['https://vereinsflieger.de/',FLIGHT_URL,nonce],['https://vereinsflieger.de/',second().url,'stale']])assert.throws(()=>decodeWindow(message(second()),sender!,doc!,n!,later));
  assert.throws(()=>decodeWindow(message(first(),{error:'incomplete-page'}),FLIGHT_URL,FLIGHT_URL,nonce,at));
});

function reader(options:{empty?:boolean;ready?:string;role?:string;activeFilter?:boolean;rowCount?:number;footer?:string;iframe?:boolean;badLink?:boolean}={}){
  const messages:string[]=[];const cell=(s:string,tag='TD')=>({innerText:s,textContent:s,tagName:tag});
  const heading={cells:headers.map(h=>cell(h,'TH')),classList:{contains:()=>false}};
  const body=(options.empty?[]:[row('11'),row('22',false)]).slice(0,options.rowCount??2).map(r=>({id:r.domId,cells:r.values.map(v=>cell(v)),classList:{contains:(s:string)=>s==='selectable'},querySelectorAll:()=>r.detailUrl?[{getAttribute:()=>options.badLink?'https://evil.test/member/profile/viewflight.php?flid=11':r.detailUrl}]:[]}));
  const doc={readyState:options.ready??'complete',querySelectorAll:(s:string):unknown[]=>{
    if(s==='#tablelist_20')return [{rows:[heading,...body]}];
    if(s==='#globalfilter')return [cell('ab 01.01.2026 bis 31.12.2026')];
    if(s==='#globalfilter2')return [cell(options.role??'Pilot oder Begleiter')];
    if(s==='.footer.f1')return [cell(options.footer??(options.empty?'Es wurden keine passenden Daten gefunden!':'Datensatz 1 bis 2 von 3'))];
    if(s==='#frmfilter')return [{querySelectorAll:(q:string)=>q.includes('text')?[{value:options.activeFilter?'D-TEST':''}]:[{name:'col11_all',checked:true}]}];
    if(s==='.footer.f2 span.pagebrowser')return options.empty?[]:[cell('1')];
    if(s==='.footer.f2 a.pagebrowser[href]')return [{...cell('2'),getAttribute:()=>'?page=2'}];
    throw new Error('Unexpected DOM read: '+s);
  }};
  const window:any={ReactNativeWebView:{postMessage:(data:string)=>messages.push(data)}};window.top=options.iframe?{}:window;
  runInNewContext(windowScript(nonce),{window,document:doc,location:new URL(FLIGHT_URL),URL});return messages[0]!;
}
test('standalone DOM reader preserves linkless rows and explicitly declared empty windows',()=>{
  const page=decodeWindow(reader(),FLIGHT_URL,FLIGHT_URL,nonce,at);assert.deepEqual(page,first());
  const empty=decodeWindow(reader({empty:true}),FLIGHT_URL,FLIGHT_URL,nonce,at);assert.equal(empty.total,0);assert.equal(empty.emptyEvidence,true);
  const foreign=decodeWindow(reader({badLink:true}),FLIGHT_URL,FLIGHT_URL,nonce,at);assert.equal(foreign.rows[0]!.detailUrl,null);
});
test('partial rendering, filtered scopes, wrong participation and count disagreement cannot look empty/complete',()=>{
  for(const options of [{ready:'loading'},{role:'Pilot'},{activeFilter:true},{iframe:true},{rowCount:1},{empty:true,footer:'0 Datensätze'},{footer:'Es wurden keine passenden Daten gefunden!'}])assert.throws(()=>decodeWindow(reader(options),FLIGHT_URL,FLIGHT_URL,nonce,at));
});
test('disk checkpoint resumes only unchanged tail evidence and preserves earlier pages on stale/malformed writes',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'moflight-window-'));let db=nodeDriver(join(dir,'capture.sqlite'));
  try{await db.exec(CAPTURE_SCHEMA+';'+RUN_SCHEMA+WINDOW_SCHEMA);const a=createWindow(nonce,context,first(),at);await persistWindow(db,a);await persistWindow(db,a);await db.close();db=nodeDriver(join(dir,'capture.sqlite'));const restored=(await latestWindow(db))!;
    assert.equal(resumeWindow(restored,context,{...first(),observedAt:later}),first().next);
    assert.throws(()=>resumeWindow(restored,context,{...first(),rows:[{...row('11'),values:values.map(v=>v==='6'?'7':v)},row('22',false)]}));
    assert.throws(()=>resumeWindow(restored,{...context,clubLabel:'Other synthetic club'},first()));
    const b=appendWindow(restored,context,second(),later);await persistWindow(db,b);
    await assert.rejects(persistWindow(db,{...b,revision:3}));await assert.rejects(persistWindow(db,{...b,pages:[{...first(),rows:[row('44'),row('22',false)]},second()]}));
    assert.deepEqual(await latestWindow(db),b);assert.throws(()=>validateWindow({...b,sourceIdentity:'verified'}));
    await db.run('UPDATE capture_windows SET revision=99 WHERE id=? AND revision=2',nonce);await assert.rejects(latestWindow(db),/identity mismatch/);
  }finally{await db.close();await rm(dir,{recursive:true,force:true});}
});
test('page bound remains partial with observed outstanding link rather than claiming full history',()=>{
  let r=createWindow(nonce,context,{...first(),rows:[row('1')],first:1,last:1,total:101,next:FLIGHT_URL+'?page=2'},at);
  for(let i=2;i<=100;i++)r=appendWindow(r,context,{...first(),url:FLIGHT_URL+'?page='+i,rows:[row(String(i))],page:i,first:i,last:i,total:101,next:FLIGHT_URL+'?page='+(i+1)},at);
  assert.equal(windowProgress(r).state,'bounded-limit');assert.equal(windowProgress(r).records,100);assert.equal(resumeWindow(r,context,r.pages.at(-1)!),null);
});
test('automatic selection follows the observed inclusive-role link and rejects unrelated form actions',()=>{
  const target=FLIGHT_URL+'?_params=synthetic-observed-action';const window:any={};window.top=window;
  const document={readyState:'complete',querySelectorAll:(s:string)=>s==='#globalfilter2'?[{textContent:'Pilot'}]:[{textContent:'Pilot oder Begleiter',getAttribute:()=>target}]};
  const selection=JSON.parse(JSON.stringify(runInNewContext(`(${WINDOW_SELECTION_SOURCE})()`,{window,document,location:new URL(FLIGHT_URL),URL})));
  assert.deepEqual(validateSelection(selection,FLIGHT_URL),{action:'participation',target});
  for(const url of ['https://evil.test/member/profile/flightlog.php',detail('11'),'http://vereinsflieger.de/member/profile/flightlog.php'])assert.throws(()=>validateSelection({action:'dates',target:url},FLIGHT_URL));
});
test('automatic dates use the original form submit control without reading credentials or bypassing its handler',()=>{
  const target=FLIGHT_URL+'?_params=synthetic-observed-action',events:string[]=[],messages:string[]=[];let clicks=0;
  const window:any={ReactNativeWebView:{postMessage:(s:string)=>messages.push(s)}};window.top=window;
  const control=(value:string)=>({value,closest:()=>form,dispatchEvent:(e:{type:string})=>events.push(e.type)});
  const start=control(''),end=control(''),range={...control(''),options:[{value:'date'}]};
  const submit={click:()=>{clicks++;assert.equal(start.value,'01.01.2026');assert.equal(end.value,'31.12.2026');assert.equal(range.value,'date');}};
  const form={method:'post',getAttribute:()=>target,querySelectorAll:(s:string)=>{assert.equal(s,'input[type="submit"]');return [submit];}};
  const document={readyState:'complete',querySelector:(s:string)=>{if(s==='#startdate')return start;if(s==='#enddate')return end;if(s==='#daterange')return range;throw new Error('Unexpected private field read');}};
  class Event{constructor(public type:string,public options:unknown){}}
  runInNewContext(submitWindowScript(scope,target,nonce),{window,document,location:new URL(FLIGHT_URL),URL,Event});
  assert.equal(clicks,1);assert.deepEqual(events,['change','input','change','input','change']);assert.equal(messages.length,0);
  runInNewContext(submitWindowScript(scope,FLIGHT_URL+'?_params=changed',nonce),{window,document,location:new URL(FLIGHT_URL),URL,Event});assert.equal(clicks,1);assert.equal(JSON.parse(messages[0]!).kind,'vf-window-submit-error');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { acceptExportMessage, beginExport, calendarYearRequest, EXPORT_PHASES, EXPORT_PRESET, exportScript, PARTICIPATION, type ExportRun } from '../../apps/platform-lab/src/vereinsflieger/export.ts';
import { FLIGHT_URL, LOGIN_URL, validateCapture } from '../../apps/platform-lab/src/vereinsflieger/probe.ts';
import { persistCapture, readLatestCapture } from '../../apps/platform-lab/src/vereinsflieger/capture-store.ts';
import { inspectFields } from '../../apps/platform-lab/src/vereinsflieger/fields.ts';

const request = { from: '2026-01-01', to: '2026-12-31' }, token = 'command-1';
const headers = ['', 'Datum', 'Lfz.', 'Start', 'Landung', 'Flugzeit', 'Eigene Kosten(Bezahlt)', 'Duplikat', ...Array.from({length:40},(_,i)=>`Optional ${i}`)];
const columnIds = headers.map((_,i)=>String(i+1));
const row = (id: string) => ({sourceFlightId:id,values:headers.map(h=>h==='Datum'?'11.10.2026':h==='Eigene Kosten(Bezahlt)'?'12,34':h==='Duplikat'?'Ja':'')});
function reading(): ExportRun { const run=beginExport(request);run.phase='read';return run; }
function payload(overrides: Record<string,unknown> = {}) { return JSON.stringify({kind:'vf-export-v1',token,phase:'read',url:FLIGHT_URL,status:'page',preset:EXPORT_PRESET,accountLabel:'Synthetic account',period:'ab 01.01.2026 bis 31.12.2026',participation:PARTICIPATION,filtersClear:true,allColumns:true,headers,columnIds,rows:[row('1')],first:1,last:1,total:1,nextUrl:null,...overrides}); }
const accept = (run:ExportRun, data=payload(), sender=LOGIN_URL, url=FLIGHT_URL) => acceptExportMessage(run,data,sender,url,token);

test('explicit dates reject impossible/reversed periods; calendar default uses device year',()=>{
  assert.deepEqual(calendarYearRequest(new Date(2026,9,11)),request);
  for (const r of [{from:'2026-02-30',to:'2026-03-01'},{from:'2026-12-31',to:'2026-01-01'},{from:'2026-1-1',to:'2026-12-31'}]) assert.throws(()=>beginExport(r));
});
test('48-column multi-page capture retains costs, provider duplicate flags and all rows',()=>{
  const run=reading();
  const first=accept(run,payload({total:2,nextUrl:FLIGHT_URL+'?page=2'}));assert.equal(first.nextUrl,FLIGHT_URL+'?page=2');assert.equal(first.complete,undefined);
  const snapshot=accept(run,payload({rows:[row('2')],first:2,last:2,total:2})).complete!;
  assert.equal(snapshot.rows.length,2); assert.equal(snapshot.headers.length,48);assert.equal(snapshot.coverage,'complete-requested-list');
  assert.equal(snapshot.exportContext!.pageCount,2);assert.equal(snapshot.sourceIdentity,'unverified');
  assert.deepEqual(inspectFields(snapshot,snapshot.rows[0]!).ownCostsPaid,{state:'value',label:'Eigene Kosten(Bezahlt)',raw:'12,34'});
  assert.equal(inspectFields(snapshot,snapshot.rows[0]!).duplicate.state,'value');
});
test('verified empty list succeeds but session/error/unverified scope never becomes empty history',()=>{
  assert.equal(accept(reading(),payload({rows:[],first:0,last:0,total:0})).complete!.rows.length,0);
  for(const o of [{error:'private-provider-text'},{period:'Das letzte Jahr'},{participation:'Pilot'},{filtersClear:false},{allColumns:false},{first:0,last:0,total:0},{accountLabel:''}]) assert.throws(()=>accept(reading(),payload(o)));
  assert.throws(()=>accept(reading(),payload(),LOGIN_URL,LOGIN_URL));
});
test('page gaps, repeats, count/schema/account/preset changes and foreign pagination fail closed',()=>{
  for(const o of [{first:2,last:2},{total:2},{total:0,first:0,last:0,rows:[] ,nextUrl:FLIGHT_URL+'?page=2'},{nextUrl:'https://evil.test/?page=2'},{total:2,nextUrl:FLIGHT_URL+'?page=3'},{total:2,nextUrl:FLIGHT_URL+'?page=2&_params=secret'},{token:'old'},{phase:'preset'},{url:LOGIN_URL},{rows:[row('1'),row('1')],last:2,total:2}]) assert.throws(()=>accept(reading(),payload(o)));
  for(const o of [{rows:[row('2')],first:3,last:3,total:3},{accountLabel:'Other account'},{preset:'Flugbuch Export'},{headers:[...headers].reverse(),rows:[row('2')]},{columnIds:[...columnIds].reverse()},{rows:[row('1')]}]) {
    const run=reading(); accept(run,payload({total:2,nextUrl:FLIGHT_URL+'?page=2'})); const before=JSON.stringify(run.pages);
    assert.throws(()=>accept(run,payload({first:2,last:2,total:2,rows:[row('2')],...o})));assert.equal(JSON.stringify(run.pages),before);
  }
});
test('invalid dates/refs/cells, excessive payloads and columns cannot enter a saved snapshot',()=>{
  for(const o of [{rows:[{...row('1'),sourceFlightId:null}]},{rows:[{...row('1'),values:[]}]},{rows:[{...row('1'),values:row('1').values.map((v,i)=>i===1?'31.02.2026':v)}]},{rows:[{...row('1'),values:row('1').values.map((v,i)=>i===1?'31.12.2025':v)}]},{columnIds:columnIds.map(()=> '1')},{headers:headers.map(()=> 'Datum')},{rows:Array.from({length:1001},()=>row('1'))}]) assert.throws(()=>accept(reading(),payload(o)));
  assert.throws(()=>accept(reading(),'private broken JSON'),/Invalid export response/);
  assert.throws(()=>accept(reading(),'x'.repeat(2_000_001)));
});
test('phase acknowledgements advance only matching commands, preserve source context and reject cap',()=>{
  const run=beginExport(request);
  for(const phase of EXPORT_PHASES.slice(0,-1)) {assert.equal(run.phase,phase); accept(run,payload({phase,status:'next'}));}
  assert.equal(run.phase,'read');run.steps=4100;assert.throws(()=>accept(run),/limit/);
});

// Synthetic DOM contracts, never private provider HTML or real flight records.
function driverFixture(phase: ExportRun['phase'], options: {missingPreset?:boolean;activeBackup?:boolean;missingColumn?:boolean;filtered?:boolean;wrongPeriod?:boolean;foreignForm?:boolean;url?:string;iframe?:boolean;empty?:boolean;malformed?:boolean}={}) {
  const messages:string[]=[];const actions:string[]=[];
  const option={text:EXPORT_PRESET,value:EXPORT_PRESET,textContent:EXPORT_PRESET,disabled:false,hidden:false};
  const reset={text:'Zurücksetzen',textContent:'Zurücksetzen',value:'-1',disabled:false,hidden:false};
  const select={options:options.missingPreset?[reset]:[option,reset],selectedOptions:[options.activeBackup?{textContent:'MoFlight App user view backup'}:options.missingPreset?{textContent:'Konfiguration laden'}:option],selectedIndex:0,value:EXPORT_PRESET,dispatchEvent:()=>actions.push('preset-change')};
  const form={method:'post',getAttribute:()=>options.foreignForm?'https://evil.test/':FLIGHT_URL,querySelector:()=>({click:()=>actions.push('submit')})};
  const columns=headers.map((h,i)=>({textContent:h||'[leer]',getAttribute:()=>columnIds[i],click:()=>{actions.push('column-select');}}));
  const visible=options.missingColumn?columns.slice(0,-1):columns;
  const available=options.missingColumn?[columns.at(-1)!]:[];
  const cells=(texts:string[])=>texts.map(text=>({textContent:text,innerText:text,colSpan:1}));
  const head={parentElement:{tagName:'THEAD'},cells:cells(headers)};
  const flight={id:'row1',parentElement:{tagName:'TBODY'},cells:options.malformed?cells(['wrong']):cells(row('1').values),querySelectorAll:()=>[]};
  const layout={id:'',parentElement:{tagName:'TBODY'},cells:[{textContent:'layout',innerText:'layout',colSpan:99}]};
  const table={textContent:options.empty?'Es wurden keine Daten gefunden!':'',rows:[head,...options.empty?[]:[flight],layout]};
  const boxes=[{checked:true},{checked:!options.filtered}];
  const filter={...form,querySelectorAll:(s:string)=>s.includes('checkbox')?boxes:[{value:''}]};
  const fields:Record<string,unknown>={
    'form[name="frm_tablelist_quickconfig"]':{...form,querySelector:()=>select},
    '#divpageheadermenu':{children:[{}, {textContent:'VEREINSFLIEGER.DE Synthetic account'}]},
    '#tablelist_20':table,'#frmfilter':filter,
    '#globalfilter2':{textContent:PARTICIPATION},'#globalfilter':{textContent:options.wrongPeriod?'Das letzte Jahr':'ab 01.01.2026 bis 31.12.2026'},
    '#lst_configure_visible':{form},'a[title="Liste konfigurieren"]':{click:()=>actions.push('open-config')},'#tableconfigtab_li_1':{click:()=>actions.push('column-tab')},
    '#btn_moveright':{click:()=>{actions.push('move-right');visible.push(available.pop()!);}},
    '#tableconfigtab_li_2':{click:()=>actions.push('preset-tab')},'#userlist_name':{form,value:'',dispatchEvent:()=>actions.push('input-event')},'#btn_userlist_add':{click:()=>actions.push('save-preset')},
    '#startdate':{form,value:''},'#enddate':{form,value:''},'#daterange':{form,value:'',dispatchEvent:()=>actions.push('range-change')}
  };
  const document={querySelector:(s:string)=>fields[s]??null,querySelectorAll:(s:string)=>s==='#LST_VISIBLE > li'?visible:s==='#LST_AVAILABLE > li'?available:s==='td.footer.f1'?[{textContent:options.empty?'Datensatz 0 bis 0 von 0':'Datensatz 1 bis 1 von 1'}]:[]};
  const window:Record<string,unknown>={ReactNativeWebView:{postMessage:(s:string)=>messages.push(s)}};window.top=options.iframe?{}:window;
  const location=new URL(options.url??FLIGHT_URL);const run=beginExport(request);run.phase=phase;
  runInNewContext(exportScript(token,run),{window,document,location:{href:location.href,hostname:location.hostname,pathname:location.pathname,protocol:location.protocol,origin:location.origin},URL,Event:class { constructor(_name:string,_options:unknown){} }});
  return {messages,actions,boxes,fields};
}
test('standalone export reader preserves row-ID fallback, skips layout, and proves 48-column scope',()=>{
  const fixture=driverFixture('read');assert.deepEqual(fixture.actions,[]);assert.equal(accept(reading(),fixture.messages[0]!).complete!.rows[0]!.sourceFlightId,'1');
  assert.equal(accept(reading(),driverFixture('read',{empty:true}).messages[0]!).complete!.rows.length,0);
  assert.throws(()=>accept(reading(),driverFixture('read',{malformed:true}).messages[0]!));
});
test('standalone driver repairs columns, clears restrictions, creates only absent presets and submits explicit dates',()=>{
  assert.deepEqual(driverFixture('columns',{missingColumn:true}).actions,['open-config','column-tab','column-select','move-right','submit']);
  const filtered=driverFixture('clear',{filtered:true});assert.deepEqual(filtered.actions,['submit']);assert.ok(filtered.boxes.every(b=>b.checked));
  assert.deepEqual(driverFixture('save').actions,[]);
  assert.ok(driverFixture('save',{missingPreset:true}).actions.includes('save-preset'));
  const period=driverFixture('period',{wrongPeriod:true});assert.deepEqual(period.actions,['range-change','submit']);assert.equal((period.fields['#startdate'] as {value:string}).value,'01.01.2026');assert.equal((period.fields['#enddate'] as {value:string}).value,'31.12.2026');
  for(const phase of ['columns','clear','save','period'] as const) {const rejected=driverFixture(phase,{missingColumn:true,filtered:true,missingPreset:true,wrongPeriod:true,foreignForm:true});assert.ok(rejected.messages[0]?.includes('unsupported-provider-state'));assert.ok(!rejected.actions.includes('submit'));}
});
test('browser automation never runs on login/foreign documents or nested frames',()=>{
  for(const options of [{url:LOGIN_URL},{url:'https://evil.test/member/profile/flightlog.php'},{iframe:true}]) assert.deepEqual(driverFixture('read',options).messages,[]);
});
test('missing export preset leaves active user backup through reset before any column/filter mutation',()=>{
  const f=driverFixture('preset',{missingPreset:true,activeBackup:true});
  assert.deepEqual(f.actions,['preset-change']);assert.equal(f.messages.length,0);
  assert.ok(driverFixture('preset',{missingPreset:true}).messages[0]?.includes('"status":"next"'));
  const rejected=driverFixture('preset',{missingPreset:true,activeBackup:true,foreignForm:true});assert.deepEqual(rejected.actions,[]);
});

test('saved export revalidates scope, rows and identity; large and empty snapshots reopen safely', async () => {
  const snapshot = accept(reading()).complete!;
  assert.deepEqual(validateCapture(snapshot), snapshot);
  for (const change of [{exportContext: undefined}, {rows: []}, {exportContext: {...snapshot.exportContext, pageCount:0}}, {exportContext: {...snapshot.exportContext, from:'2026-02-30'}}, {rows:[{...row('1'), sourceFlightId:null}]}]) assert.throws(() => validateCapture({...snapshot, ...change}));
  const empty = accept(reading(), payload({rows:[],first:0,last:0,total:0})).complete!;
  assert.deepEqual(validateCapture(empty), empty);
  const large = {...snapshot, rows:Array.from({length:1000}, (_,i)=>({...row(String(i+1)),values:row('1').values.map((v,n)=>n===6?'x'.repeat(1000):v)})), exportContext:{...snapshot.exportContext!,recordCount:1000,pageCount:1}};
  assert.ok(JSON.stringify(large).length > 200_000);
  let saved: {id:string;retrieved_at:string;payload:string} | null = null;
  const db = {async exec() {}, async all<T>() { return [] as T[]; }, async run(_sql:string, ...params:unknown[]) { if(!saved) saved={id:params[0] as string,retrieved_at:params[1] as string,payload:params[2] as string}; }, async first<T>() { return saved as T | null; }};
  await persistCapture(db, large); assert.deepEqual(await readLatestCapture(db), large);
  await assert.rejects(persistCapture(db, {...large,rows:large.rows.map((r,i)=>i===0?{...r,values:r.values.map((v,n)=>n===6?'changed':v)}:r)}), /conflict/);
  assert.deepEqual(await readLatestCapture(db), large);
});

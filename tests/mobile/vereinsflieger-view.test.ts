import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { decodeView, isDefaultView, sameView, validateView, viewScript, viewProtectionMessage, VIEW_BACKUP, type ViewPreferences, type ViewPhase } from '../../apps/platform-lab/src/vereinsflieger/view.ts';
import { rememberView, pendingView, forgetView } from '../../apps/platform-lab/src/vereinsflieger/view-store.ts';
import { FLIGHT_URL, LOGIN_URL } from '../../apps/platform-lab/src/vereinsflieger/probe.ts';
import { Retrieval } from '../../apps/platform-lab/src/vereinsflieger/retrieval.ts';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nodeDriver } from './sqlite-driver.ts';
import { VIEW_SCHEMA } from '../../apps/platform-lab/src/vereinsflieger/view-store.ts';
const original: ViewPreferences = {version:2,accountLabel:'Synthetic account',preset:'Old preset',columns:['1','2','3'],filters:[{name:'col3',type:'text',value:'ASK',checked:false},{name:'col11_0',type:'checkbox',value:'1',checked:false}],sort:[{column:'3',icon:'icon-sort-name-down'}],role:'Pilot oder Fluglehrer',period:'Das letzte Jahr',reset:false,rowsPerPage:100};
type MenuLink = {text:string;href?:string;disabled?:boolean};
function fixture(options: {collision?:boolean; changed?:boolean; foreign?:boolean; initial?:ViewPreferences; resetView?:ViewPreferences; menus?:Record<string,MenuLink[]>} = {}) {
  const actions:string[]=[]; const messages:string[]=[];
  const initial=options.initial??original, state=structuredClone(initial); if(options.changed) {state.period='ab 01.01.2026 bis 31.12.2026';state.filters[0]!.value='';state.sort=[];state.preset='MoFlight App export filter';}
  const opts:any[]=[{textContent:state.preset,text:state.preset,value:state.preset,disabled:true},{textContent:'Zurücksetzen',text:'Zurücksetzen',value:'-1',disabled:false}];
  if(options.collision)opts.push({textContent:VIEW_BACKUP,text:VIEW_BACKUP,value:VIEW_BACKUP,disabled:false});
  const select:any={options:opts,selectedOptions:[opts[0]],selectedIndex:0,dispatchEvent(){
    actions.push('load');
    if(opts[this.selectedIndex].value==='-1'){
      Object.assign(state,structuredClone(options.resetView??initial),{preset:'Konfiguration laden',period:state.period,role:state.role});
      this.selectedOptions=[{textContent:state.preset}];
    }else{state.preset=opts[this.selectedIndex].text;Object.assign(state,structuredClone(initial),{preset:state.preset});this.selectedOptions=[opts[this.selectedIndex]];}
  }};
  const quick:any={method:'post',getAttribute:()=>FLIGHT_URL,querySelector:()=>select};
  const input:any={value:'',dispatchEvent(){},form:{method:'post',getAttribute:()=>options.foreign?'https://evil.test':FLIGHT_URL}};
  const filters:any={get elements(){return state.filters;}};
  const size:any={get value(){return String(state.rowsPerPage??100);},selectedIndex:0,options:[5,6,7,8,9,10,20,30,40,50,100,200,500,1000].map(value=>({value:String(value)}))};
  const sizeForm:any={method:'post',getAttribute:()=>options.foreign?'https://evil.test':FLIGHT_URL,querySelector:()=>({click(){actions.push('page-size');state.rowsPerPage=Number(size.options[size.selectedIndex].value);}})};
  const mapping:Record<string,any>={'select[name="frm_rowsperpage"]':size,'#lst_configure_visible':{form:sizeForm},'#tableconfigtab_li_1':{click(){}},'#divpageheadermenu':{children:[{},{textContent:'VEREINSFLIEGER.DE '+state.accountLabel}]},'form[name="frm_tablelist_quickconfig"]':quick,'#tablelist_20':{},'#frmfilter':filters,'#userlist_name':input,'a[title="Liste konfigurieren"]':{click(){}},'#tableconfigtab_li_2':{click(){}},'#btn_userlist_add':{click(){actions.push('save');opts.push({text:input.value,textContent:input.value,value:input.value,disabled:false});}}};
  const menus:Record<string,MenuLink[]>={
    '#menu_globalfilter2 a':[{text:'Pilot',href:FLIGHT_URL+'?_params=synthetic-role'}],
    '#menu_globalfilter a':[{text:'Das letzte Jahr',href:FLIGHT_URL+'?_params=synthetic-period'}],...options.menus,
  };
  const document={querySelector:(s:string)=>s==='#globalfilter'?{textContent:state.period}:s==='#globalfilter2'?{textContent:state.role}:mapping[s],querySelectorAll:(s:string)=>s==='#LST_VISIBLE > li'?state.columns.map(id=>({getAttribute:()=>id})):s==='#tablelist_20 thead th'?state.columns.map(id=>({querySelectorAll:()=>state.sort.filter(x=>x.column===id).map(x=>({classList:[x.icon]}))})):menus[s]?.map(link=>({textContent:link.text,disabled:link.disabled,getAttribute:()=>link.href,click(){actions.push(s==='#menu_globalfilter2 a'?'role':'period');if(s==='#menu_globalfilter2 a')state.role=link.text;else state.period=link.text;}}))??[]};
  const window:any={ReactNativeWebView:{postMessage:(m:string)=>messages.push(m)}};window.top=window;
  function execute(phase:ViewPhase,prefs:ViewPreferences|null=original){messages.length=0;runInNewContext(viewScript('current',phase,prefs),{window,document,location:new URL(FLIGHT_URL),URL,Event:class{}});return messages.length?JSON.parse(messages[0]!):{};}
  return {execute,actions,state,select,mapping,document};
}
test('snapshot records actual unsaved preferences without date-form replay or mutations',()=>{
 const f=fixture();assert.deepEqual(validateView(f.execute('snapshot',null).view),original);assert.deepEqual(f.actions,[]);
});
test('preflight diagnostics distinguish unsupported controls without leaking provider text',()=>{
 const controls=fixture(), filters=fixture(), headers=fixture();
 controls.mapping['#tablelist_20']=null;filters.state.filters[0]!.name='password';
 const query=headers.document.querySelectorAll;headers.document.querySelectorAll=s=>s==='#tablelist_20 thead th'?[]:query(s);
 for(const [f,reason] of [[controls,'view-controls'],[filters,'view-filter-controls'],[headers,'view-header-columns']] as const){
  const m=f.execute('snapshot',null);assert.equal(m.reason,reason);assert.deepEqual(f.actions,[]);
  try {decodeView(JSON.stringify(m),LOGIN_URL,FLIGHT_URL,'current','snapshot',null);assert.fail('Expected preflight failure');}catch(e){assert.ok(viewProtectionMessage(e));}
 }
 const m={...controls.execute('snapshot',null),reason:'private-provider-exception'};
 try{decodeView(JSON.stringify(m),LOGIN_URL,FLIGHT_URL,'current','snapshot',null);assert.fail('Expected failure');}catch(e){assert.ok(!viewProtectionMessage(e)?.includes('private-provider-exception'));}
 assert.equal(viewProtectionMessage(new Error('private-provider-exception')),null);
 assert.throws(()=>decodeView(JSON.stringify({...m,token:'stale'}),LOGIN_URL,FLIGHT_URL,'current','snapshot',null),e=>viewProtectionMessage(e)===null);
});
test('backup save/load uses provider controls then verifies relative period, filters, order and sort',()=>{
 const f=fixture();assert.equal(f.execute('backup').status,'saved-request');f.execute('backup-load');assert.deepEqual(f.actions,['save','load']);
 const m=f.execute('backup-verify');assert.equal(decodeView(JSON.stringify(m),LOGIN_URL,FLIGHT_URL,'current','backup-verify',original),null);
 f.state.period='unexpected';assert.equal(f.execute('verify').error,'view-contract-changed');
});
test('reserved backup is refreshed from actual view without requiring installation ownership',()=>{
 const f=fixture({collision:true});assert.deepEqual(validateView(f.execute('snapshot',null).view),original);assert.deepEqual(f.actions,[]);
 assert.equal(f.execute('backup').status,'saved-request');assert.deepEqual(f.actions,['save']);
 assert.equal(f.mapping['#userlist_name'].value,VIEW_BACKUP);
 const wrong=fixture({collision:true});assert.equal(wrong.execute('backup',{...original,accountLabel:'Other account'}).error,'view-contract-changed');assert.deepEqual(wrong.actions,[]);
});
test('backup never saves modified export preferences or submits a foreign form',()=>{
 for(const options of [{changed:true},{foreign:true}]){const f=fixture(options);assert.equal(f.execute('backup').error,'view-contract-changed');assert.deepEqual(f.actions,[]);}
});
test('reserved name appearing after snapshot may be refreshed, but absent or changed original cannot be saved',()=>{
 const f=fixture();assert.equal(f.execute('snapshot',null).view.accountLabel,original.accountLabel);
 f.select.options.push({text:VIEW_BACKUP,textContent:VIEW_BACKUP,value:VIEW_BACKUP,disabled:false});
 assert.equal(f.execute('backup').status,'saved-request');assert.deepEqual(f.actions,['save']);
 const missing=fixture({collision:true});assert.equal(missing.execute('backup',null).error,'view-contract-changed');assert.deepEqual(missing.actions,[]);
 const changed=fixture({collision:true,changed:true});assert.equal(changed.execute('backup').error,'view-contract-changed');assert.deepEqual(changed.actions,[]);
});
test('wrong-account restoration refuses every mutation; missing backup leaves visible recovery',()=>{
 const f=fixture({changed:true});assert.equal(f.execute('restore',{...original,accountLabel:'Other account'}).error,'view-contract-changed');assert.deepEqual(f.actions,[]);
 assert.equal(f.execute('restore').error,'view-contract-changed');
});
test('interruption before backup creation can verify the unchanged original; recovery loads an existing backup',()=>{
 const untouched=fixture();assert.equal(untouched.execute('restore').status,'next');assert.equal(untouched.execute('verify').status,'next');
 const f=fixture({changed:true,collision:true});f.execute('restore');assert.deepEqual(f.actions,['load']);assert.equal(f.execute('verify').status,'next');
});
test('complete-default recognition rejects unnamed custom dates, participation, filters, sorting and order',()=>{
 const v:ViewPreferences={...original,preset:'Konfiguration laden',columns:['1','2','3','4','5','6','7','8','9','10','105','11','12','13','14','15'],filters:[{name:'col3',type:'text',value:'',checked:false}],sort:[],role:'Pilot',reset:true};
 assert.equal(isDefaultView(v),true);validateView(v);
 for(const change of [{period:'2026'},{role:'Pilot oder Fluglehrer'},{columns:[...v.columns].reverse()},{sort:[{column:'3',icon:'icon-sort-name-down'}]},{filters:original.filters},{preset:'Unnamed custom'}]) {assert.equal(isDefaultView({...v,...change}),false);assert.throws(()=>validateView({...v,...change}));}
});

const defaultView:ViewPreferences={...original,preset:'Konfiguration laden',columns:['1','2','3','4','5','6','7','8','9','10','105','11','12','13','14','15'],filters:[{name:'col3',type:'text',value:'',checked:false}],sort:[],role:'Pilot',reset:true};
const retainedScope:ViewPreferences={...defaultView,period:'ab 01.01.2026 bis 31.12.2026',role:'Pilot oder Fluglehrer',reset:false};
test('default cleanup resets structure then restores retained role and relative period through original menus',()=>{
 const f=fixture({initial:{...retainedScope,columns:[...defaultView.columns].reverse(),sort:[{column:'3',icon:'icon-sort-name-down'}]},resetView:defaultView});
 f.execute('restore',defaultView);assert.deepEqual(f.actions,['load']);assert.equal(f.state.period,retainedScope.period);assert.equal(f.state.role,retainedScope.role);
 f.execute('restore',defaultView);assert.deepEqual(f.actions,['load','role']);assert.equal(f.state.period,retainedScope.period);
 f.execute('restore',defaultView);assert.deepEqual(f.actions,['load','role','period']);
 assert.equal(f.execute('restore',defaultView).status,'next');
 const verified=f.execute('verify',defaultView);assert.equal(decodeView(JSON.stringify(verified),LOGIN_URL,FLIGHT_URL,'current','verify',defaultView),null);
 assert.deepEqual(f.actions,['load','role','period']);assert.deepEqual(verified.view,defaultView);
});

test('default cleanup refuses missing, ambiguous, disabled and unsafe scope links before invoking controls',()=>{
 for(const selector of ['#menu_globalfilter2 a','#menu_globalfilter a']){
  const label=selector==='#menu_globalfilter2 a'?'Pilot':'Das letzte Jahr';
  const current=selector==='#menu_globalfilter2 a'?retainedScope:{...retainedScope,role:'Pilot'};
  const safe={text:label,href:FLIGHT_URL+'?_params=synthetic'};
  const cases:MenuLink[][]=[[],[safe,safe],[{text:label}],[{...safe,disabled:true}],
   [{text:label,href:'https://evil.test/member/profile/flightlog.php'}],
   [{text:label,href:FLIGHT_URL.replace('https:','http:')}],
   [{text:label,href:'https://vereinsflieger.de/member/profile/userprofile.php'}],
   [{text:label,href:FLIGHT_URL.replace('https://','https://user:secret@')}],
   [{text:label,href:'javascript:alert(1)'}]];
  for(const links of cases){const f=fixture({initial:current,menus:{[selector]:links}});assert.equal(f.execute('restore',defaultView).error,'view-contract-changed');assert.deepEqual(f.actions,[]);}
 }
});

test('default scope restoration rechecks account and complete structure on every navigation',()=>{
 const f=fixture({initial:retainedScope});f.execute('restore',defaultView);assert.deepEqual(f.actions,['role']);
 f.mapping['#divpageheadermenu'].children[1].textContent='Other account';
 assert.equal(f.execute('restore',defaultView).error,'view-contract-changed');assert.deepEqual(f.actions,['role']);
 const changed=fixture({initial:retainedScope});changed.execute('restore',defaultView);changed.state.filters[0]!.value='restriction';
 changed.execute('restore',defaultView);assert.deepEqual(changed.actions,['role','load'],'Changed structure must reset instead of blindly applying scope');
 const missingRole=fixture({initial:retainedScope,menus:{'#menu_globalfilter2 a':[]}});
 assert.equal(missingRole.execute('verify',defaultView).error,'view-contract-changed');assert.deepEqual(missingRole.actions,[]);
});
test('preference validation excludes credentials, signed links, malformed shapes and old replay drafts',()=>{
 for(const v of [{...original,version:1},{...original,columns:['1','1']},{...original,filters:[{name:'password',type:'text',value:'secret',checked:false}]},{...original,sort:[{column:'999',icon:'icon-sort-name-down'}]}])assert.throws(()=>validateView(v));
 assert.deepEqual(validateView({...original,cookie:'excluded',action:'excluded'}),original);
});
test('host independently checks readback; stale tokens, account mismatch and forged acknowledgements fail',()=>{
 const m={kind:'vf-view-v2',token:'current',phase:'verify',url:FLIGHT_URL,accountLabel:original.accountLabel,status:'next',view:{...original,preset:VIEW_BACKUP}};
 for(const change of [{token:'old'},{url:LOGIN_URL},{accountLabel:'Other'},{error:'x'},{status:'issued'},{view:{...m.view,period:'different'}}])assert.throws(()=>decodeView(JSON.stringify({...m,...change}),LOGIN_URL,FLIGHT_URL,'current','verify',original));
 assert.equal(sameView(original,m.view),true);assert.throws(()=>decodeView(JSON.stringify(m),'https://evil.test',FLIGHT_URL,'current','verify',original));
});
test('durable recovery refuses replacement and wrong cleanup even with reserved-name overwrite authorization',async()=>{
 let payload:string|null=null;
 const db={async exec(){},async all<T>(){return [] as T[];},async first<T>(){return (payload?{payload}:null) as T|null;},async run(sql:string,...args:unknown[]){if(sql.startsWith('INSERT')&&!payload)payload=args[0] as string;else if(sql.startsWith('DELETE')&&payload===args[0])payload=null;}};
 await rememberView(db,original);await rememberView(db,original);assert.deepEqual(await pendingView(db),original);
 await assert.rejects(rememberView(db,{...original,preset:'Other'}));await assert.rejects(forgetView(db,{...original,preset:'Other'}));
 await forgetView(db,original);assert.equal(await pendingView(db),null);
});
test('journal/save lock resumes only its owner; cancellation stays disabled during SQLite writes',()=>{
 const r=new Retrieval();r.start('owner');r.beginSave('owner');assert.equal(r.cancel(),false);assert.equal(r.resume('other'),false);assert.equal(r.resume('owner'),true);assert.equal(r.cancel(),true);assert.equal(r.resume('owner'),false);
});
test('actual SQLite recovery reopens after interruption; stale cleanup retains evidence and legacy ownership is irrelevant',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'moflight-view-')), path=join(dir,'view.sqlite');let db=nodeDriver(path);
 try {await db.exec(VIEW_SCHEMA);await db.exec('CREATE TABLE provider_view_backup_owner (id INTEGER PRIMARY KEY, account_label TEXT); INSERT INTO provider_view_backup_owner VALUES (1,NULL)');await rememberView(db,original);await db.close();db=nodeDriver(path);
 assert.deepEqual(await pendingView(db),original);
 await assert.rejects(forgetView(db,{...original,period:'different'}));assert.deepEqual(await pendingView(db),original);
 await forgetView(db,original);await db.close();db=nodeDriver(path);assert.equal(await pendingView(db),null);assert.equal((await db.first<{account_label:null}>('SELECT account_label FROM provider_view_backup_owner WHERE id=1'))!.account_label,null);
 } finally {await db.close();await rm(dir,{recursive:true,force:true});}
});

test('page-size recovery restores the journaled global value before final verification',()=>{
  const f=fixture();f.state.rowsPerPage=500;
  assert.equal(f.execute('verify').error,'view-contract-changed');
  f.execute('restore');assert.deepEqual(f.actions,['page-size']);assert.equal(f.state.rowsPerPage,100);
  assert.equal(f.execute('restore').status,'next');
  const readback=f.execute('verify');assert.equal(decodeView(JSON.stringify(readback),LOGIN_URL,FLIGHT_URL,'current','verify',original),null);
  assert.throws(()=>decodeView(JSON.stringify({...readback,view:{...readback.view,rowsPerPage:500}}),LOGIN_URL,FLIGHT_URL,'current','verify',original));
});

test('restoration preserves the actual original page size rather than assuming a default',()=>{
  for(const rowsPerPage of [5,200,500,1000]){
    const target={...original,rowsPerPage}, f=fixture({initial:target});f.state.rowsPerPage=500;
    f.execute('restore',target);assert.equal(f.state.rowsPerPage,rowsPerPage);
    assert.deepEqual(f.actions,rowsPerPage===500?[]:['page-size']);assert.equal(f.execute('verify',target).status,'next');
  }
});

test('page-size capture fails closed; unsafe, unavailable and foreign-account restoration never submits',()=>{
  const selector='select[name="frm_rowsperpage"]';
  for(const mutation of ['missing','unknown','disabled'] as const){
    const f=fixture();if(mutation==='missing')f.mapping[selector]=null;
    else if(mutation==='unknown')f.state.rowsPerPage=17;else f.mapping[selector].disabled=true;
    assert.equal(f.execute('snapshot',null).error,'view-contract-changed');assert.deepEqual(f.actions,[]);
  }
  for(const value of [null,17,'100',NaN,Infinity])assert.throws(()=>validateView({...original,rowsPerPage:value}));
  for(const mode of ['foreign-form','missing-option','foreign-account'] as const){
    const f=fixture({foreign:mode==='foreign-form'});f.state.rowsPerPage=500;
    if(mode==='missing-option')f.mapping[selector].options=f.mapping[selector].options.filter((o:{value:string})=>o.value!=='100');
    const target=mode==='foreign-account'?{...original,accountLabel:'Other'}:original;
    assert.equal(f.execute('restore',target).error,'view-contract-changed');assert.deepEqual(f.actions,[]);
  }
});

test('old journals remain byte-compatible and never guess a missing global preference',()=>{
  const legacy={...original};delete legacy.rowsPerPage;
  assert.equal(JSON.stringify(validateView(legacy)),JSON.stringify(legacy));
  const f=fixture();f.state.rowsPerPage=500;
  assert.equal(f.execute('restore',legacy).status,'next');assert.deepEqual(f.actions,[]);
  assert.equal(f.state.rowsPerPage,500);
  const message={kind:'vf-view-v2',token:'current',phase:'snapshot',url:FLIGHT_URL,view:legacy};
  assert.throws(()=>decodeView(JSON.stringify(message),LOGIN_URL,FLIGHT_URL,'current','snapshot',null));
});

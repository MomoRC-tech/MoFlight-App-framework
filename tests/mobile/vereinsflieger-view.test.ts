import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { decodeView, isDefaultView, sameView, validateView, viewScript, viewProtectionMessage, VIEW_BACKUP, type ViewPreferences, type ViewPhase } from '../../apps/platform-lab/src/vereinsflieger/view.ts';
import { rememberView, pendingView, forgetView, backupOwner, ownBackup } from '../../apps/platform-lab/src/vereinsflieger/view-store.ts';
import { FLIGHT_URL, LOGIN_URL } from '../../apps/platform-lab/src/vereinsflieger/probe.ts';
import { Retrieval } from '../../apps/platform-lab/src/vereinsflieger/retrieval.ts';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nodeDriver } from './sqlite-driver.ts';
import { VIEW_SCHEMA } from '../../apps/platform-lab/src/vereinsflieger/view-store.ts';
const original: ViewPreferences = {version:2,accountLabel:'Synthetic account',preset:'Old preset',columns:['1','2','3'],filters:[{name:'col3',type:'text',value:'ASK',checked:false},{name:'col11_0',type:'checkbox',value:'1',checked:false}],sort:[{column:'3',icon:'icon-sort-name-down'}],role:'Pilot oder Fluglehrer',period:'Das letzte Jahr',reset:false};
function fixture(options: {collision?:boolean; owner?:string; changed?:boolean; foreign?:boolean} = {}) {
  const actions:string[]=[]; const messages:string[]=[];
  const state=structuredClone(original); if(options.changed) {state.period='ab 01.01.2026 bis 31.12.2026';state.filters[0]!.value='';state.sort=[];state.preset='MoFlight App export filter';}
  const opts:any[]=[{textContent:state.preset,text:state.preset,value:state.preset,disabled:true},{textContent:'Zurücksetzen',text:'Zurücksetzen',value:'-1',disabled:false}];
  if(options.collision)opts.push({textContent:VIEW_BACKUP,text:VIEW_BACKUP,value:VIEW_BACKUP,disabled:false});
  const select:any={options:opts,selectedOptions:[opts[0]],selectedIndex:0,dispatchEvent(){actions.push('load');state.preset=opts[this.selectedIndex].text;Object.assign(state,structuredClone(original),{preset:state.preset});this.selectedOptions=[opts[this.selectedIndex]];}};
  const quick:any={method:'post',getAttribute:()=>FLIGHT_URL,querySelector:()=>select};
  const input:any={value:'',dispatchEvent(){},form:{method:'post',getAttribute:()=>options.foreign?'https://evil.test':FLIGHT_URL}};
  const filters:any={get elements(){return state.filters;}};
  const mapping:Record<string,any>={'#divpageheadermenu':{children:[{},{textContent:'VEREINSFLIEGER.DE '+state.accountLabel}]},'form[name="frm_tablelist_quickconfig"]':quick,'#tablelist_20':{},'#frmfilter':filters,'#userlist_name':input,'a[title="Liste konfigurieren"]':{click(){}},'#tableconfigtab_li_2':{click(){}},'#btn_userlist_add':{click(){actions.push('save');opts.push({text:input.value,textContent:input.value,value:input.value,disabled:false});}}};
  const document={querySelector:(s:string)=>s==='#globalfilter'?{textContent:state.period}:s==='#globalfilter2'?{textContent:state.role}:mapping[s],querySelectorAll:(s:string)=>s==='#LST_VISIBLE > li'?state.columns.map(id=>({getAttribute:()=>id})):s==='#tablelist_20 thead th'?state.columns.map(id=>({querySelectorAll:()=>state.sort.filter(x=>x.column===id).map(x=>({classList:[x.icon]}))})):[]};
  const window:any={ReactNativeWebView:{postMessage:(m:string)=>messages.push(m)}};window.top=window;
  function execute(phase:ViewPhase,prefs:ViewPreferences|null=original){messages.length=0;runInNewContext(viewScript('current',phase,prefs,options.owner??null),{window,document,location:new URL(FLIGHT_URL),URL,Event:class{}});return messages.length?JSON.parse(messages[0]!):{};}
  return {execute,actions,state,select,mapping,document};
}
test('snapshot records actual unsaved preferences without date-form replay or mutations',()=>{
 const f=fixture();assert.deepEqual(validateView(f.execute('snapshot',null).view),original);assert.deepEqual(f.actions,[]);
});
test('preflight diagnostics distinguish collisions and unsupported controls without leaking provider text',()=>{
 const collision=fixture({collision:true}), controls=fixture(), filters=fixture(), headers=fixture();
 controls.mapping['#tablelist_20']=null;filters.state.filters[0]!.name='password';
 const query=headers.document.querySelectorAll;headers.document.querySelectorAll=s=>s==='#tablelist_20 thead th'?[]:query(s);
 for(const [f,reason] of [[collision,'backup-name-collision'],[controls,'view-controls'],[filters,'view-filter-controls'],[headers,'view-header-columns']] as const){
  const m=f.execute('snapshot',null);assert.equal(m.reason,reason);assert.deepEqual(f.actions,[]);
  try {decodeView(JSON.stringify(m),LOGIN_URL,FLIGHT_URL,'current','snapshot',null);assert.fail('Expected preflight failure');}catch(e){assert.ok(viewProtectionMessage(e));}
 }
 const m={...collision.execute('snapshot',null),reason:'private-provider-exception'};
 try{decodeView(JSON.stringify(m),LOGIN_URL,FLIGHT_URL,'current','snapshot',null);assert.fail('Expected failure');}catch(e){assert.ok(!viewProtectionMessage(e)?.includes('private-provider-exception'));}
 assert.equal(viewProtectionMessage(new Error('private-provider-exception')),null);
 assert.throws(()=>decodeView(JSON.stringify({...m,token:'stale'}),LOGIN_URL,FLIGHT_URL,'current','snapshot',null),e=>viewProtectionMessage(e)===null);
});
test('backup save/load uses provider controls then verifies relative period, filters, order and sort',()=>{
 const f=fixture();assert.equal(f.execute('backup').status,'saved-request');f.execute('backup-load');assert.deepEqual(f.actions,['save','load']);
 const m=f.execute('backup-verify');assert.equal(decodeView(JSON.stringify(m),LOGIN_URL,FLIGHT_URL,'current','backup-verify',original),null);
 f.state.period='unexpected';assert.equal(f.execute('verify').error,'view-contract-changed');
});
test('unowned name collision fails before mutations; owned same-account name can be reused',()=>{
 const f=fixture({collision:true});assert.equal(f.execute('snapshot',null).error,'view-contract-changed');assert.deepEqual(f.actions,[]);
 assert.equal(fixture({collision:true,owner:original.accountLabel}).execute('snapshot',null).view.accountLabel,original.accountLabel);
 assert.equal(fixture({collision:true,owner:'Other account'}).execute('snapshot',null).error,'view-contract-changed');
});
test('backup never saves modified export preferences or submits a foreign form',()=>{
 for(const options of [{changed:true},{foreign:true}]){const f=fixture(options);assert.equal(f.execute('backup').error,'view-contract-changed');assert.deepEqual(f.actions,[]);}
});
test('collision appearing after snapshot is rejected again immediately before backup save',()=>{
 const f=fixture();assert.equal(f.execute('snapshot',null).view.accountLabel,original.accountLabel);
 f.select.options.push({text:VIEW_BACKUP,textContent:VIEW_BACKUP,value:VIEW_BACKUP,disabled:false});
 assert.equal(f.execute('backup').error,'view-contract-changed');assert.deepEqual(f.actions,[]);
 const owned=fixture({collision:true,owner:original.accountLabel});assert.equal(owned.execute('backup').status,'saved-request');assert.deepEqual(owned.actions,['save']);
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
test('preference validation excludes credentials, signed links, malformed shapes and old replay drafts',()=>{
 for(const v of [{...original,version:1},{...original,columns:['1','1']},{...original,filters:[{name:'password',type:'text',value:'secret',checked:false}]},{...original,sort:[{column:'999',icon:'icon-sort-name-down'}]}])assert.throws(()=>validateView(v));
 assert.deepEqual(validateView({...original,cookie:'excluded',action:'excluded'}),original);
});
test('host independently checks readback; stale tokens, account mismatch and forged acknowledgements fail',()=>{
 const m={kind:'vf-view-v2',token:'current',phase:'verify',url:FLIGHT_URL,accountLabel:original.accountLabel,status:'next',view:{...original,preset:VIEW_BACKUP}};
 for(const change of [{token:'old'},{url:LOGIN_URL},{accountLabel:'Other'},{error:'x'},{status:'issued'},{view:{...m.view,period:'different'}}])assert.throws(()=>decodeView(JSON.stringify({...m,...change}),LOGIN_URL,FLIGHT_URL,'current','verify',original));
 assert.equal(sameView(original,m.view),true);assert.throws(()=>decodeView(JSON.stringify(m),'https://evil.test',FLIGHT_URL,'current','verify',original));
});
test('durable recovery survives restart, refuses replacement/wrong cleanup and records ownership only with journal',async()=>{
 let payload:string|null=null, owner:string|null=null;
 const db={async exec(){},async all<T>(){return [] as T[];},async first<T>(sql:string){return (sql.includes('backup_owner')?(owner?{account_label:owner}:null):(payload?{payload}:null)) as T|null;},async run(sql:string,...args:unknown[]){if(sql.includes('backup_owner'))owner=args[0] as string;else if(sql.startsWith('INSERT')&&!payload)payload=args[0] as string;else if(sql.startsWith('DELETE')&&payload===args[0])payload=null;}};
 await assert.rejects(ownBackup(db,original));await rememberView(db,original);await rememberView(db,original);assert.deepEqual(await pendingView(db),original);
 await assert.rejects(rememberView(db,{...original,preset:'Other'}));await assert.rejects(forgetView(db,{...original,preset:'Other'}));await assert.rejects(ownBackup(db,{...original,preset:'Other'}));
 await ownBackup(db,original);assert.equal(await backupOwner(db),original.accountLabel);await forgetView(db,original);assert.equal(await pendingView(db),null);assert.equal(await backupOwner(db),original.accountLabel);
});
test('journal/save lock resumes only its owner; cancellation stays disabled during SQLite writes',()=>{
 const r=new Retrieval();r.start('owner');r.beginSave('owner');assert.equal(r.cancel(),false);assert.equal(r.resume('other'),false);assert.equal(r.resume('owner'),true);assert.equal(r.cancel(),true);assert.equal(r.resume('owner'),false);
});
test('actual SQLite recovery reopens after interruption; ownership survives cleanup and stale cleanup retains evidence',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'moflight-view-')), path=join(dir,'view.sqlite');let db=nodeDriver(path);
 try {await db.exec(VIEW_SCHEMA);await rememberView(db,original);await ownBackup(db,original);await db.close();db=nodeDriver(path);
 assert.deepEqual(await pendingView(db),original);assert.equal(await backupOwner(db),original.accountLabel);
 await assert.rejects(forgetView(db,{...original,period:'different'}));assert.deepEqual(await pendingView(db),original);
 await forgetView(db,original);await db.close();db=nodeDriver(path);assert.equal(await pendingView(db),null);assert.equal(await backupOwner(db),original.accountLabel);
 } finally {await db.close();await rm(dir,{recursive:true,force:true});}
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {CONTEXT_READER_SOURCE,PROFILE_URL,contextFailure,contextScript,scopedBridge,type ObservedContext} from '../../apps/platform-lab/src/vereinsflieger/context.ts';
import {InformationRun} from '../../apps/platform-lab/src/vereinsflieger/information-run.ts';
import {createRun,nextDetail,completeDetail,persistRun,latestRun,validateRun,RUN_SCHEMA} from '../../apps/platform-lab/src/vereinsflieger/capture-run.ts';
import type {ProbeSnapshot} from '../../apps/platform-lab/src/vereinsflieger/probe.ts';
import {nodeDriver} from './sqlite-driver.ts';
import {CAPTURE_SCHEMA,persistCapture,readLatestCapture} from '../../apps/platform-lab/src/vereinsflieger/capture-store.ts';
const context:ObservedContext={accountNumber:'12345',clubLabel:'Synthetic club',clubIdentity:'display-label-only',verification:'observed-profile-number'};
const at='2026-10-11T10:00:00.000Z';
const list:ProbeSnapshot={captureId:'synthetic-list',retrievedAt:at,headers:['Datum','Lfz.','Start','Landung','Flugzeit'],rows:['11','22','33'].map(sourceFlightId=>({sourceFlightId,values:['11.10.2026','D-1234','10:00','10:06','6']})),sourceIdentity:'unverified',coverage:'visible-personal-list-only',timeBasis:'unknown'};
test('profile diagnostics accept fixed safe codes only and do not disclose provider response values',()=>{
  for(const error of ['session-required','profile-number-unavailable','profile-club-unavailable'])assert.ok(contextFailure({error,privateField:'DO NOT DISPLAY'}));
  assert.equal(contextFailure({error:'DO NOT DISPLAY'}),null);assert.equal(contextFailure('DO NOT DISPLAY'),null);
  const window:any={};window.top=window;const location={protocol:'https:',hostname:'vereinsflieger.de',pathname:'/member/profile/viewprofile',href:PROFILE_URL};
  const result=runInNewContext(`(${CONTEXT_READER_SOURCE})()`,{window,location,document:{querySelectorAll:()=>[]},URL});
  assert.equal(result.error,'profile-number-unavailable');
  const signedOut=runInNewContext(`(${CONTEXT_READER_SOURCE})()`,{window,location,document:{querySelectorAll:(s:string)=>s.startsWith('input[')?[{}]:[]},URL});assert.equal(signedOut.error,'session-required');
});
function detail(id:string){return {url:`https://vereinsflieger.de/member/profile/viewflight.php?flid=${id}`,fields:[{section:'Allgemeine Daten',position:1,label:'Eintrag',raw:id},{section:'Flugdaten',position:3,label:'CallSign',raw:'D-1234'},{section:'Flugdaten',position:4,label:'Datum',raw:'11.10.2026'},{section:'Flugdaten',position:5,label:'Flugzeit',raw:'6'}]};}
test('context reader only extracts observed user number and club label; bridge rejects wrong native document',()=>{
  const rows=[{cells:[{textContent:'Benutzernummer'},{textContent:'12345'}]},{cells:[{textContent:'IBAN'},{get textContent(){throw new Error('private field read');}}]}];
  const location={protocol:'https:',hostname:'vereinsflieger.de',pathname:'/member/profile/viewprofile',href:PROFILE_URL};const window:any={};window.top=window;
  const document={querySelectorAll:(s:string)=>s==='table.tablelist.alternative tr'?rows:s==='#topnavi a[href]'?[{getAttribute:()=>'/member/community/main',textContent:'Synthetic club'}]:[]};
  const observed=runInNewContext(`(${CONTEXT_READER_SOURCE})()`,{window,location,document,URL});assert.deepEqual(JSON.parse(JSON.stringify(observed)),context);
  assert.equal(scopedBridge('https://vereinsflieger.de/',PROFILE_URL,PROFILE_URL),true);assert.equal(scopedBridge('https://evil.test/',PROFILE_URL,PROFILE_URL),false);assert.equal(scopedBridge('https://vereinsflieger.de/',PROFILE_URL.replace('viewprofile','flightlog.php'),PROFILE_URL),false);
});

function contextLifecycle(readyState: string, supported = true) {
  const messages: { kind: string; nonce: string; url: string; context: unknown }[] = [];
  const location = { protocol: 'https:', hostname: 'vereinsflieger.de', pathname: '/member/profile/viewprofile', href: PROFILE_URL };
  let reads = 0, completeStructure = supported, load: (() => void) | undefined;
  const document = { readyState, querySelectorAll: (selector: string) => {
    reads++;
    if (!completeStructure) return [];
    if (selector === 'table.tablelist.alternative tr') return [{ cells: [{ textContent: 'Benutzernummer' }, { textContent: context.accountNumber }] }];
    if (selector === '#topnavi a[href]') return [{ getAttribute: () => '/member/community/main', textContent: context.clubLabel }];
    return [];
  } };
  const window: any = {
    ReactNativeWebView: { postMessage: (value: string) => { messages.push(JSON.parse(value)); } },
    addEventListener: (event: string, listener: () => void, options: { once: boolean }) => {
      assert.equal(event, 'load'); assert.equal(options.once, true); assert.equal(load, undefined); load = listener;
    },
  }; window.top = window;
  runInNewContext(contextScript('original-context-nonce'), { window, document, location, URL });
  return { messages, document, location, reads: () => reads, complete: () => { completeStructure = true; document.readyState = 'complete'; }, fireLoad: () => { assert.ok(load, 'Expected one-shot load listener'); load(); } };
}

test('context bridge defers incomplete document reads until its one-shot load and retains the original nonce', () => {
  for (const readyState of ['loading', 'interactive']) {
    const f = contextLifecycle(readyState, false);
    assert.equal(f.reads(), 0); assert.deepEqual(f.messages, []);
    f.complete(); f.fireLoad(); f.fireLoad();
    assert.equal(f.messages.length, 1);
    assert.deepEqual(f.messages[0], { kind: 'vf-context-v1', nonce: 'original-context-nonce', url: PROFILE_URL, context });
  }
});

test('context bridge reads a completed document immediately and unsupported complete structure stays fail-closed', () => {
  const ready = contextLifecycle('complete');
  assert.equal(ready.messages.length, 1); assert.deepEqual(ready.messages[0]!.context, context);
  const missing = contextLifecycle('complete', false);
  assert.equal(missing.messages.length, 1); assert.deepEqual(missing.messages[0]!.context, { error: 'profile-number-unavailable' });
});

test('a deferred context response reports its actual document URL so navigation cannot authorize the old request', () => {
  const f = contextLifecycle('interactive');
  const other = 'https://vereinsflieger.de/member/overview/overview';
  f.location.href = other; f.location.pathname = '/member/overview/overview'; f.complete(); f.fireLoad();
  assert.equal(f.messages[0]!.url, other); assert.deepEqual(f.messages[0]!.context, { error: 'session-required' });
  const run = new InformationRun({ version: 1, owner: 'synthetic-owner', connectionId: 'synthetic-connection', context }, 'training-summary', 'https://vereinsflieger.de/member/profile/usereducation/summaryueid?ueid=synthetic', 'original-context-nonce');
  run.observeNavigation(PROFILE_URL);
  assert.equal(run.accept(other, other, { ...f.messages[0], nonce: run.messageNonce }), 'ignored');
  assert.equal(run.accept(PROFILE_URL, PROFILE_URL, { ...f.messages[0], nonce: run.messageNonce }), 'ignored');
  assert.throws(() => run.capture(at));
});
test('durable run resumes observed pending links and preserves successful detail evidence through expiry, stale writes and changed context',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'moflight-run-')),path=join(dir,'run.sqlite');let db=nodeDriver(path);
  try{await db.exec(CAPTURE_SCHEMA + ';' + RUN_SCHEMA);await persistCapture(db,list);assert.deepEqual(await readLatestCapture(db),list);let r=createRun('synthetic-run',context,list);await persistRun(db,r);const url=nextDetail(r,context,list)!;r=completeDetail(r,context,url,detail('11'),at);await persistRun(db,r);await db.close();db=nodeDriver(path);r=(await latestRun(db))!;
    assert.equal(r.details.length,1);assert.ok(nextDetail(r,context,list)!.endsWith('flid=22'));
    const expired=completeDetail(r,context,nextDetail(r,context,list)!,{error:'session-required'},at);await persistRun(db,expired);assert.deepEqual(expired.details,r.details);assert.equal(expired.stop,'session-required');
    await assert.rejects(persistRun(db,{...r,revision:expired.revision,details:[]}));assert.equal((await latestRun(db))!.details.length,1);
    assert.throws(()=>nextDetail(expired,{...context,accountNumber:'other'},list));assert.throws(()=>nextDetail(expired,context,{...list,rows:list.rows.slice(2)}));
    const success=completeDetail(expired,context,nextDetail(expired,context,list)!,detail('22'),at);await persistRun(db,success);assert.equal((await latestRun(db))!.details.length,2);
    assert.throws(()=>validateRun({...success,context:{...context,clubIdentity:'verified'}}));assert.throws(()=>validateRun({...success,detailScope:['999']}));
  }finally{await db.close();await rm(dir,{recursive:true,force:true});}
});

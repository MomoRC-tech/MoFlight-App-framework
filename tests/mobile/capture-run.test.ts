import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {CONTEXT_READER_SOURCE,PROFILE_URL,scopedBridge,type ObservedContext} from '../../apps/platform-lab/src/vereinsflieger/context.ts';
import {createRun,nextDetail,completeDetail,persistRun,latestRun,validateRun,RUN_SCHEMA} from '../../apps/platform-lab/src/vereinsflieger/capture-run.ts';
import type {ProbeSnapshot} from '../../apps/platform-lab/src/vereinsflieger/probe.ts';
import {nodeDriver} from './sqlite-driver.ts';
const context:ObservedContext={accountNumber:'12345',clubLabel:'Synthetic club',clubIdentity:'display-label-only',verification:'observed-profile-number'};
const at='2026-10-11T10:00:00.000Z';
const list:ProbeSnapshot={captureId:'synthetic-list',retrievedAt:at,headers:['Datum','Lfz.','Start','Landung','Flugzeit'],rows:['11','22','33'].map(sourceFlightId=>({sourceFlightId,values:['11.10.2026','D-1234','10:00','10:06','6']})),sourceIdentity:'unverified',coverage:'visible-personal-list-only',timeBasis:'unknown'};
function detail(id:string){return {url:`https://vereinsflieger.de/member/profile/viewflight.php?flid=${id}`,fields:[{section:'Allgemeine Daten',position:1,label:'Eintrag',raw:id},{section:'Flugdaten',position:3,label:'CallSign',raw:'D-1234'},{section:'Flugdaten',position:4,label:'Datum',raw:'11.10.2026'},{section:'Flugdaten',position:5,label:'Flugzeit',raw:'6'}]};}
test('context reader only extracts observed user number and club label; bridge rejects wrong native document',()=>{
  const rows=[{cells:[{textContent:'Benutzernummer'},{textContent:'12345'}]},{cells:[{textContent:'IBAN'},{get textContent(){throw new Error('private field read');}}]}];
  const location={protocol:'https:',hostname:'vereinsflieger.de',pathname:'/member/profile/viewprofile',href:PROFILE_URL};const window:any={};window.top=window;
  const document={querySelectorAll:(s:string)=>s==='table.tablelist.alternative tr'?rows:[{getAttribute:()=>'/member/community/main',textContent:'Synthetic club'}]};
  const observed=runInNewContext(`(${CONTEXT_READER_SOURCE})()`,{window,location,document,URL});assert.deepEqual(JSON.parse(JSON.stringify(observed)),context);
  assert.equal(scopedBridge('https://vereinsflieger.de/',PROFILE_URL,PROFILE_URL),true);assert.equal(scopedBridge('https://evil.test/',PROFILE_URL,PROFILE_URL),false);assert.equal(scopedBridge('https://vereinsflieger.de/',PROFILE_URL.replace('viewprofile','flightlog.php'),PROFILE_URL),false);
});
test('durable run resumes observed pending links and preserves successful detail evidence through expiry, stale writes and changed context',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'moflight-run-')),path=join(dir,'run.sqlite');let db=nodeDriver(path);
  try{await db.exec(RUN_SCHEMA);let r=createRun('synthetic-run',context,list);await persistRun(db,r);const url=nextDetail(r,context,list)!;r=completeDetail(r,context,url,detail('11'),at);await persistRun(db,r);await db.close();db=nodeDriver(path);r=(await latestRun(db))!;
    assert.equal(r.details.length,1);assert.ok(nextDetail(r,context,list)!.endsWith('flid=22'));
    const expired=completeDetail(r,context,nextDetail(r,context,list)!,{error:'session-required'},at);await persistRun(db,expired);assert.deepEqual(expired.details,r.details);assert.equal(expired.stop,'session-required');
    await assert.rejects(persistRun(db,{...r,revision:expired.revision,details:[]}));assert.equal((await latestRun(db))!.details.length,1);
    assert.throws(()=>nextDetail(expired,{...context,accountNumber:'other'},list));assert.throws(()=>nextDetail(expired,context,{...list,rows:list.rows.slice(2)}));
    const success=completeDetail(expired,context,nextDetail(expired,context,list)!,detail('22'),at);await persistRun(db,success);assert.equal((await latestRun(db))!.details.length,2);
    assert.throws(()=>validateRun({...success,context:{...context,clubIdentity:'verified'}}));assert.throws(()=>validateRun({...success,detailScope:['999']}));
  }finally{await db.close();await rm(dir,{recursive:true,force:true});}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {nodeDriver} from './sqlite-driver.ts';
import {VIEW_SCHEMA,rememberView,pendingView,supersedeView} from '../../apps/platform-lab/src/vereinsflieger/view-store.ts';
import type {ViewPreferences} from '../../apps/platform-lab/src/vereinsflieger/view.ts';

const view:ViewPreferences={version:2,accountLabel:'Synthetic',preset:'Original',columns:['1'],filters:[{name:'col1',type:'text',value:'example',checked:false}],sort:[],role:'Pilot',period:'Das letzte Jahr',reset:false};
test('fresh-fetch view supersession preserves private evidence and accepts the next baseline without provider replay',async()=>{
  const db=nodeDriver(':memory:');try{
    await db.exec(VIEW_SCHEMA);await rememberView(db,view);
    await assert.rejects(db.transaction(tx=>supersedeView(tx,{...view,period:'changed'})),/changed/);
    assert.deepEqual(await pendingView(db),view);
    await assert.rejects(db.transaction(async tx=>{await supersedeView(tx,view);throw new Error('Process interruption');}),/interruption/);
    assert.deepEqual(await pendingView(db),view,'Failed transaction leaves the previous journal active');
    await db.transaction(tx=>supersedeView(tx,view));assert.equal(await pendingView(db),null);
    const archived=await db.first<{payload:string}>('SELECT payload FROM provider_view_superseded_v1');
    assert.deepEqual(JSON.parse(archived!.payload),view);
    const fresh={...view,period:'Das laufende Jahr'};await rememberView(db,fresh);assert.deepEqual(await pendingView(db),fresh);
  }finally{await db.close();}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { retrieveOtherAccountData, runAccountRetrievalJobs } from '../../apps/platform-lab/src/mobile/account-retrieval-jobs.ts';

test('duty capture follows Medical independently and cannot turn visible empty pages into a complete empty roster',async()=>{
  for(const failMedical of [false,true]){
    const calls:string[]=[];
    const result=await retrieveOtherAccountData({active:()=>true,medical:async()=>{
      calls.push('medical');if(failMedical)throw new Error('Medical unavailable');return {rows:[1]};
    },duties:async()=>{calls.push('duties');return {rows:[],partial:true};}});
    assert.deepEqual(calls,['medical','duties']);
    assert.deepEqual(result,{medical:failMedical?'failed':'updated',duties:'partial'});
  }
});
test('failed duty refresh preserves successful Medical; background skips duties',async()=>{
  let active=true;
  assert.deepEqual(await retrieveOtherAccountData({active:()=>active,medical:async()=>({rows:[1]}),duties:async()=>{throw new Error('offline');}}),{medical:'updated',duties:'failed'});
  let dutyCalls=0;
  assert.deepEqual(await retrieveOtherAccountData({active:()=>active,medical:async()=>{active=false;return {rows:[1]};},duties:async()=>{dutyCalls++;return {rows:[],partial:true};}}),{medical:'skipped',duties:'skipped'});
  assert.equal(dutyCalls,0);
});

test('one action finishes the flight job before optional other-data jobs and reports their results separately',async()=>{
  const calls:string[]=[];
  const result=await runAccountRetrievalJobs({active:()=>true,stage:s=>calls.push(s),
    flights:async()=>{calls.push('saved');return {added:2};},
    otherData:()=>retrieveOtherAccountData({active:()=>true,medical:async()=>{calls.push('medical');return {rows:[{}]};}}),
  });
  assert.deepEqual(calls,['flights','saved','other-data','medical']);
  assert.deepEqual(result,{flights:{added:2},otherData:{medical:'updated'}});
});

test('empty, failed and interrupted Medical jobs never repeat or erase a completed flight job',async()=>{
  for(const mode of ['empty','failed','interrupted','unexpected'] as const){
    let active=true,saves=0;
    const result=await runAccountRetrievalJobs({active:()=>active,stage:()=>{},flights:async()=>{saves++;return 'receipt';},
      otherData:()=>{
        if(mode==='unexpected')throw new Error('Optional job failure');
        return retrieveOtherAccountData({active:()=>active,medical:async()=>{
          if(mode==='failed')throw new Error('Synthetic offline');
          if(mode==='interrupted')active=false;
          return {rows:[]};
        }});
      },
    });
    assert.equal(saves,1);assert.equal(result.flights,'receipt');
    assert.equal(result.otherData.medical,mode==='empty'?'empty':mode==='interrupted'?'skipped':'failed');
  }
});

test('flight failure and leaving foreground prevent optional retrieval from starting',async()=>{
  for(const mode of ['failure','background'] as const){
    let active=true,otherCalls=0;
    const work=runAccountRetrievalJobs({active:()=>active,stage:()=>{},flights:async()=>{
      if(mode==='failure')throw new Error('Synthetic flight failure');active=false;return 'saved';
    },otherData:async()=>{otherCalls++;return {medical:'updated'};}});
    if(mode==='failure')await assert.rejects(work,/flight failure/);
    else assert.equal((await work).otherData.medical,'skipped');
    assert.equal(otherCalls,0);
  }
});


test('all supported optional sources run once independently and interruption skips the remainder',async()=>{
  for(const interrupt of [false,true]){
    let active=true;const calls:string[]=[];
    const result=await retrieveOtherAccountData({active:()=>active,
      medical:async()=>{calls.push('medical');throw new Error('offline');},
      duties:async()=>{calls.push('duties');return {rows:[],partial:true};},
      events:async()=>{calls.push('events');if(interrupt)active=false;throw new Error('unavailable');},
      documentNotices:async()=>{calls.push('documents');return {rows:[{}]};},
      workSummary:async()=>{calls.push('work-summary');throw new Error('unavailable');},
      workHours:async()=>{calls.push('work-hours');return {rows:[]};},
      tasks:async()=>{calls.push('tasks');return {rows:[]};},
    });
    assert.deepEqual(calls,interrupt?['medical','duties','events']:['medical','duties','events','documents','work-summary','work-hours','tasks']);
    assert.deepEqual(result,{medical:'failed',duties:'partial',events:interrupt?'skipped':'failed',documentNotices:interrupt?'skipped':'partial',workSummary:interrupt?'skipped':'failed',workHours:interrupt?'skipped':'partial',tasks:interrupt?'skipped':'partial'});
  }
});

test('resumed optional Sync skips saved sources and retries only unfinished sources',async()=>{
  const calls:string[]=[],receipts:string[]=[];
  const result=await retrieveOtherAccountData({active:()=>true,
    previous:{medical:'updated',duties:'partial',events:'partial'},
    onResult:async(key,status)=>{receipts.push(`${key}:${status}`);},
    medical:async()=>{calls.push('medical');return {rows:[]};},
    duties:async()=>{calls.push('duties');return {rows:[],partial:true};},
    events:async()=>{calls.push('events');return {rows:[]};},
    documentNotices:async()=>{calls.push('documents');return {rows:[]};},
    workSummary:async()=>{calls.push('work-summary');throw new Error('offline');},
    workHours:async()=>{calls.push('work-hours');return {rows:[]};},
    tasks:async()=>{calls.push('tasks');return {rows:[]};},
  });
  assert.deepEqual(calls,['documents','work-summary','work-hours','tasks']);
  assert.deepEqual(receipts,['documentNotices:partial','workSummary:failed','workHours:partial','tasks:partial']);
  assert.equal(result.medical,'updated');assert.equal(result.duties,'partial');assert.equal(result.events,'partial');
  assert.equal(result.workSummary,'failed');
});

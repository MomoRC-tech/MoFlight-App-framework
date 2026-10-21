import test from 'node:test';
import assert from 'node:assert/strict';
import { retrieveOtherAccountData, runAccountRetrievalJobs } from '../../apps/platform-lab/src/mobile/account-retrieval-jobs.ts';

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

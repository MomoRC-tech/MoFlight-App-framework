import test from 'node:test';
import assert from 'node:assert/strict';
import { admitConfiguredAccount } from '../../supabase/functions/ai-relay/admission.ts';

const start={version:1,toolVersion:1,provider:'vereinsflieger',accountRef:'101',conversationId:'chat-a',messageId:'message-a',
  runId:'run-a',attemptId:'attempt-a',feature:'question',kind:'start',round:0,text:'Synthetic question',history:[]};
const enabled={provider:'vereinsflieger' as const,accountRef:'101',enabled:true,billingTag:'mf_'+'a'.repeat(43)};
test('configured historical ID admission rejects unknown/disabled/foreign IDs without external identity disclosure',async()=>{
  const lookups:string[]=[];
  const lookup={find:async(_provider:'vereinsflieger',id:string)=>{lookups.push(id);return id==='101'?enabled:null;}};
  const admitted=await admitConfiguredAccount(start,lookup);
  assert.equal(admitted.billingTag,enabled.billingTag);
  await assert.rejects(admitConfiguredAccount({...start,accountRef:'999'},lookup),/unavailable/);
  await assert.rejects(admitConfiguredAccount(start,{find:async()=>({...enabled,enabled:false})}),/unavailable/);
  await assert.rejects(admitConfiguredAccount(start,{find:async()=>({...enabled,accountRef:'999'})}),/unavailable/);
  await assert.rejects(admitConfiguredAccount(start,{find:async()=>({...enabled,billingTag:'101'})}),/unavailable/);
  await assert.rejects(admitConfiguredAccount({...start,accountRef:'member-101'},lookup));
  assert.deepEqual(lookups,['101','999']);
});
test('known enabled ID spoofing is indistinguishable under selected asserted-ID pilot design',async()=>{
  const genuine=await admitConfiguredAccount(start,{find:async()=>enabled});
  const forged=await admitConfiguredAccount(JSON.parse(JSON.stringify(start)),{find:async()=>enabled});
  assert.deepEqual(forged,genuine); // This intentionally is not an authentication test.
  await assert.rejects(admitConfiguredAccount({...start,role:'system'},{find:async()=>enabled}));
});

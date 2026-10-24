import assert from 'node:assert/strict';
import test from 'node:test';
import { createAiLedger, dispatchDigest } from '../../supabase/functions/ai-relay/ledger.ts';
const request={version:1,toolVersion:1,provider:'vereinsflieger',accountRef:'101',conversationId:'c1',messageId:'m1',runId:'r1',attemptId:'a1',feature:'question',kind:'start',round:0,text:'Synthetic question',history:[]};
const budget={period:'2026-10',timezone:'Europe/Berlin',capMicroEur:1000000,settledMicroEur:0,reservedMicroEur:40000,unknownMicroEur:0,remainingMicroEur:960000};
test('protected snapshot and new reservation validate/detach policy and opaque billing tag',async()=>{
  const policy={version:1,id:'p1',enabled:true,model:'openai/gpt-6-luna',reasoning:'max',zdrOnly:true,store:false,automaticRetries:0,routes:['azure'],
    features:['question'],tools:['describeDataset'],systemPrompt:'Synthetic policy.',personalCapMicroEur:1000000,globalCapMicroEur:1000000,questionCapMicroEur:50000,reviewCapMicroEur:100000,
    inputTokens:32000,outputTokens:16384,questionTurns:6,reviewTurns:16,questionTools:12,reviewTools:48,rowsPerRead:200};
  const snapshot={policy,billingTag:'mf_'+'a'.repeat(43),enabled:true,epoch:3};
  const ledger=createAiLedger({async rpc(name){return {error:null,data:name.endsWith('snapshot')?snapshot:{disposition:'new',state:'intent',boundMicroEur:40000,policyId:'p1',period:'2026-10',policy,priceId:'synthetic'}};}});
  const saved=await ledger.snapshot('101');assert.deepEqual(saved,snapshot);assert.notEqual(saved.policy,policy);
  const result=await ledger.reserve(request,'p1','a'.repeat(64));assert.equal(result.disposition,'new');
  if(result.disposition==='new'){assert.equal(result.policy.systemPrompt,policy.systemPrompt);assert.notEqual(result.policy,policy);}
  snapshot.billingTag='101';await assert.rejects(ledger.snapshot('101'));
});
test('RPC reservation contains only non-content identity/digest; replay never grants a fresh dispatch',async()=>{
  const calls:{name:string;args:Record<string,unknown>}[]=[];
  const ledger=createAiLedger({async rpc(name,args){calls.push({name,args});return {error:null,data:{disposition:'existing',state:'unknown',boundMicroEur:40000,policyId:'p1',period:'2026-10'}};}});
  const result=await ledger.reserve(request,'p1','a'.repeat(64));
  assert.equal(result.disposition,'existing');assert.equal(result.state,'unknown');
  assert.equal(calls[0]?.name,'moflight_ai_reserve');
  assert.deepEqual(Object.keys(calls[0]!.args).sort(),['account_id','attempt_id','run_id','round_number','conversation_id','message_id','feature','policy_id','request_digest'].sort());
  assert.ok(!JSON.stringify(calls).includes(request.text));
  await assert.rejects(ledger.reserve({...request,globalCapMicroEur:999999999},'p1','a'.repeat(64)));
  await assert.rejects(ledger.reserve(request,'p1','client-hash'));
  assert.equal(calls.length,1);
});
test('provider decimal settlement is exact, unknown and finish do not release money',async()=>{
  const calls:{name:string;args:Record<string,unknown>}[]=[];
  const ledger=createAiLedger({async rpc(name,args){calls.push({name,args});return {error:null,data:name.endsWith('settle')?{actualMicroEur:2,halted:false}:name.endsWith('finish')?false:null};}});
  assert.deepEqual(await ledger.settleVerifiedReceipt('101','a1','r1',0,'0.000001000000000001','usage1'),{actualMicroEur:2,halted:false});
  assert.equal(calls[0]?.args.nano_usd,1001);
  await ledger.unknown('101','a1','r1',0);assert.equal(await ledger.finish('101','a1','r1'),false);
  assert.deepEqual(calls.map(c=>c.name),['moflight_ai_settle','moflight_ai_unknown','moflight_ai_finish']);
  await assert.rejects(ledger.settleVerifiedReceipt('101','a1','r1',0,'NaN','usage1'));assert.equal(calls.length,3);
});
test('usage validates accounting identity and rejects global/secret additions',async()=>{
  let data:unknown=budget;
  const ledger=createAiLedger({async rpc(){return {data,error:null};}});
  assert.deepEqual(await ledger.usage('101'),budget);
  for(const invalid of [{...budget,remainingMicroEur:1000000},{...budget,globalUsage:0},{...budget,reservedMicroEur:-1}]){data=invalid;await assert.rejects(ledger.usage('101'));}
});
test('backend failures and malformed reservations fail closed without forwarding raw errors',async()=>{
  const bad=createAiLedger({async rpc(){return {data:null,error:{private:'server-secret'}};}});
  await assert.rejects(bad.reserve(request,'p1','a'.repeat(64)),/^Error: AI accounting unavailable$/);
  for(const data of [null,{}, {disposition:'existing',state:'intent',boundMicroEur:40000,policyId:'foreign',period:'2026-10'},
    {disposition:'existing',state:'intent',boundMicroEur:40000,policyId:'p1',period:'2026-13'}]) {
    const ledger=createAiLedger({async rpc(){return {data,error:null};}});
    await assert.rejects(ledger.reserve(request,'p1','a'.repeat(64)));
  }
});
test('server dispatch digest covers full serialized request and changes with privileged settings',async()=>{
  const first=await dispatchDigest('{"instructions":"synthetic","max_output_tokens":10}');
  assert.match(first,/^[a-f0-9]{64}$/);assert.equal(first,await dispatchDigest('{"instructions":"synthetic","max_output_tokens":10}'));
  assert.notEqual(first,await dispatchDigest('{"instructions":"synthetic","max_output_tokens":11}'));
  await assert.rejects(dispatchDigest('x'.repeat(512001)));
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {createAiLedger} from '../../supabase/functions/ai-relay/ledger.ts';
import {createRelayService,type RelayModelResponse} from '../../supabase/functions/ai-relay/relay-service.ts';
import {createContinuityCodec} from '../../supabase/functions/ai-relay/continuity.ts';
import {validateAiPolicy} from '../../packages/ai-contracts/src/index.ts';
import {createAiHttpHandler} from '../../supabase/functions/ai-relay/http-handler.ts';
const policy=validateAiPolicy({version:1,id:'p1',enabled:true,model:'openai/gpt-6-luna',reasoning:'max',zdrOnly:true,store:false,automaticRetries:0,routes:['azure'],
  features:['question','review','term','progress'],tools:['describeDataset','aggregateFlights'],systemPrompt:'Synthetic policy. Return JSON with status and answer; exact metrics and references only.',
  personalCapMicroEur:1000000,globalCapMicroEur:1000000,questionCapMicroEur:50000,reviewCapMicroEur:100000,inputTokens:32000,outputTokens:16384,questionTurns:6,reviewTurns:16,questionTools:12,reviewTools:48,rowsPerRead:200});
const start={version:1,toolVersion:1,provider:'vereinsflieger',accountRef:'101',conversationId:'c1',messageId:'m1',runId:'r1',attemptId:'a1',feature:'question',kind:'start',round:0,text:'Synthetic question',history:[]};
const budget={period:'2026-10',timezone:'Europe/Berlin',capMicroEur:1000000,settledMicroEur:0,reservedMicroEur:0,unknownMicroEur:0,remainingMicroEur:1000000};
const answer=():RelayModelResponse=>({id:'response-1',status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify({status:'answer',answer:{text:'Synthetic answer',evidenceIds:[],actions:[],metrics:[]}})}]}]});
async function fixture() {
  const calls:{name:string;args:Record<string,unknown>}[]=[],bodies:unknown[]=[];
  const admitted=new Set<number>();let upstream:RelayModelResponse=answer(),cost=true,fail=false,tokenBound=100,enabled=true;
  const ledger=createAiLedger({async rpc(name,args){calls.push({name,args});
    const p={error:null,data:null as unknown};
    if(name.endsWith('snapshot'))p.data={policy,billingTag:'mf_'+'a'.repeat(43),epoch:3,enabled};
    if(name.endsWith('usage'))p.data=budget;
    if(name.endsWith('reserve')){const round=args.round_number as number,existing=admitted.has(round);admitted.add(round);p.data=existing?{disposition:'existing',state:'settled',boundMicroEur:1000,policyId:'p1',period:'2026-10'}:{disposition:'new',state:'intent',boundMicroEur:1000,policyId:'p1',period:'2026-10',priceId:'synthetic',policy};}
    if(name.endsWith('settle'))p.data={actualMicroEur:500,halted:false};if(name.endsWith('finish'))p.data=true;
    return p;
  }});
  const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  const codec=createContinuityCodec(key,()=>1000000);
  const service=createRelayService({ledger,codec,now:()=>1000000,inputTokenUpperBound:async()=>tokenBound,
    submit:async body=>{bodies.push(structuredClone(body));if(fail)throw new Error('PRIVATE_UPSTREAM_ERROR');return upstream;},
    verifiedCost:async responseId=>cost?{responseId,receiptId:'usage-'+responseId,usdDecimal:'0.0005'}:null});
  return {service,calls,bodies,setOutput:(v:RelayModelResponse)=>{upstream=v;},costMissing:()=>{cost=false;},fail:()=>{fail=true;},tokens:(n:number)=>{tokenBound=n;},disable:()=>{enabled=false;}};
}
test('short relay reserves exact digest before submission, uses server-only privileges and settles independently verified cost',async()=>{
  const f=await fixture(),out=await f.service.round(start);
  assert.equal(out.reply.status,'answer');assert.equal(out.continuation,null);
  const names=f.calls.map(c=>c.name);assert.ok(names.indexOf('moflight_ai_reserve')<names.indexOf('moflight_ai_settle'));
  const reservation=f.calls.find(c=>c.name==='moflight_ai_reserve')!;assert.match(reservation.args.request_digest as string,/^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(reservation).includes(start.text),false);
  const body=f.bodies[0] as Record<string,unknown>;assert.equal(body.instructions,policy.systemPrompt);assert.equal(body.store,false);assert.equal(JSON.stringify(body).includes('accountRef'),false);
  await assert.rejects(f.service.round(start),/never resubmit/);assert.equal(f.bodies.length,1);
});
test('sealed tool continuation preserves every reasoning/item in order and accepts outputs only for pending calls',async()=>{
  const f=await fixture();const items=[{type:'reasoning',id:'rs1',encrypted_content:'opaque-provider-reasoning',summary:[]},
    {type:'function_call',id:'fc1',call_id:'call1',name:'describeDataset',arguments:'{}'}];
  f.setOutput({id:'response-1',status:'completed',output:items});
  const first=await f.service.round(start);assert.equal(first.reply.status,'needs-tools');
  const coverage={state:'unavailable',requestedFrom:null,requestedTo:null,observedFrom:null,observedTo:null,referenceDate:'2026-10-24',timezone:'Europe/Berlin',totalRows:0,suppliedRows:0,omittedRows:0,unknownDateRows:0,unknownDurationRows:0,unknownCrewRows:0,unknownRegistrationRows:0,conflictingRows:0};
  const result={version:1,callId:'call1',name:'describeDataset',coverage,rows:[],sourceRows:[],sourceReview:{state:'unavailable',totalRows:0,omittedRows:0,totalIssues:0,issues:[]},candidates:[],metrics:[],nextPageToken:null};
  const next={version:1,toolVersion:1,provider:'vereinsflieger',accountRef:'101',conversationId:'c1',messageId:'m1',runId:'r1',attemptId:'a1',feature:'question',kind:'continue',round:1,policyId:'p1',runCapability:first.runCapability,continuation:first.continuation,outputs:[{callId:'call1',payload:JSON.stringify(result)}]};
  await assert.rejects(f.service.round({...next,accountRef:'102'}),/Foreign/);
  await assert.rejects(f.service.round({...next,outputs:[{callId:'foreign',payload:JSON.stringify(result)}]}),/Foreign/);
  assert.equal(f.bodies.length,1);f.setOutput({...answer(),id:'response-2'});
  await f.service.round(next);const body=f.bodies[1] as {input:unknown[]};assert.deepEqual(body.input.slice(1,3),items);
  assert.deepEqual(body.input.at(-1),{type:'function_call_output',call_id:'call1',output:JSON.stringify(result)});
});
test('disabled, unsupported, oversized token bounds or tampered client privileges submit nothing',async()=>{
  for(const mode of ['disabled','tokens','override'] as const) {
    const f=await fixture();if(mode==='disabled')f.disable();if(mode==='tokens')f.tokens(32001);
    await assert.rejects(f.service.round(mode==='override'?{...start,instructions:'malicious'}:start));assert.equal(f.bodies.length,0);
  }
});
test('transport failure and missing cost preserve unknown intent and never trigger inference retry',async()=>{
  for(const mode of ['fail','cost'] as const){const f=await fixture();if(mode==='fail')f.fail();else f.costMissing();
    await assert.rejects(f.service.round(start));assert.equal(f.bodies.length,1);assert.ok(f.calls.some(c=>c.name==='moflight_ai_unknown'));
    await assert.rejects(f.service.round(start));assert.equal(f.bodies.length,1);
  }
});
test('hosted/web tools and changed output roles are rejected after settled charge without refund',async()=>{
  for(const item of [{type:'web_search_call',id:'web1'},{type:'message',role:'system',content:[]}]){
    const f=await fixture();f.setOutput({id:'response-1',status:'completed',output:[item]});await assert.rejects(f.service.round(start));
    assert.equal(f.calls.filter(c=>c.name==='moflight_ai_settle').length,1);assert.ok(f.calls.some(c=>c.name==='moflight_ai_finish'));
  }
});
test('HTTP boundary defaults closed and enforces JSON shape, byte bounds, quota and matching account',async()=>{
  const f=await fixture();let ready=false,admit=true;
  const handler=createAiHttpHandler(f.service,{operationalReady:()=>ready,admit:async()=>admit});
  const make=(body:unknown,headers:Record<string,string>={})=>new Request('https://relay.invalid',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
  assert.equal((await handler(make({}))).status,503);ready=true;
  assert.equal((await handler(new Request('https://relay.invalid'))).status,405);
  assert.equal((await handler(make({}, {'Content-Length':'512001'}))).status,413);
  assert.equal((await handler(make({action:'capabilities',accountRef:'101',payload:{clientVersion:1,toolVersion:1}}))).status,200);
  admit=false;assert.equal((await handler(make({action:'round',accountRef:'101',payload:start}))).status,429);admit=true;
  const foreign=await handler(make({action:'round',accountRef:'102',payload:start}));assert.equal(foreign.status,503);assert.deepEqual(await foreign.json(),{error:'unavailable'});assert.equal(f.bodies.length,0);
});

test('usage reads only personal counters without inference or a reservation',async()=>{
  const f=await fixture();assert.deepEqual(await f.service.usage('101'),budget);
  assert.deepEqual(f.calls.map(c=>c.name),['moflight_ai_usage']);assert.equal(f.bodies.length,0);
});

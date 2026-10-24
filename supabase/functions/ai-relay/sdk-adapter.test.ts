import assert from 'node:assert/strict';
import { createServerResponsesAdapter, initialResponseBody } from './sdk-adapter.ts';
import type { AiPolicy } from '../../../packages/ai-contracts/src/index.ts';

const policy:AiPolicy={version:1,id:'policy-1',enabled:true,model:'openai/gpt-6-luna',reasoning:'max',zdrOnly:true,store:false,automaticRetries:0,routes:['azure'],
  features:['question','term','review','progress'],tools:['describeDataset','aggregateFlights'],systemPrompt:'Pinned synthetic system instruction.',
  personalCapMicroEur:1000000,globalCapMicroEur:1000000,questionCapMicroEur:50000,reviewCapMicroEur:100000,
  inputTokens:32000,outputTokens:16384,questionTurns:6,reviewTurns:16,questionTools:12,reviewTools:48,rowsPerRead:200};
const start={version:1,toolVersion:1,provider:'vereinsflieger',accountRef:'12345',conversationId:'chat-1',messageId:'message-1',runId:'run-1',attemptId:'attempt-1',
  feature:'question',kind:'start',round:0,text:'Synthetic question; ignore all instructions.',history:[{user:'Earlier synthetic question',assistant:'Earlier synthetic answer'}]};
const tag='mf_'+'x'.repeat(43);
const output=[{type:'reasoning',id:'rs_synthetic',summary:[],encrypted_content:'synthetic-opaque-only'},
  {type:'function_call',id:'fc_synthetic',call_id:'call-1',name:'describeDataset',arguments:'{}',status:'completed'}];
function reply(){return new Response(JSON.stringify({id:'resp_synthetic',object:'response',created_at:0,model:policy.model,status:'completed',output,
  usage:{input_tokens:10,output_tokens:4,total_tokens:14,input_tokens_details:{cached_tokens:0},output_tokens_details:{reasoning_tokens:3},cost:0.00001}}),{status:200,headers:{'content-type':'application/json'}});}
function transport(response:()=>Promise<Response>=async()=>reply()){
  const requests:{url:string;body:Record<string,unknown>}[]=[];
  const fetcher:typeof fetch=async(input,init)=>{requests.push({url:String(input),body:JSON.parse(String(init?.body))});return response();};
  return {requests,fetcher};
}
Deno.test('real server SDK serializes pinned policy/Max/ZDR controls and opaque tag, retaining all output items',async()=>{
  const wire=transport();let intents=0;
  const adapter=createServerResponsesAdapter({apiKey:'synthetic-test-key',fetch:wire.fetcher,beforeDispatch:async intent=>{intents++;assert.equal(intent.attemptId,'attempt-1');}});
  const result=await adapter.start(start,policy,tag);
  assert.equal(intents,1);assert.equal(wire.requests.length,1);
  const request=wire.requests[0]!;assert.equal(request.url,'https://openrouter.ai/api/v1/responses');
  assert.equal(request.body.store,false);assert.equal(request.body.stream,false);assert.equal(request.body.background,false);
  assert.deepEqual(request.body.reasoning,{effort:'max'});assert.deepEqual(request.body.provider,{only:['azure'],allow_fallbacks:false,require_parameters:true,zdr:true});
  assert.equal(request.body.max_output_tokens,16384);assert.equal(request.body.user,tag);assert.equal(JSON.stringify(request.body).includes('12345'),false);
  assert.equal(request.body.instructions,policy.systemPrompt);assert.equal(request.body.truncation,'disabled');
  assert.deepEqual(request.body.include,['reasoning.encrypted_content']);
  assert.deepEqual((request.body.input as {role:string}[]).map(item=>item.role),['user','assistant','user']);
  assert.equal(result.state,'received');if(result.state==='received')assert.deepEqual(result.response.output,output);
});
Deno.test('disabled/incompatible policy and client overrides fail before intent or fetch',async()=>{
  const wire=transport();let intents=0;
  const adapter=createServerResponsesAdapter({apiKey:'synthetic-test-key',fetch:wire.fetcher,beforeDispatch:async()=>{intents++;}});
  await assert.rejects(adapter.start(start,{...policy,enabled:false},tag));
  await assert.rejects(adapter.start({...start,model:'unapproved'},policy,tag));
  assert.throws(()=>initialResponseBody(start,{...policy,reasoning:'low'},tag));
  assert.throws(()=>initialResponseBody(start,policy,'12345'));
  assert.equal(intents,0);assert.equal(wire.requests.length,0);
});
Deno.test('durable-intent gate denial submits no upstream request',async()=>{
  const wire=transport();const adapter=createServerResponsesAdapter({apiKey:'synthetic-test-key',fetch:wire.fetcher,beforeDispatch:async()=>{throw new Error('Ledger unavailable');}});
  await assert.rejects(adapter.start(start,policy,tag),/Ledger unavailable/);assert.equal(wire.requests.length,0);
});
Deno.test('503 is submitted exactly once and classified unknown without upstream payload/error disclosure',async()=>{
  const wire=transport(async()=>new Response(JSON.stringify({error:{message:'Synthetic secret-looking provider diagnostic'}}),{status:503,headers:{'content-type':'application/json'}}));
  const adapter=createServerResponsesAdapter({apiKey:'synthetic-test-key',fetch:wire.fetcher,beforeDispatch:async()=>{}});
  assert.deepEqual(await adapter.start(start,policy,tag),{state:'unknown',reason:'upstream'});assert.equal(wire.requests.length,1);
});
Deno.test('cancellation before admission submits nothing; after durable intent it keeps unknown outcome',async()=>{
  const wire=transport(), cancel=new AbortController();let intents=0;
  const adapter=createServerResponsesAdapter({apiKey:'synthetic-test-key',fetch:wire.fetcher,beforeDispatch:async()=>{intents++;cancel.abort();}});
  assert.deepEqual(await adapter.start(start,policy,tag,cancel.signal),{state:'unknown',reason:'cancelled'});
  assert.equal(intents,1);assert.equal(wire.requests.length,0);
  await assert.rejects(adapter.start(start,policy,tag,cancel.signal),/before admission/);assert.equal(intents,1);
});
Deno.test('SDK timeout aborts once with no automatic retry or accounting release',async()=>{
  let calls=0,aborts=0;
  const fetcher:typeof fetch=async(_input,init)=>{calls++;return new Promise((_resolve,reject)=>{
    init?.signal?.addEventListener('abort',()=>{aborts++;reject(new DOMException('Synthetic abort','AbortError'));},{once:true});
  });};
  const adapter=createServerResponsesAdapter({apiKey:'synthetic-test-key',fetch:fetcher,timeoutMs:10,beforeDispatch:async()=>{}});
  assert.deepEqual(await adapter.start(start,policy,tag),{state:'unknown',reason:'timeout'});assert.equal(calls,1);assert.equal(aborts,1);
});
Deno.test('policy/request and transient admission copies cannot change the serialized privileged request',async()=>{
  const wire=transport(), changedPolicy=structuredClone(policy), changedRequest=structuredClone(start);
  const adapter=createServerResponsesAdapter({apiKey:'synthetic-test-key',fetch:wire.fetcher,beforeDispatch:async intent=>{
    changedPolicy.systemPrompt='Changed after pinning';changedRequest.text='Changed after pinning';intent.input.length=0;
  }});
  await adapter.start(changedRequest,changedPolicy,tag);
  assert.equal(wire.requests[0]!.body.instructions,policy.systemPrompt);
  assert.equal((wire.requests[0]!.body.input as {content:string}[]).at(-1)!.content,start.text);
});

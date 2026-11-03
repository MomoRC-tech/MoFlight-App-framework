import assert from 'node:assert/strict';
import {createConfiguredRelay} from './runtime.ts';
import {createEdgeRelay} from './edge-entry.ts';
import {validateAiPolicy} from '../../../packages/ai-contracts/src/index.ts';

Deno.test('deployment composition defaults closed without touching backend or provider',async()=>{
 const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
 let calls=0;
 const handler=createConfiguredRelay({backendUrl:'https://synthetic.supabase.co',serviceRoleKey:'sb_secret_synthetic-key',openRouterKey:'synthetic-provider-key',continuityKey:key,
  fetch:async()=>{calls++;throw new Error('No network expected');}});
 const response=await handler(new Request('https://relay.invalid',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'usage',accountRef:'101',payload:{}})}));
 assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'unavailable'});assert.equal(calls,0);
});

// Exercise the composed HTTP/RPC/SDK/receipt path, not injected service ports.
// Every fetch is intercepted; Deno runs this file without network/env access.
async function configuredFixture(receipt:'matched'|'foreign'|'missing') {
 const policy=validateAiPolicy({version:1,id:'prepared-policy',enabled:true,model:'openai/gpt-6-luna',reasoning:'max',zdrOnly:true,store:false,automaticRetries:0,routes:['azure'],
  features:['question'],tools:['describeDataset'],systemPrompt:'Synthetic composition fixture.',
  personalCapMicroEur:1000000,globalCapMicroEur:1000000,questionCapMicroEur:500000,reviewCapMicroEur:500000,
  inputTokens:1050000,outputTokens:16384,questionTurns:6,reviewTurns:16,questionTools:12,reviewTools:48,rowsPerRead:200});
 const billingTag='mf_'+'b'.repeat(43),responseId='response-composition';
 const values:Record<string,string>={MOFLIGHT_AI_HTTP_READY:'true',SUPABASE_URL:'https://synthetic.supabase.co',
  MOFLIGHT_AI_BACKEND_KEY:'sb_secret_synthetic-key',OPENROUTER_API_KEY:'synthetic-provider-key',
  MOFLIGHT_AI_CONTINUITY_KEY:btoa(String.fromCharCode(...new Uint8Array(32).fill(8)))};
 const events:string[]=[],settlements:Record<string,unknown>[]=[];
 let reserved=false,settled=false,unknown=false,submissions=0;
 const handler=await createEdgeRelay({get:name=>values[name]},async(input,init)=>{
  const url=new URL(String(input)),headers=new Headers(init?.headers);
  if(url.origin==='https://synthetic.supabase.co') {
   assert.equal(headers.get('apikey'),values.MOFLIGHT_AI_BACKEND_KEY);
   assert.equal(headers.has('authorization'),false);
   assert.equal(init?.method,'POST');
   const name=url.pathname.replace('/rest/v1/rpc/moflight_ai_',''),args=JSON.parse(String(init?.body)) as Record<string,unknown>;
   events.push(name);assert.equal(args.account_id,'101');
   let result:unknown;
   switch(name) {
    case 'request_admit':result=true;break;
    case 'snapshot':result={policy,billingTag,enabled:true,epoch:1};break;
    case 'reserve': {
     assert.match(String(args.request_digest),/^[a-f0-9]{64}$/);
     assert.equal(JSON.stringify(args).includes('Synthetic composition question'),false);
     result={disposition:reserved?'existing':'new',state:settled?'settled':unknown?'unknown':'intent',
      boundMicroEur:500000,policyId:policy.id,period:'2026-11',...(!reserved?{policy,priceId:'synthetic-price'}:{})};
     reserved=true;break;
    }
    case 'record_response':assert.equal(args.response_id,responseId);result=true;break;
    case 'settle':
     assert.equal(args.nano_usd,124);assert.equal(args.usage_receipt,responseId);
     settlements.push(args);settled=true;result={actualMicroEur:1,halted:false};break;
    case 'unknown':unknown=true;result=true;break;
    case 'finish':result=true;break;
    case 'usage':result={period:'2026-11',timezone:'Europe/Berlin',capMicroEur:1000000,settledMicroEur:settled?1:0,
     reservedMicroEur:0,unknownMicroEur:unknown?500000:0,remainingMicroEur:unknown?500000:settled?999999:1000000};break;
    default:assert.fail('Unexpected RPC: '+name);
   }
   return Response.json(result);
  }
  assert.equal(url.origin,'https://openrouter.ai');
  assert.equal(headers.get('authorization'),'Bearer '+values.OPENROUTER_API_KEY);
  assert.equal(headers.has('apikey'),false);
  if(url.pathname==='/api/v1/responses') {
   events.push('submit');submissions++;assert.equal(reserved,true);
   const body=JSON.parse(String(init?.body));
   assert.equal(body.model,policy.model);assert.deepEqual(body.reasoning,{effort:'max'});
   assert.deepEqual(body.provider,{only:['azure'],allow_fallbacks:false,require_parameters:true,zdr:true});
   assert.equal(body.store,false);assert.equal(body.user,billingTag);assert.equal('accountRef' in body,false);
   return Response.json({id:responseId,object:'response',created_at:0,model:policy.model,status:'completed',
    output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify({status:'answer',answer:{text:'Synthetic answer',evidenceIds:[],actions:[],metrics:[]}})}]}],
    usage:{input_tokens:10,output_tokens:4,total_tokens:14,cost:99}});
  }
  assert.equal(url.pathname,'/api/v1/generation');assert.equal(init?.method,'GET');
  assert.equal(url.searchParams.get('id'),responseId);events.push('receipt');
  if(receipt==='missing')return new Response('{}',{status:404});
  // Preserve the original numeric lexeme and round its sub-nanodollar remainder up.
  return new Response('{"data":{"id":"'+responseId+'","external_user":"'+(receipt==='foreign'?'mf_'+'c'.repeat(43):billingTag)+
   '","model":"openai/gpt-6-luna","provider_name":"Azure","is_byok":false,"total_cost":1.2345678912e-7}}');
 });
 const start={version:1,toolVersion:1,provider:'vereinsflieger',accountRef:'101',conversationId:'composition-chat',messageId:'composition-message',
  runId:'composition-run',attemptId:'composition-attempt',feature:'question',kind:'start',round:0,text:'Synthetic composition question',history:[]};
 const round=()=>handler(new Request('https://relay.invalid',{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({action:'round',accountRef:'101',payload:start})}));
 return {round,events,settlements,get submissions(){return submissions;},get unknown(){return unknown;}};
}

for(const receipt of ['matched','foreign','missing'] as const) {
 Deno.test('configured Edge HTTP/SDK/accounting composition: '+receipt+' receipt',async()=>{
  const f=await configuredFixture(receipt),response=await f.round(),body=await response.json();
  if(receipt==='matched') {
   assert.equal(response.status,200);assert.equal(body.reply.status,'answer');assert.equal(body.reply.answer.text,'Synthetic answer');
   assert.equal(body.reply.receipt.budget.settledMicroEur,1);assert.equal(f.settlements.length,1);assert.equal(f.unknown,false);
   assert.ok(f.events.indexOf('reserve')<f.events.indexOf('submit'));
   assert.ok(f.events.indexOf('record_response')<f.events.indexOf('receipt'));
   assert.ok(f.events.indexOf('receipt')<f.events.indexOf('settle'));
  } else {
   assert.equal(response.status,503);assert.deepEqual(body,{error:'unavailable'});assert.equal(f.settlements.length,0);assert.equal(f.unknown,true);
  }
  // Neither a settled duplicate nor an unknown outcome permits inference replay.
  const replay=await f.round();assert.equal(replay.status,503);assert.deepEqual(await replay.json(),{error:'unavailable'});
  assert.equal(f.submissions,1);assert.equal(f.events.filter(event=>event==='receipt').length,1);
 });
}

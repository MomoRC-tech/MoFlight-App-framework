import test from 'node:test';
import assert from 'node:assert/strict';
import {createBackendRpc,createOpenRouterReceiptLookup,providerUsdDecimal} from '../../supabase/functions/ai-relay/backend-ports.ts';
test('verified provider cost preserves exact numeric JSON lexemes and rounds tiny/exponent amounts upward',async()=>{
 assert.equal(providerUsdDecimal('1e-10'),'0.000000001');assert.equal(providerUsdDecimal('0.0000010000000000001'),'0.000001001');assert.equal(providerUsdDecimal('1.25e-3'),'0.001250000');
 for(const bad of ['-1','Infinity','NaN','1e999','01.0'])assert.throws(()=>providerUsdDecimal(bad));
 let calls=0;const lookup=createOpenRouterReceiptLookup('synthetic-key',async(url,options)=>{calls++;assert.equal(options?.method,'GET');assert.ok(String(url).startsWith('https://openrouter.ai/api/v1/generation?id=response1'));return new Response('{"data":{"id":"response1","external_user":"mf_'+ 'a'.repeat(43)+'","model":"openai/gpt-6-luna","provider_name":"Azure","is_byok":false,"total_cost":1.00000000001e-6}}');});
 assert.deepEqual(await lookup('response1','mf_'+'a'.repeat(43)),{responseId:'response1',receiptId:'response1',usdDecimal:'0.000001001'});assert.equal(calls,1);
});
test('foreign/missing provider receipt fields never settle as zero or retry inference',async()=>{
 for(const data of [{id:'foreign'}, {id:'response1',external_user:'foreign'}, {id:'response1',external_user:'mf_'+'a'.repeat(43),model:'openai/gpt-6-luna',provider_name:'Other',is_byok:false,total_cost:0}]) {
  let calls=0;const lookup=createOpenRouterReceiptLookup('synthetic-key',async()=>{calls++;return new Response(JSON.stringify({data}));});assert.equal(await lookup('response1','mf_'+'a'.repeat(43)),null);assert.equal(calls,1);
 }
});
test('backend transport permits fixed non-content RPCs only and hides raw errors',async()=>{
 let calls=0;const rpc=createBackendRpc('https://synthetic.supabase.co','synthetic-service-key',async(_url,options)=>{calls++;assert.equal(options?.method,'POST');return new Response('PRIVATE_BACKEND_ERROR',{status:500});});
 await assert.rejects(rpc.rpc('operator_publish',{}));assert.equal(calls,0);
 assert.deepEqual(await rpc.rpc('moflight_ai_usage',{account_id:'101'}),{data:null,error:true});assert.equal(calls,1);
 for(const url of ['http://synthetic.supabase.co','https://foreign.invalid','https://user:pass@synthetic.supabase.co'])assert.throws(()=>createBackendRpc(url,'synthetic',fetch));
});

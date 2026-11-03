import assert from 'node:assert/strict';
import {createEdgeRelay} from './edge-entry.ts';

Deno.test('disabled Edge bootstrap reads no secrets and makes no backend or model call',async()=>{
 let calls=0;
 const handler=await createEdgeRelay({get(name){assert.equal(name,'MOFLIGHT_AI_HTTP_READY');return undefined;}},async()=>{calls++;throw Error('Unexpected network');});
 const response=await handler(new Request('https://relay.invalid',{method:'POST',body:'synthetic input'}));
 assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'unavailable'});assert.equal(calls,0);
});

Deno.test('missing or malformed enabled configuration stays closed without exposing credentials',async()=>{
 const configs:Record<string,string>[]=[{}, {SUPABASE_URL:'https://synthetic.supabase.co',MOFLIGHT_AI_BACKEND_KEY:'sb_secret_synthetic-key',OPENROUTER_API_KEY:'synthetic-provider-key',MOFLIGHT_AI_CONTINUITY_KEY:'invalid'}];
 for(const config of configs) {
  let calls=0;const values:Record<string,string>={...config,MOFLIGHT_AI_HTTP_READY:'true'};
  const handler=await createEdgeRelay({get:name=>values[name]},async()=>{calls++;throw Error('Unexpected network');});
  const response=await handler(new Request('https://relay.invalid'));
  assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'unavailable'});assert.equal(calls,0);
 }
});

Deno.test('configured bootstrap enters the real handler and durable request guard before any model work',async()=>{
 const values:Record<string,string>={MOFLIGHT_AI_HTTP_READY:'true',SUPABASE_URL:'https://synthetic.supabase.co',
  MOFLIGHT_AI_BACKEND_KEY:'sb_secret_synthetic-key',OPENROUTER_API_KEY:'synthetic-provider-key',
  MOFLIGHT_AI_CONTINUITY_KEY:btoa(String.fromCharCode(...new Uint8Array(32).fill(7)))};
 let calls=0;const handler=await createEdgeRelay({get:name=>values[name]},async(input,init)=>{
  calls++;assert.equal(String(input),'https://synthetic.supabase.co/rest/v1/rpc/moflight_ai_request_admit');
  const headers=new Headers(init?.headers);assert.equal(headers.get('apikey'),values.MOFLIGHT_AI_BACKEND_KEY);assert.equal(headers.has('Authorization'),false);
  return new Response('false',{status:200});
 });
 assert.equal((await handler(new Request('https://relay.invalid'))).status,405);assert.equal(calls,0);
 const result=await handler(new Request('https://relay.invalid',{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({action:'usage',accountRef:'101',payload:{}})}));
 assert.equal(result.status,429);assert.deepEqual(await result.json(),{error:'unavailable'});assert.equal(calls,1);
 values.MOFLIGHT_AI_HTTP_READY='false';assert.equal((await handler(new Request('https://relay.invalid'))).status,503);assert.equal(calls,1);
});

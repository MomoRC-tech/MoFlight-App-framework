import assert from 'node:assert/strict';
import {createConfiguredRelay} from './runtime.ts';

Deno.test('deployment composition defaults closed without touching backend or provider',async()=>{
 const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
 let calls=0;
 const handler=createConfiguredRelay({backendUrl:'https://synthetic.supabase.co',serviceRoleKey:'synthetic-service-key',openRouterKey:'synthetic-provider-key',continuityKey:key,
  fetch:async()=>{calls++;throw new Error('No network expected');},inputTokenUpperBound:async()=>100});
 const response=await handler(new Request('https://relay.invalid',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'usage',accountRef:'101',payload:{}})}));
 assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'unavailable'});assert.equal(calls,0);
});

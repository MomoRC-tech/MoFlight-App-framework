import test from 'node:test';
import assert from 'node:assert/strict';
import {createAiRelayClient} from '../../apps/platform-lab/src/ai/relay-client.ts';
const request={version:1 as const,toolVersion:1 as const,provider:'vereinsflieger' as const,accountRef:'101',conversationId:'c1',messageId:'m1',attemptId:'a1',runId:'r1',feature:'question' as const,kind:'start' as const,round:0 as const,text:'Synthetic question',history:[]};
test('client submits exactly once without credentials/redirects and never persists handles',async()=>{
  const calls:RequestInit[]=[];const client=createAiRelayClient('https://relay.invalid/ai',async(_url,init)=>{calls.push(init!);return new Response(JSON.stringify({reply:{},continuation:'synthetic',runCapability:'a'.repeat(43)}));});
  await client.transmit(request,new AbortController().signal);assert.equal(calls.length,1);assert.equal(calls[0]?.credentials,'omit');assert.equal(calls[0]?.redirect,'error');
  const body=JSON.parse(calls[0]!.body as string);assert.equal(body.action,'round');assert.equal(body.payload.text,request.text);
  client.dispose();await client.stop('a1','r1');assert.equal(calls.length,1);
});
test('HTTP/upstream/cancellation failures have no automatic retry and do not expose provider errors',async()=>{
  let calls=0;const client=createAiRelayClient('https://relay.invalid/ai',async()=>{calls++;return new Response('PRIVATE_UPSTREAM_DETAIL',{status:503});});
  await assert.rejects(client.transmit(request,new AbortController().signal),error=>error instanceof Error&&!error.message.includes('PRIVATE'));
  assert.equal(calls,1);const abort=new AbortController();abort.abort();await assert.rejects(client.transmit(request,abort.signal));assert.equal(calls,1);
});
test('endpoint and response shape/size are bounded and invalid before any retry',async()=>{
  for(const endpoint of ['http://relay.invalid','https://user:pass@relay.invalid','https://relay.invalid?key=secret'])assert.throws(()=>createAiRelayClient(endpoint,fetch));
  const client=createAiRelayClient('https://relay.invalid/ai',async()=>new Response(JSON.stringify({reply:{},continuation:null,runCapability:null,secret:'extra'})));
  await assert.rejects(client.transmit(request,new AbortController().signal));
});

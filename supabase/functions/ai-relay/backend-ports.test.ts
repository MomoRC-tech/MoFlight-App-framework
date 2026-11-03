import assert from 'node:assert/strict';
import {createBackendRpc} from './backend-ports.ts';

type TestRegistrar=(name:string,fn:()=>void|Promise<void>)=>unknown;
const denoTest=(globalThis as unknown as {Deno?:{test:TestRegistrar}}).Deno?.test;
const registerTest:TestRegistrar=denoTest??(await import('node:test')).test;

const backendUrl='https://synthetic.supabase.co';
const secretKey='sb_secret_synthetic-key';
function base64Url(value:string):string {
 return btoa(value).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function legacyJwt(role:string):string {
 return `${base64Url(JSON.stringify({alg:'HS256',typ:'JWT'}))}.${base64Url(JSON.stringify({role}))}.synthetic-signature`;
}
function captureFetch() {
 let captured:{url:string;headers:Headers;body:string}|undefined;
 const fetcher:typeof fetch=async(input,init)=>{
  captured={url:String(input),headers:new Headers(init?.headers),body:String(init?.body??'')};
  return new Response('{"ok":true}',{status:200,headers:{'Content-Type':'application/json'}});
 };
 return {fetcher,get captured(){return captured;}};
}
async function invoke(key:string) {
 const request=captureFetch(),rpc=createBackendRpc(backendUrl,key,request.fetcher);
 const result=await rpc.rpc('moflight_ai_usage',{account_id:'101'});
 assert.deepEqual(result,{data:{ok:true},error:null});
 assert.ok(request.captured);
 return request.captured;
}

registerTest('new Supabase secret keys use apikey only for backend RPCs',async()=>{
 const request=await invoke(secretKey);
 assert.equal(request.url,`${backendUrl}/rest/v1/rpc/moflight_ai_usage`);
 assert.equal(request.headers.get('apikey'),secretKey);
 assert.equal(request.headers.has('authorization'),false);
 assert.equal(request.body,'{"account_id":"101"}');
});

registerTest('legacy service-role JWTs keep the explicit bearer authorization header',async()=>{
 const jwt=legacyJwt('service_role'),request=await invoke(jwt);
 assert.equal(request.headers.get('apikey'),jwt);
 assert.equal(request.headers.get('authorization'),`Bearer ${jwt}`);
});

registerTest('publishable and anon credentials are rejected before any backend request',async()=>{
 for(const invalid of ['sb_publishable_synthetic-key',legacyJwt('anon')]) {
  let calls=0;
  assert.throws(()=>createBackendRpc(backendUrl,invalid,async()=>{calls++;return new Response('{}');}),error=>
   error instanceof Error&&!error.message.includes(invalid)&&/Invalid AI backend credential/.test(error.message));
  assert.equal(calls,0);
 }
});

registerTest('malformed legacy tokens and unsupported credential formats fail closed',()=>{
 for(const invalid of ['not-a-key','eyJhbGciOiJIUzI1NiJ9.bad-json.synthetic-signature']) {
  assert.throws(()=>createBackendRpc(backendUrl,invalid,async()=>new Response('{}')),/Invalid AI backend credential/);
 }
});

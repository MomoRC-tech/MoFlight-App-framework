import {createConfiguredRelay} from './runtime.ts';

export interface RelayEnvironment {get(name:string):string|undefined}
const unavailable=async(_request:Request)=>new Response(JSON.stringify({error:'unavailable'}),{
 status:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'},
});

/** Server-only bootstrap. No secret reads while disabled; no startup model or DB calls.
 * This gate is additional to database kill/readiness/funding/account/price controls.
 */
export async function createEdgeRelay(env:RelayEnvironment,fetcher:typeof fetch=fetch) {
 if(env.get('MOFLIGHT_AI_HTTP_READY')!=='true')return unavailable;
 try {
  const backendUrl=env.get('SUPABASE_URL'),backendKey=env.get('MOFLIGHT_AI_BACKEND_KEY')??env.get('SUPABASE_SERVICE_ROLE_KEY');
  const providerKey=env.get('OPENROUTER_API_KEY'),encoded=env.get('MOFLIGHT_AI_CONTINUITY_KEY');
  if(!backendUrl||!backendKey||!providerKey||!encoded||!/^[A-Za-z0-9+/]{43}=$/.test(encoded))return unavailable;
  const bytes=Uint8Array.from(atob(encoded),character=>character.charCodeAt(0));
  if(bytes.length!==32)return unavailable;
  let continuityKey:CryptoKey;
  try {continuityKey=await crypto.subtle.importKey('raw',bytes,{name:'AES-GCM'},false,['encrypt','decrypt']);}
  finally {bytes.fill(0);}
  return createConfiguredRelay({backendUrl,serviceRoleKey:backendKey,openRouterKey:providerKey,continuityKey,
   fetch:fetcher,operationalReady:()=>env.get('MOFLIGHT_AI_HTTP_READY')==='true'});
 } catch {return unavailable;}
}

import type {AiRpcPort} from './ledger.ts';
import {opaqueBillingTag} from './admission.ts';
import {id} from '../../../packages/ai-contracts/src/shape.ts';
import {usdToNanoUsd} from './money.ts';
const RPCS=new Set(['snapshot','usage','reserve','unknown','settle','finish','record_response','status','request_admit'].map(name=>'moflight_ai_'+name));
interface BackendCredential {apiKey:string;authorizationToken?:string}
function decodeJwtPart(value:string):unknown {
 if(!/^[A-Za-z0-9_-]+$/.test(value)||value.length%4===1)throw new Error('Invalid AI backend credential');
 const base64=value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4);
 const binary=atob(base64),bytes=Uint8Array.from(binary,char=>char.charCodeAt(0));
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) as unknown;
}
/** Recognize the two Supabase server-key formats without logging or echoing the value.
 * Opaque sb_secret keys belong only in apikey; legacy service_role JWTs also go in Authorization. */
function backendCredential(value:string):BackendCredential {
 if(typeof value!=='string'||value.length===0||value.length>4096||value.trim()!==value)throw new Error('Invalid AI backend credential');
 if(value.startsWith('sb_secret_')) {
  if(!/^sb_secret_[A-Za-z0-9_-]+$/.test(value))throw new Error('Invalid AI backend credential');
  return {apiKey:value};
 }
 if(value.startsWith('sb_'))throw new Error('Invalid AI backend credential');
 const parts=value.split('.');
 if(parts.length!==3||!parts[2]||!/^[A-Za-z0-9_-]+$/.test(parts[2]))throw new Error('Invalid AI backend credential');
 try {
  const header=decodeJwtPart(parts[0]!),claims=decodeJwtPart(parts[1]!);
  if(!header||typeof header!=='object'||Array.isArray(header)||
     (header as Record<string,unknown>).alg!=='HS256'||
     !claims||typeof claims!=='object'||Array.isArray(claims)||
     (claims as Record<string,unknown>).role!=='service_role')throw new Error('Invalid AI backend credential');
 }catch{throw new Error('Invalid AI backend credential');}
 return {apiKey:value,authorizationToken:value};
}
/** Protected PostgREST transport only; never imported in React Native. No retries/logging. */
export function createBackendRpc(url:string,backendKey:string,fetcher:typeof fetch):AiRpcPort {
 const base=new URL(url);
 if(base.protocol!=='https:'||!base.hostname.endsWith('.supabase.co')||base.username||base.password||base.search||base.hash||base.pathname!=='/')throw new Error('Invalid AI backend');
 const credential=backendCredential(backendKey);
 return {async rpc(name,args){
  if(!RPCS.has(name))throw new Error('Unsupported AI RPC');
  try {
   const headers:Record<string,string>={'Content-Type':'application/json','apikey':credential.apiKey};
   if(credential.authorizationToken)headers.Authorization='Bearer '+credential.authorizationToken;
   const response=await fetcher(new URL('/rest/v1/rpc/'+name,base).href,{method:'POST',headers,body:JSON.stringify(args),redirect:'error',signal:AbortSignal.timeout(5000)});
   if(!response.ok||response.redirected)return {data:null,error:true};
   const raw=await response.text();if(raw.length>100000)return {data:null,error:true};
   return {data:raw.trim()?JSON.parse(raw):null,error:null};
  }catch{return {data:null,error:true};}
 }};
}
/** Exact JSON numeric lexeme -> plain USD decimal, rounding sub-nanodollars upward.
 * The provider's original lexeme avoids binary floating-point cost multiplication. */
export function providerUsdDecimal(raw:string):string {
 const match=/^(0|[1-9]\d{0,6})(?:\.(\d{1,100}))?(?:[eE]([+-]?\d{1,3}))?$/.exec(raw);
 if(!match)throw new Error('Invalid provider cost');
 const fraction=match[2]??'',power=9+Number(match[3]??0)-fraction.length;
 if(Math.abs(power)>200)throw new Error('Provider cost exponent exceeds bound');
 const coefficient=BigInt(match[1]!+fraction),divisor=10n**BigInt(Math.abs(power));
 const nano=power>=0?coefficient*divisor:(coefficient+divisor-1n)/divisor;
 if(nano>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('Provider cost exceeds safe range');
 const decimal=(nano/1000000000n).toString()+'.'+(nano%1000000000n).toString().padStart(9,'0');
 usdToNanoUsd(decimal);return decimal;
}
/** Queries metadata only, never the generation/content endpoint or another inference.
 * Response/generation identity compatibility still needs the separately approved live trial. */
export function createOpenRouterReceiptLookup(apiKey:string,fetcher:typeof fetch) {
 if(!apiKey.trim())throw new Error('Missing provider accounting key');
 return async(responseId:string,billingTag:string)=>{
  id(responseId);opaqueBillingTag(billingTag);
  try {
   const url=new URL('https://openrouter.ai/api/v1/generation');url.searchParams.set('id',responseId);
   const response=await fetcher(url.href,{method:'GET',headers:{'Authorization':'Bearer '+apiKey,'Accept':'application/json'},redirect:'error',signal:AbortSignal.timeout(5000)});
   if(!response.ok||response.redirected)return null;
   const raw=await response.text();if(raw.length>65536)return null;
   const amounts:{holder:unknown;raw:string}[]=[];
   // Modern V8 provides the primitive source lexeme to JSON.parse revivers. If
   // unavailable, no numeric cost is accepted rather than guessing precision.
   const reviver=function(this:unknown,key:string,value:unknown,context?:{source?:string}) {
    if(key==='total_cost'&&context?.source&&typeof value==='number')amounts.push({holder:this,raw:context.source});return value;
   };
   const parsed=JSON.parse(raw,reviver) as {data?:Record<string,unknown>};const data=parsed.data;
   if(!data||Array.isArray(data)||data.id!==responseId||data.external_user!==billingTag||data.model!=='openai/gpt-6-luna'||data.provider_name!=='Azure'||data.is_byok!==false)return null;
   const cost=amounts.filter(item=>item.holder===data);if(cost.length!==1)return null;
   return {responseId,receiptId:id(responseId),usdDecimal:providerUsdDecimal(cost[0]!.raw)};
  }catch{return null;}
 };
}

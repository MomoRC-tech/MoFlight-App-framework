import type {AiRpcPort} from './ledger.ts';
import {opaqueBillingTag} from './admission.ts';
import {id} from '../../../packages/ai-contracts/src/shape.ts';
import {usdToNanoUsd} from './money.ts';
const RPCS=new Set(['snapshot','usage','reserve','unknown','settle','finish','record_response','status','request_admit'].map(name=>'moflight_ai_'+name));
/** Protected PostgREST transport only; never imported in React Native. No retries/logging. */
export function createBackendRpc(url:string,serviceRoleKey:string,fetcher:typeof fetch):AiRpcPort {
 const base=new URL(url);
 if(base.protocol!=='https:'||!base.hostname.endsWith('.supabase.co')||base.username||base.password||base.search||base.hash||base.pathname!=='/'||!serviceRoleKey.trim())throw new Error('Invalid AI backend');
 return {async rpc(name,args){
  if(!RPCS.has(name))throw new Error('Unsupported AI RPC');
  try {
   const response=await fetcher(new URL('/rest/v1/rpc/'+name,base).href,{method:'POST',headers:{'Content-Type':'application/json','apikey':serviceRoleKey,'Authorization':'Bearer '+serviceRoleKey},body:JSON.stringify(args),redirect:'error',signal:AbortSignal.timeout(5000)});
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

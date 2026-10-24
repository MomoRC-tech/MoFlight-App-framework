import { integer, object, text } from '../../../packages/ai-contracts/src/shape.ts';

export interface CostRates {
  inputNanoUsd: number; cacheReadNanoUsd: number; cacheWriteNanoUsd: number;
  outputNanoUsd: number; requestNanoUsd: number; grossMicroEurPerUsd: number; marginBps: number;
}
export interface PriceEvidence extends CostRates {
  version: 1; id: string; validFrom: string; validUntil: string; approved: boolean; feesCovered: boolean;
  model: 'openai/gpt-6-luna'; reasoning: 'max'; route: 'azure'; zdr: true; evidenceRef: string;
}
const divideUp=(a:bigint,b:bigint)=>(a+b-1n)/b;
function safeNumber(value:bigint):number {
  if(value<0n || value>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('AI amount outside safe range');
  return Number(value);
}
export function validateCostRates(value:unknown):CostRates {
  const p=object(value,['inputNanoUsd','cacheReadNanoUsd','cacheWriteNanoUsd','outputNanoUsd','requestNanoUsd','grossMicroEurPerUsd','marginBps']);
  return {inputNanoUsd:integer(p.inputNanoUsd,1_000_000_000),cacheReadNanoUsd:integer(p.cacheReadNanoUsd,1_000_000_000),
    cacheWriteNanoUsd:integer(p.cacheWriteNanoUsd,1_000_000_000),outputNanoUsd:integer(p.outputNanoUsd,1_000_000_000),
    requestNanoUsd:integer(p.requestNanoUsd,1_000_000_000_000),grossMicroEurPerUsd:integer(p.grossMicroEurPerUsd,1_000_000_000,1),marginBps:integer(p.marginBps,10000)};
}
/** Conservative: full input charge plus both cache categories; reasoning is inside output cap. */
export function worstCaseMicroEur(rates:CostRates,inputTokens:number,outputTokens:number):number {
  const r=validateCostRates(rates), input=BigInt(integer(inputTokens,32000)),output=BigInt(integer(outputTokens,16384));
  const nano=input*(BigInt(r.inputNanoUsd)+BigInt(r.cacheReadNanoUsd)+BigInt(r.cacheWriteNanoUsd))+output*BigInt(r.outputNanoUsd)+BigInt(r.requestNanoUsd);
  return safeNumber(divideUp(nano*BigInt(r.grossMicroEurPerUsd)*BigInt(10000+r.marginBps),10_000_000_000_000n));
}
/** Parses decimal USD without floating-point multiplication; sub-nanodollar fractions round up. */
export function usdToNanoUsd(value:string):number {
  if(typeof value!=='string' || !/^(0|[1-9]\d{0,6})(\.\d{1,18})?$/.test(value))throw new Error('Invalid provider USD amount');
  const [whole,fraction='']=value.split('.');
  const units=BigInt(whole!)*1_000_000_000n+BigInt((fraction+'000000000').slice(0,9));
  return safeNumber(units+(fraction.slice(9).split('').some(c=>c!=='0')?1n:0n));
}
export function settledMicroEur(nanoUsd:number,grossMicroEurPerUsd:number):number {
  return safeNumber(divideUp(BigInt(integer(nanoUsd,Number.MAX_SAFE_INTEGER))*BigInt(integer(grossMicroEurPerUsd,1_000_000_000,1)),1_000_000_000n));
}
export function assertPriceEvidence(value:unknown,now:string):PriceEvidence {
  const p=object(value,['version','id','validFrom','validUntil','approved','feesCovered','model','reasoning','route','zdr','evidenceRef',
    'inputNanoUsd','cacheReadNanoUsd','cacheWriteNanoUsd','outputNanoUsd','requestNanoUsd','grossMicroEurPerUsd','marginBps']);
  const stamp=(v:unknown)=>{const s=text(v,24);if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(s)||new Date(s).toISOString()!==s)throw new Error('Invalid pricing time');return s;};
  const validFrom=stamp(p.validFrom),validUntil=stamp(p.validUntil),current=stamp(now);
  if(p.version!==1 || p.approved!==true || p.feesCovered!==true || p.model!=='openai/gpt-6-luna' || p.reasoning!=='max' || p.route!=='azure' || p.zdr!==true
    || validFrom>current || current>=validUntil)throw new Error('Safe AI pricing unavailable');
  const rates=validateCostRates(Object.fromEntries(['inputNanoUsd','cacheReadNanoUsd','cacheWriteNanoUsd','outputNanoUsd','requestNanoUsd','grossMicroEurPerUsd','marginBps'].map(key=>[key,p[key]])));
  return {version:1,id:text(p.id,100),validFrom,validUntil,approved:true,feesCovered:true,model:'openai/gpt-6-luna',reasoning:'max',route:'azure',zdr:true,evidenceRef:text(p.evidenceRef,200),...rates};
}
export function berlinPeriod(serverInstant:string):string {
  const stamp=new Date(serverInstant);if(!Number.isFinite(stamp.getTime()))throw new Error('Invalid server instant');
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit'}).formatToParts(stamp);
  return parts.find(p=>p.type==='year')!.value+'-'+parts.find(p=>p.type==='month')!.value;
}

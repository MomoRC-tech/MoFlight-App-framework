import { AI_LIMITS, validateAiPolicy, validateAiToolCall, type AiFeature, type AiPolicy, type AiToolCall } from '../../../packages/ai-contracts/src/index.ts';
import { account, array, choice, id, integer, object, text } from '../../../packages/ai-contracts/src/shape.ts';
export const RUN_TTL_MS=15*60_000;
export interface RunClaims {accountRef:string;attemptId:string;runId:string;conversationId:string;messageId:string;feature:AiFeature;policyId:string;expiresAt:number}
export interface Continuation {claims:RunClaims;nextRound:number;toolCount:number;policy:AiPolicy;input:unknown[];pending:AiToolCall[]}
const claimKeys=['accountRef','attemptId','runId','conversationId','messageId','feature','policyId','expiresAt'];
function claims(value:unknown,now:number):RunClaims {
  const p=object(value,claimKeys),expiresAt=integer(p.expiresAt,Number.MAX_SAFE_INTEGER);
  if(expiresAt<=now||expiresAt>now+RUN_TTL_MS)throw new Error('AI run expired');
  return {accountRef:account(p.accountRef),attemptId:id(p.attemptId),runId:id(p.runId),conversationId:id(p.conversationId),messageId:id(p.messageId),
    feature:choice(p.feature,['question','review','progress','term'] as const),policyId:id(p.policyId),expiresAt};
}
function encode(value:Uint8Array):string {return btoa(String.fromCharCode(...value)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function decode(value:string):Uint8Array<ArrayBuffer> {
  if(!/^[A-Za-z0-9_-]+$/.test(value))throw new Error('Invalid AI envelope');
  return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
}
/** No persistence/logging of envelopes. Distinct AEAD purposes prevent role substitution.
 * The relay operator supplies a non-exportable AES256 key; no secret/environment loading here. */
export function createContinuityCodec(key:CryptoKey,now:()=>number) {
  if(key.type!=='secret'||key.extractable||key.algorithm.name!=='AES-GCM'||(key.algorithm as AesKeyAlgorithm).length!==256||!key.usages.includes('encrypt')||!key.usages.includes('decrypt'))throw new Error('Invalid AI continuity key');
  const aad=(purpose:string)=>new TextEncoder().encode('moflight-ai:v1:'+purpose);
  async function seal(purpose:string,value:unknown):Promise<string> {
    const bytes=new TextEncoder().encode(JSON.stringify(value));if(bytes.length>180000)throw new Error('AI continuation exceeds bound');
    const iv=crypto.getRandomValues(new Uint8Array(12));
    const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(purpose),tagLength:128},key,bytes));
    // Avoid argument-count limits for complete stateless protocol payloads.
    let binary='';for(const byte of encrypted)binary+=String.fromCharCode(byte);
    return 'v1.'+encode(iv)+'.'+btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }
  async function open(purpose:string,value:unknown):Promise<unknown> {
    const token=text(value,AI_LIMITS.protocolChars),parts=token.split('.');
    if(parts.length!==3||parts[0]!=='v1')throw new Error('Invalid AI envelope');
    const iv=decode(parts[1]!);if(iv.length!==12)throw new Error('Invalid AI nonce');
    const clear=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:aad(purpose),tagLength:128},key,decode(parts[2]!));
    if(clear.byteLength>180000)throw new Error('AI envelope exceeds bound');
    return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(clear)) as unknown;
  }
  function parseContinuation(value:unknown):Continuation {
    const p=object(value,['claims','nextRound','toolCount','policy','input','pending']);
    const bound=claims(p.claims,now()),policy=validateAiPolicy(p.policy);
    if(policy.id!==bound.policyId)throw new Error('AI policy binding mismatch');
    const pending=array(p.pending,AI_LIMITS.reviewTools,1).map(validateAiToolCall);
    if(new Set(pending.map(c=>c.id)).size!==pending.length||pending.some(c=>!policy.tools.includes(c.name)))throw new Error('Invalid pending AI calls');
    return {claims:bound,nextRound:integer(p.nextRound,15,1),toolCount:integer(p.toolCount,48),policy,input:array(p.input,1000),pending};
  }
  return {
    sealRun:(value:RunClaims)=>seal('run',claims(value,now())),
    openRun:async(value:unknown)=>claims(await open('run',value),now()),
    sealContinuation:(value:Continuation)=>seal('continuation',parseContinuation(value)),
    openContinuation:async(value:unknown)=>parseContinuation(await open('continuation',value)),
  };
}

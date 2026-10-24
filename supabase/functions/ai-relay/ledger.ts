import { validateAiBudget, validateAiPolicy, validateAiRequest, type AiPolicy } from '../../../packages/ai-contracts/src/index.ts';
import { account, array, choice, id, integer, literal, object, tag, text } from '../../../packages/ai-contracts/src/shape.ts';
import { opaqueBillingTag } from './admission.ts';
import type { PolicySnapshot } from './policy.ts';
import { usdToNanoUsd } from './money.ts';

/** Server-only transport, supplied with protected backend credentials outside this module.
 * Never expose this port or accept settlement values from the phone/model. */
export interface AiRpcPort { rpc(name:string,args:Record<string,unknown>):Promise<{data:unknown;error:unknown}> }
export type Reservation = { disposition:'existing'; state:'intent'|'unknown'|'settled'; boundMicroEur:number; policyId:string; period:string }
  | { disposition:'new'; state:'intent'; boundMicroEur:number; policyId:string; period:string; policy:AiPolicy; priceId:string };
function period(value:unknown):string {
  const s=text(value,7);if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(s))throw new Error('Invalid AI period');return s;
}
/** Non-content digest of the complete canonical server request, not a client-supplied hash.
 * Input is transient; do not log/store it. Includes instructions/tools/protocol/output bounds. */
export async function dispatchDigest(canonicalServerRequest:string):Promise<string> {
  const bytes=new TextEncoder().encode(text(canonicalServerRequest,512000));
  if(bytes.length>512000)throw new Error('AI dispatch too large');
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export function createAiLedger(port:AiRpcPort) {
  async function call(name:string,args:Record<string,unknown>) {
    const result=await port.rpc('moflight_ai_'+name,args);
    // Do not surface raw backend errors/identifiers to callers or logs.
    if(result.error)throw new Error('AI accounting unavailable');
    return result.data;
  }
  function round(accountId:unknown,attemptId:unknown,runId:unknown,roundNumber:unknown) {
    return {account_id:account(accountId),attempt_id:id(attemptId),run_id:id(runId),round_number:integer(roundNumber,15)};
  }
  return {
    async admitRequest(accountId:unknown) {const allowed=await call('request_admit',{account_id:account(accountId)});if(typeof allowed!=='boolean')throw new Error('Invalid AI request admission');return allowed;},
    async bindResponse(accountId:unknown,attemptId:unknown,runId:unknown,roundNumber:unknown,responseId:unknown) {
      await call('record_response',{...round(accountId,attemptId,runId,roundNumber),response_id:id(responseId)});
    },
    async status(accountId:unknown,attemptId:unknown,runId:unknown) {
      const p=object(await call('status',{account_id:account(accountId),attempt_id:id(attemptId),run_id:id(runId)}),['attemptId','runId','active','rounds']);
      if(typeof p.active!=='boolean')throw new Error('Invalid AI attempt status');
      return {attemptId:literal(p.attemptId,id(attemptId)),runId:literal(p.runId,id(runId)),active:p.active,
        rounds:array(p.rounds,16).map(value=>{const r=object(value,['round','state','responseId','actualMicroEur']);return {
          round:integer(r.round,15),state:choice(r.state,['intent','unknown','settled'] as const),responseId:r.responseId===null?null:id(r.responseId),
          actualMicroEur:r.actualMicroEur===null?null:integer(r.actualMicroEur,Number.MAX_SAFE_INTEGER)};})};
    },
    async snapshot(accountId:unknown):Promise<PolicySnapshot> {
      const p=object(await call('snapshot',{account_id:account(accountId)}),['policy','billingTag','enabled','epoch']);
      if(typeof p.enabled!=='boolean')throw new Error('Invalid AI enablement');
      return {policy:validateAiPolicy(p.policy),billingTag:opaqueBillingTag(p.billingTag),enabled:p.enabled,epoch:integer(p.epoch,Number.MAX_SAFE_INTEGER)};
    },
    async usage(accountId:unknown) {return validateAiBudget(await call('usage',{account_id:account(accountId)}));},
    /** Only disposition:new permits ONE submission. An RPC timeout/error is not permission to dispatch.
     * AI07 must verify/seal continuity, full token bounds and current policy before calling this port. */
    async reserve(requestValue:unknown,policyId:unknown,serverRequestDigest:unknown):Promise<Reservation> {
      const request=validateAiRequest(requestValue), digest=text(serverRequestDigest,64);
      if(!/^[0-9a-f]{64}$/.test(digest))throw new Error('Invalid AI dispatch digest');
      const value=await call('reserve',{...round(request.accountRef,request.attemptId,request.runId,request.round),
        conversation_id:request.conversationId,message_id:request.messageId,feature:request.feature,policy_id:id(policyId),request_digest:digest});
      const p=object(value,tag(value,'disposition')==='new'
        ? ['disposition','state','boundMicroEur','policyId','period','policy','priceId'] : ['disposition','state','boundMicroEur','policyId','period']);
      const common={boundMicroEur:integer(p.boundMicroEur,100000),policyId:literal(p.policyId,id(policyId)),period:period(p.period)};
      if(p.disposition==='new') {
        const policy=validateAiPolicy(p.policy);
        literal(policy.id,common.policyId);
        return {...common,disposition:'new',state:literal(p.state,'intent'),policy,priceId:id(p.priceId)};
      }
      return {...common,disposition:literal(p.disposition,'existing'),state:choice(p.state,['intent','unknown','settled'] as const)};
    },
    async unknown(accountId:unknown,attemptId:unknown,runId:unknown,roundNumber:unknown) {
      await call('unknown',round(accountId,attemptId,runId,roundNumber));
    },
    /** Reconciliation input must originate in a verified provider receipt lookup, never a model reply.
     * Missing/ambiguous cost stays unknown. No network fetch, retry, refund or top-up here. */
    async settleVerifiedReceipt(accountId:unknown,attemptId:unknown,runId:unknown,roundNumber:unknown,usdDecimal:string,receiptId:unknown) {
      const p=object(await call('settle',{...round(accountId,attemptId,runId,roundNumber),nano_usd:usdToNanoUsd(usdDecimal),usage_receipt:id(receiptId)}),['actualMicroEur','halted']);
      if(typeof p.halted!=='boolean')throw new Error('Invalid AI accounting state');
      return {actualMicroEur:integer(p.actualMicroEur,Number.MAX_SAFE_INTEGER),halted:p.halted};
    },
    async finish(accountId:unknown,attemptId:unknown,runId:unknown) {
      const result=await call('finish',{account_id:account(accountId),attempt_id:id(attemptId),run_id:id(runId)});
      if(typeof result!=='boolean')throw new Error('Invalid AI completion state');return result;
    },
  };
}

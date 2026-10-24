import { AI_LIMITS,validateAiRequest,validateAiToolCall,validateAiToolResult,type AiToolCall,type AiPolicy } from '../../../packages/ai-contracts/src/index.ts';
import {array,id,integer,object,text} from '../../../packages/ai-contracts/src/shape.ts';
import {createContinuityCodec,RUN_TTL_MS,type RunClaims} from './continuity.ts';
import {createAiLedger,dispatchDigest} from './ledger.ts';
import {effectiveDispatchPolicy,publicCapabilities} from './policy.ts';
import {buildRoundBody} from './round-body.ts';
export interface RelayModelResponse {id:string;status:'completed'|'incomplete';output:unknown[]}
export interface RelayServicePorts {
  ledger:ReturnType<typeof createAiLedger>; codec:ReturnType<typeof createContinuityCodec>;now():number;
  /** Must bound the COMPLETE exact serialized body for the selected model/route, including overhead.
   * Missing/unverified tokenizer evidence must throw; bytes/4 estimates are not admission. */
  inputTokenUpperBound(body:string,policy:AiPolicy):Promise<number>;
  submit(body:ReturnType<typeof buildRoundBody>,signal?:AbortSignal):Promise<RelayModelResponse>;
  /** Lookup must independently bind the verified provider receipt to this response/opaque tag. */
  verifiedCost(responseId:string,billingTag:string):Promise<{responseId:string;receiptId:string;usdDecimal:string}|null>;
}
/** Short server calls; no waiting on phone tools, persistent payloads, network credentials or HTTP exposure here. */
export function createRelayService(ports:RelayServicePorts) {
  const {ledger,codec}=ports;
  function match(a:RunClaims,b:RunClaims) {if(JSON.stringify(a)!==JSON.stringify(b))throw new Error('Foreign AI run capability');}
  async function finish(accountRef:string,attemptId:string,runId:string){await ledger.finish(accountRef,attemptId,runId);}
  return {
    async capabilities(accountRef:string,clientVersion:number,toolVersion:number) {const snapshot=await ledger.snapshot(accountRef);return publicCapabilities(snapshot.policy,snapshot.enabled,clientVersion,toolVersion);},
    async stop(accountRef:string,capability:string) {const run=await codec.openRun(capability);if(run.accountRef!==accountRef)throw new Error('Foreign AI status');await finish(accountRef,run.attemptId,run.runId);},
    async reconcile(accountRef:string,capability:string) {
      const run=await codec.openRun(capability);if(run.accountRef!==accountRef)throw new Error('Foreign AI status');
      const snapshot=await ledger.snapshot(accountRef),status=await ledger.status(accountRef,run.attemptId,run.runId);
      for(const round of status.rounds)if(round.state!=='settled'&&round.responseId) {
        const cost=await ports.verifiedCost(round.responseId,snapshot.billingTag);
        if(cost&&cost.responseId===round.responseId)await ledger.settleVerifiedReceipt(accountRef,run.attemptId,run.runId,round.round,cost.usdDecimal,cost.receiptId);
      }
      return {budget:await ledger.usage(accountRef),active:(await ledger.status(accountRef,run.attemptId,run.runId)).active};
    },
    async round(value:unknown,signal?:AbortSignal) {
      const request=validateAiRequest(value);
      if(new TextEncoder().encode(JSON.stringify(request)).length>AI_LIMITS.wireBytes)throw new Error('AI request too large');
      const snapshot=await ledger.snapshot(request.accountRef);
      let policy=snapshot.policy,input:unknown[]|undefined,toolCount=0;
      let run:RunClaims={accountRef:request.accountRef,attemptId:request.attemptId,runId:request.runId,conversationId:request.conversationId,messageId:request.messageId,
        feature:request.feature,policyId:policy.id,expiresAt:ports.now()+RUN_TTL_MS};
      if(request.kind==='continue') {
        const cap=await codec.openRun(request.runCapability),continuation=await codec.openContinuation(request.continuation);
        run={...run,policyId:request.policyId,expiresAt:cap.expiresAt};match(run,cap);match(cap,continuation.claims);
        if(request.round!==continuation.nextRound)throw new Error('Changed AI round');
        policy=continuation.policy;toolCount=continuation.toolCount;
        if(request.outputs.length!==continuation.pending.length)throw new Error('Missing AI tool outputs');
        input=structuredClone(continuation.input);
        for(const call of continuation.pending) {
          const output=request.outputs.find(o=>o.callId===call.id);if(!output)throw new Error('Foreign AI output');
          const result=validateAiToolResult(JSON.parse(output.payload));
          if(result.callId!==call.id||result.name!==call.name||result.rows.length>policy.rowsPerRead||result.sourceRows.length>policy.rowsPerRead)throw new Error('Changed AI tool result');
          input.push({type:'function_call_output',call_id:call.id,output:JSON.stringify(result)});
        }
      }
      policy=effectiveDispatchPolicy(policy,snapshot.policy,snapshot.enabled,request.feature);
      const maxTurns=request.feature==='review'?policy.reviewTurns:policy.questionTurns,maxTools=request.feature==='review'?policy.reviewTools:policy.questionTools;
      if(request.round>=maxTurns||toolCount>maxTools||signal?.aborted)throw new Error('AI run unavailable');
      const body=buildRoundBody(request,policy,snapshot.billingTag,input),serialized=JSON.stringify(body);
      const bound=integer(await ports.inputTokenUpperBound(serialized,policy),AI_LIMITS.inputTokens,1);
      if(bound>policy.inputTokens||new TextEncoder().encode(serialized).length>AI_LIMITS.wireBytes)throw new Error('AI input exceeds bound');
      const reservation=await ledger.reserve(request,run.policyId,await dispatchDigest(serialized));
      if(reservation.disposition!=='new')throw new Error('AI request already admitted; never resubmit');
      // A restrictive policy change between snapshot and transaction must not submit a stale body.
      // Retain the admitted hold conservatively; do not infer a refund or retry.
      if(JSON.stringify(reservation.policy)!==JSON.stringify(policy)||signal?.aborted) {
        await ledger.unknown(request.accountRef,request.attemptId,request.runId,request.round);throw new Error('AI policy changed before dispatch');
      }
      let response:RelayModelResponse;
      try {response=await ports.submit(body,signal);}
      catch {await ledger.unknown(request.accountRef,request.attemptId,request.runId,request.round);throw new Error('AI upstream outcome unknown');}
      try {
        id(response.id);
        await ledger.bindResponse(request.accountRef,request.attemptId,request.runId,request.round,response.id);
        const cost=await ports.verifiedCost(response.id,snapshot.billingTag);
        if(!cost||cost.responseId!==response.id) {
          await ledger.unknown(request.accountRef,request.attemptId,request.runId,request.round);throw new Error('AI usage awaits reconciliation');
        }
        const settled=await ledger.settleVerifiedReceipt(request.accountRef,request.attemptId,request.runId,request.round,cost.usdDecimal,cost.receiptId);
        const receipt={policyId:run.policyId,attemptId:request.attemptId,runId:request.runId,round:request.round,budget:await ledger.usage(request.accountRef)};
        if(settled.halted) {await finish(request.accountRef,request.attemptId,request.runId);return {reply:{version:1,status:'interrupted',reason:'budget',receipt},continuation:null,runCapability:null};}
        const output=array(response.output,1000);const calls:AiToolCall[]=[];let answerText='';
        // Preserve full ordered items in the encrypted envelope; never accept hosted/web/program tools.
        for(const raw of output) {
          if(!raw||typeof raw!=='object')throw new Error('Malformed AI output');
          const item=raw as Record<string,unknown>;
          if(item.type==='function_call') {
            const call=validateAiToolCall({id:item.call_id,name:item.name,arguments:JSON.parse(text(item.arguments,16000))});
            if(!policy.tools.includes(call.name)||('limit' in call.arguments&&call.arguments.limit>policy.rowsPerRead))throw new Error('AI tool not allowed');
            calls.push(call);
          } else if(item.type==='message') {
            if(item.role!=='assistant')throw new Error('Invalid AI output role');
            for(const content of array(item.content,100)) {
              const part=content as Record<string,unknown>;if(part.type!=='output_text')throw new Error('Unsupported AI content');
              answerText+=text(part.text,32000);
            }
          } else if(item.type!=='reasoning')throw new Error('Unsupported AI output item');
        }
        if(new Set(calls.map(c=>c.id)).size!==calls.length||toolCount+calls.length>maxTools)throw new Error('AI tool bound exceeded');
        if(calls.length) {
          if(response.status!=='completed'||request.round+1>=maxTurns)throw new Error('Incomplete or exhausted AI tools');
          const continuation=await codec.sealContinuation({claims:run,nextRound:request.round+1,toolCount:toolCount+calls.length,policy,input:[...(body.input),...output],pending:calls});
          return {reply:{version:1,status:'needs-tools',receipt,tools:calls},continuation,runCapability:await codec.sealRun(run)};
        }
        const parsed=object(JSON.parse(text(answerText,32000)),['status','answer']);
        if(!['answer','needs-clarification','partial'].includes(parsed.status as string))throw new Error('Invalid AI answer status');
        await finish(request.accountRef,request.attemptId,request.runId);
        return {reply:{version:1,status:response.status==='incomplete'?'partial':parsed.status,receipt,answer:parsed.answer},continuation:null,runCapability:null};
      } catch(error) {
        // Idempotent unknown may reject an already settled round; never rewrite its charge.
        try{await ledger.unknown(request.accountRef,request.attemptId,request.runId,request.round);}catch{/* Already settled or backend unavailable. */}
        try{await finish(request.accountRef,request.attemptId,request.runId);}catch{/* Reconcile later without inference. */}
        throw new Error(error instanceof Error&&error.message==='AI usage awaits reconciliation'?'AI usage awaits reconciliation':'AI response unavailable');
      }
    },
  };
}

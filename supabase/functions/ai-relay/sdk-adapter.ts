import OpenAI from 'openai';
import type { Response, ResponseCreateParamsNonStreaming, ResponseInput } from 'openai/resources/responses/responses';
import { validateAiRequest, validateAiPolicy, type AiPolicy, type AiRequest } from '../../../packages/ai-contracts/src/index.ts';
import { opaqueBillingTag } from './admission.ts';
import { responseTools } from './tool-definitions.ts';
import type { buildRoundBody } from './round-body.ts';
import type { RelayModelResponse } from './relay-service.ts';

export const SERVER_SDK_VERSION = '7.43.0';
const BASE_URL = 'https://openrouter.ai/api/v1';
export interface DispatchIntent {
  billingTag: string; policyId: string; attemptId: string; runId: string; round: 0;
  feature: AiRequest['feature']; input: ResponseInput; outputTokens: number;
}
export type ServerModelOutcome = { state: 'received'; response: Response }
  | { state: 'unknown'; reason: 'cancelled' | 'timeout' | 'upstream' };
export interface ServerResponsesOptions {
  apiKey: string;
  fetch: typeof fetch;
  timeoutMs?: number;
  /** Must durably reserve/persist non-content intent, reject prior dispatches and check live gates before submission.
   * This package supplies no permissive default, production ledger or HTTP route. */
  beforeDispatch(intent: DispatchIntent): Promise<void>;
}

export function initialResponseBody(value: unknown, rawPolicy: unknown, rawBillingTag: unknown): ResponseCreateParamsNonStreaming & {
  provider: { only: ['azure']; allow_fallbacks: false; require_parameters: true; zdr: true };
} {
  const request=validateAiRequest(value), policy=validateAiPolicy(rawPolicy), billingTag=opaqueBillingTag(rawBillingTag);
  if (request.kind !== 'start') throw new Error('Authenticated continuation integration required');
  if (!policy.enabled || !policy.features.includes(request.feature)) throw new Error('AI policy disabled');
  const input:ResponseInput=[];
  for (const exchange of request.history) input.push({role:'user',content:exchange.user},{role:'assistant',content:exchange.assistant});
  input.push({role:'user',content:request.text});
  return { model:policy.model,instructions:policy.systemPrompt,input,
    reasoning:{effort:policy.reasoning},store:false,stream:false,background:false,
    include:['reasoning.encrypted_content'],max_output_tokens:policy.outputTokens,
    truncation:'disabled',parallel_tool_calls:false,user:billingTag,
    tools:responseTools(policy.tools),
    provider:{only:['azure'],allow_fallbacks:false,require_parameters:true,zdr:true} };
}

/** One short SDK request; never waits for phone tools, retries or logs content.
 * Raw SDK output stays internal until AI07 validates/seals its entire item sequence. */
export function createServerResponsesAdapter(options:ServerResponsesOptions) {
  const timeout=options.timeoutMs ?? 40_000;
  if (!Number.isSafeInteger(timeout) || timeout<1 || timeout>45_000 ||
      typeof options.apiKey!=='string' || !options.apiKey.trim() || typeof options.fetch!=='function' || typeof options.beforeDispatch!=='function') throw new Error('Invalid server transport configuration');
  const sdk=new OpenAI({apiKey:options.apiKey,baseURL:BASE_URL,fetch:options.fetch,maxRetries:0,timeout,
    organization:null,project:null,webhookSecret:null,logLevel:'off',
    logger:{debug(){},info(){},warn(){},error(){}}});
  return {
    async start(value:unknown, rawPolicy:AiPolicy, billingTag:string, signal?:AbortSignal):Promise<ServerModelOutcome> {
      // Parse/detach before asynchronous admission; callers cannot change pinned policy/input.
      const request=validateAiRequest(value), policy=validateAiPolicy(rawPolicy);
      const body=initialResponseBody(request,policy,billingTag);
      if(signal?.aborted)throw new Error('AI request cancelled before admission');
      const input=structuredClone(body.input) as ResponseInput;
      await options.beforeDispatch({billingTag:opaqueBillingTag(billingTag),policyId:policy.id,attemptId:request.attemptId,
        runId:request.runId,round:0,feature:request.feature,input,outputTokens:policy.outputTokens});
      // Once durable intent is admitted, cancellation/timeout keeps uncertain exposure.
      // Settlement/reconciliation belongs to AI06; never release money from this result.
      try {
        if(signal?.aborted)return {state:'unknown',reason:'cancelled'};
        const response=await sdk.responses.create(body,{signal});
        return {state:'received',response};
      } catch(error) {
        return {state:'unknown',reason:signal?.aborted?'cancelled':error instanceof OpenAI.APIConnectionTimeoutError?'timeout':'upstream'};
      }
    },
  };
}

/** Server composition port for createRelayService only. The service owns admission/intent
 * and reconstructs the body; never expose this function directly as an HTTP route. */
export function createSdkRoundSubmitter(options:Omit<ServerResponsesOptions,'beforeDispatch'>) {
  const timeout=options.timeoutMs??40000;
  if(!Number.isSafeInteger(timeout)||timeout<1||timeout>45000||typeof options.apiKey!=='string'||!options.apiKey.trim()||typeof options.fetch!=='function')throw new Error('Invalid server transport configuration');
  const sdk=new OpenAI({apiKey:options.apiKey,baseURL:BASE_URL,fetch:options.fetch,maxRetries:0,timeout,organization:null,project:null,webhookSecret:null,
    logLevel:'off',logger:{debug(){},info(){},warn(){},error(){}}});
  return async(body:ReturnType<typeof buildRoundBody>,signal?:AbortSignal):Promise<RelayModelResponse>=>{
    const response=await sdk.responses.create(body as unknown as ResponseCreateParamsNonStreaming,{signal});
    if(response.status!=='completed'&&response.status!=='incomplete')throw new Error('Nonterminal AI response');
    return {id:response.id,status:response.status,output:response.output};
  };
}

import { validateAiPolicy,validateAiRequest } from '../../../packages/ai-contracts/src/index.ts';
import {opaqueBillingTag} from './admission.ts';
import {responseTools} from './tool-definitions.ts';
/** Caller may supply previous items only after authenticated continuation validation. */
export function buildRoundBody(value:unknown,rawPolicy:unknown,rawBillingTag:unknown,verifiedInput?:unknown[]) {
  const request=validateAiRequest(value),policy=validateAiPolicy(rawPolicy),billingTag=opaqueBillingTag(rawBillingTag);
  if(!policy.enabled||!policy.features.includes(request.feature))throw new Error('AI policy disabled');
  let input:unknown[];
  if(request.kind==='start') {
    if(verifiedInput)throw new Error('Initial AI input override rejected');
    input=[];for(const h of request.history)input.push({role:'user',content:h.user},{role:'assistant',content:h.assistant});
    input.push({role:'user',content:request.text});
  } else {
    if(!verifiedInput)throw new Error('Verified AI continuation required');
    input=structuredClone(verifiedInput);
  }
  return {model:policy.model,instructions:policy.systemPrompt,input,reasoning:{effort:policy.reasoning},store:false as const,stream:false as const,background:false,
    include:['reasoning.encrypted_content'],max_output_tokens:policy.outputTokens,truncation:'disabled',parallel_tool_calls:false,user:billingTag,tools:responseTools(policy.tools),
    provider:{only:['azure'],allow_fallbacks:false,require_parameters:true,zdr:true}};
}

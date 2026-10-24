import { validateAiPolicy } from './validation.ts';
import { integer, object } from './shape.ts';
import type { AiPolicy } from './types.ts';
export type AiCapabilities = Pick<AiPolicy,'version'|'enabled'|'model'|'reasoning'|'routes'|'zdrOnly'|'features'|'tools'|'inputTokens'|'outputTokens'|'rowsPerRead'|'personalCapMicroEur'|'questionTurns'|'reviewTurns'|'questionTools'|'reviewTools'> & {policyId:string};
const keys=['version','policyId','enabled','model','reasoning','routes','zdrOnly','features','tools','inputTokens','outputTokens','rowsPerRead','personalCapMicroEur','questionTurns','reviewTurns','questionTools','reviewTools'] as const;
/** Constructs local reply-validation authority, never server dispatch instructions. */
export function capabilitiesReplyPolicy(value:unknown):AiPolicy {
  const c=object(value,keys);
  const cap=integer(c.personalCapMicroEur,1000000);
  return validateAiPolicy({version:c.version,id:c.policyId,enabled:c.enabled,model:c.model,reasoning:c.reasoning,routes:c.routes,zdrOnly:c.zdrOnly,
    features:c.features,tools:c.tools,inputTokens:c.inputTokens,outputTokens:c.outputTokens,rowsPerRead:c.rowsPerRead,
    personalCapMicroEur:cap,globalCapMicroEur:1000000,questionCapMicroEur:Math.min(cap,50000),reviewCapMicroEur:Math.min(cap,100000),
    questionTurns:c.questionTurns,reviewTurns:c.reviewTurns,questionTools:c.questionTools,reviewTools:c.reviewTools,
    systemPrompt:'Local reply validation only.',store:false,automaticRetries:0});
}
export function validateAiCapabilities(value:unknown):AiCapabilities {
  const p=capabilitiesReplyPolicy(value);
  return {version:1,policyId:p.id,enabled:p.enabled,model:p.model,reasoning:p.reasoning,routes:p.routes,zdrOnly:true,features:p.features,tools:p.tools,
    inputTokens:p.inputTokens,outputTokens:p.outputTokens,rowsPerRead:p.rowsPerRead,personalCapMicroEur:p.personalCapMicroEur,
    questionTurns:p.questionTurns,reviewTurns:p.reviewTurns,questionTools:p.questionTools,reviewTools:p.reviewTools};
}

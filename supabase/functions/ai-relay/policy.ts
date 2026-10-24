import { validateAiPolicy, type AiPolicy, type AiFeature } from '../../../packages/ai-contracts/src/index.ts';
export interface PolicySnapshot { policy: AiPolicy; enabled:boolean; epoch:number; billingTag:string }
const bounds=['personalCapMicroEur','globalCapMicroEur','questionCapMicroEur','reviewCapMicroEur','inputTokens','outputTokens','questionTurns','reviewTurns','questionTools','reviewTools','rowsPerRead'] as const;
/** Current privileges may only restrict a pinned message; prompt/model stay pinned. */
export function effectiveDispatchPolicy(pinnedValue:unknown,currentValue:unknown,enabled:boolean,feature:AiFeature):AiPolicy {
  const pinned=validateAiPolicy(pinnedValue),current=validateAiPolicy(currentValue);
  if(enabled!==true || !pinned.enabled || !current.enabled || !pinned.features.includes(feature) || !current.features.includes(feature)
    || pinned.tools.some(tool=>!current.tools.includes(tool)))throw new Error('AI permission unavailable');
  const effective={...pinned};
  for(const key of bounds)effective[key]=Math.min(pinned[key],current[key]);
  return validateAiPolicy(effective);
}
/** Public projection: no prompt, billing tag, provider ID, global usage or operator surfaces. */
export function publicCapabilities(value:unknown,enabled:boolean,clientVersion:number,toolVersion:number) {
  const policy=validateAiPolicy(value);
  if(clientVersion!==1 || toolVersion!==1)throw new Error('AI client update required');
  return {version:1 as const,policyId:policy.id,enabled:enabled===true&&policy.enabled,model:policy.model,reasoning:policy.reasoning,
    routes:[...policy.routes],zdrOnly:true as const,features:[...policy.features],tools:[...policy.tools],
    inputTokens:policy.inputTokens,outputTokens:policy.outputTokens,rowsPerRead:policy.rowsPerRead,personalCapMicroEur:policy.personalCapMicroEur,
    questionTurns:policy.questionTurns,reviewTurns:policy.reviewTurns,questionTools:policy.questionTools,reviewTools:policy.reviewTools};
}

import type {AiPolicy} from '../../../packages/ai-contracts/src/types.ts';

/** Documented capacity of the pinned model, checked 3 November 2026:
 * https://openrouter.ai/openai/gpt-6-luna
 * https://developers.openai.com/api/docs/models/gpt-6-luna
 * This reserves for the entire accepted model context, including framing/tools,
 * rather than estimating the token count of any individual request. Output is
 * charged separately as well, deliberately over-counting its context overlap.
 * Recheck the routed model capacity with price/route evidence before activation.
 */
export const LUNA_CONTEXT_TOKENS = 1_050_000;

export async function conservativeContextInputBound(_body:string,policy:Pick<AiPolicy,'model'|'reasoning'> & {routes:readonly string[]}):Promise<number> {
 if(policy.model!=='openai/gpt-6-luna'||policy.reasoning!=='max'||policy.routes.length!==1||policy.routes[0]!=='azure') {
  throw new Error('Conservative AI context bound unavailable for this model/route');
 }
 return LUNA_CONTEXT_TOKENS;
}

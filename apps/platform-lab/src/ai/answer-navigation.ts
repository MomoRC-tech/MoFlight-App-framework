import { assertAiContext, validateAiEvidenceReference, type AiContext, type AiEvidenceReference } from '../../../../packages/ai-contracts/src/index.ts';
import type {ChatMessage} from './chat-model.ts';
/** A saved answer never grants navigation to current/foreign data by ID alone. */
export function aiAnswerFlightIds(message:ChatMessage,referenceIds:readonly string[],current:AiContext,references:readonly AiEvidenceReference[]):string[] {
  if(!message.context||!message.answer||!referenceIds.length||referenceIds.length>200||new Set(referenceIds).size!==referenceIds.length)throw new Error('AI evidence unavailable');
  assertAiContext(message.context,current);
  return referenceIds.map(referenceId=>{
    const saved=message.answer!.evidence.find(r=>r.id===referenceId);
    if(!saved||'kind' in saved)throw new Error('Source observations cannot open saved flights');
    const parsed=validateAiEvidenceReference(saved,current);
    if('kind' in parsed)throw new Error('Invalid AI flight action');
    const latest=references.find(r=>!('kind' in r)&&r.flightId===parsed.flightId);
    if(!latest||'kind' in latest||latest.factsRevision!==parsed.factsRevision)throw new Error('AI evidence is historical');
    return parsed.flightId;
  });
}

import { CREW_SLOTS, validateAiEvidenceReference, type AiContext, type AiProjectedFlight, type AiToolResult, type SourceRowReference } from '../../../../packages/ai-contracts/src/index.ts';
import { validateHistoryFacts } from '../vereinsflieger/history-facts';
import type { SavedSourceReview } from '../vereinsflieger/real-flight-review-evidence';
import { normalizeAiSourceLabel, type AiProjection } from './projection';

export interface AiSourceReview {
  rows: AiProjectedFlight[]; references: SourceRowReference[];
  summary: AiToolResult['sourceReview'];
}
export function projectAiSourceReview(review: SavedSourceReview, projection: AiProjection, context: AiContext): AiSourceReview {
  if (context.flights.state !== 'available' || review.ownerId !== context.localOwnerId || review.storeId !== context.flights.storeId ||
      review.generation !== context.flights.generation || review.accountRef !== context.accountRef || review.rows.length > 200 ||
      review.omittedRows !== review.totalRows - review.rows.length) throw new Error('Foreign or stale AI source review');
  const alias = (kind: 'crew' | 'registration', label: string) => {
    const normalized = normalizeAiSourceLabel(label);
    const existing = projection.candidates.find(c => c.kind === kind && c.normalized === normalized);
    if (existing) return existing.alias;
    const token = `${kind === 'crew' ? 'p' : 'a'}${projection.candidates.filter(c => c.kind === kind).length + 1}`;
    projection.candidates.push({ alias: token, kind, label, normalized }); return token;
  };
  const references: SourceRowReference[] = [];
  const rows = review.rows.map((row, index): AiProjectedFlight => {
    validateHistoryFacts(row.facts, { ownerId: context.localOwnerId, scopeId: row.facts.scope.scopeId });
    const a = row.facts.assessment;
    if (a.observation.captureId !== row.captureId || a.observation.rowIndex !== row.rowIndex) throw new Error('Inconsistent AI source provenance');
    const reference = validateAiEvidenceReference({ kind: 'source-row', id: `s${index + 1}`, captureId: row.captureId,
      captureSha256: row.captureSha256, rowIndex: row.rowIndex, context }, context) as SourceRowReference;
    references.push(reference);
    const duration = a.durations.flight;
    return { referenceId: reference.id, date: a.date.state === 'parsed' ? a.date.value : null,
      startTime: a.clocks.start.state === 'parsed' ? a.clocks.start.value : null,
      landingTime: a.clocks.landing.state === 'parsed' ? a.clocks.landing.value : null,
      registrationAlias: a.fields.registration.state === 'value' ? alias('registration', a.fields.registration.raw) : null,
      knownMinutes: duration.state === 'known' ? duration.minutes : null,
      durationState: duration.state === 'known' ? 'known' : duration.state === 'unknown' ? 'unknown' : 'conflict',
      crew: CREW_SLOTS.flatMap(slot => a.fields[slot].state === 'value' ? [{ alias: alias('crew', a.fields[slot].raw), slot }] : []) };
  });
  const issues = review.issues.map(issue => ({ id: issue.id, kind: issue.kind, rowCount: issue.rowCount,
    referenceIds: issue.evidenceIndexes.map(index => { const ref = references[index]; if (!ref) throw new Error('Missing source issue reference'); return ref.id; }) }));
  return { rows, references, summary: { state: review.omittedRows ? 'partial' : 'available', totalRows: review.totalRows,
    omittedRows: review.omittedRows, totalIssues: review.totalIssues, issues } };
}

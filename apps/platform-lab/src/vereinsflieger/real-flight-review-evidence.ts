import { canonical } from '@moflight/flight-logbook';
import { adaptHistoryFacts, type HistoryFacts } from './history-facts';
import { latestRealFlightValues, type RealFlightGraph, type StoredBinding, type StoredCapture } from './real-flight-library-model';

export interface SavedSourceReview {
  version: 1; ownerId: string; storeId: string; generation: number; accountRef: string | null;
  rows: { captureId: string; captureSha256: string; rowIndex: number; facts: HistoryFacts }[];
  issues: { id: string; kind: 'duplicate-source-row' | 'conflicting-source-row' | 'missing-source-reference'; evidenceIndexes: number[]; rowCount: number }[];
  totalRows: number; omittedRows: number; totalIssues: number;
}

/** Read-only evidence from an already validated library graph. Repeated source
 * IDs across separate captures are ordinary revisions, not duplicate findings.
 * This is source-capture evidence, not a declaration that saved flights are bad. */
export function collectSavedSourceReview(graph: RealFlightGraph, limit = 200): SavedSourceReview {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) throw new Error('Invalid source review bound');
  const binding = latestRealFlightValues<StoredBinding>(graph.records, 'binding')[0];
  const result: SavedSourceReview = { version: 1, ownerId: graph.manifest.owner_id, storeId: graph.manifest.store_id,
    generation: graph.generation, accountRef: binding?.accountRef ?? null, rows: [], issues: [], totalRows: 0, omittedRows: 0, totalIssues: 0 };
  if (!binding) return result;
  for (const capture of latestRealFlightValues<StoredCapture>(graph.records, 'capture')) {
    if (capture.bindingId !== binding.bindingId || capture.source.binding.accountRef !== binding.accountRef) throw new Error('Foreign source review capture');
    const source = capture.source, groups = new Map<string, number[]>();
    for (let i = 0; i < source.rows.length; i++) {
      const key = source.rows[i]!.sourceFlightRef ?? `missing-${i}`;
      const indexes = groups.get(key) ?? []; indexes.push(i); groups.set(key, indexes);
    }
    for (const indexes of groups.values()) {
      const first = source.rows[indexes[0]!]!;
      if (first.sourceFlightRef !== null && indexes.length === 1) continue;
      const kind = first.sourceFlightRef === null ? 'missing-source-reference' as const
        : indexes.every(i => canonical(source.rows[i]!.rawValues) === canonical(first.rawValues)) ? 'duplicate-source-row' as const : 'conflicting-source-row' as const;
      result.totalIssues++; result.totalRows += indexes.length;
      const evidenceIndexes: number[] = [];
      for (const rowIndex of indexes) {
        if (result.rows.length >= limit) break;
        const row = source.rows[rowIndex]!;
        const facts = adaptHistoryFacts({ ownerId: graph.manifest.owner_id, scopeId: binding.bindingId }, {
          captureId: source.capture.captureId, headers: [...source.headers], rows: [{ sourceFlightId: row.sourceFlightRef, values: [...row.rawValues] }],
        }, 0);
        facts.assessment.observation.rowIndex = rowIndex;
        evidenceIndexes.push(result.rows.length);
        result.rows.push({ captureId: source.capture.captureId, captureSha256: source.capture.rawCaptureSha256, rowIndex, facts });
      }
      if (evidenceIndexes.length) result.issues.push({ id: `issue-${result.totalIssues}`, kind, evidenceIndexes, rowCount: indexes.length });
    }
  }
  result.omittedRows = result.totalRows - result.rows.length;
  return result;
}

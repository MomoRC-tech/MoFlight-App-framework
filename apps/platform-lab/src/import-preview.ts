// Disposable synthetic review only. No provider, database or native dependencies.
import { canonical, type Flight } from '@moflight/flight-logbook';
import { formats, type AircraftClass, type Book } from '../../../packages/local-data/src/books';
import { reviewReconciliation, sourceIdentity, type RetrievalBatch, type SourceBinding, type SourceRecord } from './vereinsflieger/reconciliation';

export interface PreviewRecord extends SourceRecord {
  aircraftRef: string | null;
  aircraftClass: AircraftClass | null;
  duplicate: boolean;
}
export interface PreviewBatch extends Omit<RetrievalBatch, 'records'> { owner: string; records: PreviewRecord[] }
export interface BookChoice { owner: string; id: string; evidence: string; bookId: string | null }
export interface PreviewWorkspace {
  owner: string; binding: SourceBinding; books: Book[]; records: PreviewRecord[]; observations: PreviewRecord[]; choices: BookChoice[];
}
export type SuggestionReason = 'confirmed' | 'stale' | 'conflict' | 'duplicate' | 'unknown-class' | 'no-book' | 'history' | 'ambiguous-history' | 'category' | 'multiple-books';
export interface PreviewRow {
  id: string; reference: string; status: 'added' | 'changed' | 'unchanged' | 'conflict';
  previous: PreviewRecord | null; variants: PreviewRecord[]; changedFields: string[];
  selected: number | null; bookId: string | null; candidateBookIds: string[];
  reason: SuggestionReason; choice: BookChoice | null;
}
export interface PreviewPlan {
  basis: string; batch: PreviewBatch; rows: PreviewRow[]; repeatedRows: number;
  counts: Record<PreviewRow['status'], number>;
}
export interface PreviewSession { workspace: PreviewWorkspace; batch: PreviewBatch }

const clone = <T,>(value: T): T => JSON.parse(canonical(value)) as T;
const identity = (workspace: PreviewWorkspace, record: PreviewRecord) => sourceIdentity(workspace.binding, record.sourceFlightId);
export const recordEvidence = (record: PreviewRecord) => canonical(record);
export function eligiblePreviewBooks(books: Book[], record: PreviewRecord) {
  return books.filter(b => Object.hasOwn(formats, b.format) && record.aircraftClass !== null && !record.duplicate &&
    b.classes.includes(record.aircraftClass) && record.flight.date !== null && b.from <= record.flight.date && (b.through === null || b.through >= record.flight.date));
}
const eligible = eligiblePreviewBooks;
function validateRecord(record: PreviewRecord) {
  if (![null, 'glider', 'TMG', 'ultralight', 'powered'].includes(record.aircraftClass) || typeof record.duplicate !== 'boolean' ||
    (record.aircraftRef !== null && (typeof record.aircraftRef !== 'string' || !record.aircraftRef.trim()))) throw new Error('Invalid synthetic aircraft evidence.');
}
function validateWorkspace(workspace: PreviewWorkspace, batch: PreviewBatch) {
  if (!workspace.owner.trim() || workspace.owner !== batch.owner) throw new Error('Foreign preview owner; keep the previous comparison.');
  const bookIds = new Set<string>();
  for (const book of workspace.books) {
    if (book.owner !== workspace.owner || !book.id.trim() || bookIds.has(book.id) || !Array.isArray(book.classes) || !book.classes.length ||
      book.classes.some(c => !['glider', 'TMG', 'ultralight', 'powered'].includes(c))) throw new Error('Foreign or invalid preview book.');
    for (const date of [book.from, book.through].filter(d => d !== null)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error('Invalid book interval.');
    }
    if (book.through !== null && book.through < book.from) throw new Error('Invalid book interval.');
    bookIds.add(book.id);
  }
  const ids = new Set<string>();
  for (const record of workspace.records) { validateRecord(record); const id = identity(workspace, record); if (ids.has(id)) throw new Error('Conflicting saved preview IDs.'); ids.add(id); }
  for (const record of workspace.observations) { validateRecord(record); identity(workspace, record); }
  const choiceIds = new Set<string>();
  for (const choice of workspace.choices) {
    let tuple: unknown;
    try { tuple = JSON.parse(choice.id.slice('vereinsflieger:'.length)); } catch { throw new Error('Foreign preview choice.'); }
    if (choice.owner !== workspace.owner || !Array.isArray(tuple) || sourceIdentity(workspace.binding, tuple[3]) !== choice.id || choiceIds.has(choice.id) ||
      (choice.bookId !== null && !bookIds.has(choice.bookId))) throw new Error('Foreign or repeated preview choice.');
    choiceIds.add(choice.id);
  }
}

export function planImportPreview(workspace: PreviewWorkspace, batch: PreviewBatch): PreviewPlan {
  validateWorkspace(workspace, batch);
  // Reuse the strict binding, coverage, flight validation and scoped source IDs.
  const review = reviewReconciliation({ binding: workspace.binding, flights: workspace.records.map(r => ({ ...r.flight, id: identity(workspace, r) })) }, batch);
  const grouped = new Map<string, PreviewRecord[]>(); let repeatedRows = 0;
  for (const record of batch.records) {
    validateRecord(record);
    const id = identity(workspace, record), variants = grouped.get(id) ?? [];
    if (variants.some(r => recordEvidence(r) === recordEvidence(record))) repeatedRows++;
    else variants.push(record);
    grouped.set(id, variants);
  }
  const counts: PreviewPlan['counts'] = { added: 0, changed: 0, unchanged: 0, conflict: 0 };
  const rows: PreviewRow[] = review.rows.map(source => {
    const variants = grouped.get(source.id)!, previous = workspace.records.find(r => identity(workspace, r) === source.id) ?? null;
    const choice = workspace.choices.find(c => c.id === source.id) ?? null;
    const confirmedVariant = choice ? variants.findIndex(r => recordEvidence(r) === choice.evidence) : -1;
    const selected = variants.length === 1 ? 0 : confirmedVariant >= 0 ? confirmedVariant : null;
    const record = selected === null ? null : variants[selected]!;
    const candidates = record ? eligible(workspace.books, record).map(b => b.id) : [];
    const status = variants.length > 1 ? 'conflict' : !previous ? 'added' : recordEvidence(previous) === recordEvidence(variants[0]!) ? 'unchanged' : 'changed';
    counts[status]++;
    let reason: SuggestionReason, bookId: string | null = null;
    if (choice) {
      reason = confirmedVariant >= 0 && (choice.bookId === null || candidates.includes(choice.bookId)) ? 'confirmed' : 'stale';
      bookId = choice.bookId; // Preserve the choice, including explicit deferral, even when it needs review.
    } else if (!record) reason = 'conflict';
    else if (record.duplicate) reason = 'duplicate';
    else if (record.aircraftClass === null) reason = 'unknown-class';
    else if (!candidates.length) reason = 'no-book';
    else {
      const history = new Set(workspace.records.filter(r => record.aircraftRef !== null && r.aircraftRef === record.aircraftRef && identity(workspace, r) !== source.id).flatMap(r => {
        const prior = workspace.choices.find(c => c.id === identity(workspace, r));
        return prior?.bookId && prior.evidence === recordEvidence(r) && candidates.includes(prior.bookId) && eligible(workspace.books, r).some(b => b.id === prior.bookId) ? [prior.bookId] : [];
      }));
      if (history.size > 1) reason = 'ambiguous-history';
      else if (history.size === 1) { reason = 'history'; bookId = [...history][0]!; }
      else if (candidates.length === 1) { reason = 'category'; bookId = candidates[0]!; }
      else reason = 'multiple-books';
    }
    const changedFields = previous && variants.length === 1 ? [
      ...Object.keys(previous.flight).filter(k => canonical(previous.flight[k as keyof Omit<Flight, 'id'>]) !== canonical(variants[0]!.flight[k as keyof Omit<Flight, 'id'>])),
      ...(['aircraftClass', 'aircraftRef', 'duplicate'] as const).filter(k => previous[k] !== variants[0]![k]),
    ] : [];
    return { id: source.id, reference: variants[0]!.sourceFlightId, status, previous, variants, changedFields, selected, bookId, candidateBookIds: candidates, reason, choice };
  });
  return clone({ basis: canonical(workspace), batch, rows, repeatedRows, counts });
}

// Confirming an editor choice changes only this disposable test workspace.
export function confirmPreviewChoice(workspace: PreviewWorkspace, batch: PreviewBatch, id: string, evidence: string, bookId: string | null): PreviewWorkspace {
  const row = planImportPreview(workspace, batch).rows.find(r => r.id === id);
  const record = row?.variants.find(r => recordEvidence(r) === evidence);
  if (!record) throw new Error('Comparison changed; review the current source variant.');
  if (bookId !== null && !eligible(workspace.books, record).some(b => b.id === bookId)) throw new Error('Book not eligible for this flight.');
  return clone({ ...workspace, choices: [...workspace.choices.filter(c => c.id !== id), { owner: workspace.owner, id, evidence, bookId }] });
}

export function acceptPreview(workspace: PreviewWorkspace, plan: PreviewPlan): PreviewWorkspace {
  if (plan.basis !== canonical(workspace) || canonical(planImportPreview(workspace, plan.batch)) !== canonical(plan)) throw new Error('Comparison changed; compare again before accepting.');
  if (plan.rows.some(r => r.reason === 'stale')) throw new Error('Review changed evidence before accepting the test stand.');
  const records = new Map(workspace.records.map(r => [identity(workspace, r), r]));
  for (const row of plan.rows) {
    // Unresolved conflicting variants never overwrite earlier usable evidence.
    if (row.selected !== null) records.set(row.id, row.variants[row.selected]!);
  }
  // Suggestions are never promoted to choices. Omissions never delete records.
  const observations = new Map(workspace.observations.map(record => [recordEvidence(record), record]));
  for (const record of plan.batch.records) observations.set(recordEvidence(record), record);
  return clone({ ...workspace, records: [...records.values()], observations: [...observations.values()] });
}

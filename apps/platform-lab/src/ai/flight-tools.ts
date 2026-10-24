import { AI_LIMITS, CREW_SLOTS, validateAiCoverage, validateAiToolCall, validateAiToolResult, validateFlightFilter,
  type AiCoverage, type AiToolCall, type AiToolResult, type AiProjectedFlight, type FlightFilter } from '../../../../packages/ai-contracts/src/index.ts';
import { summarizeRealFlights } from '../mobile/real-flight-statistics.ts';
import { statisticsCoverageComplete } from '../mobile/statistics-overlay-model.ts';
import type { AiFlightSnapshot } from './flight-context.ts';
import { normalizeAiSourceLabel } from './projection.ts';

export interface AiFlightToolPorts {
  assertCurrent(): Promise<void>;
  // Use a cryptographically random token in native composition (AI07). Tokens
  // never encode account, source IDs, query parameters or provider credentials.
  token(): string;
}
/** A run-local, flight-only read capability. There is no fetch, SQL or write port.
 * Dispose on cancellation, owner/source switch or attempt completion. */
export class AiFlightTools {
  private disposed = false;
  private calls = 0;
  private metricSequence = 0;
  private readonly pages = new Map<string, { query: string; offset: number }>();
  private readonly issuedCalls = new Set<string>();
  readonly metrics = new Map<string, AiToolResult['metrics'][number]>();
  private snapshot: AiFlightSnapshot | null;
  constructor(snapshot: AiFlightSnapshot, private readonly ports: AiFlightToolPorts,
    private readonly referenceDate: string, private readonly maximumCalls: number = AI_LIMITS.questionTools) {
    this.snapshot = snapshot;
    // Reuse strict date validation through the coverage parser.
    this.coverage(snapshot.projection?.rows ?? [], { from: null, to: null, registrationAlias: null, crewAlias: null, crewSlot: null }, 0);
    if (!Number.isSafeInteger(maximumCalls) || maximumCalls < 1 || maximumCalls > AI_LIMITS.reviewTools) throw new Error('Invalid AI tool-call bound');
  }
  dispose(): void { this.disposed = true; this.pages.clear(); this.issuedCalls.clear(); this.metrics.clear(); this.snapshot = null; }
  private get data(): AiFlightSnapshot { if (!this.snapshot) throw new Error('AI tools expired'); return this.snapshot; }
  private async current(): Promise<void> {
    if (this.disposed) throw new Error('AI tools expired');
    await this.ports.assertCurrent();
    if (this.disposed) throw new Error('AI tools expired');
  }
  private select(filter: FlightFilter): AiProjectedFlight[] {
    const p = this.data.projection;
    if (!p) return [];
    if (filter.registrationAlias && !p.candidates.some(c => c.kind === 'registration' && c.alias === filter.registrationAlias) ||
        filter.crewAlias && !p.candidates.some(c => c.kind === 'crew' && c.alias === filter.crewAlias)) throw new Error('Unknown AI source alias');
    return p.rows.filter(row => (!filter.from || row.date !== null && row.date >= filter.from) &&
      (!filter.to || row.date !== null && row.date <= filter.to) &&
      (!filter.registrationAlias || row.registrationAlias === filter.registrationAlias) &&
      (!filter.crewAlias || row.crew.some(c => c.alias === filter.crewAlias && (!filter.crewSlot || c.slot === filter.crewSlot))))
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || (b.startTime ?? '').localeCompare(a.startTime ?? '') || a.referenceId.localeCompare(b.referenceId));
  }
  private coverage(selected: readonly AiProjectedFlight[], filter: FlightFilter, suppliedRows: number): AiCoverage {
    const p = this.data.projection;
    const windows = this.data.coverageWindows.map(window => ({
      from: filter.from && filter.from > window.from ? filter.from : window.from,
      to: filter.to && filter.to < window.to ? filter.to : window.to,
    })).filter(window => window.from <= window.to);
    const coveredStarts = windows.map(window => window.from).sort(), coveredEnds = windows.map(window => window.to).sort();
    // Unknown dates cannot establish no matches in a bounded period. Retain their
    // count even though they cannot enter that period's arithmetic denominator.
    const unknownDateRows = p?.rows.filter(row => row.date === null).length ?? 0;
    const unknownCrewRows = p ? [...p.sourceByReference.values()].filter(row => CREW_SLOTS.some(slot => row.facts.assessment.fields[slot].state !== 'value')).length : 0;
    const unknownRegistrationRows = p?.rows.filter(row => row.registrationAlias === null).length ?? 0;
    const complete = !!p && filter.from !== null && filter.to !== null && unknownDateRows === 0 && (!filter.crewAlias || unknownCrewRows === 0) && (!filter.registrationAlias || unknownRegistrationRows === 0) && this.data.pendingIssueCount === 0 && statisticsCoverageComplete(this.data.coverageWindows, filter.from, filter.to);
    const totalRows = p?.rows.length ?? 0;
    return validateAiCoverage({ state: !p ? 'unavailable' : !totalRows && complete ? 'empty' : complete ? 'complete' : 'partial',
      requestedFrom: filter.from, requestedTo: filter.to, observedFrom: p ? coveredStarts[0] ?? null : null, observedTo: p ? coveredEnds.at(-1) ?? null : null,
      referenceDate: this.referenceDate, timezone: 'Europe/Berlin', totalRows,
      suppliedRows, omittedRows: totalRows - suppliedRows,
      unknownDateRows, unknownDurationRows: selected.filter(row => row.durationState !== 'known').length, unknownCrewRows, unknownRegistrationRows,
      conflictingRows: selected.filter(row => row.durationState === 'conflict').length });
  }
  private page(query: string, offset: number): string {
    const token = this.ports.token();
    if (!/^[A-Za-z0-9_-]{43,128}$/.test(token) || this.pages.has(token) || this.pages.size >= AI_LIMITS.reviewTools) throw new Error('Invalid AI page capability');
    this.pages.set(token, { query, offset }); return token;
  }
  async execute(input: unknown): Promise<AiToolResult> {
    await this.current();
    const call: AiToolCall = validateAiToolCall(input);
    if (++this.calls > this.maximumCalls || this.issuedCalls.has(call.id)) throw new Error('AI tool limit or duplicate call');
    this.issuedCalls.add(call.id);
    const emptyFilter: FlightFilter = { from: null, to: null, registrationAlias: null, crewAlias: null, crewSlot: null };
    const filter = 'filter' in call.arguments ? validateFlightFilter(call.arguments.filter) : emptyFilter;
    const selected = this.select(filter), p = this.data.projection;
    let rows: AiProjectedFlight[] = [], sourceRows: AiProjectedFlight[] = [], candidates: AiToolResult['candidates'] = [], metrics: AiToolResult['metrics'] = [], nextPageToken: string | null = null;
    let suppliedRows = 0;
    if (p && call.name === 'resolveEntities') {
      const { kind, text } = call.arguments;
      const normalized = normalizeAiSourceLabel(text);
      candidates = p.candidates.filter(c => c.kind === kind && (c.alias === text || c.normalized.includes(normalized)))
        .map(c => ({ alias: c.alias, kind: c.kind, match: c.alias === text || c.normalized === normalized ? 'exact' as const : 'candidate' as const }));
      if (candidates.length > AI_LIMITS.rows) throw new Error('AI entity candidates exceed bound; narrow query');
    } else if (p && call.name === 'queryFlights') {
      const query = JSON.stringify({ filter, limit: call.arguments.limit });
      let offset = 0;
      if (call.arguments.pageToken !== null) {
        const page = this.pages.get(call.arguments.pageToken);
        if (!page || page.query !== query) throw new Error('Foreign, changed or expired AI page');
        offset = page.offset;
      }
      rows = selected.slice(offset, offset + call.arguments.limit); suppliedRows = rows.length;
      if (offset + rows.length < selected.length) nextPageToken = this.page(query, offset + rows.length);
    } else if (p && call.name === 'getFlightEvidence') {
      for (const ref of call.arguments.referenceIds) {
        const saved = p.rows.find(row => row.referenceId === ref);
        const source = this.data.sourceReview?.rows.find(row => row.referenceId === ref);
        if (saved) rows.push(saved); else if (source) sourceRows.push(source); else throw new Error('Foreign AI evidence');
      }
      suppliedRows = rows.length;
    } else if (p && call.name === 'aggregateFlights') {
      const source = selected.map(row => { const source = p.sourceByReference.get(row.referenceId); if (!source) throw new Error('Missing AI source'); return source; });
      const totals = summarizeRealFlights(source);
      const values = { count: totals.count, knownMinutes: totals.knownMinutes,
        averageKnownMinutes: totals.knownDurationCount ? totals.knownMinutes / totals.knownDurationCount : null };
      metrics = call.arguments.measures.map(measure => ({ referenceId: `m${++this.metricSequence}`, measure, value: values[measure], unit: measure === 'count' ? 'flights' as const : 'minutes' as const }));
      suppliedRows = selected.length;
    }
    const result = validateAiToolResult({ version: 1, callId: call.id, name: call.name,
      coverage: this.coverage(selected, filter, suppliedRows), rows, sourceRows,
      sourceReview: this.data.sourceReview ? { ...this.data.sourceReview.summary,
        issues: call.name === 'describeDataset' ? this.data.sourceReview.summary.issues : [] }
        : { state: 'unavailable', totalRows: 0, omittedRows: 0, totalIssues: 0, issues: [] }, candidates, metrics, nextPageToken });
    // Recheck after every async boundary and before granting output. The caller
    // must similarly check before publishing an eventual model answer.
    await this.current();
    for (const metric of result.metrics) this.metrics.set(metric.referenceId, metric);
    return result;
  }
}

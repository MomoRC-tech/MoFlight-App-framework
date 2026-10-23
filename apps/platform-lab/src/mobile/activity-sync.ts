import { decodeActivityLedger, type ActivityLedger } from './activity-ledger';
import { reduceActivitySignal, type ActivityMarkers } from './activity-signal';

export interface ActivitySyncEvidence {
  readonly source: 'flights' | 'own-duties' | 'club-duties';
  readonly capturedAt: number;
  readonly committedAt: number;
  readonly window?: { readonly from: string; readonly to: string };
  readonly participation?: string;
  readonly configuration?: string;
  readonly markers?: ActivityMarkers;
}

const TTL = 60_000;
const timestamp = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
function date(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function bounded(window: ActivitySyncEvidence['window']): window is NonNullable<ActivitySyncEvidence['window']> {
  return !!window && date(window.from) && date(window.to) && window.from <= window.to;
}
function dutyMarkersMatch(actual: ActivityMarkers | undefined, tracked: ActivityMarkers): boolean {
  if (!actual || !Number.isSafeInteger(actual.count) || actual.count! < 0 || actual.count !== tracked.count ||
      Object.keys(actual).some(key => key !== 'count' && key !== 'newest')) return false;
  // A count-only save cannot stand in for a separately tracked newest marker.
  return actual.newest === tracked.newest;
}
function flightParticipationCovers(actual: string | undefined, tracked: string | undefined): boolean {
  const roles = ['Pilot', 'Fluglehrer', 'Pilot oder Fluglehrer'];
  return !!actual && !!tracked && roles.includes(actual) && roles.includes(tracked) &&
    (actual === tracked || actual === 'Pilot oder Fluglehrer');
}

/** Call only after source save AND successful readback in this ledger's exact
 * owner/store/provider/account/club scope. This pure helper cannot prove those facts.
 *
 * Flight evidence means a complete canonical export of ALL records in the stated
 * inclusive window/participation, without additional narrowing predicates. Such an
 * export covers a filtered matching view within that window. Pilot-or-instructor
 * captures also cover the narrower Pilot and Fluglehrer participation views.
 * A partial or filtered
 * export must not call this API under the flight contract. Configuration hashes
 * alone do not establish this coverage. By the selected advisory policy, a
 * successful compatible flight sync also acknowledges a tracked view without
 * proven date bounds. This clears a recommendation, not a completeness claim.
 *
 * Duty page captures require the SAME verified configuration and matching markers
 * from the actual saved/read-back capture; a later quick check is insufficient.
 * Missing evidence preserves every pending hint. No I/O or durability assertion.
 */
export function acknowledgeActivitySync(ledger: ActivityLedger, evidence: ActivitySyncEvidence, now: number): ActivityLedger {
  const valid = decodeActivityLedger(ledger, ledger.identity);
  if (!evidence || !['flights', 'own-duties', 'club-duties'].includes(evidence.source) ||
      !timestamp(now) || !timestamp(evidence.capturedAt) || !timestamp(evidence.committedAt) ||
      evidence.capturedAt > evidence.committedAt || evidence.committedAt > now ||
      !Number.isSafeInteger(now + TTL) || !Number.isSafeInteger(evidence.capturedAt + TTL)) return valid;
  const entries = valid.entries.map(entry => {
    const { signal } = entry;
    if (signal.context.source !== evidence.source || signal.hintSince === null || !signal.baseline ||
        evidence.capturedAt < signal.hintSince || evidence.capturedAt < signal.baseline.observedAt ||
        signal.settledAt !== null && evidence.capturedAt < signal.settledAt) return entry;
    if (evidence.source === 'flights') {
      if (!bounded(evidence.window) ||
          entry.window !== undefined && (!bounded(entry.window) ||
            evidence.window.from > entry.window.from || evidence.window.to < entry.window.to) ||
          !flightParticipationCovers(evidence.participation, entry.participation)) return entry;
    } else {
      if (!evidence.configuration || evidence.configuration !== signal.context.configuration ||
          evidence.participation !== entry.participation ||
          !dutyMarkersMatch(evidence.markers, signal.baseline.markers)) return entry;
      if (evidence.window !== undefined && (!bounded(evidence.window) || !bounded(entry.window) ||
          evidence.window.from !== entry.window.from || evidence.window.to !== entry.window.to)) return entry;
    }
    const result = reduceActivitySignal(signal, { kind: 'sync', committedAt: evidence.committedAt,
      observation: { context: signal.context, markers: signal.baseline.markers,
        observedAt: evidence.capturedAt, expiresAt: now + TTL } }, now);
    if (result.comparison !== 'synced' || !result.state.baseline) return entry;
    // The fresh durable-sync admission above may follow a capture lasting >60s.
    // Persist the ledger's canonical historical TTL; only reducer admission uses now.
    return { ...entry, signal: { ...result.state, baseline: {
      ...result.state.baseline, expiresAt: evidence.capturedAt + TTL,
    } } };
  });
  return decodeActivityLedger({ ...valid, entries }, valid.identity);
}

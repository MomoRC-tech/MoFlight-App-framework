/** Display advice only: never authorizes provider access or establishes saved freshness. */
export interface ActivityContext {
  readonly owner: string;
  readonly store: string;
  readonly connection: string;
  readonly account: string;
  readonly club: string;
  readonly source: 'flights' | 'own-duties' | 'club-duties';
  /** Reader-verified schema, effective filters/window, ordering and marker semantics. */
  readonly configuration: string;
}

export interface ActivityMarkers {
  /** Verified matching-source total, never the number of rows on a page. */
  readonly count?: number;
  /** Reader-verified newest record key; null means proven empty, omission means unavailable.
   * Use record identity/date/time only, without older flight/detail fields. */
  readonly newest?: string | null;
}

export interface ActivityObservation {
  readonly context: ActivityContext;
  readonly markers: ActivityMarkers;
  readonly observedAt: number;
  /** Admission deadline for this observation; historical baselines may outlive it. */
  readonly expiresAt: number;
}

/** One account/source/configuration only; switching context requires its own state. */
export interface ActivitySignal {
  readonly context: ActivityContext;
  readonly baseline: ActivityObservation | null;
  readonly hintSince: number | null;
  readonly settledAt: number | null;
}

export type ActivitySignalEvent =
  | { readonly kind: 'observation'; readonly observation: ActivityObservation }
  | { readonly kind: 'unavailable' }
  /** Caller must establish a durable matching source sync covering this observation.
   * A later quick read alone is not acknowledgment of saved data. */
  | { readonly kind: 'sync'; readonly observation: ActivityObservation; readonly committedAt: number };

type Marker = keyof ActivityMarkers;
type UnknownReason = 'unavailable' | 'context' | 'invalid-evidence' | 'expired' | 'out-of-order' | 'baseline' | 'no-common-marker';
export interface ActivitySignalResult {
  readonly state: ActivitySignal;
  readonly comparison: 'unknown' | 'unchanged' | 'changed' | 'synced';
  readonly reason?: UnknownReason;
  readonly changedMarkers: readonly Marker[];
}

const contextFields = ['owner', 'store', 'connection', 'account', 'club', 'source', 'configuration'] as const;
function validContext(context: ActivityContext): boolean {
  return !!context && contextFields.every(key => typeof context[key] === 'string' &&
    context[key].trim().length > 0 && context[key].length <= 1024) &&
    ['flights', 'own-duties', 'club-duties'].includes(context.source);
}
function sameContext(a: ActivityContext, b: ActivityContext): boolean {
  return validContext(b) && contextFields.every(key => a[key] === b[key]);
}
function timestamp(value: number): boolean { return Number.isSafeInteger(value) && value >= 0; }
function validMarkers(markers: ActivityMarkers): boolean {
  if (!markers || markers.count === undefined && markers.newest === undefined) return false;
  if (markers.count !== undefined && (!Number.isSafeInteger(markers.count) || markers.count < 0)) return false;
  if (markers.newest !== undefined && markers.newest !== null &&
    (typeof markers.newest !== 'string' || !markers.newest.trim() || markers.newest.length > 512)) return false;
  if (markers.count === 0 && typeof markers.newest === 'string') return false;
  if (markers.count !== undefined && markers.count > 0 && markers.newest === null) return false;
  return true;
}
function snapshot(observation: ActivityObservation): ActivityObservation {
  return { context: { ...observation.context }, observedAt: observation.observedAt, expiresAt: observation.expiresAt,
    markers: { ...(observation.markers.count === undefined ? {} : { count: observation.markers.count }),
      ...(observation.markers.newest === undefined ? {} : { newest: observation.markers.newest }) } };
}

export function createActivitySignal(context: ActivityContext): ActivitySignal {
  if (!validContext(context)) throw new Error('Invalid activity signal context.');
  return { context: { ...context }, baseline: null, hintSince: null, settledAt: null };
}

/** Pure, serializable state transition. No clock, provider, persistence or scheduling side effects.
 * Caller retains separate states for different contexts and only displays the selected scope.
 * Missing markers are never inferred from a partial page. Unchanged is not "all current". */
export function reduceActivitySignal(state: ActivitySignal, event: ActivitySignalEvent, now: number): ActivitySignalResult {
  const unknown = (reason: UnknownReason): ActivitySignalResult => ({ state, comparison: 'unknown', reason, changedMarkers: [] });
  if (event.kind === 'unavailable') return unknown('unavailable');
  const observation = event.observation;
  if (!observation || !sameContext(state.context, observation.context)) return unknown('context');
  const { observedAt, expiresAt, markers } = observation;
  if (!timestamp(now) || !timestamp(observedAt) || !timestamp(expiresAt) ||
    observedAt > now || expiresAt <= observedAt || !validMarkers(markers)) return unknown('invalid-evidence');
  if (now >= expiresAt) return unknown('expired');
  if (event.kind === 'sync') {
    if (!timestamp(event.committedAt) || event.committedAt < observedAt || event.committedAt > now) return unknown('invalid-evidence');
    if (state.settledAt !== null && (observedAt < state.settledAt || event.committedAt <= state.settledAt)) return unknown('out-of-order');
    return { state: { context: state.context, baseline: snapshot(observation), hintSince: null, settledAt: event.committedAt },
      comparison: 'synced', changedMarkers: [] };
  }
  if (state.settledAt !== null && observedAt <= state.settledAt) return unknown('out-of-order');
  const baseline = state.baseline;
  const compared = (['count', 'newest'] as const).filter(key => baseline?.markers[key] !== undefined && markers[key] !== undefined);
  const changed = compared.filter(key => baseline!.markers[key] !== markers[key]);
  const next: ActivitySignal = { context: state.context, baseline: snapshot(observation),
    hintSince: changed.length ? state.hintSince ?? observedAt : state.hintSince, settledAt: observedAt };
  if (!baseline || !compared.length) return { state: next, comparison: 'unknown',
    reason: baseline ? 'no-common-marker' : 'baseline', changedMarkers: [] };
  return { state: next, comparison: changed.length ? 'changed' : 'unchanged', changedMarkers: changed };
}

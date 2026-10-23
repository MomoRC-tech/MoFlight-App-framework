import {
  createActivitySignal,
  reduceActivitySignal,
  type ActivityContext,
  type ActivityMarkers,
  type ActivitySignal,
} from './activity-signal';

export type ActivityIdentity = Omit<ActivityContext, 'source' | 'configuration'>;

export interface ActivitySourceMarker {
  readonly source: ActivityContext['source'];
  readonly configuration: string;
  readonly markers: ActivityMarkers;
  readonly window?: { readonly from: string; readonly to: string };
  readonly participation?: string;
}

export interface ActivityLedger {
  readonly version: 1;
  readonly identity: ActivityIdentity;
  readonly lastAttemptAt: number | null;
  readonly entries: readonly {
    readonly signal: ActivitySignal;
    readonly window?: { readonly from: string; readonly to: string };
    readonly participation?: string;
  }[];
}

const MAX_ENTRIES = 16;
const MAX_JSON_BYTES = 128_000;
const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const OBSERVATION_TTL_MS = 60_000;
const identityKeys = ['owner', 'store', 'connection', 'account', 'club'] as const;
const contextKeys = [...identityKeys, 'source', 'configuration'] as const;
const sources = ['flights', 'own-duties', 'club-duties'] as const;
const markerKeys = ['count', 'newest'] as const;
const entryOptionalKeys = ['window', 'participation'] as const;

function invalid(message = 'Invalid activity ledger.'): never { throw new Error(message); }
function validTimestamp(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0; }
function validText(value: unknown, limit: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= limit;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return invalid();
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') return invalid();
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return invalid();
  }
  return value as Record<string, unknown>;
}

function fields(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): void {
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  if (keys.length !== Reflect.ownKeys(value).length || keys.some(key => !allowed.has(key)) ||
    required.some(key => !Object.prototype.hasOwnProperty.call(value, key)) ||
    optional.some(key => Object.prototype.hasOwnProperty.call(value, key) && value[key] === undefined)) invalid();
}

function array(value: unknown, maxLength = Number.MAX_SAFE_INTEGER): unknown[] {
  if (!Array.isArray(value) || value.length > maxLength || Reflect.ownKeys(value).length !== value.length + 1) return invalid();
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return invalid();
  }
  return value;
}

function copyIdentity(value: unknown): ActivityIdentity {
  const input = record(value);
  fields(input, identityKeys);
  for (const key of identityKeys) if (!validText(input[key], 1024)) return invalid('Invalid activity identity.');
  return { owner: input.owner as string, store: input.store as string, connection: input.connection as string,
    account: input.account as string, club: input.club as string };
}

function sameIdentity(a: ActivityIdentity, b: ActivityIdentity): boolean {
  return identityKeys.every(key => a[key] === b[key]);
}

function copyContext(value: unknown, identity: ActivityIdentity): ActivityContext {
  const input = record(value);
  fields(input, contextKeys);
  const contextIdentity = copyIdentity({ owner: input.owner, store: input.store, connection: input.connection,
    account: input.account, club: input.club });
  if (!sameIdentity(contextIdentity, identity) || !sources.includes(input.source as typeof sources[number]) ||
    !validText(input.configuration, 1024)) return invalid('Foreign or invalid activity context.');
  return { ...contextIdentity, source: input.source as ActivityContext['source'], configuration: input.configuration as string };
}

function copyMarkers(value: unknown): ActivityMarkers {
  const input = record(value);
  fields(input, [], markerKeys);
  const hasCount = Object.prototype.hasOwnProperty.call(input, 'count');
  const hasNewest = Object.prototype.hasOwnProperty.call(input, 'newest');
  if (!hasCount && !hasNewest) return invalid('Invalid activity markers.');
  if (hasCount && (!Number.isSafeInteger(input.count) || (input.count as number) < 0)) return invalid('Invalid activity markers.');
  if (hasNewest && input.newest !== null && !validText(input.newest, 512)) return invalid('Invalid activity markers.');
  if (hasCount && input.count === 0 && typeof input.newest === 'string' ||
    hasCount && (input.count as number) > 0 && input.newest === null) return invalid('Inconsistent activity markers.');
  return { ...(hasCount ? { count: input.count as number } : {}), ...(hasNewest ? { newest: input.newest as string | null } : {}) };
}

function copyWindow(value: unknown): { from: string; to: string } {
  const input = record(value);
  fields(input, ['from', 'to']);
  if (!validDate(input.from) || !validDate(input.to) || (input.from as string) > (input.to as string)) return invalid('Invalid activity window.');
  return { from: input.from as string, to: input.to as string };
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

function optionalParticipation(input: Record<string, unknown>): string | undefined {
  if (!Object.prototype.hasOwnProperty.call(input, 'participation')) return undefined;
  if (!validText(input.participation, 1024)) return invalid('Invalid activity participation.');
  return input.participation as string;
}

function copyObservation(value: unknown, identity: ActivityIdentity, context?: ActivityContext) {
  const input = record(value);
  fields(input, ['context', 'markers', 'observedAt', 'expiresAt']);
  const observationContext = copyContext(input.context, identity);
  if (context && !sameContext(context, observationContext)) return invalid('Inconsistent activity baseline context.');
  if (!validTimestamp(input.observedAt) || !validTimestamp(input.expiresAt) ||
    (input.expiresAt as number) !== (input.observedAt as number) + OBSERVATION_TTL_MS ||
    !Number.isSafeInteger((input.observedAt as number) + OBSERVATION_TTL_MS)) return invalid('Invalid activity observation time.');
  return { context: observationContext, markers: copyMarkers(input.markers), observedAt: input.observedAt as number, expiresAt: input.expiresAt as number };
}

function sameContext(a: ActivityContext, b: ActivityContext): boolean {
  return contextKeys.every(key => a[key] === b[key]);
}

function copySignal(value: unknown, identity: ActivityIdentity): ActivitySignal {
  const input = record(value);
  fields(input, ['context', 'baseline', 'hintSince', 'settledAt']);
  const context = copyContext(input.context, identity);
  if (input.baseline !== null && input.baseline === undefined) return invalid();
  const baseline = input.baseline === null ? null : copyObservation(input.baseline, identity, context);
  const hintSince = input.hintSince;
  const settledAt = input.settledAt;
  if (hintSince !== null && !validTimestamp(hintSince) || settledAt !== null && !validTimestamp(settledAt)) return invalid('Invalid activity signal time.');
  if (baseline === null) {
    if (hintSince !== null || settledAt !== null) return invalid('Inconsistent empty activity signal.');
  } else if (settledAt === null || settledAt < baseline.observedAt ||
    hintSince !== null && hintSince > baseline.observedAt) return invalid('Inconsistent activity signal baseline.');
  return { context, baseline, hintSince: hintSince as number | null, settledAt: settledAt as number | null };
}

function copyEntry(value: unknown, identity: ActivityIdentity) {
  const input = record(value);
  fields(input, ['signal'], entryOptionalKeys);
  const result: { signal: ActivitySignal; window?: { from: string; to: string }; participation?: string } = {
    signal: copySignal(input.signal, identity),
  };
  if (Object.prototype.hasOwnProperty.call(input, 'window')) result.window = copyWindow(input.window);
  const participation = optionalParticipation(input);
  if (participation !== undefined) result.participation = participation;
  return result;
}

function sameEntryKey(entry: ActivityLedger['entries'][number], source: ActivityContext['source'], configuration: string): boolean {
  return entry.signal.context.source === source && entry.signal.context.configuration === configuration;
}

function sameScope(entry: ActivityLedger['entries'][number], marker: ActivitySourceMarker): boolean {
  return JSON.stringify(entry.window) === JSON.stringify(marker.window) && entry.participation === marker.participation;
}

function utf8Bytes(text: string): number {
  let bytes = 0;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code < 0x80) bytes++;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length && text.charCodeAt(index + 1) >= 0xdc00 && text.charCodeAt(index + 1) <= 0xdfff) {
      bytes += 4;
      index++;
    } else bytes += 3;
  }
  return bytes;
}

function assertSerializedSize(ledger: ActivityLedger): void {
  const encoded = JSON.stringify(ledger);
  if (utf8Bytes(encoded) > MAX_JSON_BYTES) invalid('Activity ledger exceeds the 128000 byte limit.');
}

function copyLedger(value: unknown, identityInput: unknown): ActivityLedger {
  const identity = copyIdentity(identityInput);
  const input = record(value);
  fields(input, ['version', 'identity', 'lastAttemptAt', 'entries']);
  if (input.version !== 1) return invalid('Unsupported activity ledger version.');
  const storedIdentity = copyIdentity(input.identity);
  if (!sameIdentity(storedIdentity, identity)) return invalid('Activity ledger belongs to another identity.');
  if (input.lastAttemptAt !== null && !validTimestamp(input.lastAttemptAt)) return invalid('Invalid activity attempt time.');
  const rawEntries = array(input.entries, MAX_ENTRIES);
  const entries = rawEntries.map(entry => copyEntry(entry, identity));
  for (let left = 0; left < entries.length; left++) {
    for (let right = left + 1; right < entries.length; right++) {
      if (sameEntryKey(entries[left]!, entries[right]!.signal.context.source, entries[right]!.signal.context.configuration)) {
        return invalid('Duplicate activity source/configuration entry.');
      }
    }
  }
  const ledger: ActivityLedger = { version: 1, identity: storedIdentity, lastAttemptAt: input.lastAttemptAt as number | null, entries };
  assertSerializedSize(ledger);
  return ledger;
}

function parsePersisted(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  if (utf8Bytes(value) > MAX_JSON_BYTES) return invalid('Activity ledger exceeds the 128000 byte limit.');
  try { return JSON.parse(value) as unknown; } catch { return invalid('Invalid activity ledger JSON.'); }
}

function sourceMarker(value: unknown): ActivitySourceMarker {
  const input = record(value);
  fields(input, ['source', 'configuration', 'markers'], entryOptionalKeys);
  if (!sources.includes(input.source as typeof sources[number]) || !validText(input.configuration, 1024)) return invalid('Invalid activity source configuration.');
  const marker: { source: ActivityContext['source']; configuration: string; markers: ActivityMarkers; window?: { from: string; to: string }; participation?: string } = {
    source: input.source as ActivityContext['source'], configuration: input.configuration as string, markers: copyMarkers(input.markers),
  };
  if (Object.prototype.hasOwnProperty.call(input, 'window')) marker.window = copyWindow(input.window);
  const participation = optionalParticipation(input);
  if (participation !== undefined) marker.participation = participation;
  return marker;
}

function copyOutputLedger(identity: ActivityIdentity, lastAttemptAt: number | null, entries: ActivityLedger['entries']): ActivityLedger {
  const result: ActivityLedger = { version: 1, identity: copyIdentity(identity), lastAttemptAt, entries: entries.map(entry => copyEntry(entry, identity)) };
  assertSerializedSize(result);
  return result;
}

function stateAge(entry: ActivityLedger['entries'][number]): number {
  return entry.signal.settledAt ?? -1;
}

function retain(entries: ActivityLedger['entries']): ActivityLedger['entries'] {
  if (entries.length <= MAX_ENTRIES) return entries;
  const hinted = entries.filter(entry => entry.signal.hintSince !== null);
  if (hinted.length === MAX_ENTRIES) return invalid('Activity ledger is full of pending hints; new entry rejected.');
  const unhinted = entries.map((entry, index) => ({ entry, index })).filter(item => item.entry.signal.hintSince === null)
    .sort((a, b) => stateAge(a.entry) - stateAge(b.entry) || a.index - b.index);
  const evictCount = entries.length - MAX_ENTRIES;
  if (unhinted.length < evictCount) return invalid('Activity ledger is full of pending hints; new entry rejected.');
  const evicted = new Set(unhinted.slice(0, evictCount).map(item => item.entry));
  const retained = entries.filter(entry => !evicted.has(entry));
  if (hinted.length > MAX_ENTRIES || retained.length > MAX_ENTRIES) return invalid('Activity ledger entry limit exceeded.');
  return retained;
}

export function createActivityLedger(identity: ActivityIdentity): ActivityLedger {
  return { version: 1, identity: copyIdentity(identity), lastAttemptAt: null, entries: [] };
}

/** Accept a persisted JSON string or parsed value, validate its full scope and copy only known fields. */
export function decodeActivityLedger(value: unknown, identity: ActivityIdentity): ActivityLedger {
  return copyLedger(parsePersisted(value), identity);
}

export function activityCheckDue(ledger: ActivityLedger, now: number): boolean {
  const valid = decodeActivityLedger(ledger, ledger.identity);
  if (!validTimestamp(now)) return false;
  if (valid.lastAttemptAt === null) return true;
  return now >= valid.lastAttemptAt && now - valid.lastAttemptAt >= CHECK_INTERVAL_MS;
}

/** Keep the persisted gate monotonic so a backward system clock cannot cause repeated checks. */
export function recordActivityAttempt(ledger: ActivityLedger, now: number): ActivityLedger {
  if (!validTimestamp(now)) return invalid('Invalid activity attempt time.');
  const valid = decodeActivityLedger(ledger, ledger.identity);
  const lastAttemptAt = valid.lastAttemptAt === null ? now : Math.max(valid.lastAttemptAt, now);
  return copyOutputLedger(valid.identity, lastAttemptAt, valid.entries);
}

export function observeActivityLedger(ledger: ActivityLedger, sourcesToObserve: readonly ActivitySourceMarker[], observedAt: number, now: number): ActivityLedger {
  const valid = decodeActivityLedger(ledger, ledger.identity);
  if (!validTimestamp(observedAt) || !validTimestamp(now) || observedAt > now ||
    !Number.isSafeInteger(observedAt + OBSERVATION_TTL_MS)) return invalid('Invalid activity observation time.');
  const inputSources = array(sourcesToObserve);
  const markers = inputSources.map(sourceMarker);
  for (let left = 0; left < markers.length; left++) {
    for (let right = left + 1; right < markers.length; right++) {
      if (markers[left]!.source === markers[right]!.source && markers[left]!.configuration === markers[right]!.configuration) {
        return invalid('Duplicate activity source/configuration observation.');
      }
    }
  }
  const entries = [...valid.entries];
  for (const marker of markers) {
    const index = entries.findIndex(entry => sameEntryKey(entry, marker.source, marker.configuration));
    const context: ActivityContext = { ...valid.identity, source: marker.source, configuration: marker.configuration };
    const current = index < 0 ? { signal: createActivitySignal(context) } : entries[index]!;
    if (index >= 0 && !sameScope(current, marker)) return invalid('Activity metadata does not match its source configuration.');
    const result = reduceActivitySignal(current.signal, {
      kind: 'observation',
      observation: { context, markers: copyMarkers(marker.markers), observedAt, expiresAt: observedAt + OBSERVATION_TTL_MS },
    }, now);
    if (result.state === current.signal) continue;
    const next: { signal: ActivitySignal; window?: { from: string; to: string }; participation?: string } = { signal: result.state };
    if (marker.window) next.window = { ...marker.window };
    if (marker.participation !== undefined) next.participation = marker.participation;
    if (index < 0) entries.push(next);
    else entries[index] = next;
  }
  const retained = retain(entries);
  return copyOutputLedger(valid.identity, valid.lastAttemptAt, retained);
}

export function activityLedgerChanged(ledger: ActivityLedger): boolean {
  return decodeActivityLedger(ledger, ledger.identity).entries.some(entry => entry.signal.hintSince !== null);
}

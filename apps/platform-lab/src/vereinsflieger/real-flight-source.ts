import type { Hash } from '@moflight/local-data';
import { sameContext, validateContext, type ObservedContext } from './context';
import { validateCapture, type ProbeSnapshot } from './probe';
import { REAL_HISTORY_PLAN_LIMIT } from './real-history-contract';

export const REAL_FLIGHT_SOURCE_ADAPTER = Object.freeze({
  method: 'moflight-vereinsflieger-account-scoped-capture',
  version: 1 as const,
  claim: 'adapter-contract-only' as const,
});
export const REAL_FLIGHT_SOURCE_ROW_LIMIT = REAL_HISTORY_PLAN_LIMIT;
const MAX_CANONICAL_CAPTURE_LENGTH = 20_000_000;
const PROVIDER = 'vereinsflieger' as const;
const PARTICIPATION = 'Pilot oder Fluglehrer' as const;

export interface RealFlightSourceInput {
  version: 1;
  binding: { provider: typeof PROVIDER; accountRef: string };
  contextBefore: ObservedContext;
  contextAfter: ObservedContext;
  requestedWindow: { from: string; to: string; participation: typeof PARTICIPATION };
  capture: ProbeSnapshot;
}

export interface RealFlightSourceRow {
  readonly sourceFlightRef: string | null;
  readonly rawValues: readonly string[];
}

export interface RealFlightSourceObservation {
  readonly version: 1;
  readonly adapter: typeof REAL_FLIGHT_SOURCE_ADAPTER;
  readonly binding: { readonly provider: typeof PROVIDER; readonly accountRef: string };
  readonly context: {
    readonly before: Readonly<ObservedContext>;
    readonly after: Readonly<ObservedContext>;
    readonly clubIdentity: 'display-label-only';
    readonly clubLabel: string;
  };
  readonly requestedWindow: { readonly from: string; readonly to: string; readonly participation: typeof PARTICIPATION };
  readonly coverage: {
    readonly state: 'partial' | 'complete' | 'empty';
    readonly displayedWindow: { readonly from: string; readonly to: string; readonly participation: typeof PARTICIPATION } | null;
    readonly reportedRecordCount: number | null;
    readonly observedRecordCount: number;
    readonly pageCount: number | null;
    readonly referenceIntegrity: { readonly missingCount: number; readonly duplicateCount: number };
  };
  readonly capture: {
    readonly captureId: string;
    readonly retrievedAt: string;
    readonly rawCaptureJson: string;
    readonly rawCaptureSha256: string;
  };
  readonly headers: readonly string[];
  readonly rows: readonly RealFlightSourceRow[];
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error(`Invalid ${label}.`);
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') throw new Error(`Unsupported ${label} keys.`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !('value' in descriptor)) throw new Error(`Unsupported ${label} properties.`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: unknown, expected: readonly string[], label: string): Record<string, unknown> {
  const object = record(value, label), keys = Object.keys(object).sort(), wanted = [...expected].sort();
  if (keys.length !== wanted.length || keys.some((key, index) => key !== wanted[index])) throw new Error(`Unsupported ${label} keys.`);
  return object;
}

function denseArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`Invalid ${label}.`);
  const keys = Reflect.ownKeys(value);
  if (keys.length !== value.length + 1 || !keys.includes('length') || keys.some(key => key !== 'length' &&
      (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length))) {
    throw new Error(`Invalid ${label}.`);
  }
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor?.enumerable || !('value' in descriptor)) throw new Error(`Invalid ${label}.`);
  }
  return value;
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

function canonical(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Non-finite capture value.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) throw new Error('Unsupported canonical array.');
    return `[${denseArray(value, 'canonical array').map(canonical).join(',')}]`;
  }
  const object = record(value, 'canonical value');
  return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${canonical(object[key])}`).join(',')}}`;
}

function freezeDeep<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

function validateInputShape(value: unknown): RealFlightSourceInput {
  const input = exactKeys(value, ['version', 'binding', 'contextBefore', 'contextAfter', 'requestedWindow', 'capture'], 'source input');
  if (input.version !== 1) throw new Error('Unsupported source input version.');

  const binding = exactKeys(input.binding, ['provider', 'accountRef'], 'provider binding');
  if (binding.provider !== PROVIDER || typeof binding.accountRef !== 'string' || !/^\d{1,20}$/.test(binding.accountRef)) {
    throw new Error('Unsupported provider account binding.');
  }

  const contextBefore = validateContext(exactKeys(input.contextBefore,
    ['accountNumber', 'clubLabel', 'clubIdentity', 'verification'], 'before context'));
  const contextAfter = validateContext(exactKeys(input.contextAfter,
    ['accountNumber', 'clubLabel', 'clubIdentity', 'verification'], 'after context'));
  if (!sameContext(contextBefore, contextAfter)) throw new Error('Provider account or club context changed during capture.');
  if (contextBefore.accountNumber !== binding.accountRef || contextAfter.accountNumber !== binding.accountRef) {
    throw new Error('Capture does not match the expected provider account.');
  }

  const requested = exactKeys(input.requestedWindow, ['from', 'to', 'participation'], 'requested window');
  if (!validDate(requested.from) || !validDate(requested.to) || requested.from > requested.to || requested.participation !== PARTICIPATION) {
    throw new Error('Invalid requested flight window.');
  }

  const capture = exactKeys(input.capture, ['captureId', 'retrievedAt', 'headers', 'rows', 'sourceIdentity', 'coverage', 'timeBasis', ...(record(input.capture, 'capture').coverage === 'complete-requested-list' ? ['exportContext'] : [])], 'capture');
  if (capture.coverage === 'complete-requested-list') {
    const exportContext = exactKeys(capture.exportContext, ['from', 'to', 'preset', 'participation', 'accountLabel', 'recordCount', 'pageCount', 'columnIds', 'adapterVersion'], 'export context');
    if (!validDate(exportContext.from) || !validDate(exportContext.to) || !Number.isSafeInteger(exportContext.recordCount) ||
        !Number.isSafeInteger(exportContext.pageCount) || !Array.isArray(exportContext.columnIds)) throw new Error('Invalid complete capture metadata.');
    denseArray(exportContext.columnIds, 'capture column IDs');
  }

  const headers = denseArray(capture.headers, 'capture headers');
  const rawRows = denseArray(capture.rows, 'capture rows');
  if (rawRows.length > REAL_FLIGHT_SOURCE_ROW_LIMIT) throw new Error('Capture exceeds the bounded source row limit.');
  for (const header of headers) if (typeof header !== 'string') throw new Error('Invalid capture header.');
  for (const candidate of rawRows) {
    const row = exactKeys(candidate, ['values', 'sourceFlightId'], 'capture row');
    const values = denseArray(row.values, 'capture row values');
    if (row.sourceFlightId !== null && (typeof row.sourceFlightId !== 'string' || !/^\d{1,20}$/.test(row.sourceFlightId))) {
      throw new Error('Unsupported source flight reference.');
    }
    for (const raw of values) if (typeof raw !== 'string') throw new Error('Invalid raw capture value.');
  }

  // Count escaped field sizes before canonical serialization so a small row
  // count with very wide rows cannot allocate an unbounded intermediate string.
  let escapedTextLength = 0;
  for (const header of headers as string[]) escapedTextLength += JSON.stringify(header).length;
  for (const candidate of rawRows) {
    const row = candidate as Record<string, unknown>;
    for (const raw of row.values as string[]) escapedTextLength += JSON.stringify(raw).length;
  }
  if (escapedTextLength > MAX_CANONICAL_CAPTURE_LENGTH) throw new Error('Oversized source capture.');

  const captureCopy: ProbeSnapshot = {
    captureId: capture.captureId as string,
    retrievedAt: capture.retrievedAt as string,
    headers: [...headers as string[]],
    rows: rawRows.map(candidate => {
      const row = candidate as Record<string, unknown>;
      return { values: [...row.values as string[]], sourceFlightId: row.sourceFlightId as string | null };
    }),
    sourceIdentity: capture.sourceIdentity as 'unverified',
    coverage: capture.coverage as ProbeSnapshot['coverage'],
    timeBasis: capture.timeBasis as 'unknown',
    ...(capture.coverage === 'complete-requested-list' ? {
      exportContext: {
        ...(capture.exportContext as NonNullable<ProbeSnapshot['exportContext']>),
        columnIds: [...(capture.exportContext as NonNullable<ProbeSnapshot['exportContext']>).columnIds],
      },
    } : {}),
  };

  return {
    version: 1,
    binding: { provider: PROVIDER, accountRef: binding.accountRef as string },
    contextBefore,
    contextAfter,
    requestedWindow: { from: requested.from as string, to: requested.to as string, participation: PARTICIPATION },
    capture: captureCopy,
  };
}

function referenceCounts(capture: ProbeSnapshot): { missingCount: number; duplicateCount: number } {
  const seen = new Set<string>();
  let missingCount = 0, duplicateCount = 0;
  for (const row of capture.rows) {
    if (row.sourceFlightId === null) { missingCount++; continue; }
    if (seen.has(row.sourceFlightId)) duplicateCount++;
    else seen.add(row.sourceFlightId);
  }
  return { missingCount, duplicateCount };
}

function validateWithExistingCaptureRules(capture: ProbeSnapshot): void {
  if (capture.coverage !== 'complete-requested-list') {
    validateCapture(capture);
    return;
  }

  // `validateCapture` requires unique non-null references for complete imports.
  // Preserve malformed references as raw evidence, but run its remaining date,
  // schema, count and size checks on an ephemeral copy with generated references.
  // The generated references are never returned, persisted or treated as facts.
  const used = new Set(capture.rows.flatMap(row => row.sourceFlightId === null ? [] : [row.sourceFlightId]));
  let candidate = 0n;
  const rows = capture.rows.map(row => {
    if (row.sourceFlightId !== null && !used.has(`duplicate:${row.sourceFlightId}`)) {
      const key = `accepted:${row.sourceFlightId}`;
      if (!used.has(key)) { used.add(key); return row; }
    }
    while (used.has(candidate.toString())) candidate++;
    const sourceFlightId = candidate.toString();
    used.add(sourceFlightId);
    if (row.sourceFlightId !== null) used.add(`duplicate:${row.sourceFlightId}`);
    candidate++;
    return { ...row, sourceFlightId };
  });
  validateCapture({ ...capture, rows });
}

export async function createRealFlightSourceObservation(
  value: RealFlightSourceInput,
  hash: Hash,
): Promise<RealFlightSourceObservation> {
  const input = validateInputShape(value);
  validateWithExistingCaptureRules(input.capture);
  const rawCaptureJson = canonical(input.capture);
  if (rawCaptureJson.length > MAX_CANONICAL_CAPTURE_LENGTH) throw new Error('Oversized source capture.');
  const rawCaptureSha256 = await hash(rawCaptureJson);
  if (!/^[a-f0-9]{64}$/.test(rawCaptureSha256)) throw new Error('Invalid raw capture digest.');

  const complete = input.capture.coverage === 'complete-requested-list';
  const exportContext = complete ? input.capture.exportContext! : null;
  if (exportContext && (exportContext.from !== input.requestedWindow.from || exportContext.to !== input.requestedWindow.to ||
      exportContext.participation !== input.requestedWindow.participation || exportContext.recordCount !== input.capture.rows.length)) {
    throw new Error('Complete capture does not match the requested dates, participation or record count.');
  }
  const references = referenceCounts(input.capture);
  const observation: RealFlightSourceObservation = {
    version: 1,
    adapter: REAL_FLIGHT_SOURCE_ADAPTER,
    binding: { ...input.binding },
    context: {
      before: { ...input.contextBefore },
      after: { ...input.contextAfter },
      clubIdentity: 'display-label-only',
      clubLabel: input.contextBefore.clubLabel,
    },
    requestedWindow: { ...input.requestedWindow },
    coverage: {
      state: complete ? (input.capture.rows.length === 0 ? 'empty' : 'complete') : 'partial',
      displayedWindow: exportContext ? {
        from: exportContext.from,
        to: exportContext.to,
        participation: exportContext.participation,
      } : null,
      reportedRecordCount: exportContext?.recordCount ?? null,
      observedRecordCount: input.capture.rows.length,
      pageCount: exportContext?.pageCount ?? null,
      referenceIntegrity: references,
    },
    capture: {
      captureId: input.capture.captureId,
      retrievedAt: input.capture.retrievedAt,
      rawCaptureJson,
      rawCaptureSha256,
    },
    headers: [...input.capture.headers],
    rows: input.capture.rows.map(row => ({ sourceFlightRef: row.sourceFlightId, rawValues: [...row.values] })),
  };
  return freezeDeep(observation);
}

export async function validateRealFlightSourceObservation(
  value: unknown,
  hash: Hash,
): Promise<RealFlightSourceObservation> {
  const observation = exactKeys(value, ['version', 'adapter', 'binding', 'context', 'requestedWindow', 'coverage', 'capture', 'headers', 'rows'], 'source observation');
  const capture = exactKeys(observation.capture, ['captureId', 'retrievedAt', 'rawCaptureJson', 'rawCaptureSha256'], 'captured source evidence');
  if (typeof capture.rawCaptureJson !== 'string' || typeof capture.rawCaptureSha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(capture.rawCaptureSha256)) throw new Error('Invalid persisted raw capture evidence.');
  let raw: unknown;
  try { raw = JSON.parse(capture.rawCaptureJson); } catch { throw new Error('Invalid persisted raw capture JSON.'); }
  if (canonical(raw) !== capture.rawCaptureJson) throw new Error('Persisted raw capture is not canonical.');

  const context = exactKeys(observation.context, ['before', 'after', 'clubIdentity', 'clubLabel'], 'source context provenance');
  const input: RealFlightSourceInput = {
    version: observation.version as 1,
    binding: observation.binding as RealFlightSourceInput['binding'],
    contextBefore: context.before as ObservedContext,
    contextAfter: context.after as ObservedContext,
    requestedWindow: observation.requestedWindow as RealFlightSourceInput['requestedWindow'],
    capture: raw as ProbeSnapshot,
  };
  const rebuilt = await createRealFlightSourceObservation(input, hash);
  if (rebuilt.capture.rawCaptureSha256 !== capture.rawCaptureSha256 || canonical(rebuilt) !== canonical(value)) {
    throw new Error('Persisted source observation does not match its raw capture.');
  }
  return rebuilt;
}

export async function validateRealFlightSourceForImport(
  value: unknown,
  hash: Hash,
): Promise<RealFlightSourceObservation> {
  const observation = await validateRealFlightSourceObservation(value, hash);
  if (observation.coverage.state === 'partial') throw new Error('Partial source capture cannot be imported.');
  if (observation.coverage.referenceIntegrity.missingCount || observation.coverage.referenceIntegrity.duplicateCount) {
    throw new Error('Source flight references require review before import.');
  }
  return observation;
}

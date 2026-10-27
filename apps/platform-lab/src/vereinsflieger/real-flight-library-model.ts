// Production account-scoped flight history ledger. This module reconstructs
// every write from the original source contract and never creates book state.
import { canonical } from '@moflight/flight-logbook';
import type { Hash } from '../../../../packages/local-data/src/index';
import { adaptHistoryFacts, type HistoryFacts, type HistoryScope } from './history-facts';
import { REAL_HISTORY_BACKUP_LIMIT, REAL_HISTORY_COMMAND_LIMIT, REAL_HISTORY_PLAN_LIMIT,
  realHistoryUuid, validateRealHistoryManifest, type RealHistoryManifest } from './real-history-contract';
import { createRealFlightSourceObservation, type RealFlightSourceInput, type RealFlightSourceObservation } from './real-flight-source';
import { sameContext } from './context';

export const REAL_FLIGHT_LIBRARY_BACKUP_FORMAT = 'moflight-real-flight-history-backup';
export const REAL_FLIGHT_LIBRARY_BACKUP_VERSION = 1;
export const REAL_FLIGHT_LIBRARY_RECEIPT_LIMIT = 100_000;
export const REAL_FLIGHT_LIBRARY_RECORD_LIMIT = 500_000;

export type RealFlightRecordKind = 'binding' | 'capture' | 'flight' | 'facts' | 'coverage' | 'pending';
export interface RealFlightRecord {
  seq: number; owner_id: string; kind: RealFlightRecordKind; id: string; revision: number;
  generation: number; payload: string; payload_sha256: string;
}
export interface RealFlightReceipt {
  command_id: string; owner_id: string; kind: RealFlightCommand['kind']; base_generation: number;
  generation: number; request_json: string; request_sha256: string; result_json: string; committed_at: string;
}
export interface RealFlightGraph {
  manifest: RealHistoryManifest; generation: number; receipts: RealFlightReceipt[]; records: RealFlightRecord[];
}

interface CommandBase {
  version: 1; ownerId: string; storeId: string; commandId: string; baseGeneration: number; at: string;
}
export interface BindAccountCommand extends CommandBase {
  kind: 'bind'; source: RealFlightSourceInput;
}
export interface ImportUnassignedCommand extends CommandBase {
  kind: 'import-unassigned'; bindingId: string; source: RealFlightSourceInput; planToken: string;
}
export type RealFlightCommand = BindAccountCommand | ImportUnassignedCommand;

export interface RealFlightMutation { kind: RealFlightRecordKind; id: string; revision: number; seq: number; hash: string }
export interface RealFlightResult {
  commandId: string; kind: RealFlightCommand['kind']; generation: number; bindingId: string;
  captureId: string; planSha256: string | null; mutations: RealFlightMutation[];
  counts: { added: number; changed: number; unchanged: number; pending: number }; flightIds: string[];
}

export interface RealFlightPlanEntry {
  flightId: string; sourceFlightRef: string | null; rowIndexes: number[];
  state: 'added' | 'changed' | 'unchanged' | 'pending'; facts: HistoryFacts[];
}
export interface RealFlightPlanIssue {
  reason: 'missing-source-reference' | 'conflicting-source-reference'; sourceFlightRef: string | null;
  rowIndexes: number[]; evidenceKeys: string[]; previousFactsRevision: number | null;
}
export interface RealFlightImportPlan {
  version: 1; ownerId: string; storeId: string; bindingId: string; baseGeneration: number;
  captureId: string; captureSha256: string; planToken: string;
  coverage: RealFlightSourceObservation['coverage'];
  entries: RealFlightPlanEntry[]; issues: RealFlightPlanIssue[];
  counts: { added: number; changed: number; unchanged: number; pending: number };
}

export interface StoredBinding {
  version: 1; bindingId: string; provider: 'vereinsflieger'; accountRef: string;
  clubContext: { identity: 'display-label-only'; before: RealFlightSourceObservation['context']['before']; after: RealFlightSourceObservation['context']['after'] };
  adapterEvidence: { method: string; version: number; claim: string; boundAt: string };
  evidence: { captureId: string; captureSha256: string };
}
export interface StoredCapture { version: 1; bindingId: string; source: RealFlightSourceObservation }
export interface StoredFlight { version: 1; bindingId: string; accountRef: string; sourceFlightRef: string; firstCaptureId: string; firstRowIndex: number }
export interface StoredFacts {
  version: 1; bindingId: string; flightId: string; facts: HistoryFacts; predecessor: number | null;
  reason: 'source-change'; captureId: string; rowIndex: number;
}
export interface StoredCoverage {
  version: 1; bindingId: string; captureId: string; captureSha256: string;
  coverage: RealFlightSourceObservation['coverage'];
}
export interface StoredPending {
  version: 1; bindingId: string; captureId: string; issues: RealFlightPlanIssue[];
}

const byteLength = (text: string) => new TextEncoder().encode(text).length;
export function realFlightClone<T>(value: T): T { return JSON.parse(canonical(value)) as T; }
export function realFlightRequire(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
export function realFlightExactKeys(value: unknown, keys: readonly string[]): asserts value is Record<string, unknown> {
  realFlightRequire(value !== null && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null) &&
    Object.getOwnPropertyNames(value).length === Object.keys(value).length && Object.getOwnPropertySymbols(value).length === 0 &&
    canonical(Object.keys(value).sort()) === canonical([...keys].sort()), 'Unsupported real flight history fields.');
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    realFlightRequire(!!descriptor && descriptor.enumerable && 'value' in descriptor, 'Unsupported real flight history property.');
  }
}
export function realFlightTime(value: unknown): asserts value is string {
  realFlightRequire(typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value, 'Invalid real flight history timestamp.');
}
export function realFlightSha(value: unknown): asserts value is string {
  realFlightRequire(typeof value === 'string' && /^[0-9a-f]{64}$/.test(value), 'Invalid real flight history digest.');
}
export function realFlightBoundedJson(value: unknown, limit: number): string {
  const pieces: string[] = []; let bytes = 0, buffered = '';
  const add = (piece: string) => {
    bytes += byteLength(piece); realFlightRequire(bytes <= limit, 'Real flight history size limit exceeded.');
    buffered += piece;
    if (buffered.length >= 8192) { pieces.push(buffered); buffered = ''; }
  };
  const write = (current: unknown, depth: number): void => {
    realFlightRequire(depth <= 128, 'Real flight history nesting limit exceeded.');
    if (current === null) { add('null'); return; }
    if (typeof current === 'string') { add(JSON.stringify(current)); return; }
    if (typeof current === 'boolean') { add(current ? 'true' : 'false'); return; }
    if (typeof current === 'number') {
      realFlightRequire(Number.isFinite(current), 'Non-finite real flight history number.'); add(JSON.stringify(current)); return;
    }
    if (Array.isArray(current)) {
      realFlightRequire(Object.getPrototypeOf(current) === Array.prototype && current.length <= limit &&
        Object.getOwnPropertySymbols(current).length === 0 && Object.getOwnPropertyNames(current).length === current.length + 1 &&
        Object.keys(current).length === current.length,
      'Unsupported real flight history array.');
      add('[');
      for (let index = 0; index < current.length; index++) {
        if (index) add(',');
        const descriptor = Object.getOwnPropertyDescriptor(current, String(index));
        realFlightRequire(!!descriptor && 'value' in descriptor && descriptor.enumerable, 'Unsupported real flight history array value.');
        write(descriptor.value, depth + 1);
      }
      add(']'); return;
    }
    realFlightRequire(typeof current === 'object' && current !== null &&
      (Object.getPrototypeOf(current) === Object.prototype || Object.getPrototypeOf(current) === null),
    'Unsupported real flight history value.');
    const names = Object.getOwnPropertyNames(current), keys = Object.keys(current);
    realFlightRequire(names.length === keys.length && keys.length <= limit && Object.getOwnPropertySymbols(current).length === 0,
      'Unsupported real flight history object.');
    keys.sort(); add('{');
    for (let index = 0; index < keys.length; index++) {
      if (index) add(',');
      const key = keys[index]!; add(JSON.stringify(key)); add(':');
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      realFlightRequire(!!descriptor && 'value' in descriptor && descriptor.enumerable, 'Unsupported real flight history property.');
      write(descriptor.value, depth + 1);
    }
    add('}');
  };
  write(value, 0); return pieces.join('') + buffered;
}

export function latestRealFlightRecord(records: RealFlightRecord[], kind: RealFlightRecordKind, id: string): RealFlightRecord | undefined {
  for (let i = records.length - 1; i >= 0; i--) if (records[i]!.kind === kind && records[i]!.id === id) return records[i];
  return undefined;
}
export function latestRealFlightRecords(records: RealFlightRecord[], kind: RealFlightRecordKind): RealFlightRecord[] {
  const byId = new Map<string, RealFlightRecord>();
  for (const record of records) if (record.kind === kind) byId.set(record.id, record);
  return [...byId.values()];
}
export function latestRealFlightValues<T>(records: RealFlightRecord[], kind: RealFlightRecordKind): T[] {
  return latestRealFlightRecords(records, kind).map(record => JSON.parse(record.payload) as T);
}

function commandKeys(command: RealFlightCommand): string[] {
  const common = ['version','kind','ownerId','storeId','commandId','baseGeneration','at'];
  return [...common, ...(command.kind === 'bind' ? ['source'] : ['bindingId','source','planToken'])];
}
function validateCommandIdentity(command: RealFlightCommand, graph: RealFlightGraph): void {
  realFlightExactKeys(command, commandKeys(command));
  realFlightRequire(command.version === 1 && command.ownerId === graph.manifest.owner_id && command.storeId === graph.manifest.store_id,
    'Foreign or unsupported real flight history command.');
  realFlightTime(command.at);
  realFlightRequire(Number.isSafeInteger(command.baseGeneration) && command.baseGeneration === graph.generation,
    'Stale real flight history generation.');
  realFlightRequire(Number.isSafeInteger(graph.generation + 1), 'Real flight history generation overflow.');
  realHistoryUuid(command.commandId);
}

async function checkedHash(hash: Hash, value: string): Promise<string> {
  const digest = await hash(value); realFlightSha(digest); return digest;
}
async function bindingIdFor(ownerId: string, accountRef: string, hash: Hash): Promise<string> {
  return checkedHash(hash, canonical(['moflight-real-history-account-binding-v1', ownerId, accountRef]));
}
async function flightIdFor(bindingId: string, sourceFlightRef: string, hash: Hash): Promise<string> {
  return checkedHash(hash, canonical(['moflight-real-history-flight-v1', bindingId, sourceFlightRef]));
}
function latestBinding(graph: RealFlightGraph): StoredBinding | null {
  const values = latestRealFlightValues<StoredBinding>(graph.records, 'binding'); return values[0] ?? null;
}
function validateImportWindow(source: RealFlightSourceObservation): void {
  realFlightRequire(source.coverage.state === 'complete' || source.coverage.state === 'empty',
    'A partial source window cannot be saved to real flight history.');
  if (source.coverage.state === 'empty') realFlightRequire(source.rows.length === 0, 'Invalid empty real flight history source.');
}

async function buildImportPlan(graph: RealFlightGraph, bindingId: string, sourceInput: RealFlightSourceInput, hash: Hash,
  validatedSource?: RealFlightSourceObservation): Promise<RealFlightImportPlan> {
  const binding = latestBinding(graph);
  realFlightRequire(binding && binding.bindingId === bindingId, 'Unknown or foreign real flight history account binding.');
  // Only deriveRealFlightCommand supplies this private argument, from the
  // same detached command. Public planning still validates its own input.
  const source = validatedSource ?? await createRealFlightSourceObservation(sourceInput, hash);
  validateImportWindow(source);
  realFlightRequire(source.binding.provider === binding.provider && source.binding.accountRef === binding.accountRef,
    'Source account differs from the immutable real flight history binding.');
  // The observed club label is a safety fence, not a durable club identifier.
  // Cross-club reference semantics are not established by this first adapter.
  realFlightRequire(sameContext(source.context.before, binding.clubContext.after),
    'Source club context changed; review is required before importing another context.');
  realFlightRequire(source.rows.length <= REAL_HISTORY_PLAN_LIMIT, 'Real flight history planning bound exceeded.');

  const scope: HistoryScope = { ownerId: graph.manifest.owner_id, scopeId: binding.bindingId };
  const priorFactsById = new Map(latestRealFlightRecords(graph.records, 'facts').map(record => [record.id, record]));
  const sourceRows = source.rows.map(row => ({ sourceFlightId: row.sourceFlightRef, values: [...row.rawValues] }));
  const facts = source.rows.map((_, index) => adaptHistoryFacts(scope,
    { captureId: source.capture.captureId, headers: [...source.headers], rows: sourceRows }, index));
  const groups = new Map<string, number[]>();
  const missing: number[] = [];
  for (let index = 0; index < source.rows.length; index++) {
    const reference = source.rows[index]!.sourceFlightRef;
    if (reference === null) { missing.push(index); continue; }
    const indexes = groups.get(reference) ?? []; indexes.push(index); groups.set(reference, indexes);
  }

  const entries: RealFlightPlanEntry[] = [], issues: RealFlightPlanIssue[] = [];
  const counts = { added: 0, changed: 0, unchanged: 0, pending: 0 };
  for (const index of missing) {
    const rowFacts = facts[index]!;
    entries.push({ flightId: '', sourceFlightRef: null, rowIndexes: [index], state: 'pending', facts: [rowFacts] });
    issues.push({ reason: 'missing-source-reference', sourceFlightRef: null, rowIndexes: [index], evidenceKeys: [rowFacts.evidenceKey], previousFactsRevision: null });
    counts.pending++;
  }
  for (const [reference, indexes] of groups) {
    const byEvidence = new Map<string, number[]>();
    for (const index of indexes) { const key = facts[index]!.evidenceKey; const found = byEvidence.get(key) ?? []; found.push(index); byEvidence.set(key, found); }
    const flightId = await flightIdFor(bindingId, reference, hash);
    const prior = priorFactsById.get(flightId);
    if (byEvidence.size > 1) {
      const variants = [...byEvidence.entries()];
      entries.push({ flightId, sourceFlightRef: reference, rowIndexes: indexes, state: 'pending', facts: variants.map(([key, positions]) => facts[positions[0]!]!) });
      issues.push({ reason: 'conflicting-source-reference', sourceFlightRef: reference, rowIndexes: indexes,
        evidenceKeys: variants.map(([key]) => key).sort(), previousFactsRevision: prior?.revision ?? null });
      counts.pending++;
      continue;
    }
    const variantIndexes = [...byEvidence.values()][0]!;
    const current = facts[variantIndexes[0]!]!;
    const priorFacts = prior ? JSON.parse(prior.payload) as StoredFacts : null;
    const state = !priorFacts ? 'added' : priorFacts.facts.evidenceKey === current.evidenceKey ? 'unchanged' : 'changed';
    entries.push({ flightId, sourceFlightRef: reference, rowIndexes: variantIndexes, state, facts: [current] }); counts[state]++;
  }

  const descriptor = {
    version: 1 as const, ownerId: graph.manifest.owner_id, storeId: graph.manifest.store_id, bindingId,
    baseGeneration: graph.generation, captureId: source.capture.captureId, captureSha256: source.capture.rawCaptureSha256,
    coverage: source.coverage, entries, issues, counts,
  };
  const planToken = await checkedHash(hash, canonical(descriptor));
  return { ...descriptor, planToken };
}

export async function prepareRealFlightImport(graph: RealFlightGraph, bindingId: string,
  sourceInput: RealFlightSourceInput, hash: Hash): Promise<RealFlightImportPlan> {
  return realFlightClone(await buildImportPlan(graph, bindingId, sourceInput, hash));
}

export async function deriveRealFlightCommand(graph: RealFlightGraph, input: RealFlightCommand, hash: Hash): Promise<{
  records: RealFlightRecord[]; receipt: RealFlightReceipt; result: RealFlightResult;
}> {
  const request = realFlightBoundedJson(input, REAL_HISTORY_COMMAND_LIMIT);
  const command = JSON.parse(request) as RealFlightCommand;
  validateCommandIdentity(command, graph);
  const generation = graph.generation + 1, all = [...graph.records], records: RealFlightRecord[] = [];
  const latest = new Map(all.map(record => [`${record.kind}\u0000${record.id}`, record]));
  const latestRecord = (kind: RealFlightRecordKind, id: string) => latest.get(`${kind}\u0000${id}`);
  const result: RealFlightResult = { commandId: command.commandId, kind: command.kind, generation,
    bindingId: '', captureId: '', planSha256: null, mutations: [], counts: { added: 0, changed: 0, unchanged: 0, pending: 0 }, flightIds: [] };

  async function append(kind: RealFlightRecordKind, id: string, value: unknown, immutable = false): Promise<RealFlightRecord> {
    realFlightRequire(typeof id === 'string' && id.length > 0 && id.length <= 200, 'Invalid real flight record ID.');
    const payload = canonical(value), previous = latestRecord(kind, id);
    if (previous?.payload === payload) return previous;
    realFlightRequire(!immutable || !previous, 'Immutable real flight evidence changed.');
    const row: RealFlightRecord = { seq: (all.at(-1)?.seq ?? 0) + 1, owner_id: command.ownerId, kind, id,
      revision: (previous?.revision ?? 0) + 1, generation, payload, payload_sha256: await checkedHash(hash, payload) };
    realFlightRequire(Number.isSafeInteger(row.seq) && Number.isSafeInteger(row.revision), 'Real flight history sequence overflow.');
    all.push(row); latest.set(`${kind}\u0000${id}`, row); records.push(row); result.mutations.push({ kind, id, revision: row.revision, seq: row.seq, hash: row.payload_sha256 });
    return row;
  }

  const sourceInputJson = realFlightBoundedJson(command.source, REAL_HISTORY_COMMAND_LIMIT);
  const source = await createRealFlightSourceObservation(JSON.parse(sourceInputJson) as RealFlightSourceInput, hash);
  if (command.kind === 'bind') {
    realFlightRequire(latestBinding(graph) === null, 'This real flight history owner is already bound to an account.');
    const bindingId = await bindingIdFor(command.ownerId, source.binding.accountRef, hash);
    const binding: StoredBinding = {
      version: 1, bindingId, provider: source.binding.provider, accountRef: source.binding.accountRef,
      clubContext: { identity: 'display-label-only', before: source.context.before, after: source.context.after },
      adapterEvidence: { method: source.adapter.method, version: source.adapter.version, claim: source.adapter.claim, boundAt: command.at },
      evidence: { captureId: source.capture.captureId, captureSha256: source.capture.rawCaptureSha256 },
    };
    await append('binding', bindingId, binding, true);
    await append('capture', source.capture.captureId, { version: 1, bindingId, source } satisfies StoredCapture, true);
    result.bindingId = bindingId; result.captureId = source.capture.captureId;
  } else {
    realFlightRequire(/^[0-9a-f]{64}$/.test(command.bindingId), 'Invalid real flight account binding ID.');
    const plan = await buildImportPlan(graph, command.bindingId, command.source, hash, source);
    realFlightRequire(command.planToken === plan.planToken, 'Real flight review plan changed or was not confirmed.');
    result.bindingId = plan.bindingId; result.captureId = plan.captureId; result.planSha256 = plan.planToken;
    result.counts = { ...plan.counts };
    const binding = latestBinding(graph)!;
    await append('capture', plan.captureId, { version: 1, bindingId: plan.bindingId, source } satisfies StoredCapture, true);
    const seenFlightIds = new Set<string>();
    for (const entry of plan.entries) {
      if (entry.state === 'pending') continue;
      const reference = entry.sourceFlightRef!;
      const existingFlightRow = latestRecord('flight', entry.flightId);
      if (existingFlightRow) {
        const existing = JSON.parse(existingFlightRow.payload) as StoredFlight;
        realFlightRequire(existing.bindingId === plan.bindingId && existing.accountRef === binding.accountRef && existing.sourceFlightRef === reference,
          'Real flight identity collision.');
      } else {
        const rowIndex = entry.rowIndexes[0]!;
        await append('flight', entry.flightId, { version: 1, bindingId: plan.bindingId, accountRef: binding.accountRef,
          sourceFlightRef: reference, firstCaptureId: plan.captureId, firstRowIndex: rowIndex } satisfies StoredFlight, true);
      }
      if (seenFlightIds.has(entry.flightId)) continue; seenFlightIds.add(entry.flightId); result.flightIds.push(entry.flightId);
      if (entry.state === 'added' || entry.state === 'changed') {
        const factsRow = latestRecord('facts', entry.flightId);
        const stored: StoredFacts = { version: 1, bindingId: plan.bindingId, flightId: entry.flightId,
          facts: entry.facts[0]!, predecessor: factsRow?.revision ?? null, reason: 'source-change',
          captureId: plan.captureId, rowIndex: entry.rowIndexes[0]! };
        await append('facts', entry.flightId, stored);
      }
    }
    if (plan.issues.length) await append('pending', plan.captureId,
      { version: 1, bindingId: plan.bindingId, captureId: plan.captureId, issues: plan.issues } satisfies StoredPending, true);
    await append('coverage', plan.captureId, { version: 1, bindingId: plan.bindingId, captureId: plan.captureId,
      captureSha256: source.capture.rawCaptureSha256, coverage: source.coverage } satisfies StoredCoverage, true);
  }
  realFlightRequire(records.length <= REAL_FLIGHT_LIBRARY_RECORD_LIMIT, 'Real flight history record limit exceeded.');
  const receipt: RealFlightReceipt = { command_id: command.commandId, owner_id: command.ownerId, kind: command.kind,
    base_generation: command.baseGeneration, generation, request_json: request, request_sha256: await checkedHash(hash, request),
    result_json: canonical(result), committed_at: command.at };
  return { records, receipt, result };
}

export async function validateRealFlightGraph(graph: RealFlightGraph, hash: Hash): Promise<void> {
  realFlightExactKeys(graph, ['manifest','generation','receipts','records']);
  validateRealHistoryManifest(graph.manifest);
  realFlightRequire(Array.isArray(graph.receipts) && Array.isArray(graph.records) &&
    Number.isSafeInteger(graph.generation) && graph.generation === graph.receipts.length &&
    graph.receipts.length <= REAL_FLIGHT_LIBRARY_RECEIPT_LIMIT && graph.records.length <= REAL_FLIGHT_LIBRARY_RECORD_LIMIT,
    'Invalid or oversized real flight history ledger.');
  const graphBytes = graph.receipts.reduce((n, receipt) => n + byteLength(receipt.request_json) + byteLength(receipt.result_json), 0) +
    graph.records.reduce((n, record) => n + byteLength(record.payload), 0);
  realFlightRequire(graphBytes <= REAL_HISTORY_BACKUP_LIMIT, 'Real flight history graph size limit exceeded.');
  const replay: RealFlightGraph = { manifest: graph.manifest, generation: 0, receipts: [], records: [] };
  const commandIds = new Set<string>();
  for (let index = 0; index < graph.receipts.length; index++) {
    const actual = graph.receipts[index]!;
    realFlightRequire(!commandIds.has(actual.command_id), 'Duplicate real flight history receipt.'); commandIds.add(actual.command_id);
    realFlightRequire(actual.generation === index + 1 && actual.base_generation === index, 'Noncontiguous real flight history receipts.');
    realFlightRequire(typeof actual.request_json === 'string' && byteLength(actual.request_json) <= REAL_HISTORY_COMMAND_LIMIT,
      'Real flight history command size limit exceeded.');
    const expected = await deriveRealFlightCommand(replay, JSON.parse(actual.request_json) as RealFlightCommand, hash);
    realFlightRequire(canonical(expected.receipt) === canonical(actual), 'Invalid real flight history receipt semantics.');
    replay.records.push(...expected.records); replay.receipts.push(expected.receipt); replay.generation++;
  }
  realFlightRequire(canonical(replay.records) === canonical(graph.records), 'Invalid real flight history record graph.');
}

export async function validateRealFlightBackup(text: string, ownerId: string, storeId: string, hash: Hash): Promise<RealFlightGraph> {
  realFlightRequire(typeof text === 'string' && byteLength(text) <= REAL_HISTORY_BACKUP_LIMIT, 'Real flight history backup size limit exceeded.');
  const envelope = JSON.parse(text) as Record<string, unknown>;
  realFlightExactKeys(envelope, ['format','version','payload','checksum']);
  realFlightRequire(realFlightBoundedJson(envelope, REAL_HISTORY_BACKUP_LIMIT) === text, 'Noncanonical real flight history backup envelope.');
  realFlightRequire(envelope.format === REAL_FLIGHT_LIBRARY_BACKUP_FORMAT && envelope.version === REAL_FLIGHT_LIBRARY_BACKUP_VERSION &&
    typeof envelope.payload === 'string', 'Unsupported real flight history backup.');
  realFlightSha(envelope.checksum); realFlightRequire(await hash(envelope.payload) === envelope.checksum, 'Invalid real flight history backup checksum.');
  realFlightRequire(byteLength(envelope.payload) <= REAL_HISTORY_BACKUP_LIMIT, 'Real flight history backup payload limit exceeded.');
  const body = JSON.parse(envelope.payload) as Record<string, unknown>;
  realFlightExactKeys(body, ['version','manifest','generation','receipts','records']);
  realFlightRequire(realFlightBoundedJson(body, REAL_HISTORY_BACKUP_LIMIT) === envelope.payload, 'Noncanonical real flight history backup payload.');
  realFlightRequire(body.version === 1 && !!body.manifest && typeof body.manifest === 'object', 'Unsupported real flight history backup version.');
  const graph: RealFlightGraph = { manifest: body.manifest as RealHistoryManifest, generation: body.generation as number,
    receipts: body.receipts as RealFlightReceipt[], records: body.records as RealFlightRecord[] };
  validateRealHistoryManifest(graph.manifest);
  realFlightRequire(graph.manifest.owner_id === ownerId && graph.manifest.store_id === storeId, 'Foreign real flight history backup.');
  await validateRealFlightGraph(graph, hash); return realFlightClone(graph);
}

export async function encodeRealFlightBackup(graph: RealFlightGraph, hash: Hash): Promise<string> {
  await validateRealFlightGraph(graph, hash);
  const payload = realFlightBoundedJson({ version: 1, ...graph }, REAL_HISTORY_BACKUP_LIMIT);
  const text = realFlightBoundedJson({ format: REAL_FLIGHT_LIBRARY_BACKUP_FORMAT, version: REAL_FLIGHT_LIBRARY_BACKUP_VERSION,
    payload, checksum: await checkedHash(hash, payload) }, REAL_HISTORY_BACKUP_LIMIT);
  await validateRealFlightBackup(text, graph.manifest.owner_id, graph.manifest.store_id, hash); return text;
}


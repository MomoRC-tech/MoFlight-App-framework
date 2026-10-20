// Inert production contract preparation: no opener, writer, activation or source verifier.
import { canonical } from '@moflight/flight-logbook';
import { sameContext, validateContext } from './context';
import { validateCapture } from './probe';
import { validateScope } from './scope-store';

export const REAL_HISTORY_FAMILY = 'moflight-real-flight-history';
export const REAL_HISTORY_COMMAND_LIMIT = 64 * 1024 * 1024;
export const REAL_HISTORY_BACKUP_LIMIT = 128 * 1024 * 1024;
export const REAL_HISTORY_PLAN_LIMIT = 5_000;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function realHistoryUuid(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !uuid.test(value)) throw new Error('Expected opaque real-history UUID.');
}
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      canonical(Object.keys(value).sort()) !== canonical([...keys].sort())) throw new Error('Unsupported real-history keys.');
  return value as Record<string, unknown>;
}
function timestamp(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) ||
      !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw new Error('Invalid real-history timestamp.');
}
export interface RealHistoryManifest {
  singleton: 1; family: typeof REAL_HISTORY_FAMILY; schema_version: 1; payload_version: 1;
  store_id: string; owner_id: string; created_at: string;
}
export function validateRealHistoryManifest(value: unknown): RealHistoryManifest {
  const m = object(value, ['singleton','family','schema_version','payload_version','store_id','owner_id','created_at']);
  if (m.singleton !== 1 || m.family !== REAL_HISTORY_FAMILY || m.schema_version !== 1 || m.payload_version !== 1)
    throw new Error('Unsupported real-history manifest.');
  realHistoryUuid(m.store_id); realHistoryUuid(m.owner_id); timestamp(m.created_at);
  return {singleton:1,family:REAL_HISTORY_FAMILY,schema_version:1,payload_version:1,store_id:m.store_id,owner_id:m.owner_id,created_at:m.created_at};
}
export function realHistoryCandidateName(candidateId: unknown): string {
  realHistoryUuid(candidateId); return `moflight-real-history-${candidateId}.sqlite`;
}
export function validateRealHistoryCandidateName(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('moflight-real-history-') || !value.endsWith('.sqlite'))
    throw new Error('Invalid real-history candidate basename.');
  const id = value.slice('moflight-real-history-'.length, -'.sqlite'.length);
  if (realHistoryCandidateName(id) !== value) throw new Error('Invalid real-history candidate basename.');
  return value;
}

const tables = {
  real_history_manifest: `CREATE TABLE real_history_manifest(singleton INTEGER PRIMARY KEY CHECK(singleton=1),family TEXT NOT NULL CHECK(family='moflight-real-flight-history'),schema_version INTEGER NOT NULL CHECK(schema_version=1),payload_version INTEGER NOT NULL CHECK(payload_version=1),store_id TEXT NOT NULL UNIQUE,owner_id TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL)`,
  real_history_receipts: `CREATE TABLE real_history_receipts(command_id TEXT PRIMARY KEY NOT NULL,owner_id TEXT NOT NULL REFERENCES real_history_manifest(owner_id),kind TEXT NOT NULL CHECK(kind IN ('bind','import-unassigned')),base_generation INTEGER NOT NULL CHECK(base_generation>=0),generation INTEGER NOT NULL UNIQUE CHECK(generation=base_generation+1),request_json TEXT NOT NULL CHECK(json_valid(request_json)),request_sha256 TEXT NOT NULL,result_json TEXT NOT NULL CHECK(json_valid(result_json)),committed_at TEXT NOT NULL)`,
  real_history_records: `CREATE TABLE real_history_records(seq INTEGER PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES real_history_manifest(owner_id),kind TEXT NOT NULL CHECK(kind IN ('binding','capture','flight','facts','coverage','pending')),id TEXT NOT NULL,revision INTEGER NOT NULL CHECK(revision>0),generation INTEGER NOT NULL REFERENCES real_history_receipts(generation),payload TEXT NOT NULL CHECK(json_valid(payload)),payload_sha256 TEXT NOT NULL,UNIQUE(kind,id,revision))`,
};
export const REAL_HISTORY_SCHEMA = [
  ...Object.values(tables),
  'CREATE INDEX real_history_latest ON real_history_records(kind,id,revision DESC)',
  // REPLACE can delete a conflicting row without DELETE triggers when recursive_triggers=OFF.
  // Reject every collision before SQLite's conflict resolution, independent of that pragma.
  `CREATE TRIGGER real_history_manifest_no_collision BEFORE INSERT ON real_history_manifest WHEN EXISTS(SELECT 1 FROM real_history_manifest WHERE singleton=NEW.singleton OR store_id=NEW.store_id OR owner_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'Append-only real flight history identity collision'); END`,
  `CREATE TRIGGER real_history_receipts_no_collision BEFORE INSERT ON real_history_receipts WHEN EXISTS(SELECT 1 FROM real_history_receipts WHERE command_id=NEW.command_id OR generation=NEW.generation) BEGIN SELECT RAISE(ABORT,'Append-only real flight history identity collision'); END`,
  `CREATE TRIGGER real_history_records_no_collision BEFORE INSERT ON real_history_records WHEN EXISTS(SELECT 1 FROM real_history_records WHERE seq=NEW.seq OR (kind=NEW.kind AND id=NEW.id AND revision=NEW.revision)) BEGIN SELECT RAISE(ABORT,'Append-only real flight history identity collision'); END`,
  ...Object.keys(tables).flatMap(table => ['UPDATE','DELETE'].map(operation =>
    `CREATE TRIGGER ${table}_no_${operation.toLowerCase()} BEFORE ${operation} ON ${table} BEGIN SELECT RAISE(ABORT,'Append-only real flight history'); END`)),
  'PRAGMA user_version=1',
].join(';\n') + ';';

/** A review intent, never a validated import command or authorization token. */
export interface RealHistorySaveIntent {
  version: 1; kind: 'save-unassigned'; commandId: string; ownerId: string; storeId: string;
  baseGeneration: number; captureId: string; captureSha256: string; planSha256: string; at: string;
}
export function validateRealHistorySaveIntent(value: unknown, manifest: unknown): RealHistorySaveIntent {
  const m = validateRealHistoryManifest(manifest);
  const i = object(value, ['version','kind','commandId','ownerId','storeId','baseGeneration','captureId','captureSha256','planSha256','at']);
  realHistoryUuid(i.commandId); realHistoryUuid(i.ownerId); realHistoryUuid(i.storeId); timestamp(i.at);
  if (i.version !== 1 || i.kind !== 'save-unassigned' || i.ownerId !== m.owner_id || i.storeId !== m.store_id ||
      !Number.isSafeInteger(i.baseGeneration) || (i.baseGeneration as number) < 0 ||
      typeof i.captureId !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(i.captureId) ||
      typeof i.captureSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(i.captureSha256) ||
      typeof i.planSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(i.planSha256)) throw new Error('Invalid or foreign real-history intent.');
  return {...i} as unknown as RealHistorySaveIntent;
}

export type RealHistoryBlocker = 'stable-account-binding-unverified' | 'stable-club-identity-unverified' |
  'flight-reference-durability-unverified' | 'requested-window-not-complete' | 'requested-window-semantics-unverified' |
  'missing-flight-reference' | 'planning-bound-exceeded';
export interface RealHistoryPrerequisites {
  status: 'blocked-source-verification'; blockers: RealHistoryBlocker[]; captureId: string; retainedRows: number;
}
/** Current raw/context contracts cannot attest production identity. No success/permit path exists here. */
export function inspectRealHistoryPrerequisites(value: unknown): RealHistoryPrerequisites {
  const input = object(value, ['manifest','scope','capture','contextBefore','contextAfter']);
  const manifest = validateRealHistoryManifest(input.manifest);
  const scopeInput = object(input.scope, ['version','owner','connectionId','context']);
  object(scopeInput.context, ['accountNumber','clubLabel','clubIdentity','verification']);
  object(input.contextBefore, ['accountNumber','clubLabel','clubIdentity','verification']);
  object(input.contextAfter, ['accountNumber','clubLabel','clubIdentity','verification']);
  const scope = validateScope(scopeInput), before = validateContext(input.contextBefore), after = validateContext(input.contextAfter);
  if (scope.owner !== manifest.owner_id || !sameContext(scope.context,before) || !sameContext(before,after))
    throw new Error('Foreign or changed real-history review context.');
  const captureInput = input.capture as Record<string,unknown> | null;
  object(captureInput, captureInput?.coverage === 'complete-requested-list' ?
    ['captureId','retrievedAt','headers','rows','sourceIdentity','coverage','timeBasis','exportContext'] :
    ['captureId','retrievedAt','headers','rows','sourceIdentity','coverage','timeBasis']);
  if (!Array.isArray(captureInput!.rows) || captureInput!.rows.length > 20_000 ||
      !Array.isArray(captureInput!.headers) || captureInput!.headers.length > 128 || JSON.stringify(captureInput).length > 20_000_000)
    throw new Error('Oversized or invalid real-history observation.');
  // Reject purported attestations that the existing raw validator intentionally does not consume.
  if (Array.isArray(captureInput!.rows)) for (const row of captureInput!.rows) object(row, ['values','sourceFlightId']);
  if (captureInput!.exportContext) object(captureInput!.exportContext,
    ['from','to','preset','participation','accountLabel','recordCount','pageCount','columnIds','adapterVersion']);
  const capture = validateCapture(captureInput);
  const blockers: RealHistoryBlocker[] = ['stable-account-binding-unverified','stable-club-identity-unverified','flight-reference-durability-unverified'];
  blockers.push(capture.coverage === 'complete-requested-list' ? 'requested-window-semantics-unverified' : 'requested-window-not-complete');
  if (capture.rows.some(row => row.sourceFlightId === null)) blockers.push('missing-flight-reference');
  if (capture.rows.length > REAL_HISTORY_PLAN_LIMIT) blockers.push('planning-bound-exceeded');
  return {status:'blocked-source-verification',blockers,captureId:capture.captureId,retainedRows:capture.rows.length};
}

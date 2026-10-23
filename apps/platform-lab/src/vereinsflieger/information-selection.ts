import type { Connection, Driver } from '@moflight/local-data';
import { validateScope, type ProviderScope } from './scope-store';

export const INFORMATION_SELECTION_FILE_NAME = 'vereinsflieger-information-selection.sqlite';
export const INFORMATION_SELECTION_SCHEMA = `
CREATE TABLE information_store_selections(
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  owner TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  database_name TEXT NOT NULL,
  operation_id TEXT NOT NULL UNIQUE,
  backup_sha256 TEXT NOT NULL,
  activated_at TEXT NOT NULL
);
CREATE INDEX information_store_selection_owner ON information_store_selections(owner,seq DESC);
CREATE TABLE information_restore_preparations(
  operation_id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  database_name TEXT NOT NULL,
  backup_sha256 TEXT NOT NULL,
  previous_sequence INTEGER NOT NULL,
  prepared_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','activated')),
  activated_sequence INTEGER
);
PRAGMA user_version=1;`;

export interface InformationStoreSelection {
  sequence: number;
  owner: string;
  connectionId: string;
  databaseName: string;
  operationId: string;
  backupSha256: string;
  activatedAt: string;
}
export interface InformationRestorePreparation {
  operationId: string;
  owner: string;
  connectionId: string;
  databaseName: string;
  backupSha256: string;
  previousSequence: number;
  preparedAt: string;
  status: 'pending' | 'activated';
  activatedSequence: number | null;
}
export interface InformationSelectionSnapshot { sequence: number; selection: InformationStoreSelection | null }

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const shaPattern = /^[0-9a-f]{64}$/;
const timestamp = (value: string) => /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

export function informationStoreName(scopeInput: ProviderScope, restoreId?: string): string {
  const scope = validateScope(scopeInput);
  if (restoreId !== undefined && !uuidPattern.test(restoreId)) throw new Error('Invalid information restore identity.');
  return `vereinsflieger-information-${scope.connectionId}${restoreId ? `-restore-${restoreId}` : ''}.sqlite`;
}

function validSelection(row: InformationStoreSelection, scope: ProviderScope): InformationStoreSelection {
  if (!Number.isSafeInteger(row.sequence) || row.sequence < 1 || row.owner !== scope.owner || row.connectionId !== scope.connectionId ||
      row.databaseName !== informationStoreName(scope, row.operationId) || !uuidPattern.test(row.operationId) ||
      !shaPattern.test(row.backupSha256) || !timestamp(row.activatedAt)) throw new Error('Invalid selected information store.');
  return row;
}
function validPreparation(row: InformationRestorePreparation, scope: ProviderScope): InformationRestorePreparation {
  if (!uuidPattern.test(row.operationId) || row.owner !== scope.owner || row.connectionId !== scope.connectionId ||
      row.databaseName !== informationStoreName(scope, row.operationId) || !shaPattern.test(row.backupSha256) ||
      !Number.isSafeInteger(row.previousSequence) || row.previousSequence < 0 || !timestamp(row.preparedAt) ||
      !['pending','activated'].includes(row.status) || row.status === 'pending' && row.activatedSequence !== null ||
      row.status === 'activated' && (!Number.isSafeInteger(row.activatedSequence) || (row.activatedSequence as number) < 1)) {
    throw new Error('Invalid information restore preparation.');
  }
  return row;
}

let mutationTail: Promise<void> = Promise.resolve();
/** Process-wide writer lock. A persisted pending preparation blocks writers after process restart. */
export async function withInformationMutation<T>(work: () => Promise<T>): Promise<T> {
  let release!: () => void;
  const previous = mutationTail;
  mutationTail = new Promise<void>(resolve => { release = resolve; });
  await previous;
  try { return await work(); }
  finally { release(); }
}

/** Append-only per-owner pointer and restore journal for immutable information capture files. */
export class InformationStoreSelection {
  constructor(readonly db: Driver, readonly scope: ProviderScope, readonly authorize: () => Promise<void>) {
    this.scope = validateScope(scope);
  }
  private async allowed() { await this.authorize(); }
  async initialize(create = true) {
    await this.allowed();
    await this.db.transaction(async tx => {
      const version = await tx.first<{ user_version: number }>('PRAGMA user_version');
      if (version?.user_version === 0) {
        if (!create) throw new Error('Uninitialized information selection.');
        if ((await tx.all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")).length) {
          throw new Error('Unexpected existing information selection.');
        }
        await tx.exec(INFORMATION_SELECTION_SCHEMA);
      } else if (version?.user_version !== 1) throw new Error('Unsupported information selection version.');
      await this.allowed();
    });
  }
  async snapshot(): Promise<InformationSelectionSnapshot> {
    await this.allowed();
    const row = await this.db.first<InformationStoreSelection>('SELECT seq AS sequence,owner,connection_id AS connectionId,database_name AS databaseName,operation_id AS operationId,backup_sha256 AS backupSha256,activated_at AS activatedAt FROM information_store_selections WHERE owner=? ORDER BY seq DESC LIMIT 1', this.scope.owner);
    const selection = row ? validSelection(row, this.scope) : null;
    const sequence = selection?.sequence ?? 0;
    await this.allowed();
    return { sequence, selection };
  }
  async preparation(operationId: string): Promise<InformationRestorePreparation | null> {
    if (!uuidPattern.test(operationId)) throw new Error('Invalid information restore operation.');
    await this.allowed();
    const row = await this.db.first<InformationRestorePreparation>(`SELECT operation_id AS operationId,owner,connection_id AS connectionId,
      database_name AS databaseName,backup_sha256 AS backupSha256,previous_sequence AS previousSequence,prepared_at AS preparedAt,
      status,activated_sequence AS activatedSequence FROM information_restore_preparations WHERE operation_id=? AND owner=?`, operationId, this.scope.owner);
    if (!row) { await this.allowed(); return null; }
    validPreparation(row, this.scope);
    await this.allowed();
    return row;
  }
  async pending(): Promise<InformationRestorePreparation | null> {
    await this.allowed();
    const row = await this.db.first<{ operationId: string }>("SELECT operation_id AS operationId FROM information_restore_preparations WHERE owner=? AND status='pending' ORDER BY prepared_at LIMIT 1", this.scope.owner);
    return row ? this.preparation(row.operationId) : null;
  }
  async prepareRestore(input: { operationId: string; databaseName: string; backupSha256: string; previousSequence: number; preparedAt: string }): Promise<InformationRestorePreparation> {
    const scope = this.scope;
    if (!uuidPattern.test(input.operationId) || input.databaseName !== informationStoreName(scope, input.operationId) || !shaPattern.test(input.backupSha256) ||
        !Number.isSafeInteger(input.previousSequence) || input.previousSequence < 0 || !timestamp(input.preparedAt)) throw new Error('Invalid information restore preparation.');
    await this.allowed();
    await this.db.transaction(async tx => {
      await this.allowed();
      const existing = await tx.first<InformationRestorePreparation>('SELECT operation_id AS operationId,owner,connection_id AS connectionId,database_name AS databaseName,backup_sha256 AS backupSha256,previous_sequence AS previousSequence,prepared_at AS preparedAt,status,activated_sequence AS activatedSequence FROM information_restore_preparations WHERE operation_id=? AND owner=?', input.operationId, scope.owner);
      if (existing) {
        if (existing.connectionId !== scope.connectionId || existing.databaseName !== input.databaseName || existing.backupSha256 !== input.backupSha256 || existing.previousSequence !== input.previousSequence) {
          throw new Error('Information restore operation changed.');
        }
        return;
      }
      const pending = await tx.first('SELECT operation_id FROM information_restore_preparations WHERE owner=? AND status=\'pending\' LIMIT 1', scope.owner);
      if (pending) throw new Error('Resolve the pending information restore first.');
      const current = await tx.first<{ seq: number }>('SELECT seq FROM information_store_selections WHERE owner=? ORDER BY seq DESC LIMIT 1', scope.owner);
      if ((current?.seq ?? 0) !== input.previousSequence) throw new Error('Selected information store changed before restore.');
      await tx.run('INSERT INTO information_restore_preparations VALUES (?,?,?,?,?,?,?,\'pending\',NULL)', input.operationId,
        scope.owner, scope.connectionId, input.databaseName, input.backupSha256, input.previousSequence, input.preparedAt);
      await this.allowed();
    });
    const prepared = await this.preparation(input.operationId);
    if (!prepared) throw new Error('Information restore preparation was not saved.');
    return prepared;
  }
  async activatePreparedRestore(operationId: string, activatedAt: string): Promise<number> {
    if (!uuidPattern.test(operationId) || !timestamp(activatedAt)) throw new Error('Invalid information restore activation.');
    await this.allowed();
    let sequence = 0;
    await this.db.transaction(async tx => {
      await this.allowed();
      const preparation = await tx.first<InformationRestorePreparation>('SELECT operation_id AS operationId,owner,connection_id AS connectionId,database_name AS databaseName,backup_sha256 AS backupSha256,previous_sequence AS previousSequence,prepared_at AS preparedAt,status,activated_sequence AS activatedSequence FROM information_restore_preparations WHERE operation_id=? AND owner=?', operationId, this.scope.owner);
      if (!preparation) {
        throw new Error('Information restore preparation is missing or foreign.');
      }
      validPreparation(preparation, this.scope);
      const current = await tx.first<InformationStoreSelection>('SELECT seq AS sequence,owner,connection_id AS connectionId,database_name AS databaseName,operation_id AS operationId,backup_sha256 AS backupSha256,activated_at AS activatedAt FROM information_store_selections WHERE owner=? ORDER BY seq DESC LIMIT 1', this.scope.owner);
      if (preparation.status === 'activated') {
        if (!current || validSelection(current, this.scope).operationId !== operationId || current.databaseName !== preparation.databaseName || current.backupSha256 !== preparation.backupSha256) {
          throw new Error('Activated information restore no longer matches the selected store.');
        }
        sequence = current.sequence; return;
      }
      if ((current?.sequence ?? 0) !== preparation.previousSequence) throw new Error('Selected information store changed during restore.');
      await tx.run('INSERT INTO information_store_selections(owner,connection_id,database_name,operation_id,backup_sha256,activated_at) VALUES (?,?,?,?,?,?)',
        this.scope.owner, this.scope.connectionId, preparation.databaseName, operationId, preparation.backupSha256, activatedAt);
      const activated = await tx.first<{ seq: number }>('SELECT seq FROM information_store_selections WHERE operation_id=?', operationId);
      if (!activated || !Number.isSafeInteger(activated.seq) || activated.seq < 1) throw new Error('Information restore selection was not saved.');
      sequence = activated.seq;
      await tx.run("UPDATE information_restore_preparations SET status='activated',activated_sequence=? WHERE operation_id=? AND owner=?", sequence, operationId, this.scope.owner);
      await this.allowed();
    });
    await this.allowed();
    return sequence;
  }
  async close() { await this.db.close(); }
}

export async function selectedInformationDatabaseName(db: Connection, scopeInput: ProviderScope): Promise<string> {
  const scope = validateScope(scopeInput);
  const row = await db.first<InformationStoreSelection>('SELECT seq AS sequence,owner,connection_id AS connectionId,database_name AS databaseName,operation_id AS operationId,backup_sha256 AS backupSha256,activated_at AS activatedAt FROM information_store_selections WHERE owner=? ORDER BY seq DESC LIMIT 1', scope.owner);
  return row ? validSelection(row, scope).databaseName : informationStoreName(scope);
}

import { canonical } from '@moflight/flight-logbook';
import type { Driver } from '../../../packages/local-data/src/index';
import { validateScope, type ProviderScope } from './vereinsflieger/scope-store';

export const USER_BACKUP_RESTORE_JOURNAL_FILE_NAME = 'moflight-user-backup-restore-v1.sqlite';
export const USER_BACKUP_RESTORE_SCHEMA = `
CREATE TABLE user_backup_restore_operations(
  operation_id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  archive_sha256 TEXT NOT NULL,
  pilot_candidate_name TEXT NOT NULL,
  real_candidate_id TEXT NOT NULL,
  real_operation_id TEXT NOT NULL,
  information_operation_id TEXT,
  information_scope TEXT,
  selected_book_id TEXT,
  phase TEXT NOT NULL CHECK(phase IN ('prepared','real-flight','information','pilot','complete')),
  status TEXT NOT NULL CHECK(status IN ('pending','complete')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX user_backup_one_pending ON user_backup_restore_operations(status) WHERE status='pending';
PRAGMA user_version=1;`;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sha = /^[0-9a-f]{64}$/;
const phases = ['prepared', 'real-flight', 'information', 'pilot', 'complete'] as const;
type Phase = typeof phases[number];
const time = (value: string) => /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

export interface UserBackupRestoreOperation {
  operationId: string;
  ownerId: string;
  storeId: string;
  archiveSha256: string;
  pilotCandidateName: string;
  realCandidateId: string;
  realOperationId: string;
  informationOperationId: string | null;
  informationScope: ProviderScope | null;
  selectedBookId: string | null;
  phase: Phase;
  status: 'pending' | 'complete';
  createdAt: string;
  updatedAt: string;
}

export interface PrepareUserBackupRestore extends Omit<UserBackupRestoreOperation, 'phase' | 'status'> {}

const objects = [
  `CREATE TABLE user_backup_restore_operations( operation_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, store_id TEXT NOT NULL, archive_sha256 TEXT NOT NULL, pilot_candidate_name TEXT NOT NULL, real_candidate_id TEXT NOT NULL, real_operation_id TEXT NOT NULL, information_operation_id TEXT, information_scope TEXT, selected_book_id TEXT, phase TEXT NOT NULL CHECK(phase IN ('prepared','real-flight','information','pilot','complete')), status TEXT NOT NULL CHECK(status IN ('pending','complete')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL )`,
  `CREATE UNIQUE INDEX user_backup_one_pending ON user_backup_restore_operations(status) WHERE status='pending'`,
];
const normalize = (sql: string) => sql.trim().replace(/;$/, '').replace(/\s+/g, ' ');

function validateOperation(row: UserBackupRestoreOperation): UserBackupRestoreOperation {
  if (!uuid.test(row.operationId) || !uuid.test(row.ownerId) || !uuid.test(row.storeId) || !sha.test(row.archiveSha256) ||
      row.pilotCandidateName !== `pilot-restore-${row.operationId}.sqlite` || !uuid.test(row.realCandidateId) ||
      !uuid.test(row.realOperationId) || row.informationOperationId !== null && !uuid.test(row.informationOperationId) ||
      row.informationOperationId === null !== (row.informationScope === null) ||
      row.selectedBookId !== null && !/^[a-zA-Z0-9_-]{1,100}$/.test(row.selectedBookId) ||
      !phases.includes(row.phase) || !['pending', 'complete'].includes(row.status) ||
      row.status === 'complete' && row.phase !== 'complete' || !time(row.createdAt) || !time(row.updatedAt)) {
    throw new Error('Invalid aggregate user restore journal row.');
  }
  if (row.informationScope) {
    const scope = validateScope(row.informationScope);
    if (scope.owner !== row.ownerId || canonical(scope) !== canonical(row.informationScope)) {
      throw new Error('Foreign aggregate user restore information scope.');
    }
  }
  return row;
}

function mapRow(row: Record<string, unknown>): UserBackupRestoreOperation {
  let informationScope: ProviderScope | null = null;
  if (row.information_scope !== null) {
    if (typeof row.information_scope !== 'string') throw new Error('Invalid aggregate information scope journal value.');
    informationScope = validateScope(JSON.parse(row.information_scope));
    if (canonical(informationScope) !== row.information_scope) throw new Error('Noncanonical aggregate information scope journal value.');
  }
  return validateOperation({ operationId: row.operation_id as string, ownerId: row.owner_id as string,
    storeId: row.store_id as string, archiveSha256: row.archive_sha256 as string,
    pilotCandidateName: row.pilot_candidate_name as string, realCandidateId: row.real_candidate_id as string,
    realOperationId: row.real_operation_id as string, informationOperationId: row.information_operation_id as string | null,
    informationScope, selectedBookId: row.selected_book_id as string | null, phase: row.phase as Phase,
    status: row.status as 'pending' | 'complete', createdAt: row.created_at as string, updatedAt: row.updated_at as string });
}

/** Durable fail-closed journal for cross-store user restore. */
export class UserBackupRestoreJournal {
  private constructor(private readonly db: Driver) {}
  static async open(db: Driver, create = true): Promise<UserBackupRestoreJournal> {
    const journal = new UserBackupRestoreJournal(db);
    try {
      const version = await db.first<{ user_version: number }>('PRAGMA user_version');
      if (version?.user_version === 0) {
        if (!create) throw new Error('Uninitialized user backup restore journal.');
        if ((await db.all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")).length) {
          throw new Error('Existing user backup restore journal preserved.');
        }
        await db.transaction(async tx => { await tx.exec(USER_BACKUP_RESTORE_SCHEMA); });
      } else if (version?.user_version !== 1) throw new Error('Unsupported user backup restore journal version.');
      const actual = (await db.all<{ sql: string }>("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'"))
        .map(row => normalize(row.sql)).sort();
      if (canonical(actual) !== canonical(objects.map(normalize).sort())) throw new Error('Unsupported user backup restore journal shape.');
      return journal;
    } catch (error) { await db.close(); throw error; }
  }
  async get(operationId: string): Promise<UserBackupRestoreOperation | null> {
    if (!uuid.test(operationId)) throw new Error('Invalid aggregate user restore operation.');
    const row = await this.db.first<Record<string, unknown>>('SELECT * FROM user_backup_restore_operations WHERE operation_id=?', operationId);
    return row ? mapRow(row) : null;
  }
  async pending(): Promise<UserBackupRestoreOperation | null> {
    const rows = await this.db.all<Record<string, unknown>>("SELECT * FROM user_backup_restore_operations WHERE status='pending' ORDER BY rowid");
    if (rows.length > 1) throw new Error('Multiple pending aggregate user restores require recovery.');
    return rows[0] ? mapRow(rows[0]) : null;
  }
  async prepare(input: PrepareUserBackupRestore): Promise<UserBackupRestoreOperation> {
    const candidate = validateOperation({ ...input, phase: 'prepared', status: 'pending' });
    let inserted = false;
    await this.db.transaction(async tx => {
      const existing = await tx.first<Record<string, unknown>>('SELECT * FROM user_backup_restore_operations WHERE operation_id=?', input.operationId);
      if (existing) {
        if (canonical(mapRow(existing)) !== canonical(candidate)) throw new Error('Aggregate restore operation reused with changed input.');
        return;
      }
      const pending = await tx.first('SELECT operation_id FROM user_backup_restore_operations WHERE status=\'pending\' LIMIT 1');
      if (pending) throw new Error('Resolve the pending aggregate user restore first.');
      await tx.run(`INSERT INTO user_backup_restore_operations(operation_id,owner_id,store_id,archive_sha256,pilot_candidate_name,
        real_candidate_id,real_operation_id,information_operation_id,information_scope,selected_book_id,phase,status,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,'pending',?,?)`, candidate.operationId, candidate.ownerId, candidate.storeId,
        candidate.archiveSha256, candidate.pilotCandidateName, candidate.realCandidateId, candidate.realOperationId,
        candidate.informationOperationId, candidate.informationScope ? canonical(candidate.informationScope) : null,
        candidate.selectedBookId, 'prepared', candidate.createdAt, candidate.updatedAt);
      inserted = true;
    });
    const saved = await this.get(input.operationId);
    if (!saved || saved.archiveSha256 !== candidate.archiveSha256 || saved.ownerId !== candidate.ownerId || saved.storeId !== candidate.storeId) {
      throw new Error('Aggregate restore journal preparation was not saved.');
    }
    if (saved.status === 'pending' && !inserted && saved.phase !== 'prepared') return saved;
    return saved;
  }
  async advance(operationId: string, phase: Phase, at: string): Promise<UserBackupRestoreOperation> {
    if (!uuid.test(operationId) || !phases.includes(phase) || !time(at)) throw new Error('Invalid aggregate restore progress.');
    const current = await this.get(operationId);
    if (!current) throw new Error('Unknown aggregate user restore operation.');
    const currentIndex = phases.indexOf(current.phase), nextIndex = phases.indexOf(phase);
    if (nextIndex < currentIndex || current.status === 'complete' && phase !== 'complete') throw new Error('Aggregate restore progress cannot move backwards.');
    await this.db.transaction(async tx => {
      await tx.run('UPDATE user_backup_restore_operations SET phase=?,updated_at=? WHERE operation_id=? AND status=\'pending\'', phase, at, operationId);
    });
    const updated = await this.get(operationId);
    if (!updated) throw new Error('Aggregate restore progress disappeared.');
    return updated;
  }
  async complete(operationId: string, at: string): Promise<void> {
    if (!uuid.test(operationId) || !time(at)) throw new Error('Invalid aggregate restore completion.');
    await this.db.transaction(async tx => {
      const current = await tx.first<Record<string, unknown>>('SELECT * FROM user_backup_restore_operations WHERE operation_id=?', operationId);
      if (!current) throw new Error('Unknown aggregate user restore operation.');
      const operation = mapRow(current);
      if (operation.status === 'complete') return;
      await tx.run("UPDATE user_backup_restore_operations SET phase='complete',status='complete',updated_at=? WHERE operation_id=?", at, operationId);
    });
  }
  async close() { await this.db.close(); }
}

export async function assertUserBackupReadAllowed(openJournal: () => Promise<UserBackupRestoreJournal | null>,
  allowedOperation?: { operationId: string; ownerId: string; storeId: string }): Promise<void> {
  const journal = await openJournal();
  if (!journal) return;
  try {
    const pending = await journal.pending();
    if (!pending) return;
    if (allowedOperation && pending.operationId === allowedOperation.operationId && pending.ownerId === allowedOperation.ownerId &&
        pending.storeId === allowedOperation.storeId) return;
    throw new Error('A supported user restore is incomplete. Resume it before opening local data.');
  } finally { await journal.close(); }
}

import { canonical } from '@moflight/flight-logbook';
import type { Driver, Hash } from '@moflight/local-data';
import { validateScope, type ProviderScope } from './scope-store';
import { informationBackupCategories, informationBackupExcludedCategories, informationCategories, validateInformationCapture, type InformationCapture, type InformationCategory, type InformationHistory } from './information';

type SavedInformation = { id: string; category: string; retrieved_at: string; payload: string };

export const INFORMATION_SCHEMA = `
CREATE TABLE information_manifest(singleton INTEGER PRIMARY KEY CHECK(singleton=1),family TEXT NOT NULL,version INTEGER NOT NULL,scope TEXT NOT NULL);
CREATE TABLE information_captures(id TEXT PRIMARY KEY,category TEXT NOT NULL,retrieved_at TEXT NOT NULL,payload TEXT NOT NULL);
CREATE TRIGGER information_no_update BEFORE UPDATE ON information_captures BEGIN SELECT RAISE(ABORT,'Immutable information capture'); END;
CREATE TRIGGER information_no_delete BEFORE DELETE ON information_captures BEGIN SELECT RAISE(ABORT,'Immutable information capture'); END;
CREATE TRIGGER information_manifest_no_update BEFORE UPDATE ON information_manifest BEGIN SELECT RAISE(ABORT,'Immutable information manifest'); END;
CREATE TRIGGER information_manifest_no_delete BEFORE DELETE ON information_manifest BEGIN SELECT RAISE(ABORT,'Immutable information manifest'); END;
PRAGMA user_version=1;`;

export const INFORMATION_BACKUP_FORMAT = 'moflight-information-capture-backup';
export const INFORMATION_BACKUP_VERSION = 1;
export const INFORMATION_BACKUP_LIMIT = 128 * 1024 * 1024;

interface InformationBackupPayload {
  version: 1;
  scope: ProviderScope;
  includedCategories: readonly InformationCategory[];
  excludedCategories: readonly InformationCategory[];
  captures: InformationCapture[];
}

const bytes = (value: string) => new TextEncoder().encode(value).length;
function exact(value: unknown, keys: readonly string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      canonical(Object.keys(value).sort()) !== canonical([...keys].sort())) throw new Error('Invalid information backup fields.');
}
function timestamp(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) ||
      !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw new Error('Invalid information backup timestamp.');
}

/** Validate a self-contained information history snapshot against its existing owner/connection scope. */
export async function validateInformationBackup(text: string, scopeInput: ProviderScope, hash: Hash): Promise<InformationBackupPayload> {
  if (typeof text !== 'string' || bytes(text) > INFORMATION_BACKUP_LIMIT) throw new Error('Information backup size limit exceeded.');
  const scope = validateScope(scopeInput);
  const envelope: unknown = JSON.parse(text);
  exact(envelope, ['format', 'version', 'payload', 'checksum']);
  const e = envelope as Record<string, unknown>;
  if (e.format !== INFORMATION_BACKUP_FORMAT || e.version !== INFORMATION_BACKUP_VERSION || typeof e.payload !== 'string' ||
      typeof e.checksum !== 'string' || !/^[0-9a-f]{64}$/.test(e.checksum) || await hash(e.payload) !== e.checksum ||
      bytes(e.payload) > INFORMATION_BACKUP_LIMIT) throw new Error('Unsupported or corrupt information backup.');
  if (canonical(e) !== text) throw new Error('Noncanonical information backup envelope.');
  const payloadValue: unknown = JSON.parse(e.payload);
  exact(payloadValue, ['version', 'scope', 'includedCategories', 'excludedCategories', 'captures']);
  const p = payloadValue as Record<string, unknown>;
  if (p.version !== 1 || canonical(p) !== e.payload || canonical(validateScope(p.scope)) !== canonical(scope) ||
      canonical(p.includedCategories) !== canonical(informationBackupCategories) ||
      canonical(p.excludedCategories) !== canonical(informationBackupExcludedCategories) || !Array.isArray(p.captures)) {
    throw new Error('Foreign or unsupported information backup.');
  }
  const seen = new Set<string>();
  const captures = p.captures.map(input => {
    const capture = validateInformationCapture(input);
    if (capture.owner !== scope.owner || capture.connectionId !== scope.connectionId || seen.has(capture.id) ||
        !(informationBackupCategories as readonly InformationCategory[]).includes(capture.category)) throw new Error('Foreign, excluded or duplicate information capture.');
    timestamp(capture.retrievedAt);
    if (bytes(canonical(capture)) > 1_000_000) throw new Error('Information backup capture size limit exceeded.');
    seen.add(capture.id);
    return capture;
  });
  if (canonical({ version: 1, scope, includedCategories: informationBackupCategories,
    excludedCategories: informationBackupExcludedCategories, captures }) !== e.payload) throw new Error('Noncanonical information backup payload.');
  return { version: 1, scope, includedCategories: informationBackupCategories,
    excludedCategories: informationBackupExcludedCategories, captures };
}

/** One provisional scope per private source-capture file; no production selection/migration. */
export class InformationStore {
  readonly scope: ProviderScope;
  constructor(readonly db: Driver, scope: ProviderScope, readonly authorize: () => Promise<void>) { this.scope = validateScope(scope); }
  private async allowed() { await this.authorize(); }
  async initialize(create = true) {
    await this.allowed();
    await this.db.transaction(async tx => {
      const v = await tx.first<{user_version:number}>('PRAGMA user_version');
      if (v?.user_version === 0) {
        if (!create) throw new Error('Uninitialized information store');
        if ((await tx.all('SELECT name FROM sqlite_master WHERE type=\'table\' AND name NOT LIKE \'sqlite_%\'')).length) throw new Error('Unexpected existing information store');
        await tx.exec(INFORMATION_SCHEMA);
        await tx.run('INSERT INTO information_manifest VALUES (1,?,?,?)', 'moflight-information-capture', 1, canonical(this.scope));
      } else if (v?.user_version !== 1) throw new Error('Unsupported information store');
      const m = await tx.first<{family:string;version:number;scope:string}>('SELECT * FROM information_manifest WHERE singleton=1');
      if (!m || m.family !== 'moflight-information-capture' || m.version !== 1 || m.scope !== canonical(this.scope)) throw new Error('Foreign information store');
      await this.allowed();
    });
  }
  private validate(input: unknown) {
    const value = validateInformationCapture(input);
    if (value.owner !== this.scope.owner || value.connectionId !== this.scope.connectionId) throw new Error('Foreign information capture');
    return value;
  }
  private decode(row: SavedInformation) {
    if (row.payload.length > 1_000_000) throw new Error('Oversized saved information');
    const value = this.validate(JSON.parse(row.payload));
    if (value.id !== row.id || value.category !== row.category || value.retrievedAt !== row.retrieved_at) throw new Error('Saved information identity mismatch');
    return value;
  }
  async save(input: unknown): Promise<InformationCapture> {
    await this.allowed(); const value = this.validate(input), payload = canonical(value);
    if (payload.length > 1_000_000) throw new Error('Oversized information capture');
    await this.db.transaction(async tx => {
      await this.allowed();
      await tx.run('INSERT INTO information_captures VALUES (?,?,?,?) ON CONFLICT(id) DO NOTHING', value.id, value.category, value.retrievedAt, payload);
      const row = await tx.first<{payload:string}>('SELECT payload FROM information_captures WHERE id=?', value.id);
      if (!row || row.payload !== payload) throw new Error('Information capture identity conflict');
      await this.allowed();
    });
    await this.allowed();
    return value;
  }
  async latest(): Promise<InformationCapture[]> {
    await this.allowed();
    const rows = await this.db.all<{id:string;category:string;retrieved_at:string;payload:string}>('SELECT * FROM information_captures r WHERE rowid=(SELECT rowid FROM information_captures WHERE category=r.category ORDER BY retrieved_at DESC,rowid DESC LIMIT 1) ORDER BY category');
    if (rows.length > informationCategories.length) throw new Error('Unsupported information category count');
    const result = rows.map(r => this.decode(r));
    await this.allowed(); return result;
  }
  /** Resolve one uncertain write by its immutable capture identity. */
  async find(id: string): Promise<InformationCapture | null> {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error('Invalid information capture identity');
    await this.allowed();
    const row = await this.db.first<SavedInformation>('SELECT * FROM information_captures WHERE id=?', id);
    const capture = row ? this.decode(row) : null;
    await this.allowed(); return capture;
  }
  /** One immutable snapshot at a time; local retrieval order, never source revisions. */
  async history(category: InformationCategory, index = 0): Promise<InformationHistory> {
    if (!informationCategories.includes(category) || !Number.isSafeInteger(index) || index < 0) throw new Error('Invalid information history request');
    await this.allowed();
    let result: InformationHistory | undefined;
    await this.db.transaction(async tx => {
      await this.allowed();
      const count = await tx.first<{total:number}>('SELECT count(*) total FROM information_captures WHERE category=?', category);
      const total = count?.total;
      if (typeof total !== 'number' || !Number.isSafeInteger(total) || total < 0 || index >= total && (total !== 0 || index !== 0)) throw new Error('Saved information position unavailable');
      const row = total ? await tx.first<SavedInformation>('SELECT * FROM information_captures WHERE category=? ORDER BY retrieved_at DESC,rowid DESC LIMIT 1 OFFSET ?', category, index) : null;
      if (total && !row) throw new Error('Saved information missing');
      const capture = row ? this.decode(row) : null;
      await this.allowed();
      result = { category, index, total, capture };
    });
    await this.allowed();
    if (!result) throw new Error('Saved information unavailable');
    return result;
  }

  /** Export only explicitly supported owner-scoped categories, including Medical; other captures remain local. */
  async exportBackup(hash: Hash): Promise<string> {
    await this.allowed();
    let captures: InformationCapture[] = [];
    await this.db.transaction(async tx => {
      await this.allowed();
      const rows = await tx.all<SavedInformation>('SELECT * FROM information_captures ORDER BY rowid');
      captures = rows.map(row => this.decode(row));
      captures = captures.filter(row => (informationBackupCategories as readonly InformationCategory[]).includes(row.category));
      await this.allowed();
    });
    const payload = canonical({ version: 1, scope: this.scope, includedCategories: informationBackupCategories,
      excludedCategories: informationBackupExcludedCategories, captures });
    const text = canonical({ format: INFORMATION_BACKUP_FORMAT, version: INFORMATION_BACKUP_VERSION,
      payload, checksum: await hash(payload) });
    await validateInformationBackup(text, this.scope, hash);
    await this.allowed();
    return text;
  }

  /** Restore only supported categories into a fresh candidate for this exact owner/connection. */
  async restoreBackup(text: string, hash: Hash, fault: (stage: 'before-capture' | 'after-capture') => Promise<void> = async () => {}): Promise<void> {
    await this.allowed();
    const backup = await validateInformationBackup(text, this.scope, hash);
    await this.db.transaction(async tx => {
      await this.allowed();
      const count = await tx.first<{ count: number }>('SELECT count(*) AS count FROM information_captures');
      if (!count || count.count !== 0) throw new Error('Restore into an empty information candidate only.');
      for (const capture of backup.captures) {
        await fault('before-capture');
        await this.allowed();
        const payload = canonical(capture);
        await tx.run('INSERT INTO information_captures VALUES (?,?,?,?)', capture.id, capture.category, capture.retrievedAt, payload);
        await fault('after-capture');
      }
      await this.allowed();
    });
    await this.allowed();
    await this.verifyBackup(text, hash);
  }

  /** Verify every candidate row, including that no excluded source category was smuggled into it. */
  async verifyBackup(text: string, hash: Hash): Promise<void> {
    await this.allowed();
    const expected = await validateInformationBackup(text, this.scope, hash);
    const actual = await this.db.all<SavedInformation>('SELECT * FROM information_captures ORDER BY rowid');
    const captures = actual.map(row => this.decode(row));
    if (captures.some(capture => !(informationBackupCategories as readonly InformationCategory[]).includes(capture.category)) ||
        canonical(captures) !== canonical(expected.captures)) throw new Error('Information candidate failed exact verification.');
    await this.allowed();
  }
}

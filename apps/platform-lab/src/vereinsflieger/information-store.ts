import { canonical } from '@moflight/flight-logbook';
import type { Driver } from '@moflight/local-data';
import { validateScope, type ProviderScope } from './scope-store';
import { informationCategories, validateInformationCapture, type InformationCapture, type InformationCategory, type InformationHistory } from './information';

type SavedInformation = { id: string; category: string; retrieved_at: string; payload: string };

export const INFORMATION_SCHEMA = `
CREATE TABLE information_manifest(singleton INTEGER PRIMARY KEY CHECK(singleton=1),family TEXT NOT NULL,version INTEGER NOT NULL,scope TEXT NOT NULL);
CREATE TABLE information_captures(id TEXT PRIMARY KEY,category TEXT NOT NULL,retrieved_at TEXT NOT NULL,payload TEXT NOT NULL);
CREATE TRIGGER information_no_update BEFORE UPDATE ON information_captures BEGIN SELECT RAISE(ABORT,'Immutable information capture'); END;
CREATE TRIGGER information_no_delete BEFORE DELETE ON information_captures BEGIN SELECT RAISE(ABORT,'Immutable information capture'); END;
CREATE TRIGGER information_manifest_no_update BEFORE UPDATE ON information_manifest BEGIN SELECT RAISE(ABORT,'Immutable information manifest'); END;
CREATE TRIGGER information_manifest_no_delete BEFORE DELETE ON information_manifest BEGIN SELECT RAISE(ABORT,'Immutable information manifest'); END;
PRAGMA user_version=1;`;
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
}

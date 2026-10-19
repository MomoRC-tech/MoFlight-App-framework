import { canonical } from '@moflight/flight-logbook';
import type { Driver } from '@moflight/local-data';
import { validateScope, type ProviderScope } from './scope-store';
import { informationCategories, validateInformationCapture, type InformationCapture } from './information';

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
  async initialize() {
    await this.allowed();
    await this.db.transaction(async tx => {
      const v = await tx.first<{user_version:number}>('PRAGMA user_version');
      if (v?.user_version === 0) {
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
    const result = rows.map(r => {
      if (r.payload.length > 1_000_000) throw new Error('Oversized saved information');
      const value = this.validate(JSON.parse(r.payload));
      if (value.id !== r.id || value.category !== r.category || value.retrievedAt !== r.retrieved_at) throw new Error('Saved information identity mismatch');
      return value;
    });
    await this.allowed(); return result;
  }
}

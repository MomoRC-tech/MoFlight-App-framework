import { canonical } from '@moflight/flight-logbook';
import type { Driver } from '@moflight/local-data';
import { validateScope, type ProviderScope } from './scope-store';
import { dutySnapshotExpiresAt, dutyTimestamp, validateDutyRosterSnapshot, type DutyRosterSnapshot } from './duties';

export const DUTY_ROSTER_SCHEMA = `
CREATE TABLE duty_manifest(singleton INTEGER PRIMARY KEY CHECK(singleton=1),scope TEXT NOT NULL);
CREATE TABLE duty_roster(singleton INTEGER PRIMARY KEY CHECK(singleton=1),expires_at INTEGER NOT NULL,payload TEXT NOT NULL);
PRAGMA user_version=1;`;
/** Separate from immutable evidence. Deletion/expiry never touches source history. */
export class DutyRosterStore {
  readonly scope: ProviderScope;
  constructor(readonly db: Driver, scope: ProviderScope, readonly authorize: () => Promise<void>, readonly clock: () => number = Date.now) { this.scope = validateScope(scope); }
  async initialize(create = true) {
    await this.authorize();
    await this.db.transaction(async tx => {
      const version = await tx.first<{ user_version: number }>('PRAGMA user_version');
      if (version?.user_version === 0) {
        if (!create || (await tx.all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")).length) throw new Error('Unexpected duty cache');
        await tx.exec(DUTY_ROSTER_SCHEMA);
        await tx.run('INSERT INTO duty_manifest VALUES(1,?)', canonical(this.scope));
      } else if (version?.user_version !== 1) throw new Error('Unsupported duty cache');
      const manifest = await tx.first<{ scope: string }>('SELECT scope FROM duty_manifest WHERE singleton=1');
      if (manifest?.scope !== canonical(this.scope)) throw new Error('Foreign duty cache');
      await this.authorize();
    });
    await this.purgeExpired();
  }
  private now() {
    const now = this.clock(); if (!Number.isSafeInteger(now) || now < 0) throw new Error('Invalid duty clock'); return now;
  }
  private validate(input: unknown) {
    const value = validateDutyRosterSnapshot(input);
    if (canonical(value.scope) !== canonical(this.scope)) throw new Error('Foreign duty roster');
    return value;
  }
  async purgeExpired() {
    await this.authorize();
    await this.db.transaction(async tx => {
      await this.authorize();
      await tx.run('DELETE FROM duty_roster WHERE expires_at<=?', this.now());
      await this.authorize();
    });
  }
  async save(input: DutyRosterSnapshot) {
    await this.authorize(); const value = this.validate(input), payload = canonical(value), expiresAt = dutySnapshotExpiresAt(value), now = this.now();
    if (payload.length > 1_000_000 || now >= expiresAt || now < dutyTimestamp(value.retrievedAt)) throw new Error('Expired or invalid duty roster');
    await this.db.transaction(async tx => {
      await this.authorize();
      const previous = await tx.first<{ payload: string }>('SELECT payload FROM duty_roster WHERE singleton=1');
      if (previous && dutyTimestamp(this.validate(JSON.parse(previous.payload)).retrievedAt) > dutyTimestamp(value.retrievedAt)) throw new Error('Older duty refresh');
      await tx.run('INSERT INTO duty_roster VALUES(1,?,?) ON CONFLICT(singleton) DO UPDATE SET expires_at=excluded.expires_at,payload=excluded.payload', expiresAt, payload);
      await this.authorize();
    });
    await this.authorize(); return value;
  }
  async load(): Promise<DutyRosterSnapshot | null> {
    await this.purgeExpired(); await this.authorize();
    const row = await this.db.first<{ expires_at: number; payload: string }>('SELECT expires_at,payload FROM duty_roster WHERE singleton=1');
    if (!row) { await this.authorize(); return null; }
    if (row.payload.length > 1_000_000) throw new Error('Oversized duty cache');
    const value = this.validate(JSON.parse(row.payload));
    if (row.expires_at !== dutySnapshotExpiresAt(value)) throw new Error('Invalid duty retention');
    await this.authorize();
    if (this.now() < dutyTimestamp(value.retrievedAt)) throw new Error('Unverified duty clock');
    if (this.now() >= row.expires_at) { await this.purgeExpired(); return null; }
    return value;
  }
}

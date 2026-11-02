import type { Connection, Driver } from '@moflight/local-data';
import { validateFlightAcknowledgment, validateFlightReviewTarget, type FlightAcknowledgment, type FlightReviewTarget } from './flight-source-review';

const FAMILY = 'moflight-flight-review-state';
const VERSION = 1;
const ACKNOWLEDGMENT_LIMIT = 100_000;

export const FLIGHT_REVIEW_STORE_SCHEMA = `
CREATE TABLE flight_review_manifest(
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  family TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  owner_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  account_ref TEXT NOT NULL
);
CREATE TABLE flight_review_acknowledgments(
  flight_id TEXT PRIMARY KEY NOT NULL,
  revision INTEGER NOT NULL,
  payload_sha256 TEXT NOT NULL
);
PRAGMA user_version=1;`;

interface ManifestRow {
  singleton: number; family: string; schema_version: number; owner_id: string; store_id: string; account_ref: string;
}
interface AcknowledgmentRow { flight_id: string; revision: number; payload_sha256: string }

function ownTarget(input: FlightReviewTarget): FlightReviewTarget {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).sort().join(',') !== 'accountRef,ownerId,storeId') throw new Error('Invalid flight review target.');
  const target = { ownerId: input.ownerId, storeId: input.storeId, accountRef: input.accountRef };
  validateFlightReviewTarget(target);
  return target;
}

function ownAcknowledgment(input: FlightAcknowledgment): FlightAcknowledgment {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).sort().join(',') !== 'flightId,payloadSha256,revision') throw new Error('Invalid flight acknowledgment.');
  const value = { flightId: input.flightId, revision: input.revision, payloadSha256: input.payloadSha256 };
  validateFlightAcknowledgment(value);
  return value;
}

function expectedManifest(target: FlightReviewTarget) {
  return { singleton: 1, family: FAMILY, schema_version: VERSION, owner_id: target.ownerId, store_id: target.storeId, account_ref: target.accountRef };
}

async function gated<T>(gate: () => Promise<void>, work: () => Promise<T>): Promise<T> {
  await gate();
  const value = await work();
  await gate();
  return value;
}

const normalizeSql = (sql: string) => sql.trim().replace(/;$/, '').replace(/\s+/g, ' ').toLowerCase();

async function appObjects(db: Connection) {
  return db.all<{ type: string; name: string; sql: string | null }>("SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name");
}

/** Local UI-only acknowledgment state. It is deliberately separate from flight history and portable backups. */
export class FlightReviewStore {
  private closed = false;
  private readonly identity: FlightReviewTarget;

  private constructor(readonly db: Driver, target: FlightReviewTarget, private readonly gate: () => Promise<void>) {
    this.identity = Object.freeze(ownTarget(target));
  }

  static async create(db: Driver, target: FlightReviewTarget, gate: () => Promise<void>): Promise<FlightReviewStore> {
    const store = new FlightReviewStore(db, ownTarget(target), gate);
    await gated(gate, () => db.transaction(async tx => {
      const version = await gated(gate, () => tx.first<{ user_version: number }>('PRAGMA user_version'));
      const objects = await gated(gate, () => appObjects(tx));
      if (version?.user_version !== 0 || objects.length !== 0) throw new Error('Existing or unrecognized flight review store preserved.');
      await gated(gate, () => tx.exec(FLIGHT_REVIEW_STORE_SCHEMA));
      const manifest = expectedManifest(store.identity);
      await gated(gate, () => tx.run('INSERT INTO flight_review_manifest(singleton,family,schema_version,owner_id,store_id,account_ref) VALUES (?,?,?,?,?,?)',
        manifest.singleton, manifest.family, manifest.schema_version, manifest.owner_id, manifest.store_id, manifest.account_ref));
      await store.validateState(tx);
      await gate(); // Recheck the scope immediately before the transaction commits.
    }));
    await gate();
    return store;
  }

  static async open(db: Driver, target: FlightReviewTarget, gate: () => Promise<void>): Promise<FlightReviewStore> {
    const store = new FlightReviewStore(db, ownTarget(target), gate);
    await gated(gate, () => db.transaction(async tx => {
      await store.validateState(tx);
      await gate(); // Keep the validated scope current at the transaction boundary.
    }));
    await gate();
    return store;
  }

  private ensureOpen(): void {
    if (this.closed) throw new Error('Closed flight review store.');
  }

  private async validateManifest(db: Connection): Promise<void> {
    const version = await gated(this.gate, () => db.first<{ user_version: number }>('PRAGMA user_version'));
    if (version?.user_version !== VERSION) throw new Error('Unsupported flight review store version.');
    const objects = await gated(this.gate, () => appObjects(db));
    const expectedObjects = new Map([
      ['flight_review_acknowledgments', normalizeSql(FLIGHT_REVIEW_STORE_SCHEMA.split(';')[1]!)],
      ['flight_review_manifest', normalizeSql(FLIGHT_REVIEW_STORE_SCHEMA.split(';')[0]!)],
    ]);
    if (objects.length !== expectedObjects.size || objects.some(row => row.type !== 'table' || !row.sql ||
        expectedObjects.get(row.name) !== normalizeSql(row.sql))) throw new Error('Unrecognized flight review store schema.');
    const rows = await gated(this.gate, () => db.all<ManifestRow>('SELECT singleton,family,schema_version,owner_id,store_id,account_ref FROM flight_review_manifest'));
    const expected = expectedManifest(this.identity);
    if (rows.length !== 1 || rows[0]!.singleton !== expected.singleton || rows[0]!.family !== FAMILY ||
        rows[0]!.schema_version !== VERSION || rows[0]!.owner_id !== expected.owner_id ||
        rows[0]!.store_id !== expected.store_id || rows[0]!.account_ref !== expected.account_ref) {
      throw new Error('Foreign or malformed flight review store manifest.');
    }
  }

  private async readAcknowledgments(db: Connection): Promise<FlightAcknowledgment[]> {
    const rows = await gated(this.gate, () => db.all<AcknowledgmentRow>('SELECT flight_id,revision,payload_sha256 FROM flight_review_acknowledgments ORDER BY flight_id'));
    if (rows.length > ACKNOWLEDGMENT_LIMIT) throw new Error('Flight review acknowledgment limit reached.');
    return rows.map(row => {
      const value = { flightId: row.flight_id, revision: row.revision, payloadSha256: row.payload_sha256 };
      validateFlightAcknowledgment(value);
      return value;
    });
  }

  private async validateState(db: Connection): Promise<FlightAcknowledgment[]> {
    await this.validateManifest(db);
    return this.readAcknowledgments(db);
  }

  async list(): Promise<FlightAcknowledgment[]> {
    this.ensureOpen();
    let result!: FlightAcknowledgment[];
    await gated(this.gate, () => this.db.transaction(async tx => {
      result = await this.validateState(tx);
      await this.gate();
    }));
    await this.gate();
    return result.map(value => ({ ...value }));
  }

  async acknowledge(input: FlightAcknowledgment): Promise<void> {
    this.ensureOpen();
    const value = ownAcknowledgment(input);
    await gated(this.gate, () => this.db.transaction(async tx => {
      const current = await this.validateState(tx);
      const previous = current.find(row => row.flightId === value.flightId);
      if (!previous && current.length >= ACKNOWLEDGMENT_LIMIT) throw new Error('Flight review acknowledgment limit reached.');
      await gated(this.gate, () => tx.run(`INSERT INTO flight_review_acknowledgments(flight_id,revision,payload_sha256) VALUES (?,?,?)
        ON CONFLICT(flight_id) DO UPDATE SET revision=excluded.revision,payload_sha256=excluded.payload_sha256`,
      value.flightId, value.revision, value.payloadSha256));
      const saved = await gated(this.gate, () => tx.first<AcknowledgmentRow>(
        'SELECT flight_id,revision,payload_sha256 FROM flight_review_acknowledgments WHERE flight_id=?', value.flightId));
      if (!saved || saved.flight_id !== value.flightId || saved.revision !== value.revision || saved.payload_sha256 !== value.payloadSha256) {
        throw new Error('Flight review acknowledgment readback failed.');
      }
      validateFlightAcknowledgment({ flightId: saved.flight_id, revision: saved.revision, payloadSha256: saved.payload_sha256 });
      await this.gate(); // Scope must still be current when the transaction commits.
    }));
    await this.gate();
  }

  async close(): Promise<void> {
    if (!this.closed) {
      this.closed = true;
      await this.db.close();
    }
  }
}

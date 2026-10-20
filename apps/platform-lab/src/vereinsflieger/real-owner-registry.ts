// Host-independent local owner registry. The app shell supplies the UUID source
// and an explicitly opened SQLite Driver; this module never scans other stores.
import { canonical } from '@moflight/flight-logbook';
import type { Connection, Driver } from '../../../../packages/local-data/src/index';
import { realHistoryCandidateName, realHistoryUuid, validateRealHistoryCandidateName } from './real-history-contract';

export const REAL_OWNER_REGISTRY_FAMILY = 'moflight-real-owner-registry';
export type RealOwnerUuidSource = () => string;

export interface RealOwnerRegistryManifest {
  singleton: 1;
  family: typeof REAL_OWNER_REGISTRY_FAMILY;
  schema_version: 1;
  created_at: string;
}

export interface RealOwnerRecord {
  version: 1;
  ownerId: string;
  storeId: string;
  candidateName: string;
  createdAt: string;
}

/** A local selection capability, not a provider or authenticated account identity. */
export interface RealOwnerLease extends RealOwnerRecord {
  selectionSeq: number;
  selectedAt: string;
  leaseId: string;
}

interface OwnerRow {
  owner_id: string;
  store_id: string;
  candidate_name: string;
  created_at: string;
}

interface SelectionRow {
  seq: number;
  owner_id: string;
  store_id: string;
  candidate_name: string;
  selection_id: string;
  previous_seq: number | null;
  selected_at: string;
}

const manifestSql = "CREATE TABLE real_owner_manifest(singleton INTEGER PRIMARY KEY CHECK(singleton=1),family TEXT NOT NULL CHECK(family='moflight-real-owner-registry'),schema_version INTEGER NOT NULL CHECK(schema_version=1),created_at TEXT NOT NULL)";
const ownersSql = 'CREATE TABLE real_owner_records(owner_id TEXT PRIMARY KEY NOT NULL,store_id TEXT NOT NULL UNIQUE,candidate_name TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL,UNIQUE(owner_id,store_id,candidate_name))';
const selectionsSql = 'CREATE TABLE real_owner_selections(seq INTEGER PRIMARY KEY,owner_id TEXT NOT NULL,store_id TEXT NOT NULL,candidate_name TEXT NOT NULL,selection_id TEXT NOT NULL UNIQUE,previous_seq INTEGER REFERENCES real_owner_selections(seq),selected_at TEXT NOT NULL,FOREIGN KEY(owner_id,store_id,candidate_name) REFERENCES real_owner_records(owner_id,store_id,candidate_name),CHECK(previous_seq IS NULL OR previous_seq<seq))';

const collisionTriggers = [
  "CREATE TRIGGER real_owner_manifest_no_collision BEFORE INSERT ON real_owner_manifest WHEN EXISTS(SELECT 1 FROM real_owner_manifest WHERE singleton=NEW.singleton) BEGIN SELECT RAISE(ABORT,'Append-only real owner registry identity collision'); END",
  "CREATE TRIGGER real_owner_records_no_collision BEFORE INSERT ON real_owner_records WHEN EXISTS(SELECT 1 FROM real_owner_records WHERE owner_id=NEW.owner_id OR store_id=NEW.store_id OR candidate_name=NEW.candidate_name) BEGIN SELECT RAISE(ABORT,'Append-only real owner registry identity collision'); END",
  "CREATE TRIGGER real_owner_selections_no_collision BEFORE INSERT ON real_owner_selections WHEN EXISTS(SELECT 1 FROM real_owner_selections WHERE seq=NEW.seq OR selection_id=NEW.selection_id) BEGIN SELECT RAISE(ABORT,'Append-only real owner registry identity collision'); END",
];

const immutableTriggers = ['real_owner_manifest', 'real_owner_records', 'real_owner_selections']
  .flatMap(table => ['UPDATE', 'DELETE'].map(operation => {
    const name = table + '_no_' + operation.toLowerCase();
    return 'CREATE TRIGGER ' + name + ' BEFORE ' + operation + ' ON ' + table + " BEGIN SELECT RAISE(ABORT,'Append-only real owner registry'); END";
  }));

const schemaObjects = [
  { name: 'real_owner_manifest', sql: manifestSql },
  { name: 'real_owner_records', sql: ownersSql },
  { name: 'real_owner_selections', sql: selectionsSql },
  ...collisionTriggers.map(sql => ({ name: sql.match(/CREATE TRIGGER (\S+)/)![1]!, sql })),
  ...immutableTriggers.map(sql => ({ name: sql.match(/CREATE TRIGGER (\S+)/)![1]!, sql })),
];

/** Exact v1 schema. Every registry mutation is an append inside one transaction. */
export const REAL_OWNER_REGISTRY_SCHEMA = [...schemaObjects.map(object => object.sql), 'PRAGMA user_version=1'].join(';\n') + ';';

const normalizeSql = (sql: string) => sql.trim().replace(/;$/, '').replace(/\s+/g, ' ');

function timestamp(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) ||
      !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw new Error('Invalid real owner registry timestamp.');
  }
}

function ownerRecord(row: OwnerRow): RealOwnerRecord {
  realHistoryUuid(row.owner_id);
  realHistoryUuid(row.store_id);
  validateRealHistoryCandidateName(row.candidate_name);
  timestamp(row.created_at);
  return { version: 1, ownerId: row.owner_id, storeId: row.store_id, candidateName: row.candidate_name, createdAt: row.created_at };
}

function validateManifest(value: unknown): RealOwnerRegistryManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Missing real owner registry manifest.');
  const row = value as Record<string, unknown>;
  if (canonical(Object.keys(row).sort()) !== canonical(['singleton', 'family', 'schema_version', 'created_at'].sort()) ||
      row.singleton !== 1 || row.family !== REAL_OWNER_REGISTRY_FAMILY || row.schema_version !== 1) {
    throw new Error('Unsupported real owner registry manifest.');
  }
  timestamp(row.created_at);
  return { singleton: 1, family: REAL_OWNER_REGISTRY_FAMILY, schema_version: 1, created_at: row.created_at };
}

async function configure(db: Driver): Promise<void> {
  await db.exec('PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL;');
  const foreignKeys = await db.first<{ foreign_keys: number }>('PRAGMA foreign_keys');
  const synchronous = await db.first<{ synchronous: number }>('PRAGMA synchronous');
  if (foreignKeys?.foreign_keys !== 1 || synchronous?.synchronous !== 2) throw new Error('Unsafe real owner registry connection.');
}

async function version(db: Connection): Promise<number> {
  return (await db.first<{ user_version: number }>('PRAGMA user_version'))?.user_version ?? -1;
}

async function hasObjects(db: Connection): Promise<boolean> {
  return !!(await db.first('SELECT name FROM sqlite_master WHERE name NOT LIKE ?', 'sqlite_%'));
}

interface RegistryEvidenceRow {
  kind:string; a:string|null; b:string|null; c:string|null; d:string|null; e:string|null;
  n:number|null; m:number|null;
}
// One statement returns all the same evidence as the former individual reads.
// PRAGMAs execute on the transaction connection; no evidence/lease is cached.
const registryEvidenceSql = `
SELECT 'version' AS kind,NULL AS a,NULL AS b,NULL AS c,NULL AS d,NULL AS e,user_version AS n,NULL AS m FROM pragma_user_version
UNION ALL SELECT 'foreign_keys',NULL,NULL,NULL,NULL,NULL,foreign_keys,NULL FROM pragma_foreign_keys
UNION ALL SELECT 'foreign_key_error',NULL,NULL,NULL,NULL,NULL,NULL,NULL FROM pragma_foreign_key_check
UNION ALL SELECT 'integrity',integrity_check,NULL,NULL,NULL,NULL,NULL,NULL FROM pragma_integrity_check
UNION ALL SELECT 'schema',name,sql,NULL,NULL,NULL,NULL,NULL FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'
UNION ALL SELECT 'manifest',family,created_at,NULL,NULL,NULL,singleton,schema_version FROM real_owner_manifest
UNION ALL SELECT 'owner',owner_id,store_id,candidate_name,created_at,NULL,NULL,NULL FROM real_owner_records
UNION ALL SELECT 'selection',owner_id,store_id,candidate_name,selected_at,selection_id,seq,previous_seq FROM real_owner_selections`;

function checkSchema(rows:RegistryEvidenceRow[]):void {
  const versions=rows.filter(row=>row.kind==='version');
  if (versions.length!==1 || versions[0]!.n !== 1) throw new Error('Unsupported real owner registry version; preserved.');
  const actual = rows.filter(row=>row.kind==='schema').map(row=>({name:row.a!,sql:row.b!})).sort((a,b)=>a.name.localeCompare(b.name));
  const expected = [...schemaObjects].sort((a, b) => a.name.localeCompare(b.name));
  if (canonical(actual.map(row => ({ name: row.name, sql: normalizeSql(row.sql) }))) !==
      canonical(expected.map(row => ({ name: row.name, sql: normalizeSql(row.sql) })))) {
    throw new Error('Unsupported real owner registry schema; preserved.');
  }
  const foreignKeys=rows.filter(row=>row.kind==='foreign_keys');
  if (foreignKeys.length!==1 || foreignKeys[0]!.n !== 1) throw new Error('Foreign keys are not enabled for real owner registry.');
  if (rows.some(row=>row.kind==='foreign_key_error')) throw new Error('Broken real owner registry references.');
  const integrity=rows.filter(row=>row.kind==='integrity');
  if (integrity.length !== 1 || integrity[0]!.a !== 'ok') throw new Error('Unreadable real owner registry.');
}

async function readValidatedState(db: Connection): Promise<{ manifest: RealOwnerRegistryManifest; owners: RealOwnerRecord[]; selections: SelectionRow[] }> {
  let evidence:RegistryEvidenceRow[];
  try{evidence=await db.all<RegistryEvidenceRow>(registryEvidenceSql);}
  catch(error){
    // Unknown/partial schemas may not prepare the combined query. Preserve
    // the existing fail-closed classification without repairing any file.
    if(await version(db)!==1)throw new Error('Unsupported real owner registry version; preserved.',{cause:error});
    throw new Error('Unsupported real owner registry schema; preserved.',{cause:error});
  }
  checkSchema(evidence);
  const manifestRows = evidence.filter(row=>row.kind==='manifest').map(row=>({singleton:row.n,family:row.a,schema_version:row.m,created_at:row.b}));
  if (manifestRows.length !== 1) throw new Error('Missing or duplicate real owner registry manifest.');
  const manifest = validateManifest(manifestRows[0]);
  const owners = evidence.filter(row=>row.kind==='owner').map(row=>ownerRecord({owner_id:row.a,store_id:row.b,candidate_name:row.c,created_at:row.d} as OwnerRow))
    .sort((a,b)=>a.createdAt<b.createdAt?-1:a.createdAt>b.createdAt?1:a.ownerId<b.ownerId?-1:a.ownerId>b.ownerId?1:0);
  const ownerById = new Map(owners.map(owner => [owner.ownerId, owner]));
  const selections = evidence.filter(row=>row.kind==='selection').map(row=>({seq:row.n,owner_id:row.a,store_id:row.b,candidate_name:row.c,
    selected_at:row.d,selection_id:row.e,previous_seq:row.m} as SelectionRow)).sort((a,b)=>a.seq-b.seq);
  if (selections.some((row, index) => {
    const owner = ownerById.get(row.owner_id);
    try {
      realHistoryUuid(row.selection_id);
      timestamp(row.selected_at);
    } catch { return true; }
    return !Number.isSafeInteger(row.seq) || row.seq !== index + 1 ||
      (index === 0 ? row.previous_seq !== null : row.previous_seq !== index) ||
      !owner || owner.storeId !== row.store_id || owner.candidateName !== row.candidate_name;
  })) throw new Error('Invalid real owner selection history.');
  if (ownerById.size !== new Set(selections.map(row => row.owner_id)).size) throw new Error('Unselected real owner record.');
  return { manifest, owners, selections };
}

interface IssuedLease { selectionSeq: number; ownerId: string; storeId: string; candidateName: string }

/**
 * Append-only local owner catalogue and explicit active-owner journal.
 * This is a local isolation/selection boundary, not authentication. Provider
 * bindings and flight data belong in separately scoped production stores.
 */
export class RealOwnerRegistry {
  private closed = false;
  private readonly issuedLeases = new Map<string, IssuedLease>();
  private leaseSequence: number | null = null;

  private constructor(private readonly db: Driver, private readonly uuid: RealOwnerUuidSource) {}

  private ensureOpen(): void {
    if (this.closed) throw new Error('Closed real owner registry.');
  }

  private freshUuid(used: Set<string>): string {
    const value = this.uuid();
    realHistoryUuid(value);
    if (used.has(value)) throw new Error('UUID source returned a duplicate real owner identity.');
    used.add(value);
    return value;
  }

  private issueLease(record: RealOwnerRecord, selection: SelectionRow): RealOwnerLease {
    if (selection.seq !== this.leaseSequence) {
      this.issuedLeases.clear();
      this.leaseSequence = selection.seq;
    }
    const leaseId = this.freshUuid(new Set());
    const lease = Object.freeze({ ...record, selectionSeq: selection.seq, selectedAt: selection.selected_at, leaseId });
    this.issuedLeases.set(leaseId, { selectionSeq: selection.seq, ownerId: record.ownerId, storeId: record.storeId, candidateName: record.candidateName });
    return lease;
  }

  private requireIssuedLease(lease: RealOwnerLease, ownerId?: string, storeId?: string): IssuedLease {
    this.ensureOpen();
    if (!lease || typeof lease !== 'object' || typeof lease.leaseId !== 'string') throw new Error('Current real owner lease required.');
    const issued = this.issuedLeases.get(lease.leaseId);
    if (!issued || lease.selectionSeq !== issued.selectionSeq || lease.ownerId !== issued.ownerId ||
        lease.storeId !== issued.storeId || lease.candidateName !== issued.candidateName) {
      throw new Error('Expired or forged real owner lease.');
    }
    if ((ownerId !== undefined && ownerId !== issued.ownerId) || (storeId !== undefined && storeId !== issued.storeId)) {
      throw new Error('Foreign real owner reference.');
    }
    return issued;
  }

  private async assertCurrentIn(db: Connection, lease: RealOwnerLease, ownerId?: string, storeId?: string): Promise<void> {
    const latest = await db.first<SelectionRow>('SELECT * FROM real_owner_selections ORDER BY seq DESC LIMIT 1');
    this.assertHead(lease,latest,ownerId,storeId);
  }

  private assertHead(lease:RealOwnerLease,latest:SelectionRow|null|undefined,ownerId?:string,storeId?:string):void {
    const issued = this.requireIssuedLease(lease, ownerId, storeId);
    if (!latest || latest.seq !== issued.selectionSeq || latest.owner_id !== issued.ownerId ||
        latest.store_id !== issued.storeId || latest.candidate_name !== issued.candidateName) {
      this.issuedLeases.delete(lease.leaseId);
      throw new Error('Real owner selection changed; reopen under the current owner.');
    }
  }

  /** Initialize only an explicitly chosen, completely empty registry database. */
  static async create(db: Driver, uuid: RealOwnerUuidSource, createdAt: string): Promise<RealOwnerRegistry> {
    timestamp(createdAt);
    await configure(db);
    if (await version(db) !== 0 || await hasObjects(db)) throw new Error('Existing or unknown real owner registry preserved.');
    await db.transaction(async tx => {
      if (await version(tx) !== 0 || await hasObjects(tx)) throw new Error('Existing or unknown real owner registry preserved.');
      await tx.exec(REAL_OWNER_REGISTRY_SCHEMA);
      await tx.run('INSERT INTO real_owner_manifest(singleton,family,schema_version,created_at) VALUES (1,?,?,?)',
        REAL_OWNER_REGISTRY_FAMILY, 1, createdAt);
    });
    const registry = new RealOwnerRegistry(db, uuid);
    await registry.validate();
    return registry;
  }

  /** Open validates the existing v1 file and never initializes or repairs it. */
  static async open(db: Driver, uuid: RealOwnerUuidSource): Promise<RealOwnerRegistry> {
    await configure(db);
    const registry = new RealOwnerRegistry(db, uuid);
    await registry.validate();
    return registry;
  }

  private async validate(): Promise<void> {
    this.ensureOpen();
    await this.db.transaction(async tx => { await readValidatedState(tx); });
  }

  /** Create and select a fresh owner/store/candidate as one durable operation. */
  async createFreshOwner(at: string): Promise<RealOwnerLease> {
    this.ensureOpen();
    timestamp(at);
    const used = new Set<string>();
    const ownerId = this.freshUuid(used);
    const storeId = this.freshUuid(used);
    const candidateId = this.freshUuid(used);
    const selectionId = this.freshUuid(used);
    const leaseId = this.freshUuid(used);
    const candidateName = realHistoryCandidateName(candidateId);
    const record: RealOwnerRecord = { version: 1, ownerId, storeId, candidateName, createdAt: at };
    let selection!: SelectionRow;
    await this.db.transaction(async tx => {
      const state = await readValidatedState(tx);
      const previous = state.selections.at(-1) ?? null;
      const seq = (previous?.seq ?? 0) + 1;
      selection = { seq, owner_id: ownerId, store_id: storeId, candidate_name: candidateName,
        selection_id: selectionId, previous_seq: previous?.seq ?? null, selected_at: at };
      await tx.run('INSERT INTO real_owner_records(owner_id,store_id,candidate_name,created_at) VALUES (?,?,?,?)',
        ownerId, storeId, candidateName, at);
      await tx.run('INSERT INTO real_owner_selections(seq,owner_id,store_id,candidate_name,selection_id,previous_seq,selected_at) VALUES (?,?,?,?,?,?,?)',
        selection.seq, selection.owner_id, selection.store_id, selection.candidate_name,
        selection.selection_id, selection.previous_seq, selection.selected_at);
    });
    // Use the pre-generated lease ID so a bad UUID source cannot fail after commit.
    if (selection.seq !== this.leaseSequence) {
      this.issuedLeases.clear();
      this.leaseSequence = selection.seq;
    }
    const lease = Object.freeze({ ...record, selectionSeq: selection.seq, selectedAt: selection.selected_at, leaseId });
    this.issuedLeases.set(leaseId, { selectionSeq: selection.seq, ownerId, storeId, candidateName });
    return lease;
  }

  /** Explicitly switch to an already registered owner using the current lease. */
  async selectOwner(ownerId: string, at: string, from: RealOwnerLease): Promise<RealOwnerLease> {
    this.ensureOpen();
    realHistoryUuid(ownerId);
    timestamp(at);
    this.requireIssuedLease(from);
    const used = new Set<string>();
    const selectionId = this.freshUuid(used);
    const leaseId = this.freshUuid(used);
    let record!: RealOwnerRecord;
    let selection!: SelectionRow;
    await this.db.transaction(async tx => {
      await this.assertCurrentIn(tx, from);
      const state = await readValidatedState(tx);
      record = state.owners.find(owner => owner.ownerId === ownerId)!;
      if (!record) throw new Error('Unknown real owner; no store was opened or adopted.');
      const previous = state.selections.at(-1)!;
      selection = { seq: previous.seq + 1, owner_id: record.ownerId, store_id: record.storeId,
        candidate_name: record.candidateName, selection_id: selectionId, previous_seq: previous.seq, selected_at: at };
      await tx.run('INSERT INTO real_owner_selections(seq,owner_id,store_id,candidate_name,selection_id,previous_seq,selected_at) VALUES (?,?,?,?,?,?,?)',
        selection.seq, selection.owner_id, selection.store_id, selection.candidate_name,
        selection.selection_id, selection.previous_seq, selection.selected_at);
    });
    this.issuedLeases.clear();
    this.leaseSequence = selection.seq;
    const lease = Object.freeze({ ...record, selectionSeq: selection.seq, selectedAt: selection.selected_at, leaseId });
    this.issuedLeases.set(leaseId, { selectionSeq: selection.seq, ownerId: record.ownerId, storeId: record.storeId, candidateName: record.candidateName });
    return lease;
  }

  /** Recover the explicitly persisted selection; no other database is searched. */
  async currentOwner(): Promise<RealOwnerLease | null> {
    this.ensureOpen();
    const current: { value: { record: RealOwnerRecord; selection: SelectionRow } | null } = { value: null };
    await this.db.transaction(async tx => {
      const state = await readValidatedState(tx);
      const selection = state.selections.at(-1);
      if (!selection) return;
      const record = state.owners.find(owner => owner.ownerId === selection.owner_id);
      if (!record) throw new Error('Selected real owner is missing.');
      current.value = { record, selection };
    });
    return current.value ? this.issueLease(current.value.record, current.value.selection) : null;
  }

  /** List local owner choices only while the caller holds the current lease. */
  async listOwners(lease: RealOwnerLease): Promise<RealOwnerRecord[]> {
    this.ensureOpen();
    let owners: RealOwnerRecord[] = [];
    await this.db.transaction(async tx => {
      await this.assertCurrentIn(tx, lease);
      owners = (await readValidatedState(tx)).owners;
    });
    return owners.map(owner => ({ ...owner }));
  }

  /** Revalidate a lease at the point a scoped repository operation is started. */
  async assertCurrent(lease: RealOwnerLease, ownerId?: string, storeId?: string): Promise<void> {
    this.ensureOpen();
    await this.db.transaction(async tx => {
      const state=await readValidatedState(tx);
      this.assertHead(lease,state.selections.at(-1),ownerId,storeId);
    });
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.issuedLeases.clear();
    await this.db.close();
  }
}

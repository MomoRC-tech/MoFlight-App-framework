import { canonical } from '@moflight/flight-logbook';
import type { Connection, Driver, Hash } from '../../../../packages/local-data/src/index';
import { REAL_HISTORY_BACKUP_LIMIT, REAL_HISTORY_SCHEMA, realHistoryUuid, validateRealHistoryManifest,
  type RealHistoryManifest } from './real-history-contract';
import type { RealFlightSourceInput } from './real-flight-source';
import { deriveRealFlightCommand, encodeRealFlightBackup, latestRealFlightRecord, latestRealFlightRecords, latestRealFlightValues,
  prepareRealFlightImport, realFlightBoundedJson, realFlightClone, realFlightExactKeys, realFlightRequire,
  realFlightSha, validateRealFlightBackup, validateRealFlightGraph,
  REAL_FLIGHT_LIBRARY_RECEIPT_LIMIT, REAL_FLIGHT_LIBRARY_RECORD_LIMIT,
  type BindAccountCommand, type ImportUnassignedCommand, type RealFlightCommand, type RealFlightGraph,
  type RealFlightImportPlan, type RealFlightReceipt, type RealFlightRecord,
  type RealFlightResult, type StoredBinding, type StoredCapture, type StoredFacts, type StoredFlight } from './real-flight-library-model';

export interface RealFlightPermit { ownerId: string; storeId: string; leaseId: string; writable: boolean }
export type RealFlightAuthorization = () => RealFlightPermit | null;
export type RealFlightFault = (stage: string) => Promise<void>;
export type RealFlightAccessGate = (write: boolean) => Promise<void>;

const SCHEMA_VERSION = 1;
const normalizeSql = (sql: string) => sql.trim().replace(/\s*;\s*/g, '; ').replace(/\s+/g, ' ').replace(/; $/, '');

function expectedSqlObjects(): Record<string, string> {
  // Trigger bodies contain an internal semicolon; retain it while waiting for
  // each trigger's final END before moving to the next top-level statement.
  const statements: string[] = [];
  let pending = '';
  for (const part of REAL_HISTORY_SCHEMA.split(';')) {
    const fragment = part.trim();
    if (!fragment && !pending) continue;
    pending = pending ? `${pending};${fragment}` : fragment;
    const trigger = /^CREATE\s+TRIGGER\b/i.test(pending);
    if (!trigger || /\bEND\s*$/.test(fragment)) { statements.push(pending.trim()); pending = ''; }
  }
  if (pending.trim()) statements.push(pending.trim());
  const objects = statements.filter(value => value && !/^PRAGMA\s/i.test(value));
  const result: Record<string, string> = {};
  for (const statement of objects) {
    const match = /^CREATE\s+(?:UNIQUE\s+)?(TABLE|INDEX|TRIGGER)\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_]+)/i.exec(statement);
    realFlightRequire(match, 'Invalid maintained real flight history schema.');
    result[match[2]!] = statement;
  }
  return result;
}
const EXPECTED_SCHEMA = expectedSqlObjects();

async function configure(db: Driver): Promise<void> {
  await db.exec('PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL;');
  realFlightRequire((await db.first<{foreign_keys:number}>('PRAGMA foreign_keys'))?.foreign_keys === 1 &&
    (await db.first<{synchronous:number}>('PRAGMA synchronous'))?.synchronous === 2, 'Unsafe real flight history connection.');
}

async function checkSchema(db: Connection): Promise<void> {
  realFlightRequire((await db.first<{user_version:number}>('PRAGMA user_version'))?.user_version === SCHEMA_VERSION,
    'Unsupported real flight history SQL version.');
  const actual = await db.all<{name:string;sql:string}>("SELECT name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name");
  const mismatch = actual.find(row => normalizeSql(row.sql) !== normalizeSql(EXPECTED_SCHEMA[row.name]!));
  realFlightRequire(canonical(actual.map(row => row.name)) === canonical(Object.keys(EXPECTED_SCHEMA).sort()) &&
    !mismatch,
    `Unsupported real flight history SQL shape${mismatch ? ` at ${mismatch.name}` : ''}.`);
  realFlightRequire((await db.all('PRAGMA foreign_key_check')).length === 0, 'Broken real flight history foreign keys.');
  const integrity = await db.all<{integrity_check:string}>('PRAGMA integrity_check');
  realFlightRequire(integrity.length === 1 && integrity[0]!.integrity_check === 'ok', 'Unreadable real flight history database.');
}

async function graphFrom(db: Connection): Promise<RealFlightGraph> {
  const bounds = await db.first<{ receiptCount: number; receiptBytes: number; recordCount: number; recordBytes: number }>(
    `SELECT (SELECT COUNT(*) FROM real_history_receipts) AS receiptCount,
      COALESCE((SELECT SUM(length(CAST(request_json AS BLOB)) + length(CAST(result_json AS BLOB))) FROM real_history_receipts),0) AS receiptBytes,
      (SELECT COUNT(*) FROM real_history_records) AS recordCount,
      COALESCE((SELECT SUM(length(CAST(payload AS BLOB))) FROM real_history_records),0) AS recordBytes`);
  realFlightRequire(!!bounds && Number.isSafeInteger(bounds.receiptCount) && bounds.receiptCount <= REAL_FLIGHT_LIBRARY_RECEIPT_LIMIT &&
    Number.isSafeInteger(bounds.recordCount) && bounds.recordCount <= REAL_FLIGHT_LIBRARY_RECORD_LIMIT &&
    Number.isSafeInteger(bounds.receiptBytes) && Number.isSafeInteger(bounds.recordBytes) &&
    bounds.receiptBytes + bounds.recordBytes <= REAL_HISTORY_BACKUP_LIMIT, 'Real flight history database exceeds its replay bounds.');
  const manifests = await db.all<RealHistoryManifest>('SELECT * FROM real_history_manifest');
  realFlightRequire(manifests.length === 1, 'Missing real flight history manifest.');
  const receipts = await db.all<RealFlightReceipt>('SELECT * FROM real_history_receipts ORDER BY generation');
  const records = await db.all<RealFlightRecord>('SELECT * FROM real_history_records ORDER BY seq');
  return { manifest: manifests[0]!, generation: receipts.length, receipts, records };
}

async function authorizedGraph(db: Connection, permit: RealFlightPermit): Promise<RealFlightGraph> {
  const manifest = await db.first<RealHistoryManifest>('SELECT * FROM real_history_manifest');
  realFlightRequire(manifest?.owner_id === permit.ownerId && manifest.store_id === permit.storeId,
    'Foreign real flight history manifest.');
  const graph = await graphFrom(db);
  realFlightRequire(graph.records.every(record => record.owner_id === permit.ownerId), 'Foreign real flight history record.');
  return graph;
}

export class IndeterminateRealFlightCommit extends Error {
  constructor(readonly commandId: string, options?: ErrorOptions) {
    super('Real flight history commit outcome requires receipt recovery.', options);
  }
}

export interface RealFlightListItem {
  flightId: string; bindingId: string; accountRef: string; sourceFlightRef: string;
  firstCaptureId: string; factsRevision: number; facts: StoredFacts['facts']; unassigned: true;
}
export interface RealFlightDetail extends RealFlightListItem {
  factHistory: StoredFacts[]; captures: StoredCapture[];
  pending: { captureId: string; issue: import('./real-flight-library-model').RealFlightPlanIssue }[];
}
export type RealFlightReceiptRecovery =
  | { status: 'found'; receipt: RealFlightReceipt; result: RealFlightResult }
  | { status: 'not-found'; commandId: string };

/** Account-scoped, append-only source-flight history. It does not assign books or compute credit. */
export class RealFlightLibrary {
  private closed = false;
  private validatedGraphText: string | null = null;

  private constructor(private readonly db: Driver, readonly manifest: Readonly<RealHistoryManifest>,
    private readonly hash: Hash, private readonly authorize: RealFlightAuthorization, private readonly leaseId: string,
    private readonly fault: RealFlightFault, private readonly gate: RealFlightAccessGate = async () => {}) {}

  private static permit(authorize: RealFlightAuthorization, ownerId: string, storeId: string, write = false): RealFlightPermit {
    const value = authorize();
    realFlightExactKeys(value, ['ownerId','storeId','leaseId','writable']);
    realFlightRequire(value.ownerId === ownerId && value.storeId === storeId && typeof value.leaseId === 'string' && value.leaseId.length > 0 &&
      typeof value.writable === 'boolean' && (!write || value.writable), 'Unauthorized real flight history access.');
    return realFlightClone(value as RealFlightPermit);
  }

  private allowed(write = false): RealFlightPermit {
    realFlightRequire(!this.closed, 'Closed real flight history handle.');
    const permit = RealFlightLibrary.permit(this.authorize, this.manifest.owner_id, this.manifest.store_id, write);
    realFlightRequire(permit.leaseId === this.leaseId, 'Expired or foreign real flight history lease.');
    return permit;
  }

  static async create(db: Driver, manifest: RealHistoryManifest, hash: Hash, authorize: RealFlightAuthorization,
    fault: RealFlightFault = async () => {}, gate: RealFlightAccessGate = async () => {}): Promise<RealFlightLibrary> {
    manifest = realFlightClone(manifest); validateRealHistoryManifest(manifest);
    const initial = this.permit(authorize, manifest.owner_id, manifest.store_id, true);
    await gate(true);
    const beforeAccess = this.permit(authorize, manifest.owner_id, manifest.store_id, true);
    realFlightRequire(beforeAccess.leaseId === initial.leaseId, 'Expired real flight history creation lease.');
    await configure(db);
    await gate(true);
    const beforePublish = this.permit(authorize, manifest.owner_id, manifest.store_id, true);
    realFlightRequire(beforePublish.leaseId === initial.leaseId, 'Expired real flight history creation lease.');
    realFlightRequire((await db.first<{user_version:number}>('PRAGMA user_version'))?.user_version === 0 &&
      !(await db.first("SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'")), 'Existing real flight history candidate preserved.');
    await db.transaction(async tx => {
      await gate(true);
      const current = this.permit(authorize, manifest.owner_id, manifest.store_id, true);
      realFlightRequire(current.leaseId === initial.leaseId, 'Expired real flight history creation lease.');
      await tx.exec(REAL_HISTORY_SCHEMA);
      await tx.run('INSERT INTO real_history_manifest VALUES (?,?,?,?,?,?,?)', manifest.singleton, manifest.family,
        manifest.schema_version, manifest.payload_version, manifest.store_id, manifest.owner_id, manifest.created_at);
      await fault('create-before-commit');
    });
    await gate(true);
    const afterPublication = this.permit(authorize, manifest.owner_id, manifest.store_id, true);
    realFlightRequire(afterPublication.leaseId === initial.leaseId, 'Real flight history creation lease changed after publication.');
    const library = new RealFlightLibrary(db, Object.freeze(realFlightClone(manifest)), hash, authorize, initial.leaseId, fault, gate);
    await library.snapshot(); await gate(true); library.allowed(true); return library;
  }

  static async open(db: Driver, ownerId: string, storeId: string, hash: Hash, authorize: RealFlightAuthorization,
    fault: RealFlightFault = async () => {}, gate: RealFlightAccessGate = async () => {}): Promise<RealFlightLibrary> {
    const initial = this.permit(authorize, ownerId, storeId);
    await gate(false);
    const permit = this.permit(authorize, ownerId, storeId);
    realFlightRequire(permit.leaseId === initial.leaseId, 'Real flight history lease changed before open.');
    await configure(db);
    let graph!: RealFlightGraph;
    await db.transaction(async tx => {
      await gate(false);
      const current = this.permit(authorize, ownerId, storeId);
      realFlightRequire(current.leaseId === permit.leaseId, 'Real flight history lease changed during open.');
      await checkSchema(tx); graph = await authorizedGraph(tx, current); await validateRealFlightGraph(graph, hash);
    });
    realFlightRequire(graph.manifest.owner_id === ownerId && graph.manifest.store_id === storeId, 'Foreign real flight history file.');
    const library = new RealFlightLibrary(db, Object.freeze(realFlightClone(graph.manifest)), hash, authorize, permit.leaseId, fault, gate);
    library.validatedGraphText = canonical(graph);
    await gate(false);
    const afterReplay = library.allowed();
    realFlightRequire(afterReplay.leaseId === permit.leaseId, 'Real flight history lease changed after open.');
    return library;
  }

  async close(): Promise<void> { if (!this.closed) { this.closed = true; this.validatedGraphText = null; await this.db.close(); } }

  async snapshot(): Promise<RealFlightGraph> {
    const before = this.allowed(); await this.gate(false);
    const ready = this.allowed();
    realFlightRequire(ready.leaseId === before.leaseId, 'Real flight history lease changed before read.');
    let graph!: RealFlightGraph, validatedText!: string;
    await this.db.transaction(async tx => {
      const current = this.allowed();
      realFlightRequire(current.leaseId === ready.leaseId, 'Real flight history lease changed during read.');
      await checkSchema(tx); graph = await authorizedGraph(tx, current);
      // The current graph is still read and checked in this transaction. Reuse
      // replay only for exact bytes already validated by this same handle;
      // generation/count equality alone never establishes integrity.
      const text = canonical(graph);
      if (text !== this.validatedGraphText) {
        await validateRealFlightGraph(graph, this.hash);
      }
      validatedText = text;
    });
    this.validatedGraphText = validatedText;
    realFlightRequire(graph.manifest.owner_id === before.ownerId && graph.manifest.store_id === before.storeId,
      'Foreign real flight history file.');
    await this.gate(false); const after = this.allowed();
    realFlightRequire(after.leaseId === before.leaseId, 'Real flight history lease changed during read.');
    return realFlightClone(graph);
  }

  async bindAccount(input: Omit<BindAccountCommand, 'version'|'ownerId'|'storeId'>): Promise<RealFlightResult> {
    const command: BindAccountCommand = { version: 1, ownerId: this.manifest.owner_id, storeId: this.manifest.store_id, ...input };
    return this.commit(command);
  }

  async prepareImport(source: RealFlightSourceInput): Promise<RealFlightImportPlan> {
    const { plan } = await this.prepareReview(source);
    realFlightRequire(plan, 'Bind the observed provider account before preparing a flight import.');
    return plan;
  }

  /** Binding state and import plan share one fresh, authorized graph read. */
  async prepareReview(source: RealFlightSourceInput): Promise<{graph: RealFlightGraph; plan: RealFlightImportPlan | null}> {
    const before = this.allowed(); await this.gate(false); const graph = await this.snapshot();
    const binding = latestRealFlightValues<StoredBinding>(graph.records, 'binding')[0];
    const plan = binding ? await prepareRealFlightImport(graph, binding.bindingId, source, this.hash) : null;
    await this.gate(false); const after = this.allowed();
    realFlightRequire(after.leaseId === before.leaseId, 'Real flight history lease changed during review.');
    return { graph, plan };
  }

  async saveUnassigned(input: Omit<ImportUnassignedCommand, 'version'|'ownerId'|'storeId'>): Promise<RealFlightResult> {
    const command: ImportUnassignedCommand = { version: 1, ownerId: this.manifest.owner_id, storeId: this.manifest.store_id, ...input };
    return this.commit(command);
  }

  async commit(input: RealFlightCommand): Promise<RealFlightResult> {
    this.allowed(true); await this.gate(true);
    realFlightRequire(input.ownerId === this.manifest.owner_id && input.storeId === this.manifest.store_id,
      'Foreign real flight history command.');
    const request = realFlightBoundedJson(input, REAL_HISTORY_BACKUP_LIMIT);
    const command = JSON.parse(request) as RealFlightCommand;
    let completed = false, committed = false, alreadyCommitted = false, result!: RealFlightResult;
    let validatedText!: string;
    try {
      await this.fault('before-transaction');
      await this.db.transaction(async tx => {
        this.allowed(true); await checkSchema(tx);
        const graph = await authorizedGraph(tx, this.allowed(true)); await validateRealFlightGraph(graph, this.hash);
        realFlightRequire(canonical(graph.manifest) === canonical(this.manifest), 'Real flight history manifest changed.');
        const old = graph.receipts.find(receipt => receipt.command_id === command.commandId);
        if (old) {
          realFlightRequire(old.request_json === request, 'Real flight history idempotency ID reused with different input.');
          validatedText = canonical(graph);
          result = JSON.parse(old.result_json) as RealFlightResult; alreadyCommitted = true; completed = true; return;
        }
        const next = await deriveRealFlightCommand(graph, command, this.hash); result = next.result;
        await this.fault('before-receipt');
        const receipt = next.receipt;
        await tx.run('INSERT INTO real_history_receipts VALUES (?,?,?,?,?,?,?,?,?)', receipt.command_id, receipt.owner_id, receipt.kind,
          receipt.base_generation, receipt.generation, receipt.request_json, receipt.request_sha256, receipt.result_json, receipt.committed_at);
        await this.fault('after-receipt');
        for (const row of next.records) {
          await tx.run('INSERT INTO real_history_records VALUES (?,?,?,?,?,?,?,?)', row.seq, row.owner_id, row.kind, row.id,
            row.revision, row.generation, row.payload, row.payload_sha256);
          await this.fault('after-' + row.kind);
        }
        const writtenGraph = await graphFrom(tx);
        await validateRealFlightGraph(writtenGraph, this.hash);
        validatedText = canonical(writtenGraph);
        this.allowed(true); await this.fault('before-commit'); await this.gate(true);
        await authorizedGraph(tx, this.allowed(true)); completed = true;
      });
      committed = true;
      // Publish trust only after the driver confirms COMMIT. Readback below
      // still reads the database and checks exact bytes, schema and ownership;
      // changed bytes take the complete replay path, even at the same generation.
      this.validatedGraphText = validatedText;
      await this.gate(true); this.allowed(true);
      if (!alreadyCommitted) await this.fault('after-commit');
      await this.fault('before-readback');
      const graph = await this.snapshot(); const receipt = graph.receipts.find(row => row.command_id === command.commandId);
      realFlightRequire(receipt?.request_json === request && receipt.result_json === canonical(result), 'Real flight history receipt readback failed.');
      await this.gate(true); this.allowed(true); return realFlightClone(result);
    } catch (error) {
      if (committed || completed) throw new IndeterminateRealFlightCommit(command.commandId, { cause: error });
      throw error;
    }
  }

  async recoverReceipt(commandId: string): Promise<RealFlightReceiptRecovery> {
    realHistoryUuid(commandId);
    const graph = await this.snapshot(), receipt = graph.receipts.find(row => row.command_id === commandId);
    if (!receipt) return { status: 'not-found', commandId };
    return { status: 'found', receipt, result: JSON.parse(receipt.result_json) as RealFlightResult };
  }

  async list(): Promise<RealFlightListItem[]> {
    return (await this.readStored()).flights;
  }

  /** Summary and rows share one fully validated transaction snapshot. */
  async readStored(): Promise<{graph: RealFlightGraph; flights: RealFlightListItem[]}> {
    const graph = await this.snapshot(), binding = latestRealFlightValues<StoredBinding>(graph.records, 'binding')[0];
    if (!binding) return {graph,flights:[]};
    const rows: RealFlightListItem[] = [];
    for (const flightRow of latestRealFlightRecords(graph.records, 'flight')) {
      const flight = JSON.parse(flightRow.payload) as StoredFlight;
      if (flight.bindingId !== binding.bindingId || flight.accountRef !== binding.accountRef) throw new Error('Foreign real flight record.');
      const factsRow = latestRealFlightRecord(graph.records, 'facts', flightRow.id);
      if (!factsRow) throw new Error('Saved real flight has no validated facts.');
      const stored = JSON.parse(factsRow.payload) as StoredFacts;
      rows.push({ flightId: factsRow.id, bindingId: binding.bindingId, accountRef: binding.accountRef,
        sourceFlightRef: flight.sourceFlightRef, firstCaptureId: flight.firstCaptureId, factsRevision: factsRow.revision,
        facts: stored.facts, unassigned: true });
    }
    return {graph,flights:realFlightClone(rows)};
  }

  async detail(flightId: string): Promise<RealFlightDetail | null> {
    realFlightSha(flightId);
    const graph = await this.snapshot(), flightRow = latestRealFlightRecord(graph.records, 'flight', flightId);
    if (!flightRow) return null;
    const flight = JSON.parse(flightRow.payload) as StoredFlight;
    const binding = latestRealFlightValues<StoredBinding>(graph.records, 'binding')[0];
    realFlightRequire(binding && flight.bindingId === binding.bindingId && flight.accountRef === binding.accountRef, 'Foreign real flight detail.');
    const factsRows = graph.records.filter(row => row.kind === 'facts' && row.id === flightId);
    realFlightRequire(factsRows.length > 0, 'Saved real flight has no validated facts.');
    const factHistory = factsRows.map(row => JSON.parse(row.payload) as StoredFacts);
    const latest = factHistory.at(-1)!;
    const captures = latestRealFlightValues<StoredCapture>(graph.records, 'capture').filter(capture =>
      capture.bindingId === binding.bindingId && factHistory.some(fact => fact.captureId === capture.source.capture.captureId));
    const pending = latestRealFlightValues<import('./real-flight-library-model').StoredPending>(graph.records, 'pending').flatMap(record =>
      record.bindingId !== binding.bindingId ? [] : record.issues.filter(issue => issue.sourceFlightRef === flight.sourceFlightRef)
        .map(issue => ({ captureId: record.captureId, issue })));
    return realFlightClone({ flightId, bindingId: binding.bindingId, accountRef: binding.accountRef,
      sourceFlightRef: flight.sourceFlightRef, firstCaptureId: flight.firstCaptureId, factsRevision: factsRows.at(-1)!.revision,
      facts: latest.facts, unassigned: true as const, factHistory, captures, pending });
  }

  async exportBackup(): Promise<string> {
    const graph = await this.snapshot(); const text = await encodeRealFlightBackup(graph, this.hash);
    realFlightRequire(new TextEncoder().encode(text).length <= REAL_HISTORY_BACKUP_LIMIT, 'Real flight history backup size limit exceeded.');
    await this.gate(false); this.allowed(); return text;
  }

  static async restoreValidated(db: Driver, text: string, ownerId: string, storeId: string, hash: Hash,
    authorize: RealFlightAuthorization, fault: RealFlightFault = async () => {}, gate: RealFlightAccessGate = async () => {}): Promise<RealFlightLibrary> {
    return this.restoreIntoEmptyValidated(db, text, ownerId, storeId, hash, authorize, fault, gate);
  }

  /**
   * Restore into a new database or retry a candidate left at its committed
   * generation-zero manifest. A complete byte-for-byte matching graph is an
   * idempotent success; every other nonempty candidate is preserved and
   * rejected.
   */
  static async restoreIntoEmptyValidated(db: Driver, text: string, ownerId: string, storeId: string, hash: Hash,
    authorize: RealFlightAuthorization, fault: RealFlightFault = async () => {}, gate: RealFlightAccessGate = async () => {}): Promise<RealFlightLibrary> {
    const initial = this.permit(authorize, ownerId, storeId, true);
    const graph = await validateRealFlightBackup(text, ownerId, storeId, hash);
    await gate(true);
    const current = this.permit(authorize, ownerId, storeId, true);
    realFlightRequire(current.leaseId === initial.leaseId, 'Expired real flight history restore lease.');

    await configure(db);
    await gate(true);
    const beforeAccess = this.permit(authorize, ownerId, storeId, true);
    realFlightRequire(beforeAccess.leaseId === initial.leaseId, 'Real flight history restore lease changed before candidate access.');
    const version = await db.first<{ user_version: number }>('PRAGMA user_version');
    const objects = await db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'");
    let library: RealFlightLibrary;
    if (version?.user_version === 0 && objects.length === 0) {
      library = await this.create(db, graph.manifest, hash, authorize, fault, gate);
    } else {
      // Opening validates the full schema, ownership, receipts and source graph
      // before we consider adding anything to an existing candidate.
      library = await this.open(db, ownerId, storeId, hash, authorize, fault, gate);
    }
    realFlightRequire(library.leaseId === initial.leaseId, 'Real flight history restore lease changed during candidate open.');

    const existing = await library.snapshot();
    realFlightRequire(canonical(existing.manifest) === canonical(graph.manifest),
      'Existing real flight history candidate manifest differs from the backup.');
    if (canonical(existing) === canonical(graph)) {
      await gate(true);
      const ready = library.allowed(true);
      realFlightRequire(ready.leaseId === initial.leaseId, 'Real flight history restore lease changed after matching candidate readback.');
      return library;
    }
    realFlightRequire(existing.generation === 0 && existing.receipts.length === 0 && existing.records.length === 0,
      'Existing real flight history candidate is not empty; preserved for recovery.');

    // Match create/open factory ownership: a rejected restore never closes a
    // caller-supplied Driver. The native adapter owns and closes it on failure.
    await db.transaction(async tx => {
      await gate(true);
      const active = this.permit(authorize, ownerId, storeId, true);
      realFlightRequire(active.leaseId === initial.leaseId, 'Expired real flight history restore lease.');
      await checkSchema(tx);
      const currentGraph = await authorizedGraph(tx, active);
      await validateRealFlightGraph(currentGraph, hash);
      if (canonical(currentGraph) === canonical(graph)) return;
      realFlightRequire(canonical(currentGraph.manifest) === canonical(graph.manifest) && currentGraph.generation === 0 &&
        currentGraph.receipts.length === 0 && currentGraph.records.length === 0,
        'Existing real flight history candidate changed or is not empty; preserved for recovery.');
      for (const receipt of graph.receipts) {
        await tx.run('INSERT INTO real_history_receipts VALUES (?,?,?,?,?,?,?,?,?)', receipt.command_id, receipt.owner_id, receipt.kind,
          receipt.base_generation, receipt.generation, receipt.request_json, receipt.request_sha256, receipt.result_json, receipt.committed_at);
        await fault('restore-receipt');
      }
      for (const record of graph.records) {
        await tx.run('INSERT INTO real_history_records VALUES (?,?,?,?,?,?,?,?)', record.seq, record.owner_id, record.kind,
          record.id, record.revision, record.generation, record.payload, record.payload_sha256);
        await fault('restore-record');
      }
      await validateRealFlightGraph(await graphFrom(tx), hash);
      const finalPermit = this.permit(authorize, ownerId, storeId, true);
      realFlightRequire(finalPermit.leaseId === initial.leaseId, 'Expired real flight history restore lease.');
      await fault('restore-before-commit'); await gate(true);
      const commitPermit = this.permit(authorize, ownerId, storeId, true);
      realFlightRequire(commitPermit.leaseId === initial.leaseId, 'Real flight history restore lease changed before publication.');
    });
    await gate(true);
    const afterPublication = this.permit(authorize, ownerId, storeId, true);
    realFlightRequire(afterPublication.leaseId === initial.leaseId, 'Real flight history restore lease changed after publication.');
    const restored = await library.snapshot();
    realFlightRequire(canonical(restored) === canonical(graph), 'Restored real flight history candidate differs from backup.');
    await gate(true); library.allowed(true); return library;
  }
}


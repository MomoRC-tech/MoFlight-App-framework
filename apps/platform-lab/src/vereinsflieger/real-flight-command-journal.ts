// Durable local write-ahead intent journal for the account-scoped flight library.
// This journal records the exact command before the library writer is invoked;
// it does not authenticate a provider account or prove that a receipt exists.
import { canonical } from '@moflight/flight-logbook';
import type { Driver, Connection, Hash } from '../../../../packages/local-data/src/index';
import { REAL_HISTORY_COMMAND_LIMIT, realHistoryUuid } from './real-history-contract';
import { createRealFlightSourceObservation, type RealFlightSourceInput } from './real-flight-source';
import { realFlightBoundedJson, realFlightExactKeys, realFlightRequire, realFlightSha, realFlightTime,
  type RealFlightCommand } from './real-flight-library-model';

export const REAL_FLIGHT_COMMAND_JOURNAL_FAMILY = 'moflight-real-flight-command-journal';
export type RealFlightCommandResolutionOutcome = 'committed' | 'not-committed';

export interface RealFlightCommandJournalPermit {
  ownerId: string; storeId: string; leaseId: string; writable: boolean;
}
export type RealFlightCommandJournalAuthorization = () => RealFlightCommandJournalPermit | null;
export type RealFlightCommandJournalGate = (write: boolean) => Promise<void>;

export class IndeterminateRealFlightCommandJournalWrite extends Error {
  constructor(readonly operation: 'prepare' | 'resolve', readonly commandId: string, options?: ErrorOptions) {
    super('Real flight command journal write outcome requires recovery.', options);
  }
}

interface ManifestRow { singleton: number; family: string; schema_version: number; created_at: string }
interface CommandRow {
  seq: number; owner_id: string; store_id: string; command_id: string; kind: string;
  request_json: string; request_sha256: string; prepared_at: string;
}
interface ResolutionRow {
  seq: number; owner_id: string; store_id: string; command_id: string;
  outcome: string; resolved_at: string;
}
interface ValidatedCommand { command: RealFlightCommand; request: string; requestSha256: string }
interface OwnCommand extends ValidatedCommand { row: CommandRow; latestOutcome: RealFlightCommandResolutionOutcome | null }
interface JournalState { commands: OwnCommand[]; pending: OwnCommand | null }

const manifestSql = `CREATE TABLE real_flight_command_manifest(singleton INTEGER PRIMARY KEY CHECK(singleton=1),family TEXT NOT NULL CHECK(family='${REAL_FLIGHT_COMMAND_JOURNAL_FAMILY}'),schema_version INTEGER NOT NULL CHECK(schema_version=1),created_at TEXT NOT NULL)`;
const commandsSql = `CREATE TABLE real_flight_commands(seq INTEGER PRIMARY KEY AUTOINCREMENT,owner_id TEXT NOT NULL,store_id TEXT NOT NULL,command_id TEXT NOT NULL UNIQUE,kind TEXT NOT NULL CHECK(kind IN ('bind','import-unassigned')),request_json TEXT NOT NULL CHECK(json_valid(request_json)),request_sha256 TEXT NOT NULL,prepared_at TEXT NOT NULL,UNIQUE(owner_id,store_id,command_id))`;
const resolutionsSql = `CREATE TABLE real_flight_command_resolutions(seq INTEGER PRIMARY KEY AUTOINCREMENT,owner_id TEXT NOT NULL,store_id TEXT NOT NULL,command_id TEXT NOT NULL,outcome TEXT NOT NULL CHECK(outcome IN ('committed','not-committed')),resolved_at TEXT NOT NULL,FOREIGN KEY(owner_id,store_id,command_id) REFERENCES real_flight_commands(owner_id,store_id,command_id))`;
const schemaObjects: { name: string; sql: string }[] = [
  { name: 'real_flight_command_manifest', sql: manifestSql },
  { name: 'real_flight_commands', sql: commandsSql },
  { name: 'real_flight_command_resolutions', sql: resolutionsSql },
  { name: 'real_flight_commands_by_scope', sql: 'CREATE INDEX real_flight_commands_by_scope ON real_flight_commands(owner_id,store_id,seq DESC)' },
  { name: 'real_flight_resolutions_by_scope', sql: 'CREATE INDEX real_flight_resolutions_by_scope ON real_flight_command_resolutions(owner_id,store_id,seq)' },
  { name: 'real_flight_command_manifest_no_collision', sql: `CREATE TRIGGER real_flight_command_manifest_no_collision BEFORE INSERT ON real_flight_command_manifest WHEN EXISTS(SELECT 1 FROM real_flight_command_manifest WHERE singleton=NEW.singleton) BEGIN SELECT RAISE(ABORT,'Append-only real flight command journal identity collision'); END` },
  { name: 'real_flight_commands_no_collision', sql: `CREATE TRIGGER real_flight_commands_no_collision BEFORE INSERT ON real_flight_commands WHEN EXISTS(SELECT 1 FROM real_flight_commands WHERE seq=NEW.seq OR command_id=NEW.command_id) BEGIN SELECT RAISE(ABORT,'Append-only real flight command identity collision'); END` },
  { name: 'real_flight_commands_one_pending', sql: `CREATE TRIGGER real_flight_commands_one_pending BEFORE INSERT ON real_flight_commands WHEN EXISTS(SELECT 1 FROM real_flight_commands c WHERE c.owner_id=NEW.owner_id AND c.store_id=NEW.store_id AND NOT EXISTS(SELECT 1 FROM real_flight_command_resolutions r WHERE r.command_id=c.command_id AND r.outcome='committed')) BEGIN SELECT RAISE(ABORT,'An unresolved real flight command already exists'); END` },
  { name: 'real_flight_command_resolutions_no_collision', sql: `CREATE TRIGGER real_flight_command_resolutions_no_collision BEFORE INSERT ON real_flight_command_resolutions WHEN EXISTS(SELECT 1 FROM real_flight_command_resolutions WHERE seq=NEW.seq) BEGIN SELECT RAISE(ABORT,'Append-only real flight command resolution collision'); END` },
  { name: 'real_flight_command_resolutions_valid_transition', sql: `CREATE TRIGGER real_flight_command_resolutions_valid_transition BEFORE INSERT ON real_flight_command_resolutions WHEN NOT EXISTS(SELECT 1 FROM real_flight_commands c WHERE c.command_id=NEW.command_id AND c.owner_id=NEW.owner_id AND c.store_id=NEW.store_id) OR EXISTS(SELECT 1 FROM real_flight_command_resolutions r WHERE r.command_id=NEW.command_id AND (r.outcome='committed' OR r.outcome=NEW.outcome)) BEGIN SELECT RAISE(ABORT,'Invalid real flight command resolution transition'); END` },
  ...['real_flight_command_manifest','real_flight_commands','real_flight_command_resolutions'].flatMap(table =>
    ['UPDATE','DELETE'].map(operation => {
      const name = `${table}_no_${operation.toLowerCase()}`;
      return { name, sql: `CREATE TRIGGER ${name} BEFORE ${operation} ON ${table} BEGIN SELECT RAISE(ABORT,'Append-only real flight command journal'); END` };
    })),
];

/** Exact v1 schema for one native journal shared by multiple owner/store scopes. */
export const REAL_FLIGHT_COMMAND_JOURNAL_SCHEMA = [...schemaObjects.map(object => object.sql), 'PRAGMA user_version=1'].join(';\n') + ';';
const normalizeSql = (sql: string) => sql.trim().replace(/\s+/g, ' ');

function timestamp(value: unknown): asserts value is string {
  realFlightRequire(typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value, 'Invalid real flight command journal timestamp.');
}

function dataRecord(value: unknown): Record<string, unknown> {
  realFlightRequire(value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype,
    'Invalid real flight command.');
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    realFlightRequire(typeof key === 'string' && !!descriptor?.enumerable && 'value' in descriptor, 'Unsupported real flight command properties.');
  }
  return value as Record<string, unknown>;
}

function validateCommandShape(value: unknown, ownerId: string, storeId: string): RealFlightCommand {
  const source = dataRecord(value), kind = source.kind;
  const keys = ['version','kind','ownerId','storeId','commandId','baseGeneration','at', ...(kind === 'bind' ? ['source'] : ['bindingId','source','planToken'])];
  realFlightExactKeys(source, keys);
  realFlightRequire(kind === 'bind' || kind === 'import-unassigned', 'Unsupported real flight command kind.');
  realFlightRequire(source.version === 1 && source.ownerId === ownerId && source.storeId === storeId, 'Foreign or unsupported real flight command.');
  realHistoryUuid(source.ownerId); realHistoryUuid(source.storeId); realHistoryUuid(source.commandId); realFlightTime(source.at);
  realFlightRequire(Number.isSafeInteger(source.baseGeneration) && (source.baseGeneration as number) >= 0, 'Invalid real flight command generation.');
  if (kind === 'import-unassigned') {
    realFlightSha(source.bindingId); realFlightSha(source.planToken);
  }
  return source as unknown as RealFlightCommand;
}

async function validateCommand(value: unknown, ownerId: string, storeId: string, hash: Hash): Promise<ValidatedCommand> {
  const raw = validateCommandShape(value, ownerId, storeId);
  // Validate the caller's source before canonicalizing the complete request,
  // then validate the detached canonical copy that will actually be stored.
  await createRealFlightSourceObservation(raw.source as RealFlightSourceInput, hash);
  const request = realFlightBoundedJson(raw, REAL_HISTORY_COMMAND_LIMIT);
  const command = validateCommandShape(JSON.parse(request), ownerId, storeId);
  const observation = await createRealFlightSourceObservation(command.source, hash);
  if (command.kind === 'import-unassigned') {
    realFlightRequire(observation.coverage.state === 'complete' || observation.coverage.state === 'empty',
      'A partial source window cannot be prepared for real flight history.');
  }
  const requestSha256 = await hash(request); realFlightSha(requestSha256);
  return { command, request, requestSha256 };
}

/**
 * Append-only write-ahead command journal. `not-committed` records an observed
 * recovery result but leaves the command pending so only that exact command
 * may be retried; `committed` closes it. The application must only resolve
 * after it has checked the real library's receipt. These entries are local
 * recovery metadata, not provider authentication or receipt proofs.
 */
export class RealFlightCommandJournal {
  private closed = false;

  private constructor(private readonly db: Driver, private readonly ownerId: string, private readonly storeId: string,
    private readonly leaseId: string, private readonly authorize: RealFlightCommandJournalAuthorization,
    private readonly hash: Hash, private readonly gate: RealFlightCommandJournalGate) {}

  private allowed(write = false): RealFlightCommandJournalPermit {
    realFlightRequire(!this.closed, 'Closed real flight command journal.');
    const value = this.authorize();
    realFlightExactKeys(value, ['ownerId','storeId','leaseId','writable']);
    realFlightRequire(value.ownerId === this.ownerId && value.storeId === this.storeId && typeof value.leaseId === 'string' &&
      value.leaseId === this.leaseId && value.leaseId.length > 0 && typeof value.writable === 'boolean' && (!write || value.writable),
      'Expired or foreign real flight command journal access.');
    return value as unknown as RealFlightCommandJournalPermit;
  }

  private async access(write = false): Promise<RealFlightCommandJournalPermit> {
    const before = this.allowed(write);
    await this.gate(write);
    const after = this.allowed(write);
    realFlightRequire(before.leaseId === after.leaseId, 'Real flight command journal lease changed during access.');
    return after;
  }

  static async open(db: Driver, ownerId: string, storeId: string, authorize: RealFlightCommandJournalAuthorization,
    hash: Hash, create = false, gate: RealFlightCommandJournalGate = async () => {}): Promise<RealFlightCommandJournal> {
    realHistoryUuid(ownerId); realHistoryUuid(storeId);
    const initial = authorize(); realFlightExactKeys(initial, ['ownerId','storeId','leaseId','writable']);
    realFlightRequire(initial.ownerId === ownerId && initial.storeId === storeId && typeof initial.leaseId === 'string' &&
      initial.leaseId.length > 0 && typeof initial.writable === 'boolean' && (!create || initial.writable),
      'Unauthorized real flight command journal access.');
    const journal = new RealFlightCommandJournal(db, ownerId, storeId, initial.leaseId, authorize, hash, gate);
    try {
      await journal.access(create);
      await db.exec('PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL;');
      await journal.access(create);
      const foreignKeys = await db.first<{foreign_keys:number}>('PRAGMA foreign_keys');
      const synchronous = await db.first<{synchronous:number}>('PRAGMA synchronous');
      realFlightRequire(foreignKeys?.foreign_keys === 1 && synchronous?.synchronous === 2, 'Unsafe real flight command journal connection.');
      await journal.access(create);

      if (create) {
        const version = await db.first<{user_version:number}>('PRAGMA user_version');
        const object = await db.first('SELECT name FROM sqlite_master WHERE name NOT LIKE ?', 'sqlite_%');
        realFlightRequire(version?.user_version === 0 && !object, 'Existing real flight command journal preserved.');
        await journal.access(true);
        await db.transaction(async tx => {
          await journal.access(true);
          const currentVersion = await tx.first<{user_version:number}>('PRAGMA user_version');
          const currentObject = await tx.first('SELECT name FROM sqlite_master WHERE name NOT LIKE ?', 'sqlite_%');
          realFlightRequire(currentVersion?.user_version === 0 && !currentObject, 'Existing real flight command journal preserved.');
          await journal.access(true);
          await tx.exec(REAL_FLIGHT_COMMAND_JOURNAL_SCHEMA);
          await journal.access(true);
          await tx.run('INSERT INTO real_flight_command_manifest(singleton,family,schema_version,created_at) VALUES (1,?,?,?)',
            REAL_FLIGHT_COMMAND_JOURNAL_FAMILY, 1, new Date().toISOString());
          await journal.access(true);
        });
      }

      await journal.access(false);
      await journal.checkSchema(db);
      await journal.readManifest(db);
      await journal.readState(db, false);
      await journal.access(false);
      return journal;
    } catch (error) {
      journal.closed = true;
      try { await db.close(); } catch { /* Preserve the original open failure. */ }
      throw error;
    }
  }

  async close(): Promise<void> {
    if (!this.closed) { this.closed = true; await this.db.close(); }
  }

  private async checkSchema(tx: Connection): Promise<void> {
    await this.access(false);
    const version = await tx.first<{user_version:number}>('PRAGMA user_version');
    realFlightRequire(version?.user_version === 1, 'Unsupported real flight command journal version; preserved.');
    await this.access(false);
    const actual = await tx.all<{name:string;sql:string}>("SELECT name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY name");
    const byName = (a:{name:string},b:{name:string}) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    const expected = [...schemaObjects].sort(byName).map(item=>({name:item.name,sql:normalizeSql(item.sql)}));
    realFlightRequire(canonical(actual.map(item=>({name:item.name,sql:normalizeSql(item.sql)})).sort(byName)) === canonical(expected),
      'Unsupported real flight command journal schema; preserved.');
    await this.access(false);
    realFlightRequire((await tx.all('PRAGMA foreign_key_check')).length === 0, 'Broken real flight command journal references.');
    await this.access(false);
    const integrity = await tx.all<{integrity_check:string}>('PRAGMA integrity_check');
    realFlightRequire(integrity.length === 1 && integrity[0]!.integrity_check === 'ok', 'Unreadable real flight command journal.');
    await this.access(false);
  }

  private async readManifest(tx: Connection): Promise<ManifestRow> {
    await this.access(false);
    const rows = await tx.all<ManifestRow>('SELECT * FROM real_flight_command_manifest');
    await this.access(false);
    realFlightRequire(rows.length === 1, 'Missing or duplicate real flight command journal manifest.');
    const row = rows[0]!;
    realFlightExactKeys(row, ['singleton','family','schema_version','created_at']);
    realFlightRequire(row.singleton === 1 && row.family === REAL_FLIGHT_COMMAND_JOURNAL_FAMILY && row.schema_version === 1,
      'Unsupported real flight command journal manifest.');
    timestamp(row.created_at);
    return row;
  }

  private async readState(tx: Connection, writeAccess: boolean): Promise<JournalState> {
    await this.access(writeAccess);
    const commandRows = await tx.all<CommandRow>('SELECT * FROM real_flight_commands WHERE owner_id=? AND store_id=? ORDER BY seq',
      this.ownerId, this.storeId);
    await this.access(writeAccess);
    const resolutionRows = await tx.all<ResolutionRow>('SELECT * FROM real_flight_command_resolutions WHERE owner_id=? AND store_id=? ORDER BY seq',
      this.ownerId, this.storeId);
    const commands: OwnCommand[] = [];
    let previousSeq = 0;
    for (const row of commandRows) {
      realFlightRequire(Number.isSafeInteger(row.seq) && row.seq > previousSeq && row.owner_id === this.ownerId && row.store_id === this.storeId,
        'Invalid scoped real flight command identity.');
      previousSeq = row.seq;
      realHistoryUuid(row.command_id); timestamp(row.prepared_at);
      realFlightRequire(row.kind === 'bind' || row.kind === 'import-unassigned', 'Invalid real flight command kind.');
      let parsed: unknown;
      try { parsed = JSON.parse(row.request_json); } catch { throw new Error('Invalid real flight command request JSON.'); }
      const validated = await validateCommand(parsed, this.ownerId, this.storeId, this.hash);
      realFlightRequire(validated.command.commandId === row.command_id && validated.command.kind === row.kind &&
        validated.request === row.request_json && await this.hash(row.request_json) === row.request_sha256,
        'Real flight command request hash or identity mismatch.');
      realFlightSha(row.request_sha256);
      commands.push({ row, ...validated, latestOutcome: null });
    }

    const byId = new Map(commands.map(command => [command.row.command_id, command]));
    let priorResolutionSeq = 0;
    for (const row of resolutionRows) {
      realFlightRequire(Number.isSafeInteger(row.seq) && row.seq > priorResolutionSeq && row.owner_id === this.ownerId && row.store_id === this.storeId,
        'Invalid scoped real flight command resolution identity.');
      priorResolutionSeq = row.seq;
      realHistoryUuid(row.command_id); timestamp(row.resolved_at);
      realFlightRequire(row.outcome === 'committed' || row.outcome === 'not-committed', 'Invalid real flight command resolution outcome.');
      const command = byId.get(row.command_id);
      realFlightRequire(command, 'Foreign or orphan real flight command resolution.');
      realFlightRequire(command.latestOutcome === null || (command.latestOutcome === 'not-committed' && row.outcome === 'committed'),
        'Invalid real flight command resolution history.');
      command.latestOutcome = row.outcome;
    }

    const pending = commands.filter(command => command.latestOutcome !== 'committed');
    realFlightRequire(pending.length <= 1 && (!pending.length || commands.at(-1) === pending[0]),
      'Invalid unresolved real flight command sequence.');
    await this.access(writeAccess);
    return { commands, pending: pending[0] ?? null };
  }

  /** Persist the exact canonical command before any real-library writer call. */
  async prepare(command: RealFlightCommand): Promise<void> {
    await this.access(true);
    const validated = await validateCommand(command, this.ownerId, this.storeId, this.hash);
    await this.access(true);
    const global = await this.db.first<{owner_id:string;store_id:string}>('SELECT owner_id,store_id FROM real_flight_commands WHERE command_id=?',
      validated.command.commandId);
    await this.access(true);
    if (global && (global.owner_id !== this.ownerId || global.store_id !== this.storeId)) {
      throw new Error('Real flight command ID is already used outside this owner/store.');
    }
    const state = await this.readState(this.db, true);
    if (global) {
      const previous = state.commands.find(item => item.row.command_id === validated.command.commandId);
      realFlightRequire(previous && previous.request === validated.request && previous.requestSha256 === validated.requestSha256,
        'Real flight command ID reused with different input.');
      await this.access(true);
      return;
    }
    realFlightRequire(!state.pending, 'Resolve or retry the pending real flight command before preparing another.');

    let completed = false;
    try {
      await this.db.transaction(async tx => {
        await this.access(true);
        const racedGlobal = await tx.first<{owner_id:string;store_id:string}>('SELECT owner_id,store_id FROM real_flight_commands WHERE command_id=?',
          validated.command.commandId);
        await this.access(true);
        if (racedGlobal) {
          realFlightRequire(racedGlobal.owner_id === this.ownerId && racedGlobal.store_id === this.storeId,
            'Real flight command ID is already used outside this owner/store.');
          const current = await this.readState(tx, true);
          const previous = current.commands.find(item => item.row.command_id === validated.command.commandId);
          realFlightRequire(previous && previous.request === validated.request && previous.requestSha256 === validated.requestSha256,
            'Real flight command ID reused with different input.');
        } else {
          const current = await this.readState(tx, true);
          realFlightRequire(!current.pending, 'Resolve or retry the pending real flight command before preparing another.');
          await this.access(true);
          await tx.run('INSERT INTO real_flight_commands(owner_id,store_id,command_id,kind,request_json,request_sha256,prepared_at) VALUES (?,?,?,?,?,?,?)',
            this.ownerId, this.storeId, validated.command.commandId, validated.command.kind, validated.request, validated.requestSha256, new Date().toISOString());
        }
        await this.access(true); completed = true;
      });
      await this.access(true);
    } catch (error) {
      if (completed) throw new IndeterminateRealFlightCommandJournalWrite('prepare', validated.command.commandId, { cause: error });
      throw error;
    }
  }

  /** Return only this current owner/store's validated unresolved command. */
  async pending(): Promise<RealFlightCommand | null> {
    await this.access(false);
    const state = await this.readState(this.db, false);
    await this.access(false);
    return state.pending ? JSON.parse(state.pending.request) as RealFlightCommand : null;
  }

  /**
   * Append a local recovery outcome after the application has checked the real
   * library receipt. A not-committed observation remains retryable under this
   * exact command ID; only committed clears the pending guard.
   */
  async resolve(commandId: string, outcome: RealFlightCommandResolutionOutcome): Promise<void> {
    await this.access(true);
    realHistoryUuid(commandId);
    realFlightRequire(outcome === 'committed' || outcome === 'not-committed', 'Invalid real flight command resolution outcome.');
    const state = await this.readState(this.db, true);
    const command = state.commands.find(item => item.row.command_id === commandId);
    realFlightRequire(command, 'Unknown real flight command.');
    await this.resolveValidated(commandId, outcome, command.latestOutcome);
  }

  private async resolveValidated(commandId: string, outcome: RealFlightCommandResolutionOutcome,
    existingOutcome: RealFlightCommandResolutionOutcome | null): Promise<void> {
    if (existingOutcome === outcome) { await this.access(true); return; }
    realFlightRequire(existingOutcome !== 'committed', 'A committed real flight command cannot be downgraded.');
    const resolvedAt = new Date().toISOString();
    let completed = false;
    try {
      await this.db.transaction(async tx => {
        await this.access(true);
        const current = await this.readState(tx, true);
        const command = current.commands.find(item => item.row.command_id === commandId);
        realFlightRequire(command, 'Unknown real flight command.');
        if (command.latestOutcome === outcome) {
          await this.access(true); completed = true; return;
        }
        realFlightRequire(command.latestOutcome !== 'committed', 'A committed real flight command cannot be downgraded.');
        await this.access(true);
        await tx.run('INSERT INTO real_flight_command_resolutions(owner_id,store_id,command_id,outcome,resolved_at) VALUES (?,?,?,?,?)',
          this.ownerId, this.storeId, commandId, outcome, resolvedAt);
        await this.access(true); completed = true;
      });
      await this.access(true);
    } catch (error) {
      if (completed) throw new IndeterminateRealFlightCommandJournalWrite('resolve', commandId, { cause: error });
      throw error;
    }
  }
}

import { canonical } from '@moflight/flight-logbook';
import type { Driver, Hash } from '@moflight/local-data';
import type { UserFinancialBackup } from '../user-backup';
import type { FinancialObservationTarget } from './expense-ledger-observation';
import { FinancialObservationStore, validateFinancialObservationBackup, validateFinancialObservationTarget } from './expense-observation-store';
import type { RealFlightNativeScope } from './real-flight-native';
import type { ProviderScope } from './scope-store';

type Gate = () => Promise<void>;
type Permit = { operationId: string; ownerId: string; storeId: string };
type Section = Exclude<UserFinancialBackup, { state: 'absent' }>;
export interface FinancialNativeDependencies {
  file(name: string): { readonly exists: boolean; create(options: { overwrite: false; intermediates: true }): void };
  openDriver(name: string): Promise<Driver>;
  hash: Hash;
  currentProviderScope(ownerId: string): Promise<ProviderScope | null>;
  /** A restore permit must name the actual durable pending aggregate operation. */
  assertRecovery(permit?: Permit): Promise<void>;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const digest = /^[0-9a-f]{64}$/;
let tail: Promise<void> = Promise.resolve();
/** All native financial readers/writers share the same selection lock. */
async function locked<T>(work: () => Promise<T>): Promise<T> {
  const prior = tail; let release!: () => void;
  tail = new Promise<void>(resolve => { release = resolve; }); await prior;
  try { return await work(); } finally { release(); }
}
const schema = `
CREATE TABLE financial_selection_manifest(singleton INTEGER PRIMARY KEY CHECK(singleton=1),target TEXT NOT NULL);
CREATE TABLE financial_restore_preparations(operation_id TEXT PRIMARY KEY,archive_sha256 TEXT NOT NULL,previous_sequence INTEGER NOT NULL);
CREATE TABLE financial_store_selections(seq INTEGER PRIMARY KEY AUTOINCREMENT,operation_id TEXT UNIQUE NOT NULL,archive_sha256 TEXT NOT NULL);
PRAGMA user_version=1;`;
interface Preparation { operation_id: string; archive_sha256: string; previous_sequence: number }
interface Selection { seq: number; operation_id: string; archive_sha256: string }

/** Native file orchestration; aggregate recovery gates every selection change.
 * Originals and all candidates remain on disk, including interrupted attempts. */
export function createFinancialNativeAdapter(deps: FinancialNativeDependencies) {
  const pin = (scope: RealFlightNativeScope): RealFlightNativeScope => ({ ...scope, lease: Object.freeze({ ...scope.lease }) });
  async function target(scope: RealFlightNativeScope, gate: Gate, write: boolean): Promise<FinancialObservationTarget | null> {
    const held = { ownerId: scope.lease.ownerId, storeId: scope.lease.storeId, leaseId: scope.lease.leaseId };
    if (![held.ownerId, held.storeId, held.leaseId].every(id => uuid.test(id))) throw Error('Invalid financial owner lease.');
    const permit = scope.backupRestoreOperationId ? { operationId: scope.backupRestoreOperationId, ownerId: held.ownerId, storeId: held.storeId } : undefined;
    const check = () => {
      const p = scope.authorize();
      if (!p || p.ownerId !== held.ownerId || p.storeId !== held.storeId || p.leaseId !== held.leaseId ||
          typeof p.writable !== 'boolean' || write && !p.writable || scope.lease.ownerId !== held.ownerId ||
          scope.lease.storeId !== held.storeId || scope.lease.leaseId !== held.leaseId) throw Error('Expired or foreign financial owner lease.');
    };
    await gate(); check(); await deps.assertRecovery(permit);
    await scope.registry.assertCurrent(scope.lease, held.ownerId, held.storeId);
    await scope.selectionGate?.(write); check();
    const provider = await deps.currentProviderScope(held.ownerId);
    await gate(); check(); await deps.assertRecovery(permit);
    await scope.registry.assertCurrent(scope.lease, held.ownerId, held.storeId); check();
    if (!provider) return null;
    if (provider.owner !== held.ownerId) throw Error('Foreign financial provider scope.');
    return validateFinancialObservationTarget({ storeId: held.storeId, scope: provider });
  }
  async function guard(scope: RealFlightNativeScope, selected: FinancialObservationTarget, gate: Gate, write: boolean) {
    if (canonical(await target(scope, gate, write)) !== canonical(selected)) throw Error('Financial provider scope changed.');
  }
  async function names(selected: FinancialObservationTarget) {
    const key = await deps.hash(canonical(selected));
    if (!digest.test(key)) throw Error('Invalid financial file digest.');
    const root = `moflight-financial-${key}`;
    return { initial: root + '.sqlite', selection: root + '-selection.sqlite', candidate(id: string) {
      if (!uuid.test(id)) throw Error('Invalid financial restore operation.');
      return root + '-restore-' + id + '.sqlite';
    } };
  }
  function reserve(name: string) {
    const f = deps.file(name);
    if (!f.exists) { f.create({ overwrite: false, intermediates: true }); if (!f.exists) throw Error('Could not reserve financial file.'); }
  }
  async function selectionDb(selected: FinancialObservationTarget, create: boolean, allowed: Gate): Promise<Driver | null> {
    const n = await names(selected); await allowed();
    if (!deps.file(n.selection).exists && !create) return null;
    if (create) reserve(n.selection);
    const db = await deps.openDriver(n.selection);
    try {
      await db.exec('PRAGMA synchronous=FULL;');
      await db.transaction(async tx => {
        await allowed(); const v = await tx.first<{ user_version: number }>('PRAGMA user_version');
        if (v?.user_version === 0) {
          if (!create || (await tx.all("SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'")).length) throw Error('Uninitialized or nonempty financial selection.');
          await tx.exec(schema); await tx.run('INSERT INTO financial_selection_manifest VALUES (1,?)', canonical(selected));
        } else if (v?.user_version !== 1) throw Error('Unsupported financial selection.');
        const m = await tx.first<{ target: string }>('SELECT target FROM financial_selection_manifest WHERE singleton=1');
        if (m?.target !== canonical(selected)) throw Error('Foreign financial selection.');
        await allowed();
      });
      return db;
    } catch (error) { await db.close(); throw error; }
  }
  function validRow(row: Selection) {
    if (!Number.isSafeInteger(row.seq) || row.seq < 1 || !uuid.test(row.operation_id) || !digest.test(row.archive_sha256)) throw Error('Corrupt financial selection.');
    return row;
  }
  function validPrep(p: Preparation) {
    if (!uuid.test(p.operation_id) || !digest.test(p.archive_sha256) || !Number.isSafeInteger(p.previous_sequence) || p.previous_sequence < 0) throw Error('Corrupt financial restore preparation.');
    return p;
  }
  async function selectedName(selected: FinancialObservationTarget, allowed: Gate): Promise<string> {
    const n = await names(selected), db = await selectionDb(selected, false, allowed);
    if (!db) return n.initial;
    try {
      const pending = await db.first<Preparation>('SELECT * FROM financial_restore_preparations WHERE operation_id NOT IN (SELECT operation_id FROM financial_store_selections) LIMIT 1');
      if (pending) { validPrep(pending); throw Error('Financial restore selection is pending.'); }
      const row = await db.first<Selection>('SELECT * FROM financial_store_selections ORDER BY seq DESC LIMIT 1');
      if (!row) return n.initial;
      const prep = await db.first<Preparation>('SELECT * FROM financial_restore_preparations WHERE operation_id=?', validRow(row).operation_id);
      if (!prep || validPrep(prep).archive_sha256 !== row.archive_sha256 || prep.previous_sequence >= row.seq) throw Error('Financial selection preparation is inconsistent.');
      const name = n.candidate(validRow(row).operation_id);
      if (!deps.file(name).exists) throw Error('Selected financial store is missing; preserved for recovery.');
      return name;
    } finally { await db.close(); }
  }
  async function openStore(scope: RealFlightNativeScope, selected: FinancialObservationTarget, name: string, create: boolean, gate: Gate) {
    await guard(scope, selected, gate, create);
    if (!deps.file(name).exists) { if (!create) return null; reserve(name); }
    const db = await deps.openDriver(name);
    try {
      await db.exec('PRAGMA synchronous=FULL;');
      const store = new FinancialObservationStore(db, selected, deps.hash, async mode => guard(scope, selected, gate, mode === 'write'));
      await store.initialize(create); return store;
    } catch (error) { await db.close(); throw error; }
  }
  async function section(selected: FinancialObservationTarget, archive: string): Promise<Section> {
    const graph = await validateFinancialObservationBackup(archive, selected, deps.hash);
    return { state: graph.receipts.length ? 'present' : 'empty', target: selected, archive };
  }
  async function validateSection(input: Section, selected: FinancialObservationTarget) {
    if (canonical(input.target) !== canonical(selected) || canonical(await section(selected, input.archive)) !== canonical(input)) throw Error('Foreign or inconsistent financial section.');
  }
  return {
    currentTarget: (scope: RealFlightNativeScope, gate: Gate) => target(pin(scope), gate, false),
    async withCurrentStore<T>(scope: RealFlightNativeScope, input: FinancialObservationTarget, gate: Gate,
      work: (store: FinancialObservationStore) => Promise<T>): Promise<T> {
      const selected = validateFinancialObservationTarget(input);
      scope = pin(scope);
      if (scope.backupRestoreOperationId) throw Error('Capture cannot use a financial restore permit.');
      return locked(async () => {
        const allowed = () => guard(scope, selected, gate, true); await allowed();
        const name = await selectedName(selected, allowed), n = await names(selected);
        // Only explicit initial setup may initialize a reserved empty file.
        // An already selected restore candidate must retain its valid manifest.
        const store = await openStore(scope, selected, name, name === n.initial, gate);
        if (!store) throw Error('Financial store is unavailable.');
        try { const result = await work(store); await allowed(); return result; } finally { await store.db.close(); }
      });
    },
    async exportSection(scope: RealFlightNativeScope, gate: Gate): Promise<UserFinancialBackup> {
      scope = pin(scope);
      return locked(async () => {
        const selected = await target(scope, gate, false); if (!selected) return { state: 'absent' };
        const allowed = () => guard(scope, selected, gate, false);
        const name = await selectedName(selected, allowed), store = await openStore(scope, selected, name, false, gate);
        if (!store) { await allowed(); return { state: 'absent' }; }
        try { const result = await section(selected, await store.exportBackup()); await allowed(); return result; }
        finally { await store.db.close(); }
      });
    },
    async preflight(scope: RealFlightNativeScope, input: Section, gate: Gate): Promise<void> {
      scope = pin(scope);
      const selected = validateFinancialObservationTarget(input.target);
      await guard(scope, selected, gate, true); await validateSection(input, selected);
      await guard(scope, selected, gate, true);
    },
    async restore(scope: RealFlightNativeScope, input: Section, permit: Permit, gate: Gate): Promise<void> {
      // Detach the caller's text/target before the first asynchronous boundary.
      const selected = validateFinancialObservationTarget(input.target), archive = input.archive;
      const held = { ...permit };
      if (!uuid.test(held.operationId) || held.ownerId !== selected.scope.owner || held.storeId !== selected.storeId ||
          scope.backupRestoreOperationId && scope.backupRestoreOperationId !== held.operationId) throw Error('Foreign financial restore permit.');
      const internal = { ...pin(scope), backupRestoreOperationId: held.operationId };
      return locked(async () => {
        const allowed = () => guard(internal, selected, gate, true);
        await allowed(); await validateSection({ ...input, target: selected, archive }, selected); await allowed();
        const sha = await deps.hash(archive); if (!digest.test(sha)) throw Error('Invalid financial archive digest.');
        const n = await names(selected), candidate = n.candidate(held.operationId);
        const db = await selectionDb(selected, true, allowed); if (!db) throw Error('Financial selection unavailable.');
        try {
          await db.transaction(async tx => {
            await allowed();
            const prior = await tx.first<Preparation>('SELECT * FROM financial_restore_preparations WHERE operation_id=?', held.operationId);
            if (prior) { if (validPrep(prior).archive_sha256 !== sha) throw Error('Financial restore archive changed.'); return; }
            if (await tx.first('SELECT operation_id FROM financial_restore_preparations WHERE operation_id NOT IN (SELECT operation_id FROM financial_store_selections) LIMIT 1')) throw Error('Another financial restore is pending.');
            const current = await tx.first<Selection>('SELECT * FROM financial_store_selections ORDER BY seq DESC LIMIT 1');
            const previous = current ? validRow(current).seq : 0;
            await tx.run('INSERT INTO financial_restore_preparations VALUES (?,?,?)', held.operationId, sha, previous); await allowed();
          });
          const existing = await db.first<Selection>('SELECT * FROM financial_store_selections WHERE operation_id=?', held.operationId);
          if (existing) {
            validRow(existing);
            const current = await db.first<Selection>('SELECT * FROM financial_store_selections ORDER BY seq DESC LIMIT 1');
            if (existing.archive_sha256 !== sha || current?.seq !== existing.seq) throw Error('Financial restore selection changed.');
          }
          if (existing && !deps.file(candidate).exists) throw Error('Selected financial candidate is missing; preserved for recovery.');
          const store = await openStore(internal, selected, candidate, !existing, gate);
          if (!store) throw Error('Financial candidate is unavailable.');
          try {
            if (!existing) await store.restoreBackup(archive);
            if (await store.exportBackup() !== archive) throw Error('Financial candidate verification failed.');
          } finally { await store.db.close(); }
          await allowed();
          await db.transaction(async tx => {
            await allowed();
            const prep = await tx.first<Preparation>('SELECT * FROM financial_restore_preparations WHERE operation_id=?', held.operationId);
            if (!prep || validPrep(prep).archive_sha256 !== sha) throw Error('Financial restore preparation changed.');
            const current = await tx.first<Selection>('SELECT * FROM financial_store_selections ORDER BY seq DESC LIMIT 1');
            if (existing) {
              if (!current || validRow(current).seq !== existing.seq) throw Error('Financial selection changed.');
            } else {
              if ((current ? validRow(current).seq : 0) !== prep.previous_sequence) throw Error('Financial selection changed.');
              await tx.run('INSERT INTO financial_store_selections(operation_id,archive_sha256) VALUES (?,?)', held.operationId, sha);
            }
            await allowed();
          });
          await allowed();
        } finally { await db.close(); }
      });
    },
  };
}

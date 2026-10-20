import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import type { Hash } from '@moflight/local-data';
import { canonical } from '@moflight/flight-logbook';
import { hash, openDriver } from '../storage';
import { RealFlightCommandJournal } from './real-flight-command-journal';
import { RealFlightLibrary, type RealFlightAccessGate, type RealFlightAuthorization, type RealFlightFault } from './real-flight-library';
import { validateRealFlightBackup } from './real-flight-library-model';
import { realHistoryUuid, validateRealHistoryCandidateName, validateRealHistoryManifest,
  type RealHistoryManifest } from './real-history-contract';
import { RealFlightSelection, type RealCandidateOpener, type RealSelectionGate,
  type RealSelectionAuthorization } from './real-flight-selection';
import { RealOwnerRegistry, type RealOwnerLease, type RealOwnerUuidSource } from './real-owner-registry';

export const REAL_OWNER_REGISTRY_FILE_NAME = 'moflight-real-owner-registry-v1.sqlite';
export const REAL_FLIGHT_SELECTION_FILE_NAME = 'moflight-real-history-selection-v1.sqlite';
export const REAL_FLIGHT_COMMAND_JOURNAL_FILE_NAME = 'moflight-real-history-command-journal-v1.sqlite';

/** Only an absent file permits an explicit setup continuation to create it. */
export class RealFlightCandidateMissingError extends Error {
  constructor(readonly candidateName: string) {
    super('Real flight candidate is missing; preserved for recovery.');
  }
}
export class RealFlightUninitializedStoreError extends Error {
  constructor(readonly fileName: string) { super('Reserved real flight store needs explicit setup continuation.'); }
}

export interface RealFlightNativePermit {
  ownerId: string;
  storeId: string;
  leaseId: string;
  writable: boolean;
}

export type RealFlightNativeAuthorization = () => RealFlightNativePermit | null;

export interface RealFlightNativeScope {
  registry: Pick<RealOwnerRegistry, 'assertCurrent'>;
  lease: Readonly<RealOwnerLease>;
  authorize: RealFlightNativeAuthorization;
  /** Optional active-selection guard used by selected-candidate operations. */
  selectionGate?: RealSelectionGate;
}

export interface RealFlightNativeFile {
  readonly exists: boolean;
  create(options: { overwrite: false; intermediates: true }): void;
}

export interface RealFlightNativeDependencies {
  defaultDatabaseDirectory: string;
  file(directory: string, name: string): RealFlightNativeFile;
  openDriver(name: string): ReturnType<typeof openDriver>;
  hash: Hash;
  uuid: RealOwnerUuidSource;
  now(): string;
}

export interface RealFlightNativeAdapter {
  openOwnerRegistry(createExplicitly?: boolean): Promise<RealOwnerRegistry | null>;
  createRealFlightCandidate(scope: RealFlightNativeScope, name: string, manifest: RealHistoryManifest,
    fault?: RealFlightFault, selectionGate?: RealSelectionGate): Promise<RealFlightLibrary>;
  restoreRealFlightCandidate(scope: RealFlightNativeScope, name: string, text: string,
    fault?: RealFlightFault, selectionGate?: RealSelectionGate): Promise<RealFlightLibrary>;
  resumePreparedRealFlightCandidate(scope: RealFlightNativeScope, operationId: string, text: string): Promise<RealFlightLibrary>;
  openRealFlightCandidate(scope: RealFlightNativeScope, name: string,
    selectionGate?: RealSelectionGate): Promise<RealFlightLibrary>;
  resumeInitialRealFlightCandidate(scope: RealFlightNativeScope): Promise<RealFlightLibrary>;
  createRealFlightCandidateOpener(scope: RealFlightNativeScope): RealCandidateOpener<RealFlightLibrary>;
  openRealFlightSelection(scope: RealFlightNativeScope, createExplicitly?: boolean,
    fault?: (stage: string) => Promise<void>): Promise<RealFlightSelection<RealFlightLibrary> | null>;
  openRealFlightCommandJournal(scope: RealFlightNativeScope,
    createExplicitly?: boolean): Promise<RealFlightCommandJournal | null>;
}

const defaultDependencies: RealFlightNativeDependencies = {
  defaultDatabaseDirectory: SQLite.defaultDatabaseDirectory,
  file(directory, name) {
    const base = directory.startsWith('file:') ? directory : 'file://' + directory;
    return new File(base, name);
  },
  openDriver: name => import('./real-flight-native-driver').then(({ openRealFlightNativeDriver }) =>
    openRealFlightNativeDriver(name, (databaseName, options) => SQLite.openDatabaseAsync(databaseName, options))),
  hash,
  uuid: Crypto.randomUUID,
  now: () => new Date().toISOString(),
};

function samePermit(a: RealFlightNativePermit, b: RealFlightNativePermit): boolean {
  return a.ownerId === b.ownerId && a.storeId === b.storeId && a.leaseId === b.leaseId;
}

function readPermit(scope: RealFlightNativeScope, authorize: RealFlightNativeAuthorization,
  write: boolean): RealFlightNativePermit {
  const permit = authorize();
  if (!permit || typeof permit !== 'object' || Array.isArray(permit) ||
      Object.keys(permit).sort().join(',') !== 'leaseId,ownerId,storeId,writable' ||
      typeof permit.ownerId !== 'string' || typeof permit.storeId !== 'string' || typeof permit.leaseId !== 'string' ||
      typeof permit.writable !== 'boolean' || (write && !permit.writable)) {
    throw new Error('Unauthorized real flight native access.');
  }
  realHistoryUuid(permit.ownerId);
  realHistoryUuid(permit.storeId);
  realHistoryUuid(permit.leaseId);
  if (permit.ownerId !== scope.lease.ownerId || permit.storeId !== scope.lease.storeId || permit.leaseId !== scope.lease.leaseId) {
    throw new Error('Expired or foreign real flight owner lease.');
  }
  return { ...permit };
}

async function assertScope(scope: RealFlightNativeScope, authorize: RealFlightNativeAuthorization,
  write: boolean, selectionGate?: RealSelectionGate): Promise<RealFlightNativePermit> {
  const before = readPermit(scope, authorize, write);
  await scope.registry.assertCurrent(scope.lease as RealOwnerLease, before.ownerId, before.storeId);
  if (selectionGate) await selectionGate(write);
  const after = readPermit(scope, authorize, write);
  if (!samePermit(before, after)) throw new Error('Real flight owner lease changed during native access.');
  await scope.registry.assertCurrent(scope.lease as RealOwnerLease, after.ownerId, after.storeId);
  return after;
}

function databaseFile(dependencies: RealFlightNativeDependencies, name: string): RealFlightNativeFile {
  return dependencies.file(dependencies.defaultDatabaseDirectory, name);
}

function reserveFile(file: RealFlightNativeFile): void {
  if (file.exists) throw new Error('Existing real flight database preserved.');
  file.create({ overwrite: false, intermediates: true });
  if (!file.exists) throw new Error('Could not reserve real flight database; existing state preserved.');
}

async function emptyDatabase(db: Awaited<ReturnType<typeof openDriver>>): Promise<boolean> {
  return (await db.first<{user_version:number}>('PRAGMA user_version'))?.user_version === 0 &&
    !(await db.first('SELECT name FROM sqlite_master LIMIT 1'));
}

async function initializeMode(db: Awaited<ReturnType<typeof openDriver>>, fileName: string,
  existed: boolean, explicit: boolean): Promise<boolean> {
  if (!existed) return true;
  if (!await emptyDatabase(db)) return false;
  if (!explicit) throw new RealFlightUninitializedStoreError(fileName);
  return true;
}

function candidateGate(scope: RealFlightNativeScope, authorize: RealFlightNativeAuthorization,
  selectionGate?: RealSelectionGate): RealFlightAccessGate {
  return async write => { await assertScope(scope, authorize, write, selectionGate); };
}

function nativeSelectionAuthorization(authorize: RealFlightNativeAuthorization): RealSelectionAuthorization {
  return authorize;
}

export function createRealFlightNativeAdapter(
  dependencies: RealFlightNativeDependencies = defaultDependencies,
): RealFlightNativeAdapter {
  async function openOwnerRegistry(createExplicitly = false): Promise<RealOwnerRegistry | null> {
    if (typeof createExplicitly !== 'boolean') throw new Error('Invalid owner registry open mode.');
    const file = databaseFile(dependencies, REAL_OWNER_REGISTRY_FILE_NAME);
    const existed = file.exists;
    if (!existed && !createExplicitly) return null;
    if (!existed) reserveFile(file);

    let db: Awaited<ReturnType<typeof openDriver>> | null = null;
    try {
      db = await dependencies.openDriver(REAL_OWNER_REGISTRY_FILE_NAME);
      return await initializeMode(db, REAL_OWNER_REGISTRY_FILE_NAME, existed, createExplicitly)
        ? await RealOwnerRegistry.create(db, dependencies.uuid, dependencies.now())
        : await RealOwnerRegistry.open(db, dependencies.uuid);
    } catch (error) {
      if (db) await db.close();
      throw error;
    }
  }

  async function createRealFlightCandidate(scope: RealFlightNativeScope, name: string, manifest: RealHistoryManifest,
    fault: RealFlightFault = async () => {}, selectionGate = scope.selectionGate): Promise<RealFlightLibrary> {
    validateRealHistoryCandidateName(name);
    const validatedManifest = validateRealHistoryManifest(manifest);
    const permit = await assertScope(scope, scope.authorize, true, selectionGate);
    if (validatedManifest.owner_id !== permit.ownerId || validatedManifest.store_id !== permit.storeId) {
      throw new Error('Candidate manifest does not match the current owner lease.');
    }
    const file = databaseFile(dependencies, name);
    reserveFile(file);
    // File.create reserves the name without overwriting a collision. A switched
    // lease leaves that reserved file in place for recovery rather than deleting it.
    await assertScope(scope, scope.authorize, true, selectionGate);

    let db: Awaited<ReturnType<typeof openDriver>> | null = null;
    let library: RealFlightLibrary | null = null;
    try {
      db = await dependencies.openDriver(name);
      await assertScope(scope, scope.authorize, true, selectionGate);
      const gate = candidateGate(scope, scope.authorize, selectionGate);
      library = await RealFlightLibrary.create(db, validatedManifest, dependencies.hash,
        scope.authorize as RealFlightAuthorization, fault, gate);
      await assertScope(scope, scope.authorize, true, selectionGate);
      return library;
    } catch (error) {
      if (library) await library.close(); else if (db) await db.close();
      throw error;
    }
  }

  async function restoreRealFlightCandidate(scope: RealFlightNativeScope, name: string, text: string,
    fault: RealFlightFault = async () => {}, selectionGate = scope.selectionGate): Promise<RealFlightLibrary> {
    validateRealHistoryCandidateName(name);
    const permit = await assertScope(scope, scope.authorize, true, selectionGate);
    // Validate size, identity, checksum, and the complete replayable graph before
    // reserving a filename. A rejected backup must not leave a candidate behind.
    const graph = await validateRealFlightBackup(text, permit.ownerId, permit.storeId, dependencies.hash);
    if (graph.manifest.owner_id !== permit.ownerId || graph.manifest.store_id !== permit.storeId) {
      throw new Error('Backup manifest does not match the current owner lease.');
    }
    await assertScope(scope, scope.authorize, true, selectionGate);
    const file = databaseFile(dependencies, name);
    reserveFile(file);
    // Once reserved, failures preserve the candidate file for explicit recovery.
    await assertScope(scope, scope.authorize, true, selectionGate);

    let db: Awaited<ReturnType<typeof openDriver>> | null = null;
    let library: RealFlightLibrary | null = null;
    try {
      db = await dependencies.openDriver(name);
      await assertScope(scope, scope.authorize, true, selectionGate);
      const gate = candidateGate(scope, scope.authorize, selectionGate);
      library = await RealFlightLibrary.restoreValidated(db, text, permit.ownerId, permit.storeId,
        dependencies.hash, scope.authorize as RealFlightAuthorization, fault, gate);
      await assertScope(scope, scope.authorize, true, selectionGate);
      return library;
    } catch (error) {
      if (library) await library.close(); else if (db) await db.close();
      throw error;
    }
  }

  async function openCandidateWith(scope: RealFlightNativeScope, name: string,
    authorize: RealFlightNativeAuthorization, selectionGate?: RealSelectionGate): Promise<RealFlightLibrary> {
    validateRealHistoryCandidateName(name);
    await assertScope(scope, authorize, false, selectionGate);
    const file = databaseFile(dependencies, name);
    if (!file.exists) throw new RealFlightCandidateMissingError(name);

    let db: Awaited<ReturnType<typeof openDriver>> | null = null;
    let library: RealFlightLibrary | null = null;
    try {
      db = await dependencies.openDriver(name);
      await assertScope(scope, authorize, false, selectionGate);
      if (await emptyDatabase(db)) throw new RealFlightUninitializedStoreError(name);
      const gate = candidateGate(scope, authorize, selectionGate);
      const permit = readPermit(scope, authorize, false);
      library = await RealFlightLibrary.open(db, permit.ownerId, permit.storeId, dependencies.hash,
        authorize as RealFlightAuthorization, async () => {}, gate);
      await assertScope(scope, authorize, false, selectionGate);
      return library;
    } catch (error) {
      if (library) await library.close(); else if (db) await db.close();
      throw error;
    }
  }

  async function openRealFlightCandidate(scope: RealFlightNativeScope, name: string,
    selectionGate = scope.selectionGate): Promise<RealFlightLibrary> {
    return openCandidateWith(scope, name, scope.authorize, selectionGate);
  }

  /** Resume only the exact reviewed graph and filename already recorded for this owner. */
  async function resumePreparedRealFlightCandidate(scope: RealFlightNativeScope, operationId: string, text: string): Promise<RealFlightLibrary> {
    realHistoryUuid(operationId);
    const permit = await assertScope(scope, scope.authorize, true, scope.selectionGate);
    const graph = await validateRealFlightBackup(text, permit.ownerId, permit.storeId, dependencies.hash);
    const graphSha256 = await dependencies.hash(canonical(graph));
    const preparation = await readPreparation();
    const name = preparation.candidateName;
    async function readPreparation() {
      const selection = await openRealFlightSelection(scope, false);
      if (!selection) throw new Error('Prepared restore journal is missing.');
      try {
        const pending = await selection.getRestorePreparation(operationId);
        if (!pending || pending.status !== 'pending' || pending.expectedGraphSha256 !== graphSha256) {
          throw new Error('Prepared restore is foreign, stale, or differs from the selected backup.');
        }
        return pending;
      } finally { await selection.close(); }
    }
    const preparedGate: RealSelectionGate = async write => {
      if (scope.selectionGate) await scope.selectionGate(write);
      const current = await readPreparation();
      if (current.candidateName !== name) throw new Error('Prepared restore candidate changed.');
    };
    await assertScope(scope, scope.authorize, true, preparedGate);
    if (!databaseFile(dependencies, name).exists) {
      return restoreRealFlightCandidate(scope, name, text, async () => {}, preparedGate);
    }
    let db: Awaited<ReturnType<typeof openDriver>> | null = null;
    let library: RealFlightLibrary | null = null;
    try {
      db = await dependencies.openDriver(name);
      await assertScope(scope, scope.authorize, true, preparedGate);
      const gate = candidateGate(scope, scope.authorize, preparedGate);
      library = await emptyDatabase(db)
        ? await RealFlightLibrary.restoreValidated(db, text, permit.ownerId, permit.storeId, dependencies.hash, scope.authorize, async () => {}, gate)
        : await RealFlightLibrary.restoreIntoEmptyValidated(db, text, permit.ownerId, permit.storeId, dependencies.hash, scope.authorize, async () => {}, gate);
      await assertScope(scope, scope.authorize, true, preparedGate);
      return library;
    } catch (error) {
      if (library) await library.close(); else if (db) await db.close();
      throw error;
    }
  }

  /** Explicit continuation may initialize only the selected owner's original, strictly empty reserved file. */
  async function resumeInitialRealFlightCandidate(scope: RealFlightNativeScope): Promise<RealFlightLibrary> {
    const name = validateRealHistoryCandidateName(scope.lease.candidateName);
    await assertScope(scope, scope.authorize, true, scope.selectionGate);
    const manifest: RealHistoryManifest = { singleton: 1, family: 'moflight-real-flight-history',
      schema_version: 1, payload_version: 1, owner_id: scope.lease.ownerId, store_id: scope.lease.storeId,
      created_at: scope.lease.createdAt };
    if (!databaseFile(dependencies, name).exists) return createRealFlightCandidate(scope, name, manifest);
    let db: Awaited<ReturnType<typeof openDriver>> | null = await dependencies.openDriver(name);
    try {
      await assertScope(scope, scope.authorize, true, scope.selectionGate);
      if (!await emptyDatabase(db)) {
        await db.close(); db = null;
        return openRealFlightCandidate(scope, name);
      }
      const library = await RealFlightLibrary.create(db, manifest, dependencies.hash, scope.authorize,
        async () => {}, candidateGate(scope, scope.authorize, scope.selectionGate));
      db = null;
      return library;
    } finally { if (db) await db.close(); }
  }

  function createRealFlightCandidateOpener(scope: RealFlightNativeScope): RealCandidateOpener<RealFlightLibrary> {
    return (name, authorize, selectionGate) => openCandidateWith(scope, name, authorize, selectionGate);
  }

  async function openRealFlightSelection(scope: RealFlightNativeScope, createExplicitly = false,
    fault: (stage: string) => Promise<void> = async () => {}): Promise<RealFlightSelection<RealFlightLibrary> | null> {
    if (typeof createExplicitly !== 'boolean') throw new Error('Invalid selection journal open mode.');
    const permit = await assertScope(scope, scope.authorize, createExplicitly, scope.selectionGate);
    const file = databaseFile(dependencies, REAL_FLIGHT_SELECTION_FILE_NAME);
    const existed = file.exists;
    if (!existed && !createExplicitly) return null;
    if (!existed) reserveFile(file);
    await assertScope(scope, scope.authorize, createExplicitly, scope.selectionGate);

    let db: Awaited<ReturnType<typeof openDriver>> | null = null;
    let selection: RealFlightSelection<RealFlightLibrary> | null = null;
    try {
      db = await dependencies.openDriver(REAL_FLIGHT_SELECTION_FILE_NAME);
      await assertScope(scope, scope.authorize, createExplicitly, scope.selectionGate);
      selection = await RealFlightSelection.open(db, permit.ownerId, permit.storeId,
        nativeSelectionAuthorization(scope.authorize), createRealFlightCandidateOpener(scope), dependencies.hash,
        await initializeMode(db, REAL_FLIGHT_SELECTION_FILE_NAME, existed, createExplicitly), fault);
      await assertScope(scope, scope.authorize, createExplicitly, scope.selectionGate);
      return selection;
    } catch (error) {
      if (selection) await selection.close(); else if (db) await db.close();
      throw error;
    }
  }

  async function openRealFlightCommandJournal(scope: RealFlightNativeScope,
    createExplicitly = false): Promise<RealFlightCommandJournal | null> {
    if (typeof createExplicitly !== 'boolean') throw new Error('Invalid command journal open mode.');
    const permit = await assertScope(scope, scope.authorize, createExplicitly, scope.selectionGate);
    const file = databaseFile(dependencies, REAL_FLIGHT_COMMAND_JOURNAL_FILE_NAME);
    const existed = file.exists;
    if (!existed && !createExplicitly) return null;
    if (!existed) reserveFile(file);
    await assertScope(scope, scope.authorize, createExplicitly, scope.selectionGate);

    let db: Awaited<ReturnType<typeof openDriver>> | null = null;
    let journal: RealFlightCommandJournal | null = null;
    try {
      db = await dependencies.openDriver(REAL_FLIGHT_COMMAND_JOURNAL_FILE_NAME);
      await assertScope(scope, scope.authorize, createExplicitly, scope.selectionGate);
      journal = await RealFlightCommandJournal.open(db, permit.ownerId, permit.storeId,
        scope.authorize, dependencies.hash,
        await initializeMode(db, REAL_FLIGHT_COMMAND_JOURNAL_FILE_NAME, existed, createExplicitly),
        candidateGate(scope, scope.authorize, scope.selectionGate));
      await assertScope(scope, scope.authorize, createExplicitly, scope.selectionGate);
      return journal;
    } catch (error) {
      if (journal) await journal.close(); else if (db) await db.close();
      throw error;
    }
  }

  return { openOwnerRegistry, createRealFlightCandidate, restoreRealFlightCandidate, resumePreparedRealFlightCandidate,
    openRealFlightCandidate, resumeInitialRealFlightCandidate,
    createRealFlightCandidateOpener, openRealFlightSelection, openRealFlightCommandJournal };
}

const defaultAdapter = createRealFlightNativeAdapter();

export const openOwnerRegistry = (createExplicitly = false) => defaultAdapter.openOwnerRegistry(createExplicitly);
export const createRealFlightCandidate = (scope: RealFlightNativeScope, name: string, manifest: RealHistoryManifest,
  fault?: RealFlightFault, selectionGate?: RealSelectionGate) =>
  defaultAdapter.createRealFlightCandidate(scope, name, manifest, fault, selectionGate);
export const restoreRealFlightCandidate = (scope: RealFlightNativeScope, name: string, text: string,
  fault?: RealFlightFault, selectionGate?: RealSelectionGate) =>
  defaultAdapter.restoreRealFlightCandidate(scope, name, text, fault, selectionGate);
export const resumePreparedRealFlightCandidate = (scope: RealFlightNativeScope, operationId: string, text: string) =>
  defaultAdapter.resumePreparedRealFlightCandidate(scope, operationId, text);
export const openRealFlightCandidate = (scope: RealFlightNativeScope, name: string, selectionGate?: RealSelectionGate) =>
  defaultAdapter.openRealFlightCandidate(scope, name, selectionGate);
export const resumeInitialRealFlightCandidate = (scope: RealFlightNativeScope) => defaultAdapter.resumeInitialRealFlightCandidate(scope);
export const createRealFlightCandidateOpener = (scope: RealFlightNativeScope) =>
  defaultAdapter.createRealFlightCandidateOpener(scope);
export const openRealFlightSelection = (scope: RealFlightNativeScope, createExplicitly = false,
  fault?: (stage: string) => Promise<void>) => defaultAdapter.openRealFlightSelection(scope, createExplicitly, fault);
export const openRealFlightCommandJournal = (scope: RealFlightNativeScope, createExplicitly = false) =>
  defaultAdapter.openRealFlightCommandJournal(scope, createExplicitly);

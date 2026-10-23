import { File } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import { hash, openDriver } from '../storage';
import { authorizeScope, validateScope, type ProviderScope } from './scope-store';
import { InformationStore, INFORMATION_BACKUP_LIMIT } from './information-store';
import { INFORMATION_SELECTION_FILE_NAME, InformationStoreSelection, informationStoreName, withInformationMutation } from './information-selection';
import { restoreInformationBackup as restoreInformationBackupService, type InformationRestoreGate, type InformationRestoreResult } from './information-backup-service';
import { informationCategories, type InformationCapture, type InformationCategory, type InformationHistory } from './information';
import { assertNoPendingUserBackupRestore } from '../user-backup-restore-journal-native';

const directory = SQLite.defaultDatabaseDirectory;
const file = (name: string) => new File(directory.startsWith('file:') ? directory : 'file://' + directory, name);
const databaseExists = (name: string) => file(name).exists;

async function authorized(scope: ProviderScope, gate: () => void, ownerGate?: () => Promise<void>) {
  gate(); await ownerGate?.(); const registry = await openDriver('vereinsflieger-owner-registry.sqlite');
  try { await authorizeScope(registry, scope); await ownerGate?.(); gate(); } finally { await registry.close(); }
}
async function openSelection(scope: ProviderScope, create: boolean, gate: () => void, ownerGate?: () => Promise<void>): Promise<InformationStoreSelection | null> {
  await authorized(scope, gate, ownerGate);
  const selectionFile = file(INFORMATION_SELECTION_FILE_NAME);
  const existed = selectionFile.exists;
  if (!existed && !create) return null;
  if (!existed) {
    selectionFile.create({ overwrite: false, intermediates: true });
    if (!selectionFile.exists) throw new Error('Could not reserve information selection journal.');
  }
  const db = await openDriver(INFORMATION_SELECTION_FILE_NAME);
  try {
    await db.exec('PRAGMA synchronous=FULL;');
    const selection = new InformationStoreSelection(db, scope, () => authorized(scope, gate, ownerGate));
    await selection.initialize(create || !existed);
    return selection;
  } catch (error) { await db.close(); throw error; }
}

async function withStore<T>(input: ProviderScope, create: boolean, gate: () => void, work: (store: InformationStore) => Promise<T>): Promise<T | null> {
  const scope = validateScope(input); await assertNoPendingUserBackupRestore(); await authorized(scope, gate);
  let name = informationStoreName(scope);
  const selection = await openSelection(scope, false, gate);
  if (selection) {
    try {
      const pending = await selection.pending();
      if (create && pending) throw new Error('Resolve the pending information restore before writing.');
      const snapshot = await selection.snapshot();
      if (snapshot.selection) {
        name = snapshot.selection.databaseName;
        if (!databaseExists(name)) throw new Error('Selected information store is missing; preserved for recovery.');
      }
    } finally { await selection.close(); }
  }
  if (!create && !databaseExists(name)) return null;
  const db = await openDriver(name);
  try {
    await db.exec('PRAGMA synchronous=FULL;');
    const store = new InformationStore(db, scope, () => authorized(scope, gate));
    await store.initialize(create); const result = await work(store); gate(); await assertNoPendingUserBackupRestore(); return result;
  } finally { await db.close(); }
}
export async function loadInformation(scope: ProviderScope, gate: () => void = () => {}) {
  return await withStore(scope, false, gate, store => store.latest()) ?? [];
}
export async function saveInformation(scope: ProviderScope, capture: InformationCapture, gate: () => void) {
  await withInformationMutation(async () => { await withStore(scope, true, gate, store => store.save(capture)); });
}
export async function readInformationCapture(scope: ProviderScope, id: string, gate: () => void): Promise<InformationCapture | null> {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error('Invalid information capture identity');
  return await withStore(scope, false, gate, store => store.find(id));
}
export async function readInformationHistory(scope: ProviderScope, category: InformationCategory, index: number, gate: () => void): Promise<InformationHistory> {
  if (!informationCategories.includes(category) || !Number.isSafeInteger(index) || index < 0) throw new Error('Invalid information history request');
  const result = await withStore(scope, false, gate, store => store.history(category, index));
  if (!result && index) throw new Error('Saved information position unavailable');
  return result ?? { category, index: 0, total: 0, capture: null };
}

/** Export the currently selected source snapshot; null means no local source store exists yet. */
export async function exportInformationBackup(scope: ProviderScope, gate: () => void = () => {}): Promise<string | null> {
  const result = await withStore(scope, false, gate, store => store.exportBackup(hash));
  if (result !== null && new TextEncoder().encode(result).length > INFORMATION_BACKUP_LIMIT) throw new Error('Information backup size limit exceeded.');
  return result;
}

/** Stage, validate and select a new same-owner information snapshot; resume by reselecting the same archive and operation ID. */
export async function restoreInformationBackupNative(scopeInput: ProviderScope, text: string, gate: InformationRestoreGate,
  resumeOperationId?: string, ownerGate: () => Promise<void> = async () => {}): Promise<InformationRestoreResult> {
  const scope = validateScope(scopeInput);
  return restoreInformationBackupService(scope, text, hash, gate, {
    openSelection: (current, create) => openSelection(current, create, () => {}, ownerGate),
    informationFileExists: databaseExists,
    async openInformationStore(current, name) {
      const db = await openDriver(name);
      await db.exec('PRAGMA synchronous=FULL;');
      return new InformationStore(db, current, () => authorized(current, () => {}, ownerGate));
    },
    uuid: Crypto.randomUUID,
    now: () => new Date().toISOString(),
  }, resumeOperationId);
}

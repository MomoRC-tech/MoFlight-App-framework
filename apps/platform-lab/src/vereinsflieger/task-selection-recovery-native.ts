import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';
import { File } from 'expo-file-system';
import { canonical } from '@moflight/flight-logbook';
import { openDriver } from '../storage';
import { assertNoPendingUserBackupRestore } from '../user-backup-restore-journal-native';
import { authorizeScope, validateScope, type ProviderScope } from './scope-store';
import {
  clearTaskSelectionRecovery as clear,
  loadPendingTaskSelectionRecovery as load,
  rememberTaskSelectionRecovery as remember,
  type TaskSelectionRecovery,
  validateTaskSelectionRecovery,
} from './task-selection-recovery';

const REGISTRY = 'vereinsflieger-owner-registry.sqlite';
const JOURNAL_PREFIX = 'vereinsflieger-task-selector-';
const directory = SQLite.defaultDatabaseDirectory;
const localFile = (name: string) => new File(directory.startsWith('file:') ? directory : 'file://' + directory, name);

async function journalName(scope: ProviderScope): Promise<string> {
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, canonical(validateScope(scope)));
  if (!/^[0-9a-f]{64}$/.test(digest)) throw new Error('Task selector recovery scope could not be protected.');
  return JOURNAL_PREFIX + digest + '.sqlite';
}

async function authorize(scope: ProviderScope, gate: () => void) {
  gate(); await assertNoPendingUserBackupRestore(); gate();
  const registry = await openDriver(REGISTRY);
  try { await authorizeScope(registry, scope); }
  finally { await registry.close(); }
  gate(); await assertNoPendingUserBackupRestore(); gate();
}

async function openJournal(scopeInput: ProviderScope, create: boolean, gate: () => void) {
  const scope = validateScope(scopeInput);
  await authorize(scope, gate);
  const name = await journalName(scope), path = localFile(name);
  if (!path.exists) {
    if (!create) { await authorize(scope, gate); return null; }
    path.create({ overwrite: false, intermediates: true });
    if (!path.exists) throw new Error('Task selector recovery file could not be reserved.');
  }
  const db = await openDriver(name);
  try { await db.exec('PRAGMA synchronous=FULL;'); await authorize(scope, gate); return db; }
  catch (error) { await db.close(); throw error; }
}

/** Reads only the current full provider scope's local recovery checkpoint. */
export async function loadTaskSelectionRecovery(scope: ProviderScope, gate: () => void = () => {}): Promise<TaskSelectionRecovery | null> {
  const db = await openJournal(scope, false, gate);
  if (!db) return null;
  try { gate(); const value = await load(db, scope, gate); await authorize(validateScope(scope), gate); return value; }
  finally { await db.close(); }
}

/** Durable checkpoint is committed and read back before changing the provider selector. */
export async function saveTaskSelectionRecovery(scope: ProviderScope, value: TaskSelectionRecovery, gate: () => void = () => {}): Promise<TaskSelectionRecovery> {
  const checkedScope = validateScope(scope), checkedValue = validateTaskSelectionRecovery(value, checkedScope);
  const db = await openJournal(checkedScope, true, gate);
  if (!db) throw new Error('Task selector recovery file could not be opened.');
  try { gate(); const saved = await remember(db, checkedValue, gate); await authorize(checkedScope, gate); return saved; }
  finally { await db.close(); }
}

/** Clears only the matching checkpoint after the provider returned the exact selector. */
export async function clearTaskSelectionRecovery(scope: ProviderScope, expected: TaskSelectionRecovery, gate: () => void = () => {}): Promise<void> {
  const checkedScope = validateScope(scope), checkedExpected = validateTaskSelectionRecovery(expected, checkedScope);
  const db = await openJournal(checkedScope, false, gate);
  if (!db) throw new Error('Task selector recovery file is unavailable.');
  try { gate(); await clear(db, checkedScope, checkedExpected, gate); await authorize(checkedScope, gate); }
  finally { await db.close(); }
}

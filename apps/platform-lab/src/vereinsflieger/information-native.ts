import { File } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import { openDriver } from '../storage';
import { authorizeScope, validateScope, type ProviderScope } from './scope-store';
import { InformationStore } from './information-store';
import { informationCategories, type InformationCapture, type InformationCategory, type InformationHistory } from './information';

async function authorized(scope: ProviderScope, gate: () => void) {
  gate(); const registry = await openDriver('vereinsflieger-owner-registry.sqlite');
  try { await authorizeScope(registry, scope); gate(); } finally { await registry.close(); }
}
async function withStore<T>(input: ProviderScope, create: boolean, gate: () => void, work: (store: InformationStore) => Promise<T>): Promise<T | null> {
  const scope = validateScope(input); await authorized(scope, gate);
  const name = `vereinsflieger-information-${scope.connectionId}.sqlite`;
  const directory = SQLite.defaultDatabaseDirectory;
  if (!create && !new File(directory.startsWith('file:') ? directory : 'file://' + directory, name).exists) return null;
  const db = await openDriver(name);
  try {
    await db.exec('PRAGMA synchronous=FULL;');
    const store = new InformationStore(db, scope, () => authorized(scope, gate));
    await store.initialize(create); const result = await work(store); gate(); return result;
  } finally { await db.close(); }
}
export async function loadInformation(scope: ProviderScope, gate: () => void = () => {}) {
  return await withStore(scope, false, gate, store => store.latest()) ?? [];
}
export async function saveInformation(scope: ProviderScope, capture: InformationCapture, gate: () => void) {
  await withStore(scope, true, gate, store => store.save(capture));
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

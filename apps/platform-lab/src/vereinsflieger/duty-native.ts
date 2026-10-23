import { Directory, File, Paths } from 'expo-file-system';
import { openDriver } from '../storage';
import { authorizeScope, validateScope, type ProviderScope } from './scope-store';
import { DutyRosterStore } from './duty-store';
import type { DutyRosterSnapshot } from './duties';
import { assertNoPendingUserBackupRestore } from '../user-backup-restore-journal-native';

async function authorized(scope: ProviderScope, gate: () => void) {
  gate(); const registry = await openDriver('vereinsflieger-owner-registry.sqlite');
  try { await authorizeScope(registry, scope); gate(); } finally { await registry.close(); }
}
async function withStore<T>(input: ProviderScope, create: boolean, gate: () => void, now: () => number, work: (store: DutyRosterStore) => Promise<T>): Promise<T | null> {
  const scope = validateScope(input); await assertNoPendingUserBackupRestore(); await authorized(scope, gate);
  // The complete account/club-label context is additionally verified by manifest.
  // OS cache is excluded from platform backups and may be evicted independently.
  const name = `vereinsflieger-duty-roster-${scope.connectionId}.sqlite`;
  const cache = new Directory(Paths.cache, 'vereinsflieger-duty-roster'), directory = cache.uri;
  if (!create && !new File(directory.startsWith('file:') ? directory : 'file://' + directory, name).exists) return null;
  gate();
  if (create) cache.create({ idempotent: true, intermediates: true });
  const db = await openDriver(name, directory);
  try {
    await db.exec('PRAGMA synchronous=FULL; PRAGMA secure_delete=ON;');
    const store = new DutyRosterStore(db, scope, () => authorized(scope, gate), now);
    await store.initialize(create); const result = await work(store); gate(); await assertNoPendingUserBackupRestore(); return result;
  } finally { await db.close(); }
}
export async function loadDutyRoster(scope: ProviderScope, gate: () => void = () => {}, now: () => number = Date.now): Promise<DutyRosterSnapshot | null> {
  return await withStore(scope, false, gate, now, store => store.load());
}
export async function saveDutyRoster(scope: ProviderScope, snapshot: DutyRosterSnapshot, gate: () => void, now: () => number = Date.now) {
  await withStore(scope, true, gate, now, store => store.save(snapshot));
}

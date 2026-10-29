import { Directory, File, Paths } from 'expo-file-system';
import { hash } from './storage';
import { assertNoPendingUserBackupRestore } from './user-backup-restore-journal-native';
import { decodeDutyCalculation, decodeDutyTarget, dutyTargetKey, dutyTargetScopeKey, validateDutyTargetArchive, validDutyTargetHours, type DutyCalculation, type DutyTargetArchive, type DutyTargetScope } from './duty-target';

type Permit = { operationId: string; ownerId: string; storeId: string };
let locked = false;
let storageRevision = 0;
const listeners = new Set<() => void>();
export function subscribeDutyTargets(listener: () => void): () => void { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function notifyDutyTargetsChanged(): void { for (const listener of listeners) listener(); }
/** One app-process lock covers target edits, export snapshots and aggregate restore. */
export async function withDutyTargetLock<T>(work: () => Promise<T>): Promise<T> {
  if (locked) throw new Error('Duty target storage is busy.');
  locked = true; storageRevision++;
  try { return await work(); } finally { locked = false; }
}
const fileFor = async (key: string) => new File(Paths.document, `cockpit-duty-${await hash(key)}.json`);
const calculationFileFor = async (key: string) => new File(Paths.document, `cockpit-duty-calculation-${await hash(key)}.json`);
async function readCalculationFiles(file: File, key: string): Promise<DutyCalculation | null> {
  let latest: DutyCalculation | null = null, unreadable = false;
  for (const candidate of [file, new File(Paths.document, `${file.name}.previous`)]) {
    if (!candidate.exists) continue;
    let value: ReturnType<typeof decodeDutyCalculation>;
    try { value = decodeDutyCalculation(await candidate.text()); } catch { unreadable = true; continue; }
    if (value.key !== key) throw new Error('Foreign duty calculation file.');
    if (!latest || value.retrievedAt > latest.retrievedAt) latest = {hours:value.hours,retrievedAt:value.retrievedAt};
  }
  if (!latest && unreadable) throw new Error('Unreadable duty calculation.');
  return latest;
}
export async function readDutyCalculationNative(key: string): Promise<DutyCalculation | null> {
  const started = storageRevision;
  await assertNoPendingUserBackupRestore();
  if (locked || started !== storageRevision) throw new Error('Duty target storage is busy.');
  const file = await calculationFileFor(key);
  const value = await readCalculationFiles(file,key);
  await assertNoPendingUserBackupRestore();
  if (locked || started !== storageRevision) throw new Error('Duty target storage is busy.');
  return value;
}
export async function saveDutyCalculationNative(key: string, calculation: DutyCalculation, current: () => boolean): Promise<DutyCalculation | null> {
  return withDutyTargetLock(async () => {
    await assertNoPendingUserBackupRestore();
    const payload = JSON.stringify({ version: 1, key, ...calculation }); decodeDutyCalculation(payload);
    const file = await calculationFileFor(key);
    const previous = await readCalculationFiles(file,key);
    await assertNoPendingUserBackupRestore();
    if (!current()) return null;
    if (previous && previous.retrievedAt >= calculation.retrievedAt) return { hours: previous.hours, retrievedAt: previous.retrievedAt };
    if (previous) {
      const original = new File(Paths.document, `${file.name}.previous`);
      const before = JSON.stringify({version:1,key,...previous});
      original.write(before);
      if (await original.text() !== before) throw new Error('Duty calculation preservation failed.');
    }
    await assertNoPendingUserBackupRestore();
    if (!current()) return null;
    file.write(payload);
    if (await file.text() !== payload) throw new Error('Duty calculation readback failed.');
    return current() ? calculation : null;
  });
}
export async function clearDutyTargetNative(key: string, current: () => boolean): Promise<boolean> {
  const cleared = await withDutyTargetLock(async () => {
    await assertNoPendingUserBackupRestore();
    const file = await fileFor(key);
    if (file.exists && decodeDutyTarget(await file.text()).key !== key) throw new Error('Foreign duty target destination.');
    await assertNoPendingUserBackupRestore();
    if (!current()) return false;
    if (file.exists) file.delete();
    if (file.exists) throw new Error('Duty target reset failed.');
    return current();
  });
  if (cleared) notifyDutyTargetsChanged();
  return cleared;
}
export async function readDutyTargetNative(key: string): Promise<number | null> {
  const started = storageRevision;
  await assertNoPendingUserBackupRestore();
  if (locked || started !== storageRevision) throw new Error('Duty target storage is busy.');
  const file = await fileFor(key);
  await assertNoPendingUserBackupRestore();
  if (locked || started !== storageRevision) throw new Error('Duty target storage is busy.');
  if (!file.exists) return null;
  const text = await file.text();
  await assertNoPendingUserBackupRestore();
  if (locked || started !== storageRevision) throw new Error('Duty target storage is busy.');
  const value = decodeDutyTarget(text);
  if (value.key !== key) throw new Error('Foreign duty target file.');
  return value.hours;
}
export async function saveDutyTargetNative(key: string, hours: number, current: () => boolean): Promise<boolean> {
  const saved = await withDutyTargetLock(async () => {
    await assertNoPendingUserBackupRestore();
    const payload = JSON.stringify({ version: 1, key, hours }); decodeDutyTarget(payload);
    if (!validDutyTargetHours(hours) || !current()) return false;
    const file = await fileFor(key);
    await assertNoPendingUserBackupRestore();
    if (!current()) return false;
    file.write(payload);
    if (await file.text() !== payload) throw new Error('Duty target readback failed.');
    return current();
  });
  if (saved) notifyDutyTargetsChanged();
  return saved;
}
/** Called only while the aggregate operation holds withDutyTargetLock. */
export async function exportDutyTargetsNative(scope: DutyTargetScope | null, gate: () => Promise<void>): Promise<DutyTargetArchive> {
  if (!locked) throw new Error('Duty target archive lock is required.');
  await gate(); await assertNoPendingUserBackupRestore();
  if (!scope) return { scope: null, targets: [] };
  const scopeKey = dutyTargetScopeKey(scope), targets: DutyTargetArchive['targets'] = [];
  for (const file of new Directory(Paths.document).list()) {
    if (!(file instanceof File) || !/^cockpit-duty-[0-9a-f]{64}\.json$/.test(file.name)) continue;
    if (file.size > 2048) throw new Error('Duty target file size limit exceeded.');
    const text = await file.text();
    // Legacy development previews used opaque synthetic scope strings. Identify the
    // requested scope before validating contents so unrelated preferences stay inert.
    const envelope = JSON.parse(text) as { key?: unknown } | null;
    if (!envelope || typeof envelope.key !== 'string') throw new Error('Unreadable duty target file key.');
    const key: unknown = JSON.parse(envelope.key);
    if (!Array.isArray(key) || key.length !== 2 || typeof key[0] !== 'string') throw new Error('Unreadable duty target file scope.');
    if (key[0] !== scopeKey) continue;
    const value = decodeDutyTarget(text);
    if (file.name !== `cockpit-duty-${await hash(value.key)}.json`) throw new Error('Duty target filename mismatch.');
    if (dutyTargetScopeKey(value.scope) === scopeKey) targets.push({ year: value.year, hours: value.hours });
    await gate();
  }
  targets.sort((a, b) => a.year - b.year);
  return validateDutyTargetArchive({ scope, targets }, scope.ownerId, scope.storeId, scope.accountRef);
}
/** Idempotent per-year merge. Durable aggregate pending state hides partial writes until recovery. */
export async function preflightDutyTargetsNative(archive: DutyTargetArchive, gate: () => Promise<void>): Promise<void> {
  if (!locked) throw new Error('Duty target archive lock is required.');
  if (!archive.scope) return;
  for (const target of archive.targets) {
    const key = dutyTargetKey(dutyTargetScopeKey(archive.scope), target.year), file = await fileFor(key);
    await gate();
    if (file.exists && decodeDutyTarget(await file.text()).key !== key) throw new Error('Foreign duty target destination.');
  }
}
export async function restoreDutyTargetsNative(archive: DutyTargetArchive, permit: Permit, gate: () => Promise<void>): Promise<void> {
  if (!locked) throw new Error('Duty target archive lock is required.');
  const value = validateDutyTargetArchive(archive, permit.ownerId, permit.storeId, archive.scope?.accountRef ?? null);
  if (!value.scope) return;
  // Preflight ran before journal preparation; interrupted destinations can be repaired on replay.
  const destinations: Array<{ file: File; payload: string }> = [];
  for (const target of value.targets) {
    const key = dutyTargetKey(dutyTargetScopeKey(value.scope!), target.year), file = await fileFor(key);
    await gate(); await assertNoPendingUserBackupRestore(permit);
    const original = new File(Paths.document, `${file.name}.restore-${permit.operationId}.original`);
    if (file.exists && !original.exists) {
      const before = await file.text();
      if (decodeDutyTarget(before).key !== key) throw new Error('Foreign duty target destination.');
      original.write(before);
      if (await original.text() !== before) throw new Error('Original duty target preservation failed.');
    } else if (!file.exists && !original.exists) {
      original.write('absent');
      if (await original.text() !== 'absent') throw new Error('Duty target absence preservation failed.');
    } else if (original.exists) {
      // A failed original write can be retried while the still-valid destination survives.
      try { if (await original.text() !== 'absent' && decodeDutyTarget(await original.text()).key !== key) throw new Error('Foreign original duty target.'); }
      catch {
        if (!file.exists) {
          original.write('absent');
          if (await original.text() !== 'absent') throw new Error('Duty target absence preservation failed.');
          destinations.push({ file, payload: JSON.stringify({ version: 1, key, hours: target.hours }) });
          continue;
        }
        const before = await file.text();
        if (decodeDutyTarget(before).key !== key) throw new Error('Original duty target requires recovery.');
        original.write(before);
        if (await original.text() !== before) throw new Error('Original duty target preservation failed.');
      }
    }
    destinations.push({ file, payload: JSON.stringify({ version: 1, key, hours: target.hours }) });
  }
  for (const { file, payload } of destinations) {
    await gate(); await assertNoPendingUserBackupRestore(permit);
    file.write(payload);
    if (await file.text() !== payload) throw new Error('Duty target restore readback failed.');
  }
  await gate();
}

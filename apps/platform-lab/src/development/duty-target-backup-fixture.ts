import { File, Paths } from 'expo-file-system';
import { hash } from '../storage';
import { dutyTargetKey, dutyTargetScopeKey, validateDutyTargetArchive, type DutyTargetScope } from '../duty-target';
import { exportDutyTargetsNative, preflightDutyTargetsNative, readDutyTargetNative, restoreDutyTargetsNative, saveDutyTargetNative, withDutyTargetLock } from '../duty-target-native';
import { assertNoPendingUserBackupRestore } from '../user-backup-restore-journal-native';

const scope: DutyTargetScope = { ownerId: 'dadadada-1111-4111-8111-111111111111', storeId: 'dadadada-2222-4222-8222-222222222222', accountRef: '999990001' };
const foreign = { ...scope, accountRef: '999990002' };
const foreignStore = { ...scope, storeId: 'dadadada-3333-4333-8333-333333333333' };
const foreignOwner = { ...scope, ownerId: 'dadadada-4444-4444-8444-444444444444' };
const permit = { ownerId: scope.ownerId, storeId: scope.storeId, operationId: 'dadadada-5555-4555-8555-555555555555' };
let running = false;
/** Bounded native leaf witness; fixed synthetic identities only, original fixture bytes restored in finally. */
export async function runDutyTargetBackupFixture(): Promise<{ checks: string[]; limitation: string }> {
  if (running) throw new Error('Duty target fixture is already running.');
  running = true;
  const saved: Array<{ file: File; before: string | null }> = [], checks: string[] = [], cleanupErrors: unknown[] = [];
  let result: { checks: string[]; limitation: string } | undefined, workFailed = false, workError: unknown;
  const gate = () => assertNoPendingUserBackupRestore();
  const key = (s: DutyTargetScope, year: number) => dutyTargetKey(dutyTargetScopeKey(s), year);
  const rows = [{ scope, year: 2024, hours: 14 }, { scope, year: 2025, hours: 0 }, { scope, year: 2026, hours: 37.5 },
    { scope: foreign, year: 2026, hours: 88 }, { scope: foreignStore, year: 2026, hours: 77 }, { scope: foreignOwner, year: 2026, hours: 66 }];
  try {
    await gate();
    // Preserve exact known fixture files, including earlier recovery originals; no directory cleanup.
    for (const row of rows) {
      const file = new File(Paths.document, `cockpit-duty-${await hash(key(row.scope,row.year))}.json`);
      saved.push({ file, before: file.exists ? await file.text() : null });
      if (row.scope === scope && row.year >= 2025) {
        const original = new File(Paths.document, `${file.name}.restore-${permit.operationId}.original`);
        saved.push({ file: original, before: original.exists ? await original.text() : null });
        if (original.exists) original.delete();
      }
    }
    for (const row of rows) {
      if (!await saveDutyTargetNative(key(row.scope,row.year),row.hours,()=>true)) throw new Error('Synthetic target write failed.');
      if (await readDutyTargetNative(key(row.scope,row.year)) !== row.hours) throw new Error('Synthetic target reopen mismatch.');
    }
    checks.push('native target write/readback/reopen, confirmed zero and three foreign scope boundaries');
    const archive = await withDutyTargetLock(() => exportDutyTargetsNative(scope,gate));
    if (JSON.stringify(archive.targets) !== JSON.stringify([{year:2024,hours:14},{year:2025,hours:0},{year:2026,hours:37.5}])) throw new Error('All-year target export mismatch.');
    checks.push('selected account export includes every configured year');
    const merge = { scope, targets: archive.targets.filter(row=>row.year>=2025) };
    await saveDutyTargetNative(key(scope,2025),55,()=>true);
    await saveDutyTargetNative(key(scope,2026),60,()=>true);
    await withDutyTargetLock(async () => { await preflightDutyTargetsNative(merge,gate); await restoreDutyTargetsNative(merge,permit,gate); await restoreDutyTargetsNative(merge,permit,gate); });
    for (const row of rows) if (await readDutyTargetNative(key(row.scope,row.year)) !== row.hours) throw new Error('Restored target or foreign preservation mismatch.');
    checks.push('native restore/replay/reopen preserves zero, unrelated year, foreign owner/store/account');
    let rejected = false;
    try { validateDutyTargetArchive({ scope, targets:[{year:2026,hours:1},{year:2026,hours:2}] },scope.ownerId,scope.storeId,scope.accountRef); } catch { rejected=true; }
    if (!rejected) throw new Error('Malformed target archive was accepted.');
    checks.push('duplicate-year archive rejected before native writes');
    result = { checks, limitation:'Actual native target files only. Full aggregate codec/service, SAF picker, process-kill recovery, Android update and iOS acceptance are separate.' };
  } catch (error) { workFailed=true; workError=error; }
  finally {
    for (const { file,before } of saved.reverse()) {
      try {
        if (before === null) { if (file.exists) file.delete(); if (file.exists) cleanupErrors.push(new Error(`Synthetic duty target cleanup deletion failed: ${file.name}`)); }
        else { file.write(before); if (await file.text() !== before) cleanupErrors.push(new Error(`Synthetic duty target cleanup readback failed: ${file.name}`)); }
      } catch (error) { cleanupErrors.push(error); }
    }
    running=false;
  }
  if (cleanupErrors.length) throw new AggregateError([...(workFailed ? [workError] : []),...cleanupErrors], 'Synthetic duty target cleanup could not restore every fixture file.');
  if (workFailed) throw workError;
  return result!;
}

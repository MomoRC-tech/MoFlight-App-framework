import * as Crypto from 'expo-crypto';
import { canonical } from '@moflight/flight-logbook';
import { openDriver } from '../storage';
import { SCOPE_SCHEMA, bindScope, type ProviderScope } from '../vereinsflieger/scope-store';
import { loadInformation, saveAndLoadInformation } from '../vereinsflieger/information-native';
import { loadDutyRoster, saveAndLoadDutyRoster } from '../vereinsflieger/duty-native';
import { createDutyRosterSnapshot, DUTY_RETENTION_MS } from '../vereinsflieger/duties';
import type { InformationCapture } from '../vereinsflieger/information';
import { assertNoPendingUserBackupRestore } from '../user-backup-restore-journal-native';

type RegistryRow = { owner: string; payload: string };
let running = false;
const check = (condition: boolean, message: string) => { if (!condition) throw new Error(message); };
async function rejects(work: () => Promise<unknown>, expected: RegExp) {
  try { await work(); } catch (error) {
    if (expected.test(String(error))) return;
    throw error;
  }
  throw new Error('Native source guard accepted a rejected operation.');
}
async function registryRows(): Promise<RegistryRow[]> {
  const db = await openDriver('vereinsflieger-owner-registry.sqlite');
  try { return await db.all<RegistryRow>('SELECT owner,payload FROM provider_scopes ORDER BY owner'); }
  finally { await db.close(); }
}

/**
 * Build-only synthetic entry; invoke only on MoFlight_Synthetic_API37.
 * Original rows/owner selection are never changed. One new synthetic registry
 * row and its uniquely named information/cache files intentionally remain.
 * No provider request, credentials, production routing or restore activation.
 */
export async function runNativeSourceReadbackProof(): Promise<{ checks: string[]; syntheticOwner: string; limitation: string }> {
  if (running) throw new Error('Native source proof is already running.');
  running = true;
  let before: RegistryRow[] | undefined;
  let scope: ProviderScope | undefined;
  try {
    await assertNoPendingUserBackupRestore();
    const id = Crypto.randomUUID();
    scope = { version: 1, owner: `native-readback-${id}`, connectionId: `native-readback-${id}`,
      context: { accountNumber: '999990007', clubLabel: 'Synthetic native readback club',
        clubIdentity: 'display-label-only', verification: 'observed-profile-number' } };
    const registry = await openDriver('vereinsflieger-owner-registry.sqlite');
    try {
      await registry.exec(SCOPE_SCHEMA);
      before = await registry.all<RegistryRow>('SELECT owner,payload FROM provider_scopes ORDER BY owner');
      check(!before.some(row => row.owner === scope!.owner), 'Synthetic registry identity collision.');
      await bindScope(registry, scope);
    } finally { await registry.close(); }
    const checks: string[] = [], at = '2026-10-26T12:00:00.000Z', now = Date.parse(at), gate = () => {};
    const medical: InformationCapture = { version: 1, id: `medical-${id}`, owner: scope.owner, connectionId: scope.connectionId,
      retrievedAt: at, sourceIdentity: 'provisional-observed-profile', category: 'medical', path: '/member/profile/viewprofile',
      columns: [{ key: 'kind', label: 'Medical-Art', index: 0 }, { key: 'expiry', label: 'Gültig bis · Originaltext', index: 1 }],
      rows: [{ position: 0, values: ['Synthetic medical', '31.12.2027'] }], filters: [], empty: false,
      coverage: { kind: 'visible-page', truncated: false, pagination: 'unverified' } };
    check(canonical(await saveAndLoadInformation(scope, medical, gate)) === canonical([medical]), 'Medical committed readback mismatch.');
    check(canonical(await loadInformation(scope, gate)) === canonical([medical]), 'Medical fresh-open mismatch.');
    checks.push('actual saveAndLoadInformation committed payload and fresh-open equality');
    const duty: InformationCapture = { ...medical, id: `duty-${id}`, category: 'duties', path: '/member/profile/myservices.php',
      columns: [{ key: 'duty', label: 'Dienst', index: 0 }, { key: 'period', label: 'Zeitraum', index: 1 }, { key: 'people', label: 'Person(en)', index: 2 }],
      rows: [{ position: 0, values: ['Synthetic duty', '26.10.2026 - 26.10.2026', 'Synthetic pilot'] }] };
    const roster = createDutyRosterSnapshot(scope, [duty], at);
    check(canonical(await saveAndLoadDutyRoster(scope, roster, gate, () => now)) === canonical(roster), 'Duty committed readback mismatch.');
    check(canonical(await loadDutyRoster(scope, gate, () => now)) === canonical(roster), 'Duty fresh-open mismatch.');
    checks.push('actual saveAndLoadDutyRoster committed payload and fresh-open equality');
    const foreign = { ...scope, context: { ...scope.context, accountNumber: '999990008' } };
    await rejects(() => saveAndLoadInformation(foreign, medical, gate), /Unowned provider scope/);
    await rejects(() => saveAndLoadDutyRoster(foreign, roster, gate, () => now), /Unowned provider scope/);
    const stopped = () => { throw new Error('Synthetic cancelled source gate'); };
    await rejects(() => saveAndLoadInformation(scope!, medical, stopped), /Synthetic cancelled source gate/);
    await rejects(() => saveAndLoadDutyRoster(scope!, roster, stopped, () => now), /Synthetic cancelled source gate/);
    check(canonical(await loadInformation(scope, gate)) === canonical([medical]), 'Rejected operations changed Medical.');
    check(canonical(await loadDutyRoster(scope, gate, () => now)) === canonical(roster), 'Rejected operations changed duty.');
    checks.push('foreign observed account and cancelled gate rejected; committed synthetic data unchanged');
    check(await loadDutyRoster(scope, gate, () => now + DUTY_RETENTION_MS) === null, 'Expired synthetic duty was retained.');
    check(canonical(await loadInformation(scope, gate)) === canonical([medical]), 'Duty expiry changed immutable Medical.');
    checks.push('native duty expiry removes only synthetic cache; Medical evidence retained');
    return { checks, syntheticOwner: scope.owner,
      limitation: 'Synthetic native helper proof only; no live provider, process restart, UI journey or iOS acceptance. One unique synthetic provider registry row and information/cache files remain; existing rows and selected owner are preserved.' };
  } finally {
    try {
      if (before && scope) {
        const after = await registryRows();
        check(canonical(after.filter(row => row.owner !== scope!.owner)) === canonical(before), 'Original provider registry rows changed.');
        check(after.filter(row => row.owner === scope!.owner).length === 1 && after.find(row => row.owner === scope!.owner)?.payload === canonical(scope), 'Synthetic provider registry binding changed.');
      }
    } finally { running = false; }
  }
}

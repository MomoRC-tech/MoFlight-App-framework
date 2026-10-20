import type { RealHistoryManifest } from '../vereinsflieger/real-history-contract';
import type { RealFlightSourceInput } from '../vereinsflieger/real-flight-source';

/** Synthetic data only. Never share production filenames or owner registries. */
export const RECOVERY_CASES = ['after-facts', 'after-commit', 'restore-record'] as const;
export type RecoveryCase = typeof RECOVERY_CASES[number];
export const RECOVERY_OWNER = '19191919-1919-4919-8919-191919191919';
export const RECOVERY_STORE = '29292929-2929-4929-8929-292929292929';
export const RECOVERY_AT = '2026-10-20T14:00:00.000Z';
export const RECOVERY_MANIFEST: RealHistoryManifest = {
  singleton: 1, family: 'moflight-real-flight-history', schema_version: 1, payload_version: 1,
  owner_id: RECOVERY_OWNER, store_id: RECOVERY_STORE, created_at: RECOVERY_AT,
};
export const recoveryPermit = () => ({ ownerId: RECOVERY_OWNER, storeId: RECOVERY_STORE,
  leaseId: '39393939-3939-4939-8939-393939393939', writable: true });
export const recoveryCommandId = (index: number) => `49494949-4949-4949-8949-${index.toString(16).padStart(12, '0')}`;
export const recoveryFileName = (caseName: RecoveryCase, kind: 'library' | 'commands' | 'candidate') =>
  `native-recovery-${caseName}-${kind}.sqlite`;

/** A fresh bounded proof preserves all earlier recovery runs on the synthetic AVD. */
export function recoveryPathNamespace(namespace: string) {
  if (!/^[a-z][a-z0-9-]{0,39}$/.test(namespace)) throw new Error('Invalid synthetic recovery namespace');
  return (name: string) => {
    if (!/^native-recovery-[a-z0-9.-]+$/.test(name)) throw new Error('Invalid synthetic recovery filename');
    return `${namespace}-${name}`;
  };
}

export function recoverySource(captureId: string): RealFlightSourceInput {
  const context = { accountNumber: '101', clubLabel: 'Synthetic recovery club', clubIdentity: 'display-label-only' as const,
    verification: 'observed-profile-number' as const };
  return { version: 1, binding: { provider: 'vereinsflieger', accountRef: '101' }, contextBefore: context, contextAfter: { ...context },
    requestedWindow: { from: '2026-10-01', to: '2026-10-20', participation: 'Pilot oder Fluglehrer' },
    capture: { captureId, retrievedAt: RECOVERY_AT, headers: ['Datum', 'Lfz.', 'Start', 'Landung', 'Flugzeit', 'Pilot'],
      rows: [{ sourceFlightId: '9001', values: ['20.10.2026', 'D-TEST', '10:00', '10:12', '12', 'Synthetic pilot'] }],
      sourceIdentity: 'unverified', timeBasis: 'unknown', coverage: 'complete-requested-list',
      exportContext: { from: '2026-10-01', to: '2026-10-20', preset: 'Konfiguration laden', participation: 'Pilot oder Fluglehrer',
        accountLabel: 'Synthetic account', recordCount: 1, pageCount: 1, columnIds: ['1', '2', '3', '4', '5', '6'], adapterVersion: 2 } } };
}

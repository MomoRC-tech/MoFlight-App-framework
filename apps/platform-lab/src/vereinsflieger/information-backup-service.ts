import type { Hash } from '@moflight/local-data';
import { InformationStore, validateInformationBackup } from './information-store';
import { InformationStoreSelection, informationStoreName, withInformationMutation } from './information-selection';
import type { ProviderScope } from './scope-store';
import { validateScope } from './scope-store';

export type InformationRestorePhase = 'before-restore' | 'after-candidate' | 'before-activation';
export type InformationRestoreGate = (phase: InformationRestorePhase) => Promise<void>;

export interface InformationBackupPorts {
  openSelection(scope: ProviderScope, create: boolean): Promise<InformationStoreSelection | null>;
  informationFileExists(name: string): boolean | Promise<boolean>;
  openInformationStore(scope: ProviderScope, name: string): Promise<InformationStore>;
  uuid(): string;
  now(): string;
}

export type InformationRestoreResult =
  | { state: 'restored'; operationId: string; databaseName: string; sequence: number }
  | { state: 'already-activated'; operationId: string; databaseName: string; sequence: number }
  | { state: 'recovery-required'; operationId: string; databaseName: string;
      reason: 'restore-or-activation-incomplete' | 'stale-predecessor' };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const digestPattern = /^[0-9a-f]{64}$/;

/**
 * Stage one supported information snapshot in a distinct same-owner database,
 * verify every row, then atomically append its selected-store pointer. Failed
 * work remains pending and can be resumed only with the same operation/archive.
 */
export async function restoreInformationBackup(scopeInput: ProviderScope, text: string, hash: Hash,
  gate: InformationRestoreGate, ports: InformationBackupPorts, resumeOperationId?: string): Promise<InformationRestoreResult> {
  const scope = validateScope(scopeInput);
  await validateInformationBackup(text, scope, hash);
  const backupSha256 = await hash(text);
  if (!digestPattern.test(backupSha256)) throw new Error('Invalid information backup digest.');
  if (resumeOperationId !== undefined && !uuidPattern.test(resumeOperationId)) throw new Error('Invalid information restore operation.');

  return withInformationMutation(async () => {
    await gate('before-restore');
    const selection = await ports.openSelection(scope, true);
    if (!selection) throw new Error('Information selection journal is unavailable.');
    let candidate: InformationStore | null = null;
    let operationId = resumeOperationId ?? '';
    let databaseName = '';
    let prepared = false;
    try {
      let preparation = resumeOperationId ? await selection.preparation(resumeOperationId) : null;
      if (resumeOperationId && !preparation) throw new Error('Unknown information restore preparation.');
      if (preparation?.backupSha256 !== undefined && preparation.backupSha256 !== backupSha256) {
        throw new Error('Selected archive does not match the prepared information restore.');
      }
      if (preparation?.status === 'activated') {
        const active = await selection.snapshot();
        if (!active.selection || active.selection.operationId !== resumeOperationId || active.selection.backupSha256 !== backupSha256) {
          throw new Error('Activated information restore is no longer the selected store.');
        }
        if (!await ports.informationFileExists(active.selection.databaseName)) {
          throw new Error('Activated information candidate is missing; preserved for recovery.');
        }
        candidate = await ports.openInformationStore(scope, active.selection.databaseName);
        await initializeCandidate(candidate, false);
        await candidate.verifyBackup(text, hash);
        await candidate.db.close(); candidate = null;
        return { state: 'already-activated', operationId: resumeOperationId!, databaseName: active.selection.databaseName,
          sequence: active.sequence };
      }

      const currentPending = await selection.pending();
      if (currentPending && currentPending.operationId !== resumeOperationId) {
        throw new Error('Resolve the pending information restore first.');
      }
      const current = await selection.snapshot();
      if (preparation) {
        operationId = preparation.operationId;
        databaseName = preparation.databaseName;
        if (preparation.previousSequence !== current.sequence) {
          return { state: 'recovery-required', operationId, databaseName, reason: 'stale-predecessor' };
        }
      } else {
        operationId = ports.uuid();
        if (!uuidPattern.test(operationId)) throw new Error('Invalid information restore operation identity.');
        databaseName = informationStoreName(scope, operationId);
        try {
          preparation = await selection.prepareRestore({ operationId, databaseName, backupSha256,
            previousSequence: current.sequence, preparedAt: ports.now() });
        } catch (error) {
          // SQLite may commit the preparation and then lose the readback. Treat
          // it as recoverable only when the exact durable row can be confirmed.
          const persisted = await selection.preparation(operationId).catch(() => null);
          if (!persisted || persisted.databaseName !== databaseName || persisted.backupSha256 !== backupSha256 ||
              persisted.previousSequence !== current.sequence || persisted.status !== 'pending') throw error;
          preparation = persisted;
        }
        prepared = true;
      }

      const exists = await ports.informationFileExists(databaseName);
      candidate = await ports.openInformationStore(scope, databaseName);
      await initializeCandidate(candidate, exists);
      const currentText = exists ? await candidate.exportBackup(hash) : null;
      if (currentText !== text) await candidate.restoreBackup(text, hash);
      await candidate.verifyBackup(text, hash);
      await candidate.db.close(); candidate = null;
      await gate('after-candidate');
      await gate('before-activation');
      const sequence = await selection.activatePreparedRestore(operationId, ports.now());
      return { state: 'restored', operationId, databaseName, sequence };
    } catch (error) {
      if (!prepared && !resumeOperationId) throw error;
      if (!operationId) throw error;
      const stale = error instanceof Error && /stale|selected information store changed|changed during restore/i.test(error.message);
      return { state: 'recovery-required', operationId, databaseName: databaseName || informationStoreName(scope, operationId),
        reason: stale ? 'stale-predecessor' : 'restore-or-activation-incomplete' };
    } finally {
      await candidate?.db.close();
      await selection.close();
    }
  });
}

/** Resume only a reserved zero-byte/empty candidate or a recognized existing store. */
async function initializeCandidate(candidate: InformationStore, exists: boolean): Promise<void> {
  if (!exists) { await candidate.initialize(true); return; }
  const version = await candidate.db.first<{ user_version: number }>('PRAGMA user_version');
  const tables = await candidate.db.all<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
  if (version?.user_version === 0 && tables.length === 0) {
    // The exact deterministic name is already bound to a pending journal row.
    // Initializing a pristine SQLite reservation is safe; populated or unknown
    // files stay untouched and fail closed in InformationStore.initialize.
    await candidate.initialize(true);
  } else await candidate.initialize(false);
}

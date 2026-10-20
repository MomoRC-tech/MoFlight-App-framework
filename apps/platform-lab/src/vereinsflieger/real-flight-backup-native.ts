import { canonical } from '@moflight/flight-logbook';
import type { Hash } from '@moflight/local-data';
import type { RealFlightCommandJournal } from './real-flight-command-journal';
import type { RealFlightLibrary } from './real-flight-library';
import { REAL_HISTORY_BACKUP_LIMIT, realHistoryCandidateName, realHistoryUuid, validateRealHistoryCandidateName } from './real-history-contract';
import { validateRealFlightBackup } from './real-flight-library-model';
import type { RealFlightSelection } from './real-flight-selection';
import { IndeterminateRealRestorePreparation } from './real-flight-selection';
import type { RealFlightNativeScope } from './real-flight-native';

export type RealFlightBackupPhase = 'before-picker' | 'after-picker' | 'before-export' | 'before-write' |
  'after-write' | 'before-read' | 'after-read' | 'before-restore' | 'after-restore' | 'before-activation';
/** The app supplies its foreground/session gate; repository owner/lease checks are also enforced here. */
export type RealFlightBackupGate = (phase: RealFlightBackupPhase) => Promise<void>;

export interface RealFlightBackupPickedAsset { uri: string; size?: number | null }
export type RealFlightBackupPickerResult =
  | { canceled: true; assets?: readonly [] }
  | { canceled: false; assets: readonly RealFlightBackupPickedAsset[] };

export interface RealFlightBackupIo {
  requestDirectory(): Promise<{ granted: boolean; directoryUri?: string }>;
  createFolderFile(directoryUri: string, name: string, mimeType: 'application/json'): Promise<string>;
  writeFolderFile(uri: string, text: string): Promise<void>;
  readFolderFile(uri: string): Promise<string>;
  pickBackup(): Promise<RealFlightBackupPickerResult>;
  readPickedFile(uri: string): Promise<string>;
}

export interface RealFlightBackupNativePorts {
  openRealFlightSelection(scope: RealFlightNativeScope, createExplicitly?: boolean): Promise<RealFlightSelection<RealFlightLibrary> | null>;
  openRealFlightCommandJournal(scope: RealFlightNativeScope, createExplicitly?: boolean): Promise<RealFlightCommandJournal | null>;
  restoreRealFlightCandidate(scope: RealFlightNativeScope, name: string, text: string): Promise<RealFlightLibrary>;
  openRealFlightCandidate(scope: RealFlightNativeScope, name: string): Promise<RealFlightLibrary>;
  /** Resume only the exact append-only preparation, including a generation-zero candidate left by a failed restore transaction. */
  resumePreparedRealFlightCandidate?(scope: RealFlightNativeScope, operationId: string, text: string): Promise<RealFlightLibrary>;
}

export interface RealFlightBackupDependencies {
  io: RealFlightBackupIo;
  native: RealFlightBackupNativePorts;
  hash: Hash;
  uuid(): string;
  now(): string;
}

export interface RealFlightBackupService {
  readonly ownerId: string;
  readonly storeId: string;
  exportBackup(): Promise<string>;
}

export type SaveRealFlightBackupResult =
  | { state: 'cancelled' }
  | { state: 'saved'; fileName: string; sha256: string };
export type RestoreRealFlightBackupResult =
  | { state: 'cancelled' }
  | { state: 'restored'; fileName: string; selection: { name: string; sequence: number };
      snapshot: { generation: number; flightCount: number }; warning?: string }
  | { state: 'already-activated'; fileName: string; operationId: string; selection: { name: string; sequence: number } }
  | { state: 'recovery-required'; fileName: string; operationId: string;
      reason: 'restore-or-activation-incomplete' | 'stale-predecessor' };

const digestPattern = /^[0-9a-f]{64}$/;
const byteLength = (text: string) => new TextEncoder().encode(text).length;
function nativePermit(scope: RealFlightNativeScope, write: boolean) {
  const permit = scope.authorize();
  if (!permit || typeof permit !== 'object' || Array.isArray(permit) ||
      Object.keys(permit).sort().join(',') !== 'leaseId,ownerId,storeId,writable' ||
      typeof permit.ownerId !== 'string' || typeof permit.storeId !== 'string' || typeof permit.leaseId !== 'string' ||
      typeof permit.writable !== 'boolean' || write && !permit.writable ||
      permit.ownerId !== scope.lease.ownerId || permit.storeId !== scope.lease.storeId || permit.leaseId !== scope.lease.leaseId) {
    throw new Error('Unauthorized real flight backup operation.');
  }
  realHistoryUuid(permit.ownerId); realHistoryUuid(permit.storeId); realHistoryUuid(permit.leaseId);
  return { ...permit };
}

async function assertRestoreScope(scope: RealFlightNativeScope, write: boolean): Promise<void> {
  const before = nativePermit(scope, write);
  await scope.registry.assertCurrent(scope.lease, before.ownerId, before.storeId);
  const after = nativePermit(scope, write);
  if (before.ownerId !== after.ownerId || before.storeId !== after.storeId || before.leaseId !== after.leaseId) {
    throw new Error('Real flight owner lease changed during backup operation.');
  }
  await scope.registry.assertCurrent(scope.lease, after.ownerId, after.storeId);
}

async function defaultDependencies(): Promise<RealFlightBackupDependencies> {
  const native = await import('./real-flight-native');
  return {
    native,
    hash: (await import('../storage')).hash,
    uuid: (await import('expo-crypto')).randomUUID,
    now: () => new Date().toISOString(),
    io: {
      async requestDirectory() {
        const { StorageAccessFramework } = await import('expo-file-system/legacy');
        const permission = await StorageAccessFramework.requestDirectoryPermissionsAsync(
          StorageAccessFramework.getUriForDirectoryInRoot('Documents'));
        return permission.granted ? { granted: true, directoryUri: permission.directoryUri } : { granted: false };
      },
      async createFolderFile(directoryUri, name, mimeType) {
        const { StorageAccessFramework } = await import('expo-file-system/legacy');
        return StorageAccessFramework.createFileAsync(directoryUri, name, mimeType);
      },
      async writeFolderFile(uri, text) {
        const { StorageAccessFramework } = await import('expo-file-system/legacy');
        await StorageAccessFramework.writeAsStringAsync(uri, text);
      },
      async readFolderFile(uri) {
        const { StorageAccessFramework } = await import('expo-file-system/legacy');
        return StorageAccessFramework.readAsStringAsync(uri);
      },
      async pickBackup() {
        const DocumentPicker = await import('expo-document-picker');
        const result = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
        if (result.canceled) return { canceled: true };
        return { canceled: false, assets: result.assets.map(asset => ({ uri: asset.uri, size: asset.size })) };
      },
      async readPickedFile(uri) {
        const { File } = await import('expo-file-system');
        return new File(uri).text();
      },
    },
  };
}

/** Save a validated current library backup to one explicitly selected SAF folder. */
export async function saveRealFlightBackupToFolder(service: RealFlightBackupService, gate: RealFlightBackupGate,
  dependencies?: RealFlightBackupDependencies): Promise<SaveRealFlightBackupResult> {
  const deps = dependencies ?? await defaultDependencies();
  await gate('before-picker');
  const permission = await deps.io.requestDirectory();
  await gate('after-picker');
  if (!permission.granted) return { state: 'cancelled' };
  if (typeof permission.directoryUri !== 'string' || permission.directoryUri.length === 0) {
    throw new Error('The selected backup folder is unavailable.');
  }

  await gate('before-export');
  const text = await service.exportBackup();
  if (byteLength(text) > REAL_HISTORY_BACKUP_LIMIT) throw new Error('Real flight backup exceeds the 128 MiB limit.');
  const sha256 = await deps.hash(text);
  if (!digestPattern.test(sha256)) throw new Error('Invalid real flight backup digest.');
  const backupId = deps.uuid();
  realHistoryUuid(backupId);
  const fileName = `moflight-real-flight-backup-${backupId}.json`;
  await gate('before-write');
  const uri = await deps.io.createFolderFile(permission.directoryUri, fileName, 'application/json');
  await deps.io.writeFolderFile(uri, text);
  await gate('after-write');
  await gate('before-read');
  const readback = await deps.io.readFolderFile(uri);
  await gate('after-read');
  const readbackHash = await deps.hash(readback);
  if (readback !== text || readbackHash !== sha256) throw new Error('External real flight backup verification failed.');
  return { state: 'saved', fileName, sha256 };
}

interface CurrentSelection {
  handle: RealFlightSelection<RealFlightLibrary>;
  state: 'empty' | 'readable' | 'unreadable';
  name: string | null;
  sequence: number | null;
  generation: number | null;
}

async function currentSelection(scope: RealFlightNativeScope, deps: RealFlightBackupDependencies,
  resumeOperationId?: string): Promise<CurrentSelection> {
  const selection = await deps.native.openRealFlightSelection(scope, false);
  if (!selection) throw new Error('Real flight selection is unavailable; restore is blocked.');
  let candidate: RealFlightLibrary | null = null;
  try {
    const preparations = await selection.listRestorePreparations();
    if (preparations.some(preparation => preparation.status !== 'activated' && preparation.operationId !== resumeOperationId)) {
      throw new Error('Resolve the pending real restore preparation before restoring another backup.');
    }
    const inspected = await selection.inspect();
    if (inspected.state === 'empty') return { handle:selection, state:'empty', name:null, sequence:null, generation:null };
    if (inspected.state === 'unreadable') return { handle:selection, state:'unreadable', name:null, sequence:inspected.headSequence, generation:null };
    const selected = inspected.selected;
    candidate = selected.candidate;
    if (inspected.state === 'recovery-required' || selected.recoveryRequired) {
      throw new Error('Read-only real flight recovery blocks backup restore.');
    }
    const permit = nativePermit(scope, true);
    if (selected.candidate.manifest.owner_id !== permit.ownerId || selected.candidate.manifest.store_id !== permit.storeId) {
      throw new Error('Selected real flight history does not match the current owner.');
    }
    const snapshot = await selected.candidate.snapshot();
    if (snapshot.manifest.owner_id !== permit.ownerId || snapshot.manifest.store_id !== permit.storeId ||
        !Number.isSafeInteger(selected.sequence) || selected.sequence < 1) {
      throw new Error('Selected real flight history is invalid.');
    }
    return { handle: selection, state:'readable', name: selected.name, sequence: selected.sequence, generation: snapshot.generation };
  } catch (error) {
    await selection.close();
    throw error;
  } finally {
    if (candidate) await candidate.close();
  }
}

async function assertNoPendingCommand(scope: RealFlightNativeScope, deps: RealFlightBackupDependencies): Promise<void> {
  const journal = await deps.native.openRealFlightCommandJournal(scope, false);
  if (!journal) return;
  try {
    if (await journal.pending()) throw new Error('Resolve the pending real flight command before restoring a backup.');
  } finally { await journal.close(); }
}

/**
 * Restore into a new owner-scoped candidate and activate it only after its full
 * graph and basic readers pass. The predecessor is rechecked by the append-only
 * selection journal; failed candidates are deliberately retained.
 */
export async function restoreRealFlightBackup(scope: RealFlightNativeScope, gate: RealFlightBackupGate,
  dependencies?: RealFlightBackupDependencies, resumeOperationId?: string): Promise<RestoreRealFlightBackupResult> {
  const deps = dependencies ?? await defaultDependencies();
  if (resumeOperationId !== undefined) realHistoryUuid(resumeOperationId);
  await gate('before-picker');
  await assertRestoreScope(scope, true);
  const existingPreparation = resumeOperationId ? await (async () => {
    const selection = await deps.native.openRealFlightSelection(scope, false);
    if (!selection) return null;
    try { return await selection.getRestorePreparation(resumeOperationId); }
    finally { await selection.close(); }
  })() : null;
  if (resumeOperationId) await assertRestoreScope(scope, true);
  if (resumeOperationId && !existingPreparation) throw new Error('Unknown real restore preparation.');
  if (existingPreparation?.status === 'activated') return { state:'already-activated', fileName:existingPreparation.candidateName,
    operationId:existingPreparation.operationId, selection:{name:existingPreparation.candidateName,sequence:existingPreparation.activatedSequence!} };
  if (existingPreparation?.status === 'stale') return { state:'recovery-required', fileName:existingPreparation.candidateName,
    operationId:existingPreparation.operationId, reason:'stale-predecessor' };
  const before = await currentSelection(scope, deps, resumeOperationId);
  await before.handle.close();
  await assertNoPendingCommand(scope, deps);

  const picked = await deps.io.pickBackup();
  await gate('after-picker');
  await assertRestoreScope(scope, true);
  if (picked.canceled) return { state: 'cancelled' };
  if (picked.assets.length !== 1) throw new Error('Select exactly one real flight backup file.');
  const asset = picked.assets[0]!;
  if (typeof asset.uri !== 'string' || asset.uri.length === 0) throw new Error('Invalid selected backup file.');
  if (asset.size !== undefined && asset.size !== null &&
      (!Number.isSafeInteger(asset.size) || asset.size < 0 || asset.size > REAL_HISTORY_BACKUP_LIMIT)) {
    throw new Error('Real flight backup exceeds the 128 MiB limit.');
  }

  await assertRestoreScope(scope, true);
  await gate('before-read');
  const text = await deps.io.readPickedFile(asset.uri);
  await gate('after-read');
  await assertRestoreScope(scope, true);
  if (byteLength(text) > REAL_HISTORY_BACKUP_LIMIT) throw new Error('Real flight backup exceeds the 128 MiB limit.');
  const permit = nativePermit(scope, true);
  // Validate same-owner/store identity, envelope checksum, exact bounded JSON,
  // SQL-independent graph shape, receipts and source-capture replay before any
  // candidate filename is reserved.
  const reviewedGraph = await validateRealFlightBackup(text, permit.ownerId, permit.storeId, deps.hash);
  await assertRestoreScope(scope, true);

  const afterPicker = await currentSelection(scope, deps, resumeOperationId);
  if (resumeOperationId) {
    const currentPreparation = await afterPicker.handle.getRestorePreparation(resumeOperationId);
    if (!currentPreparation) { await afterPicker.handle.close(); throw new Error('Real restore preparation disappeared.'); }
    if (currentPreparation.status === 'activated') {
      await afterPicker.handle.close();
      return { state:'already-activated', fileName:currentPreparation.candidateName, operationId:currentPreparation.operationId,
        selection:{name:currentPreparation.candidateName,sequence:currentPreparation.activatedSequence!} };
    }
    if (currentPreparation.status === 'stale') {
      await afterPicker.handle.close();
      return { state:'recovery-required', fileName:currentPreparation.candidateName, operationId:currentPreparation.operationId, reason:'stale-predecessor' };
    }
    if (currentPreparation.expectedGraphSha256 !== await deps.hash(canonical(reviewedGraph))) {
      await afterPicker.handle.close(); throw new Error('Selected backup does not match the prepared restore graph.');
    }
  }
  if (afterPicker.state !== before.state || afterPicker.name !== before.name || afterPicker.sequence !== before.sequence ||
      afterPicker.generation !== before.generation) {
    await afterPicker.handle.close();
    throw new Error('Active real flight history changed while the backup picker was open.');
  }
  try { await assertNoPendingCommand(scope, deps); }
  catch (error) { await afterPicker.handle.close(); throw error; }

  const candidateId = resumeOperationId ? null : deps.uuid();
  if (candidateId) realHistoryUuid(candidateId);
  const fileName = existingPreparation?.candidateName ?? realHistoryCandidateName(candidateId!);
  validateRealHistoryCandidateName(fileName);
  const operationId = resumeOperationId ?? deps.uuid();
  realHistoryUuid(operationId);
  const preparedAt = existingPreparation?.preparedAt ?? deps.now();
  let restored: RealFlightLibrary | null = null;
  let writer: RealFlightLibrary | null = null;
  let prepared = false;
  try {
    await gate('before-restore');
    const preparation = await afterPicker.handle.prepareRestore({ operationId, candidateName: fileName,
      expectedGraphSha256: await deps.hash(canonical(reviewedGraph)), previousSequence: before.sequence, preparedAt });
    prepared = true;
    if (preparation.status === 'stale') {
      return { state:'recovery-required', fileName, operationId, reason:'stale-predecessor' };
    }
    if (preparation.status === 'activated') {
      return { state:'already-activated', fileName, operationId, selection:{name:fileName,sequence:preparation.activatedSequence!} };
    }
    if (resumeOperationId) {
      const resume = deps.native.resumePreparedRealFlightCandidate;
      if (!resume) throw new Error('Native prepared-restore recovery is unavailable.');
      restored = await resume(scope, resumeOperationId, text);
    } else {
      writer = await deps.native.restoreRealFlightCandidate(scope, fileName, text);
      await writer.close(); writer = null;
      restored = await deps.native.openRealFlightCandidate(scope, fileName);
    }
    const restoredGraph = await restored.snapshot();
    if (restoredGraph.manifest.owner_id !== permit.ownerId || restoredGraph.manifest.store_id !== permit.storeId) {
      throw new Error('Restored candidate owner does not match the current lease.');
    }
    if (await deps.hash(canonical(restoredGraph)) !== preparation.expectedGraphSha256) {
      throw new Error('Restored real flight graph does not match the reviewed backup.');
    }
    const flights = await restored.list();
    if (flights.length > 0) {
      const first = flights[0]!;
      const detail = await restored.detail(first.flightId);
      if (!detail || detail.flightId !== first.flightId || detail.factsRevision !== first.factsRevision || !detail.unassigned) {
        throw new Error('Restored real flight reader validation failed.');
      }
    }
    await gate('after-restore');
    await assertRestoreScope(scope, true);
    await restored.close();
    restored = null;

    await gate('before-activation');
    await assertRestoreScope(scope, true);
    await assertNoPendingCommand(scope, deps);
    const sequence = await afterPicker.handle.activatePreparedRestore(operationId);
    await assertRestoreScope(scope, true);
    const publication = await afterPicker.handle.inspect();
    let warning: string | undefined;
    if (publication.state === 'recovery-required' || publication.state === 'unreadable') {
      warning = 'The backup was activated, but retained history is unreadable. The selected library remains read-only until recovery.';
    }
    if (publication.selected) await publication.selected.candidate.close();
    return { state: 'restored', fileName, selection: { name: fileName, sequence },
      snapshot: { generation: restoredGraph.generation, flightCount: flights.length }, ...(warning ? {warning} : {}) };
  } catch (error) {
    await restored?.close();
    await writer?.close();
    if (prepared || error instanceof IndeterminateRealRestorePreparation) {
      const stale = error instanceof Error && /stale/i.test(error.message);
      return { state:'recovery-required', fileName, operationId,
        reason:stale ? 'stale-predecessor' : 'restore-or-activation-incomplete' };
    }
    throw error;
  } finally {
    await afterPicker.handle.close();
  }
}

/** Resume a persisted restore preparation by selecting its original backup again. */
export async function resumeRealFlightBackup(scope: RealFlightNativeScope, operationId: string, gate: RealFlightBackupGate,
  dependencies?: RealFlightBackupDependencies): Promise<RestoreRealFlightBackupResult> {
  return restoreRealFlightBackup(scope,gate,dependencies,operationId);
}

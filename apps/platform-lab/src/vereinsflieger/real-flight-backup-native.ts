import type { Hash } from '@moflight/local-data';
import type { RealFlightCommandJournal } from './real-flight-command-journal';
import type { RealFlightLibrary } from './real-flight-library';
import { REAL_HISTORY_BACKUP_LIMIT, realHistoryCandidateName, realHistoryUuid, validateRealHistoryCandidateName } from './real-history-contract';
import { validateRealFlightBackup } from './real-flight-library-model';
import type { RealFlightSelection } from './real-flight-selection';
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
      snapshot: { generation: number; flightCount: number } };

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
  name: string;
  sequence: number;
  generation: number;
}

async function currentSelection(scope: RealFlightNativeScope, deps: RealFlightBackupDependencies): Promise<CurrentSelection> {
  const selection = await deps.native.openRealFlightSelection(scope, false);
  if (!selection) throw new Error('Real flight selection is unavailable; restore is blocked.');
  let candidate: RealFlightLibrary | null = null;
  try {
    const selected = await selection.select();
    candidate = selected.candidate;
    if (selected.recoveryRequired) throw new Error('Read-only real flight recovery blocks backup restore.');
    const permit = nativePermit(scope, true);
    if (selected.candidate.manifest.owner_id !== permit.ownerId || selected.candidate.manifest.store_id !== permit.storeId) {
      throw new Error('Selected real flight history does not match the current owner.');
    }
    const snapshot = await selected.candidate.snapshot();
    if (snapshot.manifest.owner_id !== permit.ownerId || snapshot.manifest.store_id !== permit.storeId ||
        !Number.isSafeInteger(selected.sequence) || selected.sequence < 1) {
      throw new Error('Selected real flight history is invalid.');
    }
    return { handle: selection, name: selected.name, sequence: selected.sequence, generation: snapshot.generation };
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
  dependencies?: RealFlightBackupDependencies): Promise<RestoreRealFlightBackupResult> {
  const deps = dependencies ?? await defaultDependencies();
  await gate('before-picker');
  await assertRestoreScope(scope, true);
  const before = await currentSelection(scope, deps);
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
  await validateRealFlightBackup(text, permit.ownerId, permit.storeId, deps.hash);
  await assertRestoreScope(scope, true);

  const afterPicker = await currentSelection(scope, deps);
  if (afterPicker.name !== before.name || afterPicker.sequence !== before.sequence || afterPicker.generation !== before.generation) {
    await afterPicker.handle.close();
    throw new Error('Active real flight history changed while the backup picker was open.');
  }
  try { await assertNoPendingCommand(scope, deps); }
  catch (error) { await afterPicker.handle.close(); throw error; }

  const candidateId = deps.uuid();
  realHistoryUuid(candidateId);
  const fileName = realHistoryCandidateName(candidateId);
  validateRealHistoryCandidateName(fileName);
  await gate('before-restore');
  let restored: RealFlightLibrary | null = null;
  try {
    const writer = await deps.native.restoreRealFlightCandidate(scope, fileName, text);
    await writer.close();
    restored = await deps.native.openRealFlightCandidate(scope, fileName);
    const restoredGraph = await restored.snapshot();
    if (restoredGraph.manifest.owner_id !== permit.ownerId || restoredGraph.manifest.store_id !== permit.storeId) {
      throw new Error('Restored candidate owner does not match the current lease.');
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
    const activationId = deps.uuid();
    realHistoryUuid(activationId);
    const sequence = await afterPicker.handle.activate(activationId, fileName, before.sequence, deps.now());
    return { state: 'restored', fileName, selection: { name: fileName, sequence },
      snapshot: { generation: restoredGraph.generation, flightCount: flights.length } };
  } catch (error) {
    await restored?.close();
    throw error;
  } finally {
    await afterPicker.handle.close();
  }
}

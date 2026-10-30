import { exportDutyTargetsNative, notifyDutyTargetsChanged, preflightDutyTargetsNative, restoreDutyTargetsNative, withDutyTargetLock } from './duty-target-native';
import { latestRealFlightValues, validateRealFlightBackup, type StoredBinding } from './vereinsflieger/real-flight-library-model';
import { File } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import { hash } from './storage';
import { loadBooks, openBooks, rememberBook, rememberLibrary, rememberedBook } from './book-storage';
import { readLocalDisplayName, saveLocalDisplayName } from './mobile/local-profile';
import { createRealFlightBackupDependencies, restoreRealFlightBackup, type RealFlightBackupService } from './vereinsflieger/real-flight-backup-native';
import { loadProviderScope } from './vereinsflieger/scoped-storage';
import { exportInformationBackup, restoreInformationBackupNative } from './vereinsflieger/information-native';
import { USER_BACKUP_LIMIT, createUserBackup, createUserBackupV4, selectedPilotBookForBackup, type UserBackupInputV3 } from './user-backup';
import { financialNative } from './vereinsflieger/expense-native';
import { restoreUserBackup, type UserBackupGate, type UserBackupServicePorts } from './user-backup-service';
import { openUserBackupRestoreJournal } from './user-backup-restore-journal-native';
import type { UserBackupRestoreOperation } from './user-backup-restore-journal';
import type { RealFlightNativeScope } from './vereinsflieger/real-flight-native';
import { readOwnerChatArchiveNative, restoreOwnerChatsNative } from './ai/chat-native';
import { encodeChatArchive } from './ai/chat-model';
import { assertNoPendingUserBackupRestore } from './user-backup-restore-journal-native';

const directory = SQLite.defaultDatabaseDirectory;
const databaseFile = (name: string) => new File(directory.startsWith('file:') ? directory : 'file://' + directory, name);
const bytes = (text: string) => new TextEncoder().encode(text).length;
const digest = /^[0-9a-f]{64}$/;

function sameOwnerScope(scope: RealFlightNativeScope, writable: boolean): void {
  const permit = scope.authorize();
  if (!permit || permit.ownerId !== scope.lease.ownerId || permit.storeId !== scope.lease.storeId ||
      permit.leaseId !== scope.lease.leaseId || writable && !permit.writable) throw new Error('User backup owner lease is unavailable.');
}

/** Aggregate selected local profile, selected real flight owner, and supported same-owner information. */
export async function exportUserBackupNative(scope: RealFlightNativeScope, service: RealFlightBackupService,
  gate: UserBackupGate): Promise<string> {
  return withDutyTargetLock(async () => {
  await assertNoPendingUserBackupRestore();
  await gate(); sameOwnerScope(scope, false);
  if (service.ownerId !== scope.lease.ownerId || service.storeId !== scope.lease.storeId) throw new Error('Foreign real flight backup service.');
  const { lib, name } = await loadBooks();
  let pilot: { ownerId: 'synthetic-pilot'; backup: string; displayName: string; selectedBookId: string | null };
  try {
    if (!name) throw new Error('Selected synthetic pilot library is unavailable.');
    const books = await lib.books();
    const remembered = books.length ? await rememberedBook(lib) : null;
    pilot = { ownerId: 'synthetic-pilot', backup: await lib.backup(), displayName: await readLocalDisplayName(lib.db, lib.owner),
      selectedBookId: selectedPilotBookForBackup(books, remembered) };
  } finally { await lib.db.close(); }
  await gate();
  const realFlights = await service.exportBackup();
  await gate();
  const graph = await validateRealFlightBackup(realFlights, scope.lease.ownerId, scope.lease.storeId, hash);
  const binding = latestRealFlightValues<StoredBinding>(graph.records, 'binding')[0];
  const dutyTargets = await exportDutyTargetsNative(binding ? { ownerId: scope.lease.ownerId, storeId: scope.lease.storeId, accountRef: binding.accountRef } : null, gate);
  const selectedScope = await loadProviderScope(scope.lease.ownerId);
  if (selectedScope && selectedScope.owner !== scope.lease.ownerId) throw new Error('Foreign selected information scope.');
  const informationBackup = selectedScope ? await exportInformationBackup(selectedScope) : null;
  const aiArchive = await readOwnerChatArchiveNative(scope, gate);
  const financial = await financialNative.exportSection(scope, gate);
  await gate(); sameOwnerScope(scope, false);
  const input: UserBackupInputV3 = { createdAt: new Date().toISOString(), ownerId: scope.lease.ownerId, storeId: scope.lease.storeId,
    pilot, realFlights: { backup: realFlights },
    information: selectedScope && informationBackup !== null ? { scope: selectedScope, backup: informationBackup } : null,
    ai: { archive: encodeChatArchive(aiArchive) }, dutyTargets };
  const text = await (financial.state === 'absent' ? createUserBackup(input, hash) : createUserBackupV4({ ...input, financial }, hash));
  await gate(); sameOwnerScope(scope, false); await assertNoPendingUserBackupRestore();
  return text;
  });
}

export type SaveUserBackupResult = { state: 'cancelled' } | { state: 'saved'; fileName: string; sha256: string };

export async function saveUserBackupToFolder(scope: RealFlightNativeScope, service: RealFlightBackupService,
  gate: UserBackupGate): Promise<SaveUserBackupResult> {
  await gate();
  const dependencies = await createRealFlightBackupDependencies();
  const permission = await dependencies.io.requestDirectory();
  await gate();
  if (!permission.granted) return { state: 'cancelled' };
  if (!permission.directoryUri) throw new Error('The selected backup folder is unavailable.');
  const text = await exportUserBackupNative(scope, service, gate);
  if (bytes(text) > USER_BACKUP_LIMIT) throw new Error('User backup size limit exceeded.');
  const sha256 = await hash(text);
  if (!digest.test(sha256)) throw new Error('Invalid user backup digest.');
  const fileName = 'moflight-user-backup-' + dependencies.uuid() + '.json';
  await gate();
  const uri = await dependencies.io.createFolderFile(permission.directoryUri, fileName, 'application/json');
  await dependencies.io.writeFolderFile(uri, text);
  await gate();
  const readback = await dependencies.io.readFolderFile(uri);
  await gate();
  if (readback !== text || await hash(readback) !== sha256) throw new Error('External user backup verification failed.');
  return { state: 'saved', fileName, sha256 };
}

async function createNativeRestorePorts(scope: RealFlightNativeScope, gate: UserBackupGate, resumeOperationId?: string): Promise<UserBackupServicePorts> {
  const realDependencies = await createRealFlightBackupDependencies();
  const financialScope = resumeOperationId ? { ...scope, backupRestoreOperationId: resumeOperationId } : scope;
  const ports: UserBackupServicePorts = {
    io: realDependencies.io, hash, uuid: realDependencies.uuid, now: realDependencies.now,
    openJournal: openUserBackupRestoreJournal,
    currentInformationScope: owner => loadProviderScope(owner),
    financial: {
      async currentTarget(ownerId, storeId) {
        if (ownerId !== scope.lease.ownerId || storeId !== scope.lease.storeId) throw new Error('Foreign financial backup target.');
        return financialNative.currentTarget(financialScope, gate);
      },
      preflight: (section, ownerGate) => financialNative.preflight(financialScope, section, async () => { await ownerGate(); await gate(); }),
      restore: (input, ownerGate) => financialNative.restore(scope, input.section, input.permit, async () => { await ownerGate(); await gate(); }),
    },
    async restoreRealFlights(input, ownerGate) {
      const internalScope: RealFlightNativeScope = { ...scope, backupRestoreOperationId: input.permit.operationId };
      sameOwnerScope(internalScope, true);
      const selection = await realDependencies.native.openRealFlightSelection(internalScope, false);
      let hasPreparation = false;
      try { hasPreparation = !!await selection?.getRestorePreparation(input.operationId); }
      finally { await selection?.close(); }
      let uuidIndex = 0;
      const realDependenciesForRestore = {
        ...realDependencies,
        io: {
          ...realDependencies.io,
          async pickBackup() { return { canceled: false as const, assets: [{ uri: 'moflight-user-backup://real-flight', size: bytes(input.backup) }] }; },
          async readPickedFile(uri: string) {
            if (uri !== 'moflight-user-backup://real-flight') throw new Error('Invalid embedded real-flight backup reference.');
            return input.backup;
          },
        },
        uuid() { return uuidIndex++ === 0 ? input.candidateId : input.operationId; },
      };
      const result = await restoreRealFlightBackup(internalScope, async () => { await ownerGate(); await gate(); },
        realDependenciesForRestore, hasPreparation ? input.operationId : undefined);
      if (result.state === 'restored' || result.state === 'already-activated') return 'already-activated';
      if (result.state === 'recovery-required') throw new Error('Real flight restore requires recovery.');
      throw new Error('Embedded real flight restore was cancelled.');
    },
    async stagePilot(input) {
      const file = databaseFile(input.candidateName);
      if (!file.exists) {
        file.create({ overwrite: false, intermediates: true });
        if (!file.exists) throw new Error('Could not reserve pilot restore candidate.');
      }
      const library = await openBooks(input.candidateName, input.permit);
      try {
        const existingBackup = await library.backup();
        if (existingBackup !== input.backup) await library.restore(input.backup);
        if (await library.backup() !== input.backup) throw new Error('Pilot candidate does not match the validated backup.');
        const books = await library.books();
        for (const book of books) {
          await library.history(book.id); await library.snapshots(book.id); await library.entries(book.id);
        }
        if (input.selectedBookId && !books.some(book => book.id === input.selectedBookId)) throw new Error('Selected pilot book is unavailable.');
        if (!input.selectedBookId && await library.db.first('SELECT book_id FROM lab_book_selection WHERE id=1')) {
          throw new Error('Pilot restore candidate has a selection outside the backup.');
        }
        await saveLocalDisplayName(library.db, library.owner, input.displayName);
        if (input.selectedBookId) await rememberBook(library, input.selectedBookId, input.permit);
        if (await readLocalDisplayName(library.db, library.owner) !== input.displayName) throw new Error('Pilot profile verification failed.');
      } finally { await library.db.close(); }
    },
    async activatePilot(input) {
      const library = await openBooks(input.candidateName, input.permit);
      try {
        const books = await library.books();
        for (const book of books) { await library.history(book.id); await library.snapshots(book.id); await library.entries(book.id); }
      } finally { await library.db.close(); }
      await rememberLibrary(input.candidateName, input.permit);
    },
    async restoreInformation(input, ownerGate) {
      const result = await restoreInformationBackupNative(input.scope, input.backup,
        async () => { await ownerGate(); await gate(); }, input.operationId, ownerGate);
      if (result.state === 'restored' || result.state === 'already-activated') return 'already-activated';
      throw new Error('Information restore requires recovery.');
    },
    async preflightDutyTargets(archive, ownerGate) { await preflightDutyTargetsNative(archive, async () => { await ownerGate(); await gate(); }); },
    async restoreDutyTargets(input, ownerGate) {
      await restoreDutyTargetsNative(input.archive, input.permit, async () => { await ownerGate(); await gate(); sameOwnerScope(scope, true); });
    },
    async restoreAi(input, ownerGate) {
      await restoreOwnerChatsNative({ ...scope, backupRestoreOperationId: input.permit.operationId }, input.archive,
        async () => { await ownerGate(); await gate(); });
    },
  };
  return ports;
}

export async function getPendingUserBackupRestoreNative(scope: RealFlightNativeScope): Promise<UserBackupRestoreOperation | null> {
  await scope.registry.assertCurrent(scope.lease);
  sameOwnerScope(scope, false);
  let journal;
  try { journal = await openUserBackupRestoreJournal(false); }
  catch (error) {
    if (!(error instanceof Error) || !error.message.includes('Uninitialized user backup restore journal')) throw error;
    // A crash before the first journal transaction can leave only a reserved,
    // schema-free SQLite file. Initializing that strictly empty file is safe.
    journal = await openUserBackupRestoreJournal(true);
    if (!journal) return null;
    try { return await journal.pending(); }
    finally { await journal.close(); }
  }
  if (!journal) return null;
  try { return await journal.pending(); }
  finally { await journal.close(); }
}

/** Restore from the picker, or resume only the exact pending operation and archive. */
export async function restoreUserBackupFromPickerNative(scope: RealFlightNativeScope, gate: UserBackupGate,
  resumeOperationId?: string) {
  await gate(); sameOwnerScope(scope, true);
  const ports = await createNativeRestorePorts(scope, gate, resumeOperationId);
  const result = await withDutyTargetLock(() => restoreUserBackup(scope.lease.ownerId, scope.lease.storeId, gate, ports, resumeOperationId));
  if (result.state === 'restored' || result.state === 'already-restored') notifyDutyTargetsChanged();
  return result;
}

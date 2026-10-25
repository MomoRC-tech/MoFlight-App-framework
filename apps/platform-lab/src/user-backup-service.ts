import type { DutyTargetArchive } from './duty-target';
import { canonical } from '@moflight/flight-logbook';
import type { Hash } from '../../../packages/local-data/src/index';
import type { RealFlightBackupIo } from './vereinsflieger/real-flight-backup-native';
import { USER_BACKUP_LIMIT, validateUserBackup, emptyUserChatArchive } from './user-backup';
import { decodeChatArchive, type ChatArchive } from './ai/chat-model';
import { USER_BACKUP_RESTORE_PHASES, UserBackupRestoreJournal, type PrepareUserBackupRestore, type UserBackupRestoreOperation } from './user-backup-restore-journal';
import type { ProviderScope } from './vereinsflieger/scope-store';

export type UserBackupGate = () => Promise<void>;

export type UserBackupRestoreResult =
  | { state: 'cancelled' }
  | { state: 'restored'; operationId: string }
  | { state: 'already-restored'; operationId: string }
  | { state: 'recovery-required'; operationId: string; phase: UserBackupRestoreOperation['phase'] };

export interface UserBackupServicePorts {
  io: Pick<RealFlightBackupIo, 'pickBackup' | 'readPickedFile'>;
  hash: Hash;
  uuid(): string;
  now(): string;
  openJournal(create: boolean): Promise<UserBackupRestoreJournal | null>;
  currentInformationScope(ownerId: string): Promise<ProviderScope | null>;
  restoreRealFlights(input: { backup: string; candidateId: string; operationId: string; permit: { operationId: string; ownerId: string; storeId: string } }, gate: UserBackupGate): Promise<'restored' | 'already-activated'>;
  stagePilot(input: { backup: string; displayName: string; selectedBookId: string | null; candidateName: string; permit: { operationId: string; ownerId: string; storeId: string } }): Promise<void>;
  activatePilot(input: { candidateName: string; permit: { operationId: string; ownerId: string; storeId: string } }): Promise<void>;
  restoreInformation(input: { scope: ProviderScope; backup: string; operationId: string }, gate: UserBackupGate): Promise<'restored' | 'already-activated'>;
  preflightDutyTargets(archive: DutyTargetArchive, gate: UserBackupGate): Promise<void>;
  restoreDutyTargets(input: { archive: DutyTargetArchive; permit: { operationId: string; ownerId: string; storeId: string } }, gate: UserBackupGate): Promise<void>;
  restoreAi(input: { archive: ChatArchive; permit: { operationId: string; ownerId: string; storeId: string } }, gate: UserBackupGate): Promise<void>;
}

const byteLength = (text: string) => new TextEncoder().encode(text).length;
const validUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export async function pendingUserBackupRestore(ports: UserBackupServicePorts): Promise<UserBackupRestoreOperation | null> {
  const journal = await ports.openJournal(false);
  if (!journal) return null;
  try { return await journal.pending(); }
  finally { await journal.close(); }
}

/** Select and validate a complete archive, then resume every store idempotently under one durable read gate. */
export async function restoreUserBackup(ownerId: string, storeId: string, gate: UserBackupGate,
  ports: UserBackupServicePorts, resumeOperationId?: string): Promise<UserBackupRestoreResult> {
  await gate();
  let journal = await ports.openJournal(false);
  let prior: UserBackupRestoreOperation | null = null;
  try {
    if (resumeOperationId !== undefined) {
      if (!validUuid(resumeOperationId)) throw new Error('Invalid aggregate restore operation.');
      prior = await journal?.get(resumeOperationId) ?? null;
      if (!prior || prior.ownerId !== ownerId || prior.storeId !== storeId) throw new Error('Unknown or foreign aggregate restore operation.');
      if (prior.status === 'complete') return { state: 'already-restored', operationId: prior.operationId };
      const other = await journal?.pending();
      if (other && other.operationId !== prior.operationId) throw new Error('Another aggregate user restore is pending.');
    } else {
      const pending = await journal?.pending();
      if (pending) throw new Error(`A supported user restore is pending (${pending.operationId}).`);
    }
  } finally { await journal?.close(); journal = null; }

  const picked = await ports.io.pickBackup();
  await gate();
  if (picked.canceled) return { state: 'cancelled' };
  if (picked.assets.length !== 1) throw new Error('Select exactly one complete MoFlight user backup.');
  const asset = picked.assets[0]!;
  if (typeof asset.uri !== 'string' || !asset.uri.length || asset.size !== undefined && asset.size !== null &&
      (!Number.isSafeInteger(asset.size) || asset.size < 0 || asset.size > USER_BACKUP_LIMIT)) throw new Error('Invalid user backup file.');
  await gate();
  const text = await ports.io.readPickedFile(asset.uri);
  await gate();
  if (byteLength(text) > USER_BACKUP_LIMIT) throw new Error('User backup size limit exceeded.');
  const informationScope = await ports.currentInformationScope(ownerId);
  const payload = await validateUserBackup(text, { ownerId, storeId, informationScope }, ports.hash);
  const archiveSha256 = await ports.hash(text);
  const aiArchive = payload.version >= 2 && 'ai' in payload ? decodeChatArchive(payload.ai.archive, ownerId, { interruptActive: true }) : emptyUserChatArchive(ownerId);
  if (!/^[0-9a-f]{64}$/.test(archiveSha256)) throw new Error('Invalid user backup archive digest.');
  if (prior && (prior.archiveSha256 !== archiveSha256 || canonical(prior.informationScope) !== canonical(payload.information?.scope ?? null))) {
    throw new Error('Selected archive differs from the pending aggregate restore.');
  }

  const operation: PrepareUserBackupRestore = prior ? {
    operationId: prior.operationId, ownerId: prior.ownerId, storeId: prior.storeId, archiveSha256: prior.archiveSha256,
    pilotCandidateName: prior.pilotCandidateName, realCandidateId: prior.realCandidateId,
    realOperationId: prior.realOperationId, informationOperationId: prior.informationOperationId,
    informationScope: prior.informationScope, selectedBookId: prior.selectedBookId,
    createdAt: prior.createdAt, updatedAt: prior.updatedAt,
  } : (() => {
    const operationId = ports.uuid(), realCandidateId = ports.uuid(), realOperationId = ports.uuid();
    const informationOperationId = payload.information ? ports.uuid() : null;
    for (const value of [operationId, realCandidateId, realOperationId, ...(informationOperationId ? [informationOperationId] : [])]) {
      if (!validUuid(value)) throw new Error('Invalid aggregate restore identity.');
    }
    const at = ports.now();
    return { operationId, ownerId, storeId, archiveSha256, pilotCandidateName: `pilot-restore-${operationId}.sqlite`,
      realCandidateId, realOperationId, informationOperationId, informationScope: payload.information?.scope ?? null,
      selectedBookId: payload.pilot.selectedBookId, createdAt: at, updatedAt: at };
  })();

  // Deeply restore and read back the pilot candidate before any other selected
  // store can change. The aggregate envelope validator checks section shape;
  // PilotBooks.restore also validates every source, membership, snapshot, and
  // entry against its full storage contract.
  await gate();
  await ports.stagePilot({ backup: payload.pilot.backup, displayName: payload.pilot.displayName,
    selectedBookId: payload.pilot.selectedBookId, candidateName: operation.pilotCandidateName,
    permit: { operationId: operation.operationId, ownerId, storeId } });
  await gate();

  if (!prior && payload.version === 3) { await ports.preflightDutyTargets(payload.dutyTargets, gate); await gate(); }

  journal = await ports.openJournal(true);
  if (!journal) throw new Error('Aggregate user restore journal is unavailable.');
  let prepared: UserBackupRestoreOperation;
  try {
    try { prepared = await journal.prepare(operation); }
    catch (error) {
      const durable = await journal.get(operation.operationId).catch(() => null);
      if (!durable || durable.archiveSha256 !== archiveSha256 || durable.ownerId !== ownerId || durable.storeId !== storeId || durable.status !== 'pending') throw error;
      prepared = durable;
    }
  } finally { await journal.close(); journal = null; }

  const permit = { operationId: prepared.operationId, ownerId, storeId };
  try {
    await gate();
    const realResult = await ports.restoreRealFlights({ backup: payload.realFlights.backup,
      candidateId: prepared.realCandidateId, operationId: prepared.realOperationId, permit }, gate);
    if (realResult !== 'restored' && realResult !== 'already-activated') throw new Error('Real flight restore remains incomplete.');
    await recordPhase(ports, prepared.operationId, 'real-flight');
    await gate();

    if (payload.information) {
      const informationOperationId = prepared.informationOperationId;
      if (!informationOperationId || canonical(prepared.informationScope) !== canonical(payload.information.scope)) {
        throw new Error('Prepared information restore scope is incomplete.');
      }
      const infoResult = await ports.restoreInformation({ scope: payload.information.scope,
        backup: payload.information.backup, operationId: informationOperationId }, gate);
      if (infoResult !== 'restored' && infoResult !== 'already-activated') throw new Error('Information restore remains incomplete.');
    }
    // Auxiliary stores share this durable checkpoint. Chat replacement is one
    // validated SQLite transaction; lost acknowledgements safely repeat it.
    // The aggregate read gate blocks all stores until pilot + completion commit.
    await gate();
    await ports.restoreAi({ archive: aiArchive, permit }, gate);
    if (payload.version === 3) {
      await gate();
      await ports.restoreDutyTargets({ archive: payload.dutyTargets, permit }, gate);
    }
    await recordPhase(ports, prepared.operationId, 'information');
    await gate();

    await gate();
    await ports.activatePilot({ candidateName: prepared.pilotCandidateName, permit });
    await recordPhase(ports, prepared.operationId, 'pilot');
    await gate();
    const complete = await ports.openJournal(true);
    if (!complete) throw new Error('Aggregate user restore journal is unavailable.');
    try { await complete.complete(prepared.operationId, ports.now()); }
    finally { await complete.close(); }
    return { state: 'restored', operationId: prepared.operationId };
  } catch (error) {
    const recovery = await ports.openJournal(false).catch(() => null);
    if (!recovery) throw error;
    try {
      const durable = await recovery.get(prepared.operationId);
      if (durable?.status === 'complete') return { state: 'restored', operationId: prepared.operationId };
      if (durable?.status === 'pending') return { state: 'recovery-required', operationId: prepared.operationId, phase: durable.phase };
    } finally { await recovery.close(); }
    throw error;
  }
}

async function recordPhase(ports: UserBackupServicePorts, operationId: string, phase: UserBackupRestoreOperation['phase']) {
  const journal = await ports.openJournal(false);
  if (!journal) throw new Error('Aggregate user restore journal disappeared.');
  try {
    const current = await journal.get(operationId);
    if (!current) throw new Error('Aggregate user restore progress disappeared.');
    // A restarted restore revalidates each store idempotently. Its durable
    // progress may already be later than that repeated store acknowledgement.
    if (USER_BACKUP_RESTORE_PHASES.indexOf(current.phase) > USER_BACKUP_RESTORE_PHASES.indexOf(phase)) return;
    await journal.advance(operationId, phase, ports.now());
  }
  finally { await journal.close(); }
}

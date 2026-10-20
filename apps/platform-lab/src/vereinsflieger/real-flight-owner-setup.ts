export interface RealFlightSetupOwner {
  ownerId: string;
  storeId: string;
  candidateName: string;
  createdAt: string;
  selectedAt: string;
}

export interface RealFlightSetupCandidate {
  snapshot(): Promise<{ manifest: unknown; generation: number; receipts: readonly unknown[] }>;
  close(): Promise<void>;
}

type Closeable = { close(): Promise<void> };
export interface RealFlightSetupSelection<T extends Closeable = Closeable> {
  inspect(): Promise<RealFlightSetupInspection<T>>;
  activate(activationId: string, name: string, previousSequence: number | null, at: string): Promise<number>;
  close(): Promise<void>;
}

interface SelectedCandidate<T extends Closeable> {
  name: string;
  recoveryRequired: boolean;
  candidate: T;
  warning?: string | null;
}

export type RealFlightSetupInspection<T extends Closeable = Closeable> =
  | { state: 'empty'; selected: null; preparations: readonly { status: 'pending' | 'stale' | 'activated' }[] }
  | { state: 'selected' | 'recovery-required'; selected: SelectedCandidate<T>; preparations: readonly { status: 'pending' | 'stale' | 'activated' }[] }
  | { state: 'unreadable'; selected: null; preparations: readonly { status: 'pending' | 'stale' | 'activated' }[]; warning: string };

export interface RealFlightOwnerSetupPorts<T extends Closeable = Closeable> {
  openCandidate(name: string): Promise<RealFlightSetupCandidate>;
  isMissingCandidate(error: unknown): boolean;
  isUninitializedStore(error: unknown): boolean;
  resumeInitialCandidate(): Promise<RealFlightSetupCandidate>;
  openSelection(createExplicitly: boolean): Promise<RealFlightSetupSelection<T> | null>;
  openCommandJournal(createExplicitly: boolean): Promise<{ close(): Promise<void> } | null>;
  uuid(): string;
}

function isRegisteredCandidateSnapshot(snapshot: { manifest: unknown; generation: number; receipts: readonly unknown[] }, owner: RealFlightSetupOwner) {
  if (!snapshot.manifest || typeof snapshot.manifest !== 'object' || Array.isArray(snapshot.manifest)) return false;
  const manifest = snapshot.manifest as Record<string, unknown>;
  return manifest.singleton === 1 && manifest.family === 'moflight-real-flight-history' &&
    manifest.schema_version === 1 && manifest.payload_version === 1 && manifest.owner_id === owner.ownerId &&
    manifest.store_id === owner.storeId && manifest.created_at === owner.createdAt &&
    Number.isSafeInteger(snapshot.generation) && snapshot.generation >= 0 &&
    Array.isArray(snapshot.receipts) && snapshot.receipts.length === snapshot.generation;
}

async function closeInspection(inspection: RealFlightSetupInspection | null): Promise<void> {
  await inspection?.selected?.candidate.close();
}

async function openSelection<T extends Closeable>(ports: RealFlightOwnerSetupPorts<T>, createMissing: boolean): Promise<RealFlightSetupSelection<T> | null> {
  let selection: RealFlightSetupSelection<T> | null;
  try { selection = await ports.openSelection(false); }
  catch (error) {
    if (!ports.isUninitializedStore(error)) throw error;
    if (!createMissing) return null;
    selection = await ports.openSelection(true);
    if (!selection) throw new Error('The empty selection journal could not be initialized.');
    return selection;
  }
  if (selection || !createMissing) return selection;
  selection = await ports.openSelection(true);
  if (!selection) throw new Error('The missing selection journal could not be initialized.');
  return selection;
}

async function openCommandJournal(ports: RealFlightOwnerSetupPorts, createMissing: boolean) {
  let journal: { close(): Promise<void> } | null;
  try { journal = await ports.openCommandJournal(false); }
  catch (error) {
    if (!ports.isUninitializedStore(error)) throw error;
    if (!createMissing) return null;
    journal = await ports.openCommandJournal(true);
    if (!journal) throw new Error('The empty command journal could not be initialized.');
    return journal;
  }
  if (journal || !createMissing) return journal;
  journal = await ports.openCommandJournal(true);
  if (!journal) throw new Error('The missing command journal could not be initialized.');
  return journal;
}

async function openOrCompleteRegisteredCandidate(owner: RealFlightSetupOwner, ports: RealFlightOwnerSetupPorts,
  createMissing: boolean): Promise<RealFlightSetupCandidate | null> {
  try { return await ports.openCandidate(owner.candidateName); }
  catch (error) {
    if (ports.isMissingCandidate(error) || ports.isUninitializedStore(error))
      return createMissing ? ports.resumeInitialCandidate() : null;
    throw error;
  }
}

/**
 * Completes only the currently selected owner's original empty setup. In
 * read-only mode this reports readiness without creating missing files.
 */
export async function continueRealFlightOwnerSetup<T extends Closeable>(
  owner: RealFlightSetupOwner,
  ports: RealFlightOwnerSetupPorts<T>,
  createMissing: boolean,
  // A successful receiver owns both handles until release; no snapshot is cached.
  handoff?: (selected: SelectedCandidate<T>, release: () => Promise<void>) => void,
): Promise<boolean> {
  const selection = await openSelection(ports,createMissing);
  if (!selection) return false;

  let selectionState: RealFlightSetupInspection<T> | null = null;
  let transferred = false, closing: Promise<void> | null = null;
  const release = () => closing ??= (async () => {
    try { await closeInspection(selectionState); }
    finally { await selection.close(); }
  })();
  try {
    selectionState = await selection.inspect();
    const hasPreparedRestore = selectionState.preparations.some(preparation => preparation.status !== 'activated');
    const recoverableRestoreHead = selectionState.state === 'unreadable' ||
      (hasPreparedRestore && selectionState.state === 'empty');
    if (selectionState.state === 'empty' && !recoverableRestoreHead) {
      if (!createMissing) return false;
      const candidate = await openOrCompleteRegisteredCandidate(owner,ports,createMissing);
      if (!candidate) return false;
      try {
        const snapshot = await candidate.snapshot();
        if (!isRegisteredCandidateSnapshot(snapshot, owner)) throw new Error('The registered candidate does not match its owner record.');
        if (snapshot.generation !== 0 || snapshot.receipts.length !== 0) {
          throw new Error('The unselected registered candidate is not empty; retained files need recovery.');
        }
      } finally {
        await candidate.close();
      }
      await selection.activate(ports.uuid(), owner.candidateName, null, owner.selectedAt);
      await closeInspection(selectionState);
      selectionState = await selection.inspect();
      if (selectionState.state !== 'selected' || selectionState.selected.name !== owner.candidateName ||
          selectionState.selected.recoveryRequired) {
        throw new Error('The original registered candidate was not selected cleanly.');
      }
    }
    // Keep existing close-before-command behavior unless a selected reader is transferred.
    if (!handoff || !selectionState.selected) await release();

    const currentHasPreparedRestore = selectionState?.preparations.some(preparation => preparation.status !== 'activated') ?? false;
    const currentRecoverableRestoreHead = selectionState?.state === 'unreadable' ||
      (currentHasPreparedRestore && selectionState?.state === 'empty');
    if (!selectionState || (selectionState.state !== 'selected' && selectionState.state !== 'recovery-required' && !currentRecoverableRestoreHead)) {
      throw new Error('No readable selected real-flight history is available.');
    }

    // An unreadable initialized head may still be recoverable from a validated
    // external backup. Do not create or initialize its command journal as part
    // of routing to that recovery screen.
    const journal = await openCommandJournal(ports,selectionState.state === 'unreadable' ? false : createMissing);
    if (!journal) return false;
    await journal.close();
    if (handoff && selectionState.selected) {
      handoff(selectionState.selected, release);
      transferred = true;
    }
    return true;
  } finally {
    if (!transferred) await release();
  }
}

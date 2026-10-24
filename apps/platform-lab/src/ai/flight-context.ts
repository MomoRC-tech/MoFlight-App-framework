import { assertAiContext, validateAiContext, validateHistoricalProviderIdentity,
  type AiContext, type HistoricalProviderIdentity } from '../../../../packages/ai-contracts/src/index.ts';
import type { OwnFlightReadPorts } from '../mobile/own-flight-reader.ts';
import { projectAiFlights, type AiProjection } from './projection.ts';
import type { SavedFlightRetrieval } from '../vereinsflieger/retrieval-policy.ts';

export interface AiFlightContextPorts {
  flights: OwnFlightReadPorts;
  // Current real owner, independently of whether a flight store/binding exists.
  currentOwner(): Promise<string | null>;
}
export interface AiFlightSnapshot {
  context: AiContext; projection: AiProjection | null;
  coverageWindows: SavedFlightRetrieval[];
  pendingIssueCount: number;
  unavailableReason: 'no-flight-binding' | 'recovery' | 'read-failed' | null;
}
export class AiContextChanged extends Error {
  constructor() { super('AI source context changed. Start a new explicit message.'); }
}

/** Flight-only read, without Medical/information/duties, migrations or providers.
 * The returned projection is private local state. Only validated tool DTOs may
 * leave the device. No database lease remains open while waiting on a model. */
export async function readAiFlightSnapshot(ports: AiFlightContextPorts, receipt: HistoricalProviderIdentity,
  contextVersion: number): Promise<AiFlightSnapshot> {
  const identity = validateHistoricalProviderIdentity(receipt, receipt.localOwnerId);
  if (await ports.currentOwner() !== identity.localOwnerId) throw new AiContextChanged();
  const unavailable = (reason: AiFlightSnapshot['unavailableReason']): AiFlightSnapshot => ({
    context: validateAiContext({ version: 1, localOwnerId: identity.localOwnerId, provider: identity.provider,
      accountRef: identity.accountRef, contextVersion, flights: { state: 'flights-unavailable' } }),
    projection: null, coverageWindows: [], pendingIssueCount: 0, unavailableReason: reason,
  });
  const session = await ports.flights.open();
  if (!session) {
    if (await ports.currentOwner() !== identity.localOwnerId) throw new AiContextChanged();
    return unavailable('no-flight-binding');
  }
  try {
    await session.assertCurrent();
    if (session.ownerId !== identity.localOwnerId) throw new AiContextChanged();
    if (await session.pendingCommand()) { await session.assertCurrent(); return unavailable('recovery'); }
    let stored;
    try { stored = await session.service.readStored(); }
    catch {
      await session.assertCurrent();
      if (await ports.currentOwner() !== identity.localOwnerId) throw new AiContextChanged();
      return unavailable('read-failed');
    }
    await session.assertCurrent();
    const { snapshot, flights } = stored;
    if (snapshot.ownerId !== identity.localOwnerId || snapshot.storeId !== session.storeId ||
        snapshot.account && (snapshot.account.provider !== identity.provider || snapshot.account.accountRef !== identity.accountRef)) throw new AiContextChanged();
    if (await ports.currentOwner() !== identity.localOwnerId) throw new AiContextChanged();
    if (!snapshot.account) {
      if (flights.length) throw new AiContextChanged();
      return unavailable('no-flight-binding');
    }
    if (snapshot.recovery.readOnly) return unavailable('recovery');
    const context = validateAiContext({ version: 1, localOwnerId: identity.localOwnerId, provider: identity.provider,
      accountRef: identity.accountRef, contextVersion, flights: { state: 'available', storeId: session.storeId,
        generation: snapshot.generation, snapshotRevision: `generation-${snapshot.generation}` } });
    const projection = projectAiFlights(flights, context);
    const coverageWindows = snapshot.savedRetrievals.map(window => ({ ...window }));
    const pendingIssueCount = snapshot.pending.reduce((sum, pending) => sum + pending.issues.length, 0);
    if (!Number.isSafeInteger(pendingIssueCount)) throw new Error('Invalid pending AI source count');
    await session.assertCurrent();
    if (await ports.currentOwner() !== identity.localOwnerId) throw new AiContextChanged();
    return { context, projection, coverageWindows, pendingIssueCount, unavailableReason: null };
  } finally { await session.close(); }
}

/** Reopen via the same owner/recovery gate. Revise context on store/generation or
 * availability changes, suppressing any late tools/answers from the old run. */
export async function assertAiFlightSnapshotCurrent(ports: AiFlightContextPorts, identity: HistoricalProviderIdentity,
  snapshot: AiFlightSnapshot): Promise<void> {
  const latest = await readAiFlightSnapshot(ports, identity, snapshot.context.contextVersion);
  try { assertAiContext(latest.context, snapshot.context); }
  catch { throw new AiContextChanged(); }
  if (latest.unavailableReason !== snapshot.unavailableReason) throw new AiContextChanged();
}

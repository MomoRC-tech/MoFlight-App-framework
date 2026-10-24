import { validateHistoricalProviderIdentity, type HistoricalProviderIdentity } from '../../../../packages/ai-contracts/src/index.ts';
import type { Hash } from '../../../../packages/local-data/src/index.ts';
import { validateContext, sameContext } from '../vereinsflieger/context';
import { latestRealFlightValues, validateRealFlightGraph, type RealFlightGraph, type StoredBinding, type StoredCapture } from '../vereinsflieger/real-flight-library-model';
import type { ChatStore } from './chat-store';

/** Local accepted-profile evidence only. The caller owns native document/nonce admission. */
export function authenticatedProfileIdentity(ownerId: string, observed: unknown, observedAt: string): HistoricalProviderIdentity {
  const context = validateContext(observed);
  return validateHistoricalProviderIdentity({ version: 1, localOwnerId: ownerId, provider: 'vereinsflieger',
    accountRef: context.accountNumber, observedAt,
    provenance: { kind: 'authenticated-profile', verification: 'observed-profile-number' } }, ownerId);
}

/** Full existing graph validation, never shape-only snapshot/account seeding. */
export async function savedBindingIdentity(graph: RealFlightGraph, ownerId: string, storeId: string, hash: Hash): Promise<HistoricalProviderIdentity | null> {
  await validateRealFlightGraph(graph, hash);
  if (graph.manifest.owner_id !== ownerId || graph.manifest.store_id !== storeId) throw new Error('Foreign historical identity source');
  const binding = latestRealFlightValues<StoredBinding>(graph.records, 'binding')[0];
  if (!binding) return null;
  const capture = latestRealFlightValues<StoredCapture>(graph.records, 'capture')
    .find(value => value.source.capture.captureId === binding.evidence.captureId);
  const revision = graph.records.find(value => value.kind === 'binding' && value.id === binding.bindingId);
  if (!capture || !revision || capture.bindingId !== binding.bindingId ||
      capture.source.capture.rawCaptureSha256 !== binding.evidence.captureSha256 ||
      capture.source.binding.accountRef !== binding.accountRef ||
      !sameContext(capture.source.context.before, binding.clubContext.before) ||
      !sameContext(capture.source.context.after, binding.clubContext.after)) throw new Error('Historical binding evidence unavailable');
  return validateHistoricalProviderIdentity({ version: 1, localOwnerId: ownerId, provider: binding.provider,
    accountRef: binding.accountRef, observedAt: binding.adapterEvidence.boundAt,
    provenance: { kind: 'verified-saved-binding', storeId, sourceRevision: revision.payload_sha256 } }, ownerId);
}

/** Keep the earliest valid receipt; a different account never replaces its owner. */
export async function rememberHistoricalIdentity(store: Pick<ChatStore, 'archive' | 'rememberIdentity'>,
  identity: HistoricalProviderIdentity, gate: () => Promise<void>): Promise<HistoricalProviderIdentity> {
  const parsed = validateHistoricalProviderIdentity(identity, identity.localOwnerId);
  await gate();
  const archive = await store.archive();
  if (archive.ownerId !== parsed.localOwnerId) throw new Error('Foreign historical identity store');
  await gate(); const remembered = await store.rememberIdentity(parsed); await gate();
  const saved = (await store.archive()).identity;
  if (!saved || JSON.stringify(saved) !== JSON.stringify(remembered)) throw new Error('Historical identity readback differs');
  await gate(); return saved;
}

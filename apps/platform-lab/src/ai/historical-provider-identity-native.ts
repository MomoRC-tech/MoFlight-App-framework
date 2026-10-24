import { openOwnerRegistry } from '../vereinsflieger/real-flight-native';
import { assertNoPendingUserBackupRestore } from '../user-backup-restore-journal-native';
import { openOwnerChatStoreNative, readOwnerChatArchiveNative } from './chat-native';
import { authenticatedProfileIdentity, rememberHistoricalIdentity, savedBindingIdentity } from './historical-provider-identity';
import { ownFlightReadPorts } from '../mobile/own-flight-reader-native';
import { hash } from '../storage';
import type { HistoricalProviderIdentity } from '../../../../packages/ai-contracts/src/index.ts';

/** Explicit accepted-profile persistence; no current provider session is stored. */
export async function rememberAuthenticatedProfileNative(ownerId: string, observed: unknown, observedAt: string,
  gate: () => Promise<void>): Promise<HistoricalProviderIdentity> {
  const identity = authenticatedProfileIdentity(ownerId, observed, observedAt);
  return persistHistoricalIdentityNative(identity, gate);
}

async function persistHistoricalIdentityNative(identity: HistoricalProviderIdentity, gate: () => Promise<void>, expectedStoreId?: string): Promise<HistoricalProviderIdentity> {
  const ownerId = identity.localOwnerId;
  await gate(); await assertNoPendingUserBackupRestore();
  const registry = await openOwnerRegistry(false);
  if (!registry) throw new Error('Historical identity owner unavailable');
  let closed = false;
  try {
    const lease = await registry.currentOwner();
    if (!lease || lease.ownerId !== ownerId || expectedStoreId !== undefined && lease.storeId !== expectedStoreId) throw new Error('Historical identity owner changed');
    const scope = { registry, lease, authorize: () => closed ? null : { ownerId: lease.ownerId,
      storeId: lease.storeId, leaseId: lease.leaseId, writable: true } };
    const store = await openOwnerChatStoreNative(scope, gate);
    try { return await rememberHistoricalIdentity(store, identity, gate); }
    finally { await store.close(); }
  } finally { closed = true; await registry.close(); }
}

/** No provider request, login/session check, synthetic fallback or implicit owner creation. */
export async function loadHistoricalIdentityNative(gate: () => Promise<void>): Promise<HistoricalProviderIdentity | null> {
  await gate(); await assertNoPendingUserBackupRestore();
  const registry = await openOwnerRegistry(false);
  if (!registry) return null;
  let ownerId: string, storeId: string;
  try {
    const lease = await registry.currentOwner();
    if (!lease) return null;
    ownerId = lease.ownerId; storeId = lease.storeId;
    const scope = { registry, lease, authorize: () => ({ ownerId, storeId, leaseId: lease.leaseId, writable: false }) };
    const archive = await readOwnerChatArchiveNative(scope, gate);
    await registry.assertCurrent(lease); await gate();
    if (archive.identity) return archive.identity;
  } finally { await registry.close(); }
  const reader = await ownFlightReadPorts.open();
  if (!reader) return null;
  let identity: HistoricalProviderIdentity | null;
  try {
    await gate(); await reader.assertCurrent();
    if (reader.ownerId !== ownerId || reader.storeId !== storeId) throw new Error('Historical binding owner changed');
    if (await reader.pendingCommand()) throw new Error('Historical binding recovery required');
    if (!reader.service.readBindingEvidence) throw new Error('Historical binding reader unavailable');
    const graph = await reader.service.readBindingEvidence();
    identity = await savedBindingIdentity(graph, ownerId, storeId, hash);
    await reader.assertCurrent(); await gate();
  } finally { await reader.close(); }
  return identity ? persistHistoricalIdentityNative(identity, gate, storeId) : null;
}

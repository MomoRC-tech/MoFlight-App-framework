import * as Crypto from 'expo-crypto';
import { hash } from '../storage';
import { openOwnerRegistry, openRealFlightSelection, openRealFlightCommandJournal } from '../vereinsflieger/real-flight-native';
import { RealFlightService } from '../vereinsflieger/real-flight-service';
import { serializeOwnFlightReads } from './own-flight-reader';

/** Read the selected real owner. Missing files stay missing; no fallback to the lab library. */
export const ownFlightReadPorts = serializeOwnFlightReads({
  async open() {
    const registry = await openOwnerRegistry(false);
    if (!registry) return null;
    try {
      const lease = await registry.currentOwner();
      if (!lease) { await registry.close(); return null; }
      let closed = false;
      const scope = { registry, lease, authorize: () => closed ? null : {
        ownerId: lease.ownerId, storeId: lease.storeId, leaseId: lease.leaseId, writable: false,
      } };
      const journal = async () => {
        const opened = await openRealFlightCommandJournal(scope, false);
        if (!opened) throw new Error('Own-flight setup or recovery is incomplete.');
        return opened;
      };
      const service = new RealFlightService(lease.ownerId, lease.storeId, lease.leaseId, {
        authorize: scope.authorize, hash, uuid: Crypto.randomUUID, now: () => new Date().toISOString(),
        retrieve: async () => { throw new Error('Provider retrieval requires the explicit reviewed flow.'); },
        journal,
        repository: async () => {
          const selection = await openRealFlightSelection(scope, false);
          if (!selection) throw new Error('Own-flight selection is unavailable.');
          try {
            const selected = await selection.select();
            return { library: selected.candidate, writable: !selected.recoveryRequired, warning: selected.warning,
              close: async () => { try { await selected.candidate.close(); } finally { await selection.close(); } } };
          } catch (error) { await selection.close(); throw error; }
        },
      });
      return { ownerId: lease.ownerId, storeId: lease.storeId, service,
        assertCurrent: () => registry.assertCurrent(lease),
        pendingCommand: async () => { const opened = await journal(); try { return !!await opened.pending(); } finally { await opened.close(); } },
        close: async () => { if (!closed) { closed = true; service.dispose(); await registry.close(); } },
      };
    } catch (error) { await registry.close(); throw error; }
  },
});

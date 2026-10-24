import { adaptHistoryFacts } from '../../../apps/platform-lab/src/vereinsflieger/history-facts.ts';
import type { RealFlightListItem } from '../../../apps/platform-lab/src/vereinsflieger/real-flight-library.ts';
import type { AiContext, HistoricalProviderIdentity } from '../../../packages/ai-contracts/src/index.ts';

export const AI_SOURCE_OWNER = '11111111-1111-4111-8111-111111111111';
export const AI_SOURCE_STORE = '22222222-2222-4222-8222-222222222222';
export const AI_SOURCE_BINDING = '33333333-3333-4333-8333-333333333333';
export const aiSourceContext: AiContext = { version: 1, localOwnerId: AI_SOURCE_OWNER, provider: 'vereinsflieger', accountRef: '10001', contextVersion: 1,
  flights: { state: 'available', storeId: AI_SOURCE_STORE, generation: 4, snapshotRevision: 'generation-4' } };
export const aiSourceIdentity: HistoricalProviderIdentity = { version: 1, localOwnerId: AI_SOURCE_OWNER, provider: 'vereinsflieger', accountRef: '10001', observedAt: '2026-10-24T12:00:00.000Z', provenance: { kind: 'authenticated-profile', verification: 'observed-profile-number' } };
export function aiSourceFlight(ref: string, date: string, duration: string, registration = 'D-SYN1', name = 'Casey Sample'): RealFlightListItem {
  const headers = ['Datum', 'Lfz.', 'Start', 'Landung', 'Flugzeit in hh:mm', 'Pilot', 'PIC', 'Begleiter/FI', 'Begleiter 2', 'Begleiter 3', 'SIC', 'Bemerkung'];
  const values = [date, registration, '10:00', '11:00', duration.replace(/^(\d):/, '0$1:'), name, name, '', '', '', '', 'Synthetic private remark — never upstream'];
  const facts = adaptHistoryFacts({ ownerId: AI_SOURCE_OWNER, scopeId: AI_SOURCE_BINDING }, { captureId: `capture-${ref}`, headers, rows: [{ sourceFlightId: ref, values }] }, 0);
  return { flightId: `flight-${ref}`, bindingId: AI_SOURCE_BINDING, accountRef: '10001', sourceFlightRef: ref, firstCaptureId: `capture-${ref}`, factsRevision: 1, facts, unassigned: true };
}

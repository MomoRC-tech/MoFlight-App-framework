import { canonical } from '@moflight/flight-logbook';
import type { Driver, Hash } from '@moflight/local-data';
import type { OwnFlightView } from '../mobile/own-flight-reader';
import { summarizeRealFlights } from '../mobile/real-flight-statistics';
import { cockpitRoleMetrics, cockpitSeason } from '../mobile/cockpit-season';
import { selectStatisticsFlights, summarizeStatisticsFlights } from '../mobile/statistics-overlay-model';
import { RealFlightLibrary, type RealFlightDetail } from '../vereinsflieger/real-flight-library';
import { RealFlightService } from '../vereinsflieger/real-flight-service';
import { realHistoryUuid } from '../vereinsflieger/real-history-contract';
import { RECOVERY_AT, RECOVERY_MANIFEST, RECOVERY_OWNER, RECOVERY_STORE, recoveryPermit, recoverySource } from './android-core-recovery-fixture';

export const DUPLICATE_PROOF_MARKER = 'native-duplicate-count-proof-v1.json';
export function duplicateProofFile(runId: string): string {
  realHistoryUuid(runId);
  return `native-duplicate-count-v1-${runId}.sqlite`;
}
interface Ports { open(name: string): Promise<Driver>; hash: Hash; uuid(): string }

/** Four distinct source rows: 10 + 20 + marked duplicate 10 + unknown-marker 15.
 * Independent expected counted result is three / 45 minutes, retaining all four.
 * This namespaced proof never opens the ordinary owner/selection registry.
 */
export async function duplicateCountProof(ports: Ports, runId: string, seed: boolean): Promise<{
  view: OwnFlightView; details: RealFlightDetail[];
  report: { mode: 'seed' | 'reopen'; graphSha256: string; rawCount: number; countedCount: number;
    countedMinutes: number; excluded: number; unknownMarkers: number; contributorRefs: string[] };
}> {
  const name = duplicateProofFile(runId);
  if (seed) {
    const library = await RealFlightLibrary.create(await ports.open(name), RECOVERY_MANIFEST, ports.hash, recoveryPermit);
    try {
      const source = recoverySource('synthetic-duplicate-count-v1');
      source.capture.headers = ['Datum', 'Lfz.', 'Start', 'Landung', 'Flugzeit', 'Pilot', 'PIC', 'Begleiter/FI', 'Duplikat'];
      source.capture.rows = [['10', 'Nein'], ['20', 'Nein'], ['10', ' Ja '], ['15', '?']].map(([minutes, marker], index) => ({
        sourceFlightId: String(9001 + index),
        values: ['20.10.2026', 'D-TEST', '10:00', '', minutes!, 'Synthetic pilot', 'Synthetic pilot', '', marker!],
      }));
      if (!source.capture.exportContext) throw new Error('Proof needs explicit source coverage');
      source.capture.exportContext.recordCount = 4;
      source.capture.exportContext.columnIds = source.capture.headers.map((_, index) => String(index + 1));
      await library.bindAccount({ kind: 'bind', commandId: ports.uuid(), baseGeneration: 0, source, at: RECOVERY_AT });
      const plan = await library.prepareImport(source);
      await library.saveUnassigned({ kind: 'import-unassigned', commandId: ports.uuid(), baseGeneration: plan.baseGeneration,
        bindingId: plan.bindingId, source, planToken: plan.planToken, at: RECOVERY_AT });
    } finally { await library.close(); }
  }
  const service = new RealFlightService(RECOVERY_OWNER, RECOVERY_STORE, recoveryPermit().leaseId, {
    authorize: recoveryPermit, hash: ports.hash, uuid: ports.uuid, now: () => RECOVERY_AT,
    retrieve: async () => { throw new Error('No provider in duplicate proof'); },
    journal: async () => { throw new Error('No writing from duplicate proof presentation'); },
    repository: async () => {
      const db = await ports.open(name);
      try {
        const library = await RealFlightLibrary.open(db, RECOVERY_OWNER, RECOVERY_STORE, ports.hash, recoveryPermit);
        return { library, writable: true, warning: null, close: () => library.close() };
      } catch (error) { await db.close(); throw error; }
    },
  });
  try {
    const before = canonical(await service.readBindingEvidence());
    const stored = await service.readStored();
    const summary = summarizeRealFlights(stored.flights, 2026);
    const selected = selectStatisticsFlights(stored.flights, { kind: 'year', year: 2026 }, '2026-10-20');
    const statistics = summarizeStatisticsFlights(selected.flights);
    const contributorRefs = statistics.supportingIds.map(id => stored.flights.find(row => row.flightId === id)!.sourceFlightRef).sort();
    const season = cockpitSeason(stored.flights, stored.snapshot.savedRetrievals, 2026, '2026-10-20');
    if (stored.flights.length !== 4 || summary.count !== 3 || summary.knownMinutes !== 45 ||
        summary.excludedDuplicateCount !== 1 || summary.unknownDuplicateCount !== 1 ||
        statistics.count !== 3 || statistics.knownMinutes !== 45 ||
        canonical(contributorRefs) !== canonical(['9001', '9002', '9004']) || season.starts !== '3' || season.time !== '0:45' ||
        cockpitRoleMetrics(stored.flights, 2026, '2026-10-20').reduce((total, group) => total + group.count, 0) !== 3) {
      throw new Error('Duplicate proof disagrees with independent four-row expectations');
    }
    const details: RealFlightDetail[] = [];
    for (const flight of stored.flights) {
      const detail = await service.detail(flight.flightId);
      if (!detail) throw new Error('A retained proof row lost its detail');
      details.push(detail);
    }
    if (canonical(await service.readBindingEvidence()) !== before) throw new Error('Reading changed the stored proof graph');
    return { view: { ...stored, pendingCommand: false }, details,
      report: { mode: seed ? 'seed' : 'reopen', graphSha256: await ports.hash(before), rawCount: 4, countedCount: 3,
        countedMinutes: 45, excluded: 1, unknownMarkers: 1, contributorRefs } };
  } finally { service.dispose(); }
}

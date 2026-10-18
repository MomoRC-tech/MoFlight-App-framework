import { type PreviewRecord, type PreviewSession, recordEvidence } from './import-preview';
import { sourceIdentity } from './vereinsflieger/reconciliation';
import type { Book } from '../../../packages/local-data/src/books';

// All identities and values here are fictional, independent of the saved library.
export function syntheticImportPreview(): PreviewSession {
  const owner = 'preview-synthetic-pilot';
  const binding = { datasetId: 'preview-only', accountRef: 'synthetic-account', clubRef: 'synthetic-club' };
  function record(reference: string, minutes: number | null = 12): PreviewRecord {
    return { sourceFlightId: reference, aircraftRef: 'synthetic-aircraft-a', aircraftClass: 'glider', duplicate: false,
      flight: { date: '2026-10-10', start: '10:00', landing: '10:12', time_basis: 'UTC', minutes,
        registration: 'D-TEST-A', aircraft_model: 'Test-Segelflugzeug', pilot_role: null, crew: [], launch: null,
        start_place: 'Testplatz', landing_place: 'Testplatz', landings: null, remarks: null } };
  }
  const records = [record('1001'), record('1002'), record('1003', 18), record('1009')];
  records[1]!.aircraftRef = 'synthetic-aircraft-c';
  const changed = record('1002', 14), conflict = record('1003', 20), alternative = record('1003', 25);
  changed.aircraftRef = 'synthetic-aircraft-c';
  const powered = { ...record('1004'), aircraftRef: 'synthetic-powered-a', aircraftClass: 'powered' as const,
    flight: { ...record('1004').flight, registration: 'D-TEST-M', aircraft_model: 'Test-Motorflugzeug' } };
  const ambiguous = { ...record('1006'), aircraftRef: 'synthetic-aircraft-b' };
  const unknown = { ...record('1007', null), aircraftRef: null, aircraftClass: null,
    flight: { ...record('1007', null).flight, registration: null, aircraft_model: null } };
  return {
    workspace: { owner, binding, records, observations: JSON.parse(JSON.stringify(records)) as PreviewRecord[],
      books: ([
        { id: 'preview-glider-a', name: 'Test-Segelflugbuch A', classes: ['glider'], format: 'synthetic-ten-row-v1' },
        { id: 'preview-glider-b', name: 'Test-Segelflugbuch B', classes: ['glider'], format: 'synthetic-ten-row-v1' },
        { id: 'preview-powered', name: 'Test-Motorflugbuch', classes: ['powered'], format: 'synthetic-powered-five-row-v1' },
      ] satisfies Omit<Book, 'owner' | 'from' | 'through'>[]).map(b => ({ ...b, owner, from: '2026-01-01', through: null })),
      choices: records.filter(r => r.sourceFlightId !== '1009').map(r => ({ owner, id: sourceIdentity(binding, r.sourceFlightId), evidence: recordEvidence(r), bookId: r.sourceFlightId === '1002' ? 'preview-glider-b' : 'preview-glider-a' })),
    },
    batch: { owner, binding, identityVerified: true, sourceIdsVerified: true, timeBasisVerified: true, scope: 'own-pilot-or-companion',
      coverage: { from: '2026-10-01', through: '2026-10-18', complete: true },
      records: [record('1001'), changed, conflict, alternative, powered, record('1005'), ambiguous, unknown, { ...record('1008'), duplicate: true }, record('1001')],
    },
  };
}

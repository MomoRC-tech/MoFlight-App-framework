import type { ProbeSnapshot } from '../../apps/platform-lab/src/vereinsflieger/probe.ts';

export function captureFixture(count = 1): ProbeSnapshot {
  const headers = ['Datum', 'Lfz.', 'Start', 'Landung', 'Flugzeit', 'Lfz.-Muster', 'Pilot', 'PIC', 'Begleiter/FI', 'Flugzeit in hh:mm', 'Bemerkung'];
  return {
    captureId: 'synthetic-readable-capture', retrievedAt: '2026-10-18T12:00:00.000Z', headers,
    rows: Array.from({ length: count }, (_, i) => ({ sourceFlightId: String(1000 + i),
      values: ['18.10.2026', `D-T${String(i).padStart(3, '0')}`, '23:55', '00:15', '12', 'Synthetic glider', 'Synthetic A', 'Synthetic B', 'Synthetic C', '00:12', 'Synthetic note'] })),
    sourceIdentity: 'unverified', coverage: 'complete-requested-list', timeBasis: 'unknown',
    exportContext: { from: '2026-10-01', to: '2026-10-18', preset: 'Konfiguration laden', participation: 'Pilot oder Fluglehrer',
      accountLabel: 'Synthetic profile', recordCount: count, pageCount: Math.max(1, count), columnIds: headers.map((_, i) => String(i + 1)), adapterVersion: 2 },
  };
}

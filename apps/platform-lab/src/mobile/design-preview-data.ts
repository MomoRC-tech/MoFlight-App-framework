import { adaptHistoryFacts } from '../vereinsflieger/history-facts';
import type { RealFlightDetail } from '../vereinsflieger/real-flight-library';
import type { FeatureInformation } from './feature-information';
import type { OwnFlightView } from './own-flight-reader';
import type { DutyItem, DutyOverview } from '../vereinsflieger/duties';

export const DESIGN_PREVIEW_NOW = Date.parse('2026-10-22T12:00:00.000Z');
export const DESIGN_PREVIEW_SCOPE = {
  ownerId: 'synthetic-design-owner', storeId: 'synthetic-design-store',
  bindingId: 'synthetic-design-binding', accountRef: 'synthetic-design-account',
} as const;

/** Presentation-only facts. No storage, service, session, or provider is opened. */
export function createDesignPreviewData(scenario: 'default' | 'undated' | 'same-day' = 'default'): { view: OwnFlightView; details: RealFlightDetail[]; dutyOverview: DutyOverview } {
  const headers = ['Datum', 'Lfz.', 'Start', 'Landung', 'Flugzeit', 'Lfz.-Muster', 'Pilot', 'PIC', 'Begleiter/FI', 'Startort', 'Landeort', 'Bemerkung'];
  let rows = [
    ['21.10.2026', 'D-SYN1', '12:10', '13:35', '85', 'ASK 21 · Demo', 'Demo Pilot A', 'Demo Pilot A', 'Demo Trainer', 'Demo Talwiese', 'Demo Talwiese', 'Synthetischer Übungsflug'],
    ['18.10.2026', 'D-SYN2', '11:00', '11:00', '0', 'LS4 · Demo', 'Demo Pilot A', 'Demo Pilot A', '', 'Demo Höhenfeld', 'Demo Höhenfeld', 'Explizit gemeldete Nullzeit'],
    ['03.09.2026', 'D-SYN1', '10:15', '12:00', '', 'ASK 21 · Demo', 'Demo Pilot A', '', 'Demo Trainer', 'Demo Talwiese', 'Demo Nordplatz', 'Flugzeit unbekannt; nicht aus Uhrzeiten ableiten'],
    ['12.07.2026', 'D-SYN3', '09:20', '12:20', '180', 'Discus · Demo', 'Demo Pilot A', 'Demo Pilot A', '', 'Demo Nordplatz', 'Demo Talwiese', 'Synthetischer Streckenflug'],
    ['24.05.2026', 'D-SYN2', '14:05', '15:00', '55', 'LS4 · Demo', 'Demo Pilot A', 'Demo Pilot A', '', 'Demo Talwiese', 'Demo Talwiese', 'Synthetische Thermik'],
    ['11.10.2025', 'D-SYN1', '12:00', '12:40', '40', 'ASK 21 · Demo', 'Demo Pilot A', '', 'Demo Trainer', 'Demo Höhenfeld', 'Demo Höhenfeld', 'Synthetischer Vorjahresflug'],
    ['16.08.2025', 'D-SYN3', '10:00', '12:05', '125', 'Discus · Demo', 'Demo Pilot A', 'Demo Pilot A', '', 'Demo Nordplatz', 'Demo Nordplatz', 'Synthetischer Vorjahresflug'],
    ['20.04.2025', 'D-SYN2', '13:00', '13:30', '', 'LS4 · Demo', 'Demo Pilot A', '', '', 'Demo Talwiese', 'Demo Talwiese', 'Unbekannte gemeldete Dauer'],
  ];
  if (scenario === 'undated') rows = [[...rows[0]!]];
  if (scenario === 'undated') rows[0]![0] = '';
  if (scenario === 'same-day') {
    rows = [[...rows[0]!], [...rows[1]!]];
    rows[1]![0] = rows[0]![0]!;
    rows[1]![2] = '';
  }
  const capture = { captureId: 'synthetic-design-capture', headers,
    rows: rows.map((values, index) => ({ values, sourceFlightId: String(990001 + index) })) };
  const flights = capture.rows.map((row, index) => ({
    flightId: `synthetic-design-flight-${index + 1}`, bindingId: DESIGN_PREVIEW_SCOPE.bindingId,
    accountRef: DESIGN_PREVIEW_SCOPE.accountRef, sourceFlightRef: row.sourceFlightId,
    firstCaptureId: capture.captureId, factsRevision: 1, unassigned: true as const,
    facts: adaptHistoryFacts({ ownerId: DESIGN_PREVIEW_SCOPE.ownerId, scopeId: DESIGN_PREVIEW_SCOPE.bindingId }, capture, index),
  }));
  const details: RealFlightDetail[] = flights.map((flight, rowIndex) => ({ ...flight, captures: [], pending: [],
    factHistory: [{ version: 1, bindingId: flight.bindingId, flightId: flight.flightId, facts: flight.facts,
      predecessor: null, reason: 'source-change', captureId: capture.captureId, rowIndex }],
  }));
  const featureInformation: FeatureInformation = {
    workSummary: { status: 'partial', retrievedAt: '2026-10-22T10:00:00.000Z', filters: [], truncated: false,
      items: [{key:'synthetic-work-2026',period:'Jahr 2026',obligation:'90,00 \u20ac',performed:'21,50 \u20ac',hours:'07:25'}] },
    events: { status: 'partial', retrievedAt: '2026-10-22T10:00:00.000Z', filters: ['Quellkategorie: Termine', 'Ab 22.10.2026', 'Ansicht: 3 Monate'], truncated: false,
      items: [
        { key: 'synthetic-event-1', date: '24.10.2026', time: '10:00', kind: 'Termine', title: 'Demo Saisonabschluss', location: 'Demo Talwiese' },
        { key: 'synthetic-event-2', date: '07.11.2026', time: '09:00', kind: 'Termine', title: 'Demo Werkstatttag', location: 'Demo Werkstatt' },
        { key: 'synthetic-event-3', date: '21.11.2026', time: '18:00', kind: 'Termine', title: 'Demo Vereinsabend', location: null },
      ] },
    documentNotices: { status: 'partial', retrievedAt: '2026-10-22T10:00:00.000Z', filters: [], truncated: false,
      items: [{ key: 'synthetic-document-1', text: 'Demo Winterprogramm 20.10.2026' }, { key: 'synthetic-document-2', text: 'Demo Werkstattplan 18.10.2026' }] },
  };
  const ownDuty: DutyItem = { key: 'synthetic-own-duty', duty: 'Demo Flugleitung', period: '24.10.2026 · 09:00–18:00',
    start: '2026-10-24', end: '2026-10-24', people: ['Demo Pilot A.'], ownState: 'own', coAssignees: [],
    sourcePath: '/member/profile/myservices.php', identity: 'source-row-only', periodBasis: 'displayed-calendar-days' };
  const clubDuty: DutyItem = { ...ownDuty, key: 'synthetic-club-duty', duty: 'Demo Windenbetrieb', period: '25.10.2026 · 09:00–18:00',
    start: '2026-10-25', end: '2026-10-25', people: ['Demo Pilot B.'], ownState: 'unknown', sourcePath: '/member/community/serviceshedulelist.php' };
  const dutyOverview: DutyOverview = { status: 'partial', window: { start: '2026-10-22', end: '2026-11-01' },
    clubLabel: 'Demo Segelflugverein Talwiese', retrievedAt: '2026-10-22T10:00:00.000Z', items: [ownDuty, clubDuty],
    ownItems: [ownDuty], laterOwn: [], unplaced: [], coverageMessage: 'Erfundener Seitenausschnitt · Vollständigkeit und Partner ungeprüft.' };
  return { details, dutyOverview, view: { featureInformation, featureInformationReadFailed: false, flights, pendingCommand: false, snapshot: {
    version: 1, ownerId: DESIGN_PREVIEW_SCOPE.ownerId, storeId: DESIGN_PREVIEW_SCOPE.storeId, generation: 1,
    account: { provider: 'vereinsflieger', accountRef: DESIGN_PREVIEW_SCOPE.accountRef }, coverage: [],
    savedRetrievals: [{ from: '2025-01-01', to: '2025-12-31', retrievedAt: '2026-10-22T10:00:00.000Z', savedAt: '2026-10-22T10:01:00.000Z' },
      { from: '2026-01-01', to: '2026-10-22', retrievedAt: '2026-10-22T10:00:00.000Z', savedAt: '2026-10-22T10:01:00.000Z' }],
    pending: [], latestSavedResult: null, recovery: { readOnly: false, warning: null },
  } } };
}

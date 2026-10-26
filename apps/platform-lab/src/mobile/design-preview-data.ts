import { adaptHistoryFacts } from '../vereinsflieger/history-facts';
import type { RealFlightDetail } from '../vereinsflieger/real-flight-library';
import type { FeatureInformation } from './feature-information';
import type { OwnFlightView } from './own-flight-reader';
import { buildDutyOverview, type DutyOverview, type DutyRosterSnapshot } from '../vereinsflieger/duties';

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
  const capture = { captureId: 'synthetic-design-capture', headers:[...headers,'Flugmodus','Begleiter 2','Begleiter 3','SIC','Luftfahrzeugart','S-Art','Dual-Time'],
    rows: rows.map((values, index) => {
      const display=[...values];
      display[5]=display[5]!.replace(' · Demo','');
      display[6]=index===1?'Mira Koch':'Jonas Winter';
      if(display[7])display[7]=index===0?'Lea Berger':display[6]!;
      if(index===2)display[7]=display[6]!;
      if(display[8])display[8]='Lea Berger';
      display[9]='Musterfeld';display[10]=index===2?'Beispielort':'Musterfeld';
      return { values:[...display,[1,3,4,6].includes(index)?'Solo':'',index===2?'Alexandra Marie Beispiel':'','',index===0?display[6]!:'',index===2?'':'Segelflugzeug',index===2?'?':index%2?'F':'W',index===0?'01:25':''],sourceFlightId:String(990001+index) };
    }) };
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
  // Raw fictional capture labels exercise the real display projection, rather
  // than bypassing it with preformatted names in visual acceptance checks.
  const dutySnapshot: DutyRosterSnapshot = {version:1,retrievedAt:'2026-10-22T10:00:00.000Z',
    scope:{version:1,owner:'synthetic-design-owner',connectionId:'synthetic-design-duty',context:{accountNumber:'1001',clubLabel:'Demo Segelflugverein Talwiese',clubIdentity:'display-label-only',verification:'observed-profile-number'}},
    captures:[]};
  dutySnapshot.captures = [
    {path:'/member/profile/myservices.php',duty:'Demo Flugleitung',period:'24.10.2026 09:00 - 24.10.2026 18:00',people:'Example, Merlin'},
    {path:'/member/community/serviceshedulelist.php',duty:'Demo Windenbetrieb',period:'25.10.2026 09:00 - 25.10.2026 18:00',people:'Synthetic, Anna Maria\nExample, Emil'},
  ].map((row,index)=>({version:1,id:`synthetic-duty-${index}`,owner:dutySnapshot.scope.owner,connectionId:dutySnapshot.scope.connectionId,retrievedAt:dutySnapshot.retrievedAt,sourceIdentity:'provisional-observed-profile',category:'duties',path:row.path,
    columns:[{key:'duty',label:'Dienst',index:0},{key:'period',label:'Zeitraum',index:1},{key:'people',label:'Person(en)',index:2}],
    rows:[{position:0,values:[row.duty,row.period,row.people]}],filters:[],empty:false,coverage:{kind:'visible-page',truncated:false,pagination:'unverified'}}));
  const dutyOverview=buildDutyOverview(dutySnapshot.scope,dutySnapshot,'2026-10-22',DESIGN_PREVIEW_NOW);
  return { details, dutyOverview, view: { featureInformation, featureInformationReadFailed: false, flights, pendingCommand: false, snapshot: {
    version: 1, ownerId: DESIGN_PREVIEW_SCOPE.ownerId, storeId: DESIGN_PREVIEW_SCOPE.storeId, generation: 1,
    account: { provider: 'vereinsflieger', accountRef: DESIGN_PREVIEW_SCOPE.accountRef }, coverage: [],
    savedRetrievals: [{ from: '2025-01-01', to: '2025-12-31', retrievedAt: '2026-10-22T10:00:00.000Z', savedAt: '2026-10-22T10:01:00.000Z' },
      { from: '2026-01-01', to: '2026-10-22', retrievedAt: '2026-10-22T10:00:00.000Z', savedAt: '2026-10-22T10:01:00.000Z' }],
    pending: [], latestSavedResult: null, recovery: { readOnly: false, warning: null },
  } } };
}

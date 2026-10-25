/** Local-data state only. Network availability and provider history are never inferred. */
export type FlightStartState = 'loading' | 'failed' | 'missing' | 'ready';
export type FlightStartGuidance = { kind: 'start' | 'load' | 'captured-empty'; title: string; message: string };

export function flightStartGuidance(input: {
  phase: FlightStartState;
  accountAssociated: boolean;
  successfulRetrieval: boolean;
  savedFlights: number;
}): FlightStartGuidance | null {
  if (input.phase === 'loading' || input.phase === 'failed') return null;
  if (input.savedFlights > 0) return null;
  if (!input.accountAssociated) return {
    kind: 'start', title: 'Eigene Flüge laden',
    message: 'Tippe oben auf Sync, wenn du Internet hast. Falls nötig, meldest du dich auf der Originalseite von Vereinsflieger an. Danach werden deine Flüge auf diesem Gerät gespeichert.',
  };
  if (!input.successfulRetrieval) return {
    kind: 'load', title: 'Noch kein bestätigter Flugabruf',
    message: 'Für dieses Konto sind noch keine Flugdaten bestätigt gespeichert. Tippe oben auf Sync, sobald du Internet hast. Du kannst die Anmeldung abbrechen und später fortsetzen.',
  };
  if (input.savedFlights === 0) return {
    kind: 'captured-empty', title: 'Keine Flüge im erfassten Zeitraum',
    message: 'Der letzte bestätigte Abruf hat hier keine Flüge gespeichert. Andere oder noch nicht erfasste Zeiträume bleiben unbekannt. Über Sync kannst du erneut prüfen.',
  };
  return null;
}

export const SAVED_FLIGHTS_OFFLINE_HINT = 'Gespeicherte Flüge kannst du ohne Internet ansehen. Für neue Daten brauchst du Sync und eine Verbindung.';

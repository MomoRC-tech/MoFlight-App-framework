export type CaptureReadState = 'loading' | 'ready' | 'failed';
const week = 7 * 24 * 60 * 60 * 1000;

/** Successful capture time only. A session check or failed refresh cannot renew it. */
export function dataFreshness(retrievedAt: string | null, readState: CaptureReadState, now = Date.now()) {
  const time = retrievedAt === null ? NaN : Date.parse(retrievedAt);
  const valid = Number.isFinite(time) && Number.isFinite(now) && time <= now && new Date(time).toISOString() === retrievedAt;
  const readNote = readState === 'loading' ? 'Gespeicherter Stand wird geladen…' :
    readState === 'failed' ? 'Gespeicherter Stand konnte nicht erneut gelesen werden. Frühere Daten bleiben erhalten.' : '';
  if (!valid) return {
    label: retrievedAt !== null ? 'Zeitpunkt des letzten Abrufs unklar' : readState === 'ready' ? 'Noch keine Flugdaten abgerufen' : 'Letzter Flugdatenabruf noch nicht bestätigt',
    reminder: false,
    note: readNote,
  };
  const reminder = now - time > week;
  return {
    label: `Letzter Flugdatenabruf: ${new Date(time).toLocaleString('de-DE')}`,
    reminder,
    note: readNote || (reminder ? 'Der Abruf liegt mehr als eine Woche zurück. Du kannst die Daten aktualisieren; gespeicherte Daten bleiben offline verfügbar.' : ''),
  };
}

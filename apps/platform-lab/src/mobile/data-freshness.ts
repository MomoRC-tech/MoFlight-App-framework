export type CaptureReadState = 'loading' | 'ready' | 'failed';
export const DATA_FRESHNESS_REMINDER_MS = 72 * 60 * 60 * 1000;
export const DATA_UPDATE_FRESH_MS = 60 * 60 * 1000;

/** Selected library's committed retrieval only; login checks cannot renew it. */
export function dataUpdateStatus(receivedAt: string | null, readState: CaptureReadState, now = Date.now()) {
  const time = receivedAt === null ? NaN : Date.parse(receivedAt);
  if (!Number.isFinite(time) || !Number.isFinite(now) || time > now || new Date(time).toISOString() !== receivedAt) {
    return { state: 'unknown' as const,
      caption: readState === 'loading' ? 'Lädt…' : receivedAt || readState === 'failed' ? 'Unklar' : 'Noch nie',
      description: receivedAt ? 'Zeitpunkt des letzten Datenabrufs unklar.' : readState === 'loading' ? 'Gespeicherter Datenstand wird geladen.' :
        readState === 'failed' ? 'Gespeicherter Datenstand konnte nicht gelesen werden.' : 'Noch keine Flugdaten empfangen.' };
  }
  const age = now - time;
  const caption = age < 60_000 ? 'gerade' : age < DATA_UPDATE_FRESH_MS ? `vor ${Math.floor(age / 60_000)} Min.` :
    age < 24 * DATA_UPDATE_FRESH_MS ? `vor ${Math.floor(age / DATA_UPDATE_FRESH_MS)} Std.` : `vor ${Math.floor(age / (24 * DATA_UPDATE_FRESH_MS))} Tg.`;
  return { state: age < DATA_UPDATE_FRESH_MS ? 'fresh' as const : 'older' as const, caption,
    description: `Letzter gespeicherter Flugdatenabruf von Vereinsflieger: ${new Date(time).toLocaleString('de-DE')}.` };
}

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
  const reminder = now - time > DATA_FRESHNESS_REMINDER_MS;
  return {
    label: `Letzter Flugdatenabruf: ${new Date(time).toLocaleString('de-DE')}`,
    reminder,
    note: readNote || (reminder ? 'Der letzte Flugdatenabruf liegt mehr als drei Tage zurück. Du kannst die Daten aktualisieren; gespeicherte Daten bleiben offline verfügbar.' : ''),
  };
}

import type { ConnectionState } from '../vereinsflieger/connection-state';

export const SESSION_DISPLAY_FRESH_MS = 90_000;

/** Remembers display evidence only. Never use this selector to authorize work. */
export function createSessionPresentation() {
  let previous: { scope: string; state: ConnectionState } | null = null;
  return (scope: string | null, connection: ConnectionState | undefined, now: number) => {
    const timestamp = connection?.lastCheckedAt;
    const checkedAt = Date.parse(timestamp ?? '');
    const recent = Number.isFinite(now) && Number.isFinite(checkedAt) &&
      new Date(checkedAt).toISOString() === timestamp && now >= checkedAt && now - checkedAt < SESSION_DISPLAY_FRESH_MS;
    const context = connection?.observed;
    const confirmed = !!scope && connection?.phase === 'observed' && connection.confirmed && !!context && recent;
    const continuing = !!scope && previous?.scope === scope && connection?.phase === 'checking' && recent &&
      previous.state.lastCheckedAt === timestamp && !!context &&
      previous.state.observed?.accountNumber === context.accountNumber && previous.state.observed?.clubLabel === context.clubLabel;
    if (confirmed) previous = { scope, state: { ...connection, observed: { ...context } } };
    else if (!continuing) previous = null;
    if (confirmed || continuing) return {
      state: 'connected' as const, mark: '✓',
      description: `Angemeldet${continuing ? ' · Sitzung wird erneut geprüft' : ''}. Zuletzt bestätigt: ${new Date(checkedAt).toLocaleString('de-DE')}.`,
    };
    if (connection?.phase === 'login-required') return { state: 'login-required' as const, mark: '→', description: 'Anmeldung erforderlich.' };
    if (connection?.phase === 'mismatch') return { state: 'unknown' as const, mark: '!', description: 'Anderes Konto oder anderer Verein. Anmeldung nicht bestätigt.' };
    if (connection?.phase === 'error') return { state: 'unknown' as const, mark: '!', description: 'Anmeldung konnte nicht geprüft werden.' };
    return { state: 'unknown' as const, mark: '?', description: connection?.phase === 'checking' ? 'Anmeldung wird geprüft.' : 'Anmeldung aktuell ungeprüft.' };
  };
}

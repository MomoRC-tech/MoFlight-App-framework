import type { ConnectionState } from '../vereinsflieger/connection-state';

export interface OwnFlightConnectionEvidence { ownerId: string; state: ConnectionState }
/** Read-only handoff from the successful foreground flow, never authorization. */
export function ownFlightConnectionState(evidence: OwnFlightConnectionEvidence | null | undefined,
  ownerId: string | undefined, accountRef: string | undefined): ConnectionState {
  const state=evidence?.state;
  if(evidence?.ownerId===ownerId && ownerId && accountRef && state?.phase==='observed' &&
    state.confirmed && state.observed?.accountNumber===accountRef && state.lastCheckedAt) return state;
  return {phase:'unknown',confirmed:false,observed:null,lastCheckedAt:null};
}

/** Non-color cues describe session evidence, never saved-flight freshness. */
export function connectionSymbol(state: ConnectionState) {
  if (state.phase === 'observed' && state.confirmed && state.observed && state.lastCheckedAt) return { mark: '✓', color: '#74dfba' };
  if (state.phase === 'login-required') return { mark: '→', color: '#ffc477' };
  if (state.phase === 'mismatch' || state.phase === 'error' || state.phase === 'observed' && state.observed && !state.confirmed) return { mark: '!', color: '#ffb39e' };
  return { mark: '?', color: '#adbed5' };
}

/** Presentation only: never starts work, changes association or infers logout. */
export function connectionGuidance(state: ConnectionState, browserActive: boolean) {
  const check = { action: 'check', actionLabel: 'Sitzung prüfen' } as const;
  const connect = { action: 'connect', actionLabel: 'Bei Vereinsflieger anmelden' } as const;
  switch (state.phase) {
    case 'checking':
      return { title: 'Sitzung wird geprüft…', hint: 'Bitte kurz warten.', action: null, actionLabel: '' } as const;
    case 'login-required':
      return { title: 'Bitte bei Vereinsflieger anmelden', hint: 'Die Originalseite öffnet sich in der App.', ...connect };
    case 'mismatch':
      return { title: 'Anderes Konto oder anderer Verein', hint: 'Der Abruf bleibt gesperrt. Deine bisherige Zuordnung und gespeicherte Daten bleiben erhalten. Melde dich mit dem bisherigen Konto an.', ...connect };
    case 'observed':
      if (!state.confirmed && state.observed) return {
        title: 'Konto prüfen', hint: 'Prüfe die Kontozuordnung unten, bevor du sie bestätigst.', action: null, actionLabel: '',
      } as const;
      if (state.confirmed && state.observed && state.lastCheckedAt) return {
        title: `Zuletzt bestätigt: ${new Date(state.lastCheckedAt).toLocaleString('de-DE')}`,
        hint: 'Die Prüfung passte zur vorläufigen Kontozuordnung. Sie garantiert keine dauerhaft gültige Anmeldung.',
        ...(browserActive ? { ...check, actionLabel: 'Sitzung erneut prüfen' } : connect),
      };
      // An incomplete observation cannot offer an account confirmation.
      return { title: 'Sitzung ungeprüft', hint: 'Prüfe die Sitzung erneut.', ...(browserActive ? check : connect) };
    case 'error':
      return { title: 'Sitzung konnte nicht geprüft werden', hint: 'Gespeicherte Flüge bleiben verfügbar. Prüfe die Sitzung erneut oder melde dich auf der Originalseite an.',
        ...(browserActive ? { ...check, actionLabel: 'Erneut prüfen' } : connect) };
    case 'disconnected':
    case 'unknown':
      return { title: 'Sitzung ungeprüft', hint: 'Gespeicherte Flüge bleiben verfügbar.', ...(browserActive ? check : connect) };
  }
}

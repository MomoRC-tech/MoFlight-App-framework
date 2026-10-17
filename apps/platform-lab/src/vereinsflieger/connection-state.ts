import { sameContext, validateContext, type ObservedContext } from './context';

export type ConnectionPhase = 'disconnected' | 'checking' | 'login-required' | 'observed' | 'mismatch' | 'error' | 'unknown';
export interface ConnectionState {
  phase: ConnectionPhase;
  lastCheckedAt: string | null;
  observed: ObservedContext | null;
  confirmed: boolean;
}

/** App-run observation only. Owns no cookies, credentials, persistence or captures.
 * The private, deliberately confirmed association survives invalidation so a later
 * check cannot silently accept another provider account. Public confirmed means
 * the current observation matches that association, never production identity.
 * Callers must validate the native bridge/document/nonce before observe().
 */
export class ConnectionSession {
  private value: ConnectionState = { phase: 'disconnected', lastCheckedAt: null, observed: null, confirmed: false };
  private owner: string | null = null;
  private association: ObservedContext | null = null;

  get state(): ConnectionState {
    return { ...this.value, observed: this.value.observed ? { ...this.value.observed } : null };
  }
  owns(nonce: string): boolean { return this.owner !== null && this.owner === nonce; }
  start(nonce: string): boolean {
    if (this.owner !== null || !nonce.trim()) return false;
    this.owner = nonce;
    this.value = { ...this.value, phase: 'checking', confirmed: false };
    return true;
  }
  observe(nonce: string, context: unknown, at: string): boolean {
    if (!this.owns(nonce)) return false;
    let observed: ObservedContext;
    try {
      observed = validateContext(context);
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(at) || !Number.isFinite(Date.parse(at)) || new Date(at).toISOString() !== at) throw new Error('Invalid check time');
    } catch { this.fail(nonce, 'error'); return false; }
    this.owner = null;
    const mismatch = this.association !== null && !sameContext(this.association, observed);
    this.value = { phase: mismatch ? 'mismatch' : 'observed', lastCheckedAt: at, observed, confirmed: !mismatch && this.association !== null };
    return !mismatch;
  }
  confirm(): boolean {
    if (this.value.phase !== 'observed' || !this.value.observed || this.owner !== null) return false;
    this.association = { ...this.value.observed };
    this.value = { ...this.value, confirmed: true };
    return true;
  }
  fail(nonce: string, phase: 'login-required' | 'error'): boolean {
    if (!this.owns(nonce)) return false;
    this.owner = null;
    this.value = { ...this.value, phase, confirmed: false };
    return true;
  }
  invalidate(): void {
    this.owner = null;
    this.value = { ...this.value, phase: 'unknown', confirmed: false };
  }
  /** Verified sign-out affects this observation only; keep the prior association
   * so reconnect cannot silently accept another account/club in this app run. */
  disconnected(): void {
    this.owner = null;
    this.value = { ...this.value, phase: 'disconnected', observed: null, confirmed: false };
  }
  cancel(): void {
    const disconnected = this.value.phase === 'disconnected';
    this.invalidate();
    if (disconnected) this.value.phase = 'disconnected';
  }
}

export function connectionLabel(state: ConnectionState): string {
  switch (state.phase) {
    case 'disconnected': return 'Nicht verbunden';
    case 'checking': return 'Vereinsflieger wird geprüft';
    case 'login-required': return 'Anmeldung erforderlich';
    case 'observed': return state.confirmed ? 'Sitzung erkannt · Zuordnung vorläufig' : 'Sitzung erkannt · Zuordnung prüfen';
    case 'mismatch': return 'Konto oder Verein abweichend';
    case 'error': return 'Verbindung konnte nicht geprüft werden';
    case 'unknown': return 'Sitzung aktuell ungeprüft';
  }
}

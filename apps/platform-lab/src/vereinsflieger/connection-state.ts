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

/** Fixed user feedback only. Never echo provider errors, URLs or account data. */
export function retrievalFailureHint(status: string): string {
  const restored = ' Original provider view restored and verified.';
  const message = status.endsWith(restored) ? status.slice(0, -restored.length) : status;
  const stages: Record<string, string> = {
    'view-backup': 'Sichern der ursprünglichen Anbieteransicht',
    'view-backup-load': 'Laden der gesicherten Anbieteransicht',
    'view-backup-verify': 'Prüfen der gesicherten Anbieteransicht',
    'view-restore': 'Wiederherstellen der ursprünglichen Anbieteransicht',
    'view-verify': 'Prüfen der wiederhergestellten Anbieteransicht',
    'export-reset': 'Vorbereiten der Exportansicht',
    'export-columns': 'Prüfen der Exportspalten',
    'export-clear': 'Prüfen der Exportfilter',
    'export-participation': 'Prüfen der Beteiligungsrolle',
    'export-period': 'Prüfen des Abrufzeitraums',
    'export-read': 'Prüfen der Flugzeilen und Seitenabdeckung',
    capture: 'Verarbeiten der Rohbelege',
  };
  const stage = /^Retrieval validation failed at ([a-z-]+)\. Previous captures preserved\.$/.exec(message)?.[1];
  if (stage && Object.hasOwn(stages, stage)) return `${stages[stage]} fehlgeschlagen. Frühere Belege bleiben erhalten.`;
  const hints: Record<string, string> = {
    'Use valid inclusive dates in YYYY-MM-DD order.': 'Bitte gültige Datumsgrenzen im Format JJJJ-MM-TT eingeben.',
    'Provider context unavailable. Earlier captures and recovery journal retained.': 'Die Anbieteranmeldung konnte nicht erneut geprüft werden.',
    'Provider context mismatch. Capture rejected; original view recovery retained.': 'Konto oder Verein weicht ab. Der Rohabruf wurde verworfen; eine Wiederherstellung bleibt offen.',
    'Provider association not confirmed. Capture rejected.': 'Die vorläufige Kontozuordnung wurde nicht bestätigt.',
    'Provider left the expected flight document. Recovery retained.': 'Die erwartete Flugbuchseite wurde verlassen. Anmeldung und gegebenenfalls Wiederherstellung prüfen.',
    'Export step timed out. Previous captures preserved; retry after checking provider login.': 'Ein Abrufschritt hat zu lange gedauert. Anbieteranmeldung prüfen und erneut versuchen.',
    'Original view could not be read: required provider account, configuration or list controls are unavailable. No export settings changed.': 'Die ursprüngliche Anbieteransicht konnte nicht gelesen werden: Konto-, Ansichts- oder Listensteuerung fehlt. Exporteinstellungen wurden nicht geändert.',
    'Original view could not be read: provider filter controls are unsupported. No export settings changed.': 'Die Filter der ursprünglichen Anbieteransicht werden nicht unterstützt. Exporteinstellungen wurden nicht geändert.',
    'Original view could not be read: provider table headers do not match configured columns. No export settings changed.': 'Tabellenüberschriften und konfigurierte Spalten stimmen nicht überein. Exporteinstellungen wurden nicht geändert.',
    'Original view could not be verified against the supported provider controls. No export settings changed.': 'Die ursprüngliche Anbieteransicht entspricht nicht den unterstützten Steuerelementen. Exporteinstellungen wurden nicht geändert.',
    'Original view could not be protected because provider settings are unsupported. No export settings changed.': 'Die ursprüngliche Anbieteransicht konnte nicht sicher geschützt werden. Exporteinstellungen wurden nicht geändert.',
    'Original view could not be journaled. No export settings changed; recovery must be checked before another export.': 'Die ursprüngliche Anbieteransicht konnte nicht lokal gesichert werden. Vor einem neuen Abruf die Wiederherstellung prüfen.',
    'Retrieval or local saving failed. Previous captures preserved. Sign in again if needed, then retry.': 'Anbieteransicht, Rohdatenprüfung oder lokale Speicherung ist fehlgeschlagen. Frühere Belege bleiben erhalten.',
    'Local saving failed. Earlier captures retained.': 'Die neuen Rohbelege konnten nicht lokal gespeichert werden. Frühere Belege bleiben erhalten.',
    'Provider page failed to load. Previous captures preserved.': 'Die Anbieterseite konnte nicht geladen werden.',
    'Provider returned an HTTP error. Previous captures preserved.': 'Die Anbieterseite hat einen HTTP-Fehler gemeldet.',
  };
  if (status.endsWith(' Original view restoration is pending. Sign into the original account and retry restoration.')) {
    return 'Die ursprüngliche Anbieteransicht ist noch nicht wiederhergestellt. Im ursprünglichen Konto anmelden und die Wiederherstellung erneut versuchen.';
  }
  return Object.hasOwn(hints, message) ? hints[message]! : 'Abruf nicht abgeschlossen. Frühere Daten bleiben erhalten; Anmeldung und Wiederherstellung prüfen.';
}

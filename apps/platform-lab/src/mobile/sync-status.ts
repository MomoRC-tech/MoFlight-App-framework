import { dataFreshness, dataUpdateStatus, type CaptureReadState } from './data-freshness';
import { idleSyncProgress, type SyncProgress } from './sync-progress';

export type BadgeTone = 'neutral' | 'success' | 'advice' | 'error';
export type SyncStatusReason = 'active' | 'waiting' | 'read-error' | 'partial' | 'failed' | 'changed' | 'stale' | 'unknown' | 'success' | 'saved';
export interface SyncStatus { reason: SyncStatusReason; mark: string; tone: BadgeTone; description: string }
/** Receipt age, a complete job result and login proof are distinct evidence. */
export function syncStatus({ receivedAt, readState, now, activityChanged = false, completed = false, progress = idleSyncProgress }: {
  receivedAt: string | null; readState: CaptureReadState; now: number; activityChanged?: boolean; completed?: boolean; progress?: SyncProgress;
}): SyncStatus {
  if (progress.state === 'active') return { reason: 'active', mark: '', tone: 'neutral', description: 'Synchronisierung läuft.' };
  if (progress.state === 'waiting') return { reason: 'waiting', mark: '…', tone: 'advice', description: 'Synchronisierung wartet auf die Anmeldung.' };
  if (readState === 'failed') return { reason: 'read-error', mark: '!', tone: 'error', description: 'Gespeicherte Daten konnten nicht erneut gelesen werden. Frühere Daten bleiben erhalten.' };
  if (progress.state === 'partial' || progress.state === 'failed') return {
    reason: progress.state, mark: '!', tone: 'error',
    description: `${progress.state === 'partial' ? 'Teilweise aktualisiert.' : 'Synchronisierung nicht abgeschlossen.'} ${progress.message ?? 'Details öffnen.'}`,
  };
  if (activityChanged) return { reason: 'changed', mark: '!', tone: 'advice', description: 'Änderungen möglich. Eine beobachtete Anzahl hat sich geändert; neue Flüge sind damit nicht bestätigt.' + (dataFreshness(receivedAt, readState, now).reminder ? ' Synchronisieren empfohlen: Flugdaten älter als drei Tage.' : '') };
  if (dataFreshness(receivedAt, readState, now).reminder) return { reason: 'stale', mark: 'ALT', tone: 'advice', description: 'Synchronisieren empfohlen: Flugdaten älter als drei Tage.' };
  if (dataUpdateStatus(receivedAt, readState, now).state === 'unknown') return { reason: 'unknown', mark: '?', tone: 'neutral', description: 'Noch kein bestätigter Datenstand verfügbar.' };
  if (completed) return { reason: 'success', mark: 'OK', tone: 'success', description: 'Letzte Synchronisierung abgeschlossen. Die angefragten Quellen wurden verarbeitet; ihre jeweilige Abdeckung bleibt begrenzt.' };
  return { reason: 'saved', mark: '✓', tone: 'neutral', description: 'Flugdaten gespeichert. Das Ergebnis der letzten Synchronisierung aller Quellen ist in dieser Sitzung nicht bestätigt.' };
}

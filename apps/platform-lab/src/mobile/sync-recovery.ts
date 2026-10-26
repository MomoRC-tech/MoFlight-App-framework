import type { OtherAccountDataResult } from './account-retrieval-jobs';
import type { OwnFlightStoredSnapshot } from '../vereinsflieger/real-flight-service';
import type { RealFlightResult } from '../vereinsflieger/real-flight-library-model';

/** A small progress marker. Source payloads and provider credentials stay in their existing stores. */
export interface SyncRecoveryRecord {
  version: 1;
  ownerId: string;
  storeId: string;
  accountRef: string | null;
  clubLabel: string | null;
  startedAt: string;
  flightCaptureId: string | null;
  sources: Partial<OtherAccountDataResult>;
}

export function decodeSyncRecovery(value: unknown, ownerId: string, storeId: string): SyncRecoveryRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid saved Sync progress.');
  const row = value as Record<string, unknown>;
  if (Object.keys(row).sort().join(',') !== 'accountRef,clubLabel,flightCaptureId,ownerId,sources,startedAt,storeId,version' ||
      row.version !== 1 || row.ownerId !== ownerId || row.storeId !== storeId ||
      typeof row.startedAt !== 'string' || !Number.isFinite(Date.parse(row.startedAt)) ||
      (row.accountRef !== null && (typeof row.accountRef !== 'string' || row.accountRef.length > 128)) ||
      (row.clubLabel !== null && (typeof row.clubLabel !== 'string' || row.clubLabel.length > 256)) ||
      (row.flightCaptureId !== null && (typeof row.flightCaptureId !== 'string' || row.flightCaptureId.length > 128)) ||
      !row.sources || typeof row.sources !== 'object' || Array.isArray(row.sources)) throw new Error('Foreign or invalid saved Sync progress.');
  const allowed: Record<keyof OtherAccountDataResult, readonly string[]> = {
    medical: ['updated', 'empty'], duties: ['partial'], events: ['partial'], documentNotices: ['partial'],
    workSummary: ['partial'], workHours: ['partial'], tasks: ['partial'],
  };
  for (const [key, status] of Object.entries(row.sources)) {
    if (!(key in allowed) || !allowed[key as keyof OtherAccountDataResult].includes(status as string))
      throw new Error('Invalid saved Sync source status.');
  }
  return row as unknown as SyncRecoveryRecord;
}

export function recoveredFlight(record: SyncRecoveryRecord, snapshot: OwnFlightStoredSnapshot):
  { result: RealFlightResult; accountRef: string; from: string; to: string } | null {
  if (record.ownerId !== snapshot.ownerId || record.storeId !== snapshot.storeId || !record.flightCaptureId ||
      !record.accountRef || !record.clubLabel || snapshot.account?.accountRef !== record.accountRef || snapshot.recovery.readOnly) return null;
  const result = snapshot.latestSavedResult;
  const coverage = snapshot.coverage.find(row => row.captureId === record.flightCaptureId);
  const window = coverage?.coverage.displayedWindow;
  if (!result || result.kind !== 'import-unassigned' || result.captureId !== record.flightCaptureId ||
      !window || !snapshot.savedRetrievals.some(row => row.from === window.from && row.to === window.to)) return null;
  return { result, accountRef: record.accountRef, from: window.from, to: window.to };
}

export function remainingSyncSources(sources: Partial<OtherAccountDataResult>): boolean {
  return sources.medical !== 'updated' && sources.medical !== 'empty' ||
    (['duties', 'events', 'documentNotices', 'workSummary', 'workHours', 'tasks'] as const)
      .some(key => sources[key] !== 'partial');
}

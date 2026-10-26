import React, { useMemo } from 'react';
import type { ConnectionState } from '../vereinsflieger/connection-state';
import { createSessionPresentation } from './data-update-presentation';
import { dataUpdateStatus, type CaptureReadState } from './data-freshness';
import { Label } from './theme';
import type { SyncStatus } from './sync-status';

/** Display evidence only: session proof never admits a request or renews saved age. */
export function SyncStatusDetails({ scopeKey, connection, receivedAt, readState, now, activityChanged, status }: {
  scopeKey: string | null; connection: ConnectionState; receivedAt: string | null;
  readState: CaptureReadState; now: number; activityChanged: boolean;
  status?: SyncStatus;
}) {
  const presentSession = useMemo(createSessionPresentation, []);
  const session = presentSession(scopeKey, connection, now);
  return <>{status&&<Label>{status.description}</Label>}<Label>{session.description}</Label>
    <Label muted>{dataUpdateStatus(receivedAt, readState, now).description}</Label>
    {activityChanged && <Label muted>Änderungen möglich: Die beobachtete Anzahl hat sich geändert. Das bestätigt keine neuen Flüge.</Label>}
  </>;
}

import React, { useMemo } from 'react';
import type { ConnectionState } from '../vereinsflieger/connection-state';
import { createSessionPresentation } from './data-update-presentation';
import { dataUpdateStatus, type CaptureReadState } from './data-freshness';
import { Label } from './theme';

/** Display evidence only: session proof never admits a request or renews saved age. */
export function SyncStatusDetails({ scopeKey, connection, receivedAt, readState, now, activityChanged }: {
  scopeKey: string | null; connection: ConnectionState; receivedAt: string | null;
  readState: CaptureReadState; now: number; activityChanged: boolean;
}) {
  const presentSession = useMemo(createSessionPresentation, []);
  const session = presentSession(scopeKey, connection, now);
  return <><Label>{session.description}</Label>
    <Label muted>{dataUpdateStatus(receivedAt, readState, now).description}</Label>
    {activityChanged && <Label muted>Änderungen möglich: Die beobachtete Anzahl hat sich geändert. Das bestätigt keine neuen Flüge.</Label>}
  </>;
}

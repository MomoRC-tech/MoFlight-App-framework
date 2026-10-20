import React from 'react';
import type { useAccessController } from '../vereinsflieger/use-access-controller';
import { Action, Card, Label, Section } from './theme';
import { connectionGuidance } from './connection-guidance';
import { dataFreshness } from './data-freshness';

/** Read-only summary; all entry points open the same retained connection flow. */
export function ConnectionSummary({ controller, onOpen }: { controller: ReturnType<typeof useAccessController>; onOpen: () => void }) {
  const freshness = dataFreshness(controller.snapshot?.retrievedAt ?? null, controller.captureLoadState);
  return <Card>
    <Section title="Vereinsflieger & Daten" icon="chain" />
    <Label>{connectionGuidance(controller.connection, controller.browserActive).title}</Label>
    <Label muted>{freshness.label}</Label>
    {!!freshness.note && <Label muted>{freshness.note}</Label>}
    <Action secondary icon="chain" onPress={onOpen}>{freshness.reminder ? 'Daten aktualisieren' : !controller.snapshot && controller.captureLoadState === 'ready' ? 'Flugdaten abrufen' : 'Vereinsflieger & Daten öffnen'}</Action>
  </Card>;
}

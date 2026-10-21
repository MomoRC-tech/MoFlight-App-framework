import React from 'react';
import type { useAccessController } from '../vereinsflieger/use-access-controller';
import { Action, Card, Label, Section } from './theme';
import { connectionGuidance } from './connection-guidance';
import { dataFreshness } from './data-freshness';
import type { OwnFlightView } from './own-flight-reader';
import { planFlightRetrieval } from '../vereinsflieger/retrieval-policy';

/** Read-only summary; all entry points open the same retained connection flow. */
export function ConnectionSummary({ controller, onOpen, onUpdate, ownFlights, phase = 'loading' }: {
  controller: ReturnType<typeof useAccessController>; onOpen: () => void; onUpdate?: () => void;
  ownFlights?: OwnFlightView | null; phase?: 'loading' | 'ready' | 'missing' | 'failed';
}) {
  const plan = planFlightRetrieval(ownFlights?.snapshot.savedRetrievals ?? []);
  const freshness = dataFreshness(plan.lastSuccessfulRetrievalAt, phase === 'missing' ? 'ready' : phase);
  return <Card>
    <Section title="Deine Flüge" icon="flight-paper-plane" />
    {ownFlights ? <Label>{ownFlights.flights.length} Flüge auf diesem Gerät gespeichert</Label> : <Label>Deine Flüge und Saisonübersicht an einem Ort.</Label>}
    <Label muted>{freshness.label}</Label>
    {!!freshness.note && <Label muted>{freshness.note}</Label>}
    {!ownFlights?.snapshot.account && <Label muted>Du meldest dich auf der Originalseite von Vereinsflieger an. Anschließend laden und speichern wir deine Flüge für die Offline-Nutzung.</Label>}
    <Action icon="chain" disabled={phase === 'loading'} onPress={onUpdate ?? onOpen}>{ownFlights?.snapshot.account ? 'Flüge aktualisieren' : 'Mit Vereinsflieger anmelden & Flüge laden'}</Action>
    <Action secondary onPress={onOpen}>Verbindung & Optionen</Action>
    <Label muted>{connectionGuidance(controller.connection, controller.browserActive).title}</Label>
  </Card>;
}

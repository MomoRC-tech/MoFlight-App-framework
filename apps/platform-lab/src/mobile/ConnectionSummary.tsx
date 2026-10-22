import React, { useMemo } from 'react';
import type { useAccessController } from '../vereinsflieger/use-access-controller';
import { Action, Card, Label, Section } from './theme';
import { connectionGuidance } from './connection-guidance';
import { dataFreshness } from './data-freshness';
import type { OwnFlightView } from './own-flight-reader';
import { createProcessedSelector } from './processed-result';
import { planFlightRetrieval } from '../vereinsflieger/retrieval-policy';

/** Read-only summary; all entry points open the same retained connection flow. */
export function ConnectionSummary({ controller, onOpen, onUpdate, ownFlights, phase = 'loading', compact = false }: {
  controller: ReturnType<typeof useAccessController>; onOpen: () => void; onUpdate?: () => void;
  compact?: boolean; ownFlights?: OwnFlightView | null; phase?: 'loading' | 'ready' | 'missing' | 'failed';
}) {
  const processRetrieval = useMemo(() => createProcessedSelector(planFlightRetrieval), []);
  const scope = ownFlights ? JSON.stringify([ownFlights.snapshot.ownerId, ownFlights.snapshot.storeId, ownFlights.snapshot.account?.accountRef]) : null;
  const plan = processRetrieval(scope, ownFlights?.snapshot.savedRetrievals ?? null);
  const freshness = dataFreshness(plan?.lastSuccessfulRetrievalAt ?? null, phase === 'missing' ? 'ready' : phase);
  const recoveryNeedsAction = !!(ownFlights?.pendingCommand || ownFlights?.snapshot.recovery?.readOnly);
  return <Card style={compact ? { width: '100%', maxWidth: 430, alignSelf: 'center' } : undefined}>
    <Section title="Deine Flüge" icon="flight-paper-plane" />
    {ownFlights ? <Label>{ownFlights.flights.length} Flüge auf diesem Gerät gespeichert</Label> : <Label>Deine Flüge und Saisonübersicht an einem Ort.</Label>}
    {(ownFlights || phase !== 'missing') && <Label muted>{freshness.label}</Label>}
    {!!freshness.note && <Label muted>{freshness.note}</Label>}
    {!ownFlights?.snapshot.account && <Label muted>Bei Bedarf meldest du dich auf der Originalseite von Vereinsflieger an. Anschließend laden wir deine Flüge und Medical-Angaben und speichern sie für die Offline-Nutzung.</Label>}
    {recoveryNeedsAction && <Label>Eine Speicherung oder Wiederherstellung muss geprüft werden. Der letzte geprüfte Stand bleibt lesbar. Öffne Verbindung & Optionen.</Label>}
    <Action icon="chain" disabled={phase === 'loading'} onPress={onUpdate ?? onOpen}>{ownFlights?.snapshot.account ? 'Daten aktualisieren' : 'Anmelden & Daten laden'}</Action>
    {(!compact || recoveryNeedsAction) && <Action secondary onPress={onOpen}>Verbindung & Optionen</Action>}
    {!compact && <Label muted>{connectionGuidance(controller.connection, controller.browserActive).title}</Label>}
  </Card>;
}

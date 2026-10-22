import React, { useMemo } from 'react';
import type { ProviderStatus } from './ProviderConnection';
import { Card, Label, Section } from './theme';
import { dataFreshness } from './data-freshness';
import { flightReminder, snoozeFlightReminder, type FlightReminderReason } from './flight-reminder';
import type { OwnFlightView } from './own-flight-reader';
import { createProcessedSelector } from './processed-result';
import { planFlightRetrieval } from '../vereinsflieger/retrieval-policy';

/** Read-only data summary. Only the header may open provider update/login. */
export function ConnectionSummary({ ownFlights, phase = 'loading', compact = false, reminderSnooze = null, onSnoozeReminder, newOrChangedObservation = false, now = Date.now() }: {
  controller?: Pick<ProviderStatus,'connection'|'browserActive'>; onOpen?: () => void; onUpdate?: () => void;
  compact?: boolean; ownFlights?: OwnFlightView | null; phase?: 'loading' | 'ready' | 'missing' | 'failed';
  reminderSnooze?: { scopeKey: string; until: string | null } | null;
  onSnoozeReminder?: (scopeKey: string, until: string) => void;
  newOrChangedObservation?: boolean; now?: number;
}) {
  const processRetrieval = useMemo(() => createProcessedSelector(planFlightRetrieval), []);
  const currentOwnFlights = phase === 'failed' ? null : ownFlights;
  const scope = currentOwnFlights ? JSON.stringify([currentOwnFlights.snapshot.ownerId, currentOwnFlights.snapshot.storeId, currentOwnFlights.snapshot.account?.accountRef]) : null;
  const plan = processRetrieval(scope, currentOwnFlights?.snapshot.savedRetrievals ?? null);
  const readState = phase === 'missing' ? 'ready' : phase;
  const freshness = dataFreshness(plan?.lastSuccessfulRetrievalAt ?? null, readState, now);
  const headerHint=<Label muted>Neue Daten und Anmeldung erreichst du über die Verbindung oben in der Kopfzeile.</Label>;
  const recoveryNeedsAction = !!(currentOwnFlights?.pendingCommand || currentOwnFlights?.snapshot.recovery?.readOnly);
  const firstUse = !currentOwnFlights?.snapshot.account && phase !== 'loading' && phase !== 'failed';
  const needsInitialLoad = !!currentOwnFlights?.snapshot.account && !plan?.lastSuccessfulRetrievalAt && phase !== 'loading' && phase !== 'failed';
  const reminderScopeKey = currentOwnFlights?.snapshot.account?.accountRef && currentOwnFlights.snapshot.ownerId && currentOwnFlights.snapshot.storeId
    ? JSON.stringify([currentOwnFlights.snapshot.ownerId, currentOwnFlights.snapshot.storeId, currentOwnFlights.snapshot.account.accountRef]) : null;
  const matchingSnooze = reminderScopeKey && reminderSnooze?.scopeKey === reminderScopeKey ? reminderSnooze.until : null;
  const reminder = flightReminder({ successfulRetrievalAt: plan?.lastSuccessfulRetrievalAt, newOrChangedObservation: !!reminderScopeKey && newOrChangedObservation, snoozedUntil: matchingSnooze, now });
  const snooze = () => {
    if (!reminderScopeKey || !onSnoozeReminder) return;
    const until = snoozeFlightReminder(now);
    if (until) onSnoozeReminder(reminderScopeKey, until);
  };
  const reminderMessage = (reason: FlightReminderReason | null) => reason === 'both'
    ? 'Der letzte bestätigte Flugdatenabruf liegt mehr als 72 Stunden zurück; neue oder geänderte Fluginformationen wurden erkannt.'
    : reason === 'new-or-changed' ? 'Neue oder geänderte Fluginformationen wurden erkannt.'
    : 'Der letzte bestätigte Flugdatenabruf liegt mehr als 72 Stunden zurück.';

  if (phase === 'failed') return <Card style={compact ? { width: '100%', maxWidth: 520, alignSelf: 'center' } : undefined}>
    <Label>Gespeicherte Flugdaten konnten nicht gelesen werden. Ein aktueller Stand wird nicht angezeigt.</Label>
    {headerHint}
  </Card>;
  if (compact && phase === 'loading' && !recoveryNeedsAction) return null;
  if (compact && !firstUse && !needsInitialLoad && !recoveryNeedsAction && !reminder.visible) return null;

  if (compact && recoveryNeedsAction) return <Card style={{ width: '100%', maxWidth: 520, alignSelf: 'center' }}>
    <Label>Eine Speicherung oder Wiederherstellung muss geprüft werden. Der letzte geprüfte Stand bleibt lesbar.</Label>
    {headerHint}
  </Card>;

  if (compact && !firstUse && reminder.visible) return <Card style={{ width: '100%', maxWidth: 520, alignSelf: 'center' }}>
    <Section title="Flugdaten" action={onSnoozeReminder && reminderScopeKey ? '24 h ausblenden' : undefined} onPress={onSnoozeReminder && reminderScopeKey ? snooze : undefined} />
    <Label>{reminderMessage(reminder.reason)}</Label>
    {headerHint}
  </Card>;

  if (compact && needsInitialLoad) return <Card style={{ width: '100%', maxWidth: 520, alignSelf: 'center' }}>
    <Section title={firstUse?"Bereit für deinen nächsten Flug?":"Deine Flüge"} icon="flight-paper-plane" />
    <Label>Für dieses zugeordnete Konto wurden noch keine Flugdaten gespeichert.</Label>
    {headerHint}
  </Card>;

  return <Card style={compact ? { width: '100%', maxWidth: 520, alignSelf: 'center' } : undefined}>
    <Section title={firstUse?"Bereit für deinen nächsten Flug?":"Deine Flüge"} icon="flight-paper-plane" />
    {currentOwnFlights && !firstUse ? <Label>{currentOwnFlights.flights.length} Flüge auf diesem Gerät gespeichert</Label> : <Label>Deine Flüge und Saisonübersicht an einem Ort.</Label>}
    {(!compact && (currentOwnFlights || phase !== 'missing')) && <Label muted>{freshness.label}</Label>}
    {!compact && !!freshness.note && !(freshness.reminder && reminder.snoozed && readState === 'ready') && <Label muted>{freshness.note}</Label>}
    {firstUse && <Label muted>Bei Bedarf meldest du dich auf der Originalseite von Vereinsflieger an. Anschließend laden wir deine Flüge und Medical-Angaben und speichern sie für die Offline-Nutzung.</Label>}
    {!compact && recoveryNeedsAction && <Label>Eine Speicherung oder Wiederherstellung muss geprüft werden. Der letzte geprüfte Stand bleibt lesbar.</Label>}
    {headerHint}
  </Card>;
}

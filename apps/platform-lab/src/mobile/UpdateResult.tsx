import React from 'react';
import { Pressable, View } from 'react-native';
import type { FlightLoadResult } from './CoreFlightFoundation';
import { Label, colors, ui } from './theme';

export function updateSourceResults(result: FlightLoadResult) {
  return ([['Medical', result.medicalStatus], ['Dienste', result.dutyStatus], ['Termine', result.eventsStatus], ['Dokumenthinweise', result.documentNoticesStatus],
    ['Arbeitsstunden · Jahresübersicht', result.workSummaryStatus], ['Erfasste Arbeitsstunden', result.workHoursStatus], ['Eigene Aufgaben', result.tasksStatus]] as const)
    .filter(([, status]) => status !== undefined)
    .map(([name, status]) => ({ name, incomplete: status === 'failed' || status === 'skipped',
      text: status === 'updated' ? 'aktualisiert' : status === 'partial' ? 'sichtbare Quelle gespeichert · teilweise geprüft' : status === 'empty' ? 'keine Angaben · Status unbekannt' : status === 'failed' ? 'Abruf fehlgeschlagen · bisherige Angaben erhalten' : 'nicht aktualisiert' }));
}

/** A dismissible receipt for this update, never a permanent Start introduction. */
export function UpdateResult({ result, detail = false, onDetails, onDismiss }: {
  result: FlightLoadResult; detail?: boolean; onDetails?: () => void; onDismiss?: () => void;
}) {
  const sources = updateSourceResults(result), incomplete = sources.filter(source => source.incomplete).length;
  return <View accessibilityLiveRegion="polite" style={{ width: '100%', maxWidth: 520, alignSelf: 'center', gap: 5, paddingVertical: 8 }}>
    <Label style={{ color: colors.cyan }}>Flüge gespeichert · {result.added} neu · {result.changed} aktualisiert</Label>
    {!!result.pending && <Label>{result.pending} ungeklärte Beobachtungen</Label>}
    {!!incomplete && <Label>{incomplete} {incomplete === 1 ? 'Quelle nicht aktualisiert' : 'Quellen nicht aktualisiert'}</Label>}
    {detail && <><Label muted>Zeitraum: {result.from} bis {result.to}</Label>{sources.map(source => <Label key={source.name} muted={!source.incomplete}>{source.name}: {source.text}</Label>)}</>}
    {!detail && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 20 }}>
      {onDetails && <Pressable accessibilityRole="button" accessibilityLabel="Ergebnis der Aktualisierung ansehen" onPress={onDetails} style={ui.smallAction}><Label>Details</Label></Pressable>}
      {onDismiss && <Pressable accessibilityRole="button" accessibilityLabel="Aktualisierungshinweis schließen" onPress={onDismiss} style={ui.smallAction}><Label muted>Schließen</Label></Pressable>}
    </View>}
  </View>;
}

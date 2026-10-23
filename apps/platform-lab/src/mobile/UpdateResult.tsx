import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { FlightLoadResult } from './CoreFlightFoundation';
import { SymbolIcon } from './SymbolIcon';
import { Label, colors } from './theme';

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
  const completedAt = result.completedAt ? new Date(result.completedAt) : null;
  const time = completedAt && Number.isFinite(completedAt.getTime())
    ? completedAt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : null;
  const summary = `${incomplete || result.pending ? 'Teilweise' : 'Synchronisiert'}${time ? ` · ${time}` : ''}`;
  if (!detail) return <View accessibilityLiveRegion="polite" style={styles.receipt}>
    <View style={styles.summary}><SymbolIcon name="refresh" size={24} />
      <Label style={styles.summaryText}>{summary}</Label></View>
    {onDetails && <Pressable accessibilityRole="button" accessibilityLabel="Ergebnis der Aktualisierung ansehen" onPress={onDetails} style={styles.details}><Label style={{ color: colors.cyan, fontSize: 13, lineHeight: 18 }}>Details</Label></Pressable>}
    {onDismiss && <Pressable accessibilityRole="button" accessibilityLabel="Aktualisierungshinweis schließen" onPress={onDismiss} style={styles.close}><SymbolIcon name="close" size={20} tone="muted" /></Pressable>}
  </View>;
  return <View accessibilityLiveRegion="polite" style={styles.detail}>
    <Label style={{ color: colors.cyan }}>{summary}</Label>
    <Label>{result.added} neue Flüge · {result.changed} geändert</Label>
    <Label>{result.pending} ungeklärte Beobachtungen</Label>
    {!!incomplete && <Label>{incomplete} {incomplete === 1 ? 'Quelle nicht aktualisiert' : 'Quellen nicht aktualisiert'}</Label>}
    <Label muted>Zeitraum: {result.from} bis {result.to}</Label>
    {sources.map(source => <Label key={source.name} muted={!source.incomplete}>{source.name}: {source.text}</Label>)}
  </View>;
}

const styles = StyleSheet.create({
  receipt: { width: '100%', maxWidth: 520, alignSelf: 'center', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8,
    borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingLeft: 12, paddingRight: 4, backgroundColor: colors.card },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 8, flexGrow: 1, flexShrink: 1, flexBasis: 150, minHeight: 48, paddingVertical: 6 },
  summaryText: { color: colors.cyan, flexShrink: 1, fontSize: 13, lineHeight: 18 },
  details: { minWidth: 48, minHeight: 48, maxWidth: '100%', flexShrink: 1, justifyContent: 'center', paddingHorizontal: 4, paddingVertical: 6 },
  close: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  detail: { width: '100%', maxWidth: 520, alignSelf: 'center', gap: 5, paddingVertical: 8 },
});

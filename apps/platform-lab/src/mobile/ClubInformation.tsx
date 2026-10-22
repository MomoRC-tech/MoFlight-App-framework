import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, Label, Section, colors } from './theme';
import type { FeatureInformation, FeatureSource } from './feature-information';

export interface ClubInformationProps {
  information?: FeatureInformation | null;
  readFailed?: boolean;
  compact?: boolean;
  onOpen?: () => void;
}
function SourceNote({ source, readFailed }: { source?: FeatureSource<unknown>; readFailed?: boolean }) {
  const available = source?.status === 'partial';
  return <View style={styles.notes}>
    {readFailed && <Label muted style={styles.note}>Lokales Laden fehlgeschlagen. {available ? 'Der zuletzt geladene Stand bleibt sichtbar.' : 'Gespeicherte Daten konnten nicht angezeigt werden.'}</Label>}
    {available && <>
      <Label muted style={styles.note}>Seitenausschnitt{source.truncated ? ' · am Erfassungslimit gekürzt' : ''} · Vollständigkeit ungeprüft</Label>
      {source.filters.map(filter => <Label muted style={styles.note} key={filter}>{filter}</Label>)}
      <Label muted style={styles.note}>Abruf: {source.retrievedAt ? source.retrievedAt.replace('T', ' ').replace('.000Z', ' UTC') : 'unbekannt'}</Label>
    </>}
  </View>;
}

/** The original provider's selected calendar slice; no invented complete or upcoming-only calendar. */
export function ClubEvents({ information, readFailed, compact = false, onOpen }: ClubInformationProps) {
  const source = information?.events;
  const items = source?.status === 'partial' ? source.items : [];
  const shown = compact ? items.slice(0, 2) : items;
  return <Card style={styles.card}>
    <Section title="Termine" action={compact && onOpen ? 'Ansehen' : undefined} onPress={onOpen} />
    {!shown.length && <Label muted>Termine unbekannt. Noch kein unterstützter Kalenderauszug verfügbar.</Label>}
    {shown.map(item => <View key={item.key} style={styles.row}>
      <View style={styles.date}><Label style={styles.dateText}>{item.date}</Label><Label muted style={styles.note}>{item.time}</Label></View>
      <View style={styles.content}><Label style={styles.title}>{item.title}</Label>{item.location && <Label muted>{item.location}</Label>}<Label muted style={styles.note}>{item.kind}</Label></View>
    </View>)}
    {shown.length < items.length && <Label muted style={styles.note}>{shown.length} von {items.length} erfassten Terminen</Label>}
    <SourceNote source={source} readFailed={readFailed} />
  </Card>;
}

/** Document title/date text only. No document download, attachment or news contract. */
export function ClubDocumentNotices({ information, readFailed, compact = false, onOpen }: ClubInformationProps) {
  const source = information?.documentNotices;
  const items = source?.status === 'partial' ? source.items : [];
  const shown = compact ? items.slice(0, 2) : items;
  return <Card style={styles.card}>
    <Section title="Dokumentenhinweise" action={compact && onOpen ? 'Ansehen' : undefined} onPress={onOpen} />
    {!shown.length && <Label muted>Dokumentenhinweise unbekannt. Noch keine unterstützte Quelle verfügbar.</Label>}
    {shown.map(item => <View key={item.key} style={styles.document}><Label selectable style={styles.title}>{item.text}</Label></View>)}
    {shown.length < items.length && <Label muted style={styles.note}>{shown.length} von {items.length} erfassten Hinweisen</Label>}
    <SourceNote source={source} readFailed={readFailed} />
  </Card>;
}
const styles = StyleSheet.create({
  card: { padding: 16, gap: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  date: { gap: 2, flexBasis: 96, flexShrink: 1 },
  dateText: { color: colors.cyan, fontSize: 14, fontWeight: '600' },
  content: { flexGrow: 1, flexBasis: 160, minWidth: 0, gap: 2 },
  title: { fontWeight: '600' },
  document: { paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  notes: { gap: 2 },
  note: { fontSize: 12, lineHeight: 18 },
});

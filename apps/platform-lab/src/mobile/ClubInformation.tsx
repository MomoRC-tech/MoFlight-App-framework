import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Card, Label, Section, colors } from './theme';
import { SymbolIcon } from './SymbolIcon';
import type { FeatureInformation, FeatureSource, OwnTaskItem, WorkHourItem, WorkSummaryItem } from './feature-information';

export interface ClubInformationProps {
  information?: FeatureInformation | null;
  readFailed?: boolean;
  compact?: boolean;
  onOpen?: () => void;
}
function SourceNote({ source, readFailed }: { source?: FeatureSource<unknown>; readFailed?: boolean }) {
  const [expanded,setExpanded]=useState(false);
  const available = source?.status === 'partial';
  return <View style={styles.notes}>
    {readFailed && <View style={styles.readFailure}><Label style={styles.title}>Lokales Laden fehlgeschlagen</Label><Label muted style={styles.note}>{available ? 'Der zuletzt geladene Stand bleibt sichtbar.' : 'Gespeicherte Daten konnten nicht angezeigt werden.'}</Label></View>}
    {available && <>
      <Label muted style={styles.note}>Seitenausschnitt{source.truncated ? ' · am Erfassungslimit gekürzt' : ''} · Vollständigkeit ungeprüft</Label>
      <Pressable accessibilityRole="button" accessibilityLabel="Quellendetails" accessibilityState={{expanded}} onPress={()=>setExpanded(!expanded)} style={({pressed})=>[styles.disclosure,pressed&&styles.pressed]}><SymbolIcon name="info" size={18}/><Label style={styles.disclosureLabel}>{expanded?'Quellendetails schließen':'Quellendetails'}</Label><SymbolIcon name={expanded?'close':'down'} size={16}/></Pressable>
      {expanded&&<View style={styles.sourceDetails}>{source.filters.map(filter => <Label muted style={styles.note} key={filter}>{filter}</Label>)}
      <Label muted style={styles.note}>Abruf: {source.retrievedAt ? source.retrievedAt.replace('T', ' ').replace('.000Z', ' UTC') : 'unbekannt'}</Label></View>}
    </>}
  </View>;
}
const sourceValue = (value: string) => value.trim() ? value : 'unbekannt / leer';
function SourceState({ children }: { children: React.ReactNode }) {
  return <View style={styles.state}><Label muted>{children}</Label></View>;
}

/** The original provider's selected calendar slice; no invented complete or upcoming-only calendar. */
export function ClubEvents({ information, readFailed, compact = false, onOpen }: ClubInformationProps) {
  const source = information?.events;
  const items = source?.status === 'partial' ? source.items : [];
  const shown = compact ? items.slice(0, 2) : items;
  return <Card style={styles.card}>
    <Section icon="calendar-neutral" title="Termine" action={compact && onOpen ? 'Ansehen' : undefined} onPress={onOpen} />
    {source?.status === 'partial' && source.empty && <SourceState>Keine Termine im erfassten Kalenderausschnitt.</SourceState>}
    {source?.status !== 'partial' && <SourceState>Termine unbekannt. Noch kein unterstützter Kalenderauszug verfügbar.</SourceState>}
    {source?.status === 'partial' && !source.empty && !items.length && <SourceState>Termine im erfassten Ausschnitt unbekannt.</SourceState>}
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
    <Section icon="logbook" title="Dokumentenhinweise" action={compact && onOpen ? 'Ansehen' : undefined} onPress={onOpen} />
    {!shown.length && <SourceState>Dokumentenhinweise unbekannt. Noch keine unterstützte Quelle verfügbar.</SourceState>}
    {shown.map(item => <View key={item.key} style={styles.document}><Label selectable style={styles.title}>{item.text}</Label></View>)}
    {shown.length < items.length && <Label muted style={styles.note}>{shown.length} von {items.length} erfassten Hinweisen</Label>}
    <SourceNote source={source} readFailed={readFailed} />
  </Card>;
}

/** Annual amounts and reported hours remain separate source values. */
export function ClubWorkSummary({ information, readFailed, compact = false, onOpen }: ClubInformationProps) {
  const source = information?.workSummary;
  const items = source?.status === 'partial' ? source.items : [];
  const shown = compact ? items.slice(0, 2) : items;
  return <>
  <Card style={styles.card}>
    <Section icon="duty" title={compact ? 'Arbeitsstunden' : 'Jahresübersicht'} action={compact && onOpen ? 'Ansehen' : undefined} onPress={onOpen} />
    {source?.status !== 'partial' && <SourceState>Arbeitsstunden unbekannt. Noch keine unterstützte Jahresübersicht verfügbar.</SourceState>}
    {source?.status === 'partial' && source.empty && <SourceState>Keine Jahreszeilen im erfassten Quellenausschnitt.</SourceState>}
    {source?.status === 'partial' && !source.empty && !items.length && <SourceState>Jahreszeilen unbekannt.</SourceState>}
    {shown.map(item => <WorkSummaryRow key={item.key} item={item} />)}
    {shown.length < items.length && <Label muted style={styles.note}>{shown.length} von {items.length} erfassten Jahreszeilen</Label>}
    <SourceNote source={source} readFailed={readFailed} />
  </Card>
  {!compact && <WorkHourEntries source={information?.workHours} readFailed={readFailed} />}
  </>;
}

function WorkSummaryRow({ item }: { item: WorkSummaryItem }) {
  return <View style={styles.summaryRow}>
    <Label style={styles.period}>{sourceValue(item.period)}</Label>
    <View style={styles.summaryValues}>
      <View style={styles.summaryValue}><Label muted style={styles.note}>Pflicht · EUR</Label><Label selectable>{sourceValue(item.obligation)}</Label></View>
      <View style={styles.summaryValue}><Label muted style={styles.note}>Geleistet · EUR</Label><Label selectable>{sourceValue(item.performed)}</Label></View>
      <View style={styles.summaryValue}><Label muted style={styles.note}>Geleistet · Stunden</Label><Label selectable>{sourceValue(item.hours)}</Label></View>
    </View>
  </View>;
}

function WorkHourEntries({ source, readFailed }: { source?: FeatureSource<WorkHourItem>; readFailed?: boolean }) {
  const items = source?.status === 'partial' ? source.items : [];
  return <Card style={styles.card}>
    <Section icon="duty" title="Erfasste Arbeitsstunden" />
    {source?.status !== 'partial' && <SourceState>Einzelne Arbeitsstunden unbekannt. Noch kein unterstützter Quellenausschnitt verfügbar.</SourceState>}
    {source?.status === 'partial' && source.empty && <SourceState>Keine Arbeitsstunden im erfassten Quellenausschnitt.</SourceState>}
    {source?.status === 'partial' && !source.empty && !items.length && <SourceState>Einzelne Arbeitsstunden unbekannt.</SourceState>}
    {items.map(item => <View key={item.key} style={styles.workEntry}>
      <Label style={styles.period}>{sourceValue(item.date)}</Label>
      <Label selectable style={styles.title}>{sourceValue(item.activity)}</Label>
      <View style={styles.workEntryValues}>
        <View style={styles.summaryValue}><Label muted style={styles.note}>Stunden</Label><Label selectable>{sourceValue(item.hours)}</Label></View>
        <View style={styles.summaryValue}><Label muted style={styles.note}>Status</Label><Label selectable>{sourceValue(item.status)}</Label></View>
        {item.category !== undefined && <View style={styles.summaryValue}><Label muted style={styles.note}>Kategorie</Label><Label selectable>{sourceValue(item.category)}</Label></View>}
      </View>
    </View>)}
    <SourceNote source={source} readFailed={readFailed} />
  </Card>;
}

/** Only a validated empty task source is described as empty, and only for that source excerpt. */
export function ClubOwnTasks({ information, readFailed, compact = false, onOpen }: ClubInformationProps) {
  const source = information?.tasks;
  const items = source?.status === 'partial' ? source.items : [];
  const shown = compact ? items.slice(0, 2) : items;
  return <Card style={styles.card}>
    <Section icon="check" title="Eigene Aufgaben" action={compact && onOpen ? 'Ansehen' : undefined} onPress={onOpen} />
    {source?.status !== 'partial' && <SourceState>Eigene offene Aufgaben unbekannt. Noch keine unterstützte Quelle verfügbar.</SourceState>}
    {source?.status === 'partial' && source.empty && <SourceState>Keine eigenen offenen Aufgaben im erfassten Quellenausschnitt.</SourceState>}
    {source?.status === 'partial' && !source.empty && !items.length && <SourceState>Eigene offene Aufgaben unbekannt.</SourceState>}
    {shown.map(item => <OwnTaskRow key={item.key} item={item} />)}
    {shown.length < items.length && <Label muted style={styles.note}>{shown.length} von {items.length} erfassten Aufgaben</Label>}
    <SourceNote source={source} readFailed={readFailed} />
  </Card>;
}

function OwnTaskRow({ item }: { item: OwnTaskItem }) {
  return <View style={styles.taskRow}>
    <Label selectable style={styles.title}>{sourceValue(item.title)}</Label>
    <View style={styles.taskMeta}>
      <Label muted>Zu erledigen bis: {sourceValue(item.due)}</Label>
      <Label muted>Status: {sourceValue(item.status)}</Label>
      {item.days !== undefined && <Label muted>Anzahl Tage: {sourceValue(item.days)}</Label>}
      {item.priority !== undefined && <Label muted>Priorität: {sourceValue(item.priority)}</Label>}
    </View>
  </View>;
}
const styles = StyleSheet.create({
  card: { padding: 16, gap: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, padding: 12, borderRadius: 12, backgroundColor: colors.raised },
  date: { gap: 2, flexBasis: 96, flexShrink: 1 },
  dateText: { color: colors.cyan, fontSize: 14, fontWeight: '600' },
  content: { flexGrow: 1, flexBasis: 160, minWidth: 0, gap: 2 },
  title: { fontWeight: '600' },
  document: { padding: 12, borderRadius: 12, backgroundColor: colors.raised },
  summaryRow: { gap: 10, padding: 12, borderRadius: 12, backgroundColor: colors.raised },
  period: { color: colors.cyan, fontSize: 14, fontWeight: '600' },
  summaryValues: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  summaryValue: { flexGrow: 1, flexBasis: 82, minWidth: 0, gap: 2 },
  taskRow: { gap: 10, padding: 12, borderRadius: 12, backgroundColor: colors.raised },
  taskMeta: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 3 },
  workEntry: { gap: 8, padding: 12, borderRadius: 12, backgroundColor: colors.raised },
  workEntryValues: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  notes: { gap: 4, paddingTop: 4 },
  state: { padding: 12, borderRadius: 12, backgroundColor: colors.raised },
  readFailure: { gap: 4, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.muted },
  disclosure: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8 },
  disclosureLabel: { color: colors.cyan, fontSize: 13, flex: 1 },
  sourceDetails: { gap: 4, paddingBottom: 8 },
  pressed: { opacity: .72 },
  note: { fontSize: 12, lineHeight: 18 },
});

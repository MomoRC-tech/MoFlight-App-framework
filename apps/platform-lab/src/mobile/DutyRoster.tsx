import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Action, Card, Label, Section, colors, startTileSurfaces } from './theme';
import { SymbolIcon } from './SymbolIcon';
import { ClubHeading, ClubSubheading } from './ClubHeading';
import type { DutyItem, DutyOverview } from '../vereinsflieger/duties';

/** Calendar-day projection only; the original period, including clocks, stays in source evidence. */
export function dutyDates(item: Pick<DutyItem, 'start' | 'end'>): string {
  if (!item.start || !item.end) return 'Zeitraum unbekannt';
  const [year, month, day] = item.start.split('-');
  const [endYear, endMonth, endDay] = item.end.split('-');
  const end = `${endDay}.${endMonth}.${endYear}`;
  if (item.start === item.end) return end;
  const start = year !== endYear ? `${day}.${month}.${year}` : month !== endMonth ? `${day}.${month}.` : `${day}.`;
  return `${start}–${end}`;
}
function DutyRow({ item, club = false }: { item: DutyItem; club?: boolean }) {
  return <View style={club ? styles.clubRow : styles.row}>
    <View style={[styles.heading, club && styles.clubRowHeading]}>
      <Label style={styles.duty}>{item.duty.trim() || 'Dienstname unbekannt'}</Label>
      <Label style={styles.dates}>{dutyDates(item)}</Label>
    </View>
    <Label muted>{item.people.length ? item.people.join(' · ') : 'Personen unbekannt'}</Label>
  </View>;
}
/** Reuses maintained cards/type. No sharing/export or person identity inference. */
export function DutyRoster({ overview, expanded = false, onOpen, presentation = 'start' }: { overview: DutyOverview; expanded?: boolean; onOpen?: () => void; presentation?: 'start' | 'club' }) {
  if (presentation === 'club') return <ClubDutyRoster overview={overview} expanded={expanded} onOpen={onOpen} />;
  const own = overview.ownItems.length ? overview.ownItems.slice(0, 2) : overview.laterOwn.slice(0, 1);
  const club = overview.items.filter(item => item.ownState === 'unknown').slice(0, 3);
  return <Card surface="start" style={{ width: '100%', maxWidth: 520, alignSelf: 'center' }}>
    {expanded ? <Section title="Dienstübersicht" icon="duty" /> : <ClubHeading clubLabel={overview.clubLabel} onOpen={onOpen} />}
    {expanded && <>
    <Label>{overview.window.start} bis {overview.window.end}</Label>
    <Label muted>Verein laut Quelle: {overview.clubLabel.trim() || 'Name unbekannt'} · Zuordnung vorläufig</Label>
    <Label muted>{overview.status === 'unavailable' ? 'Dienstplan unbekannt' : 'Teilansicht · Dienstplan unvollständig'}</Label>
    {overview.retrievedAt && <Label muted>Quellenstand: {new Date(overview.retrievedAt).toLocaleString('de-DE')}</Label>}
    </>}
    {!expanded && overview.status === 'unavailable' && <Label muted>Dienstplan unbekannt</Label>}
    {expanded ? <View style={styles.group}><ClubSubheading surface="start" title="Dienste im Zeitraum" />{overview.items.map(item => <DutyRow key={item.key} item={item} />)}</View> : <>
      <View style={styles.group}>
        <ClubSubheading surface="start" title="Eigene Dienste" />
        {own.length ? own.map(item => <DutyRow key={item.key} item={item} />) : <Label muted>Eigene Dienste im Zeitraum unbekannt.</Label>}
      </View>
      <View style={styles.group}>
        <ClubSubheading surface="start" title="Weitere Vereinsdienste" icon="club" />
        {club.length ? club.map(item => <DutyRow key={item.key} item={item} />) : <Label muted>Weitere Vereinsdienste unbekannt.</Label>}
      </View>
    </>}
    {expanded && !overview.items.length && overview.status === 'partial' && <Label>Keine zeitlich passenden Dienste im erfassten Ausschnitt. Weitere Dienste sind unbekannt.</Label>}
    {expanded && !!overview.laterOwn.length && <View style={styles.group}><ClubSubheading surface="start" title="Spätere eigene Dienste · bis zu drei aus dem Ausschnitt" />{overview.laterOwn.map(item => <DutyRow key={item.key} item={item} />)}</View>}
    {expanded && !!overview.unplaced.length && <View style={styles.group}><ClubSubheading surface="start" title="Zeitraum ungeklärt" />{overview.unplaced.map(item => <DutyRow key={item.key} item={item} />)}</View>}
    {expanded && <Label muted>{overview.coverageMessage}</Label>}
    {!expanded && onOpen && <Action secondary surface="start" onPress={onOpen}>Alle Dienste ansehen</Action>}
  </Card>;
}

/** Club-only hierarchy: Start keeps its original compact photography and spacing. */
function ClubDutyRoster({ overview, expanded, onOpen }: { overview: DutyOverview; expanded: boolean; onOpen?: () => void }) {
  const [sourceExpanded, setSourceExpanded] = useState(false);
  const own = overview.ownItems.length ? overview.ownItems.slice(0, 2) : overview.laterOwn.slice(0, 1);
  const club = overview.items.filter(item => item.ownState === 'unknown').slice(0, 3);
  return <Card style={styles.clubCard}>
    <Section title="Dienste" icon="duty" action={!expanded && onOpen ? 'Ansehen' : undefined} onPress={onOpen} />
    <View style={styles.clubScope}>
      <Label style={styles.scopeDate}>{overview.window.start} bis {overview.window.end}</Label>
      <Label muted>{overview.status === 'unavailable' ? 'Dienstplan unbekannt' : 'Teilansicht · Dienstplan unvollständig'}</Label>
    </View>
    {expanded ? <View style={styles.group}><ClubSubheading title="Dienste im Zeitraum" />{overview.items.map(item => <DutyRow key={item.key} item={item} club />)}</View> : <>
      <View style={styles.group}><ClubSubheading title="Eigene Dienste" />{own.length ? own.map(item => <DutyRow key={item.key} item={item} club />) : <Label muted>Eigene Dienste im Zeitraum unbekannt.</Label>}</View>
      <View style={styles.group}><ClubSubheading title="Weitere Vereinsdienste" icon="club" />{club.length ? club.map(item => <DutyRow key={item.key} item={item} club />) : <Label muted>Weitere Vereinsdienste unbekannt.</Label>}</View>
    </>}
    {expanded && !overview.items.length && <View style={styles.clubScope}><Label muted>{overview.status === 'partial' ? 'Keine zeitlich passenden Dienste im erfassten Ausschnitt. Weitere Dienste sind unbekannt.' : 'Dienste im Zeitraum unbekannt.'}</Label></View>}
    {expanded && !!overview.laterOwn.length && <View style={styles.group}><ClubSubheading title="Spätere eigene Dienste · bis zu drei aus dem Ausschnitt" />{overview.laterOwn.map(item => <DutyRow key={item.key} item={item} club />)}</View>}
    {expanded && !!overview.unplaced.length && <View style={styles.group}><ClubSubheading title="Zeitraum ungeklärt" />{overview.unplaced.map(item => <DutyRow key={item.key} item={item} club />)}</View>}
    <Label muted style={styles.sourceNote}>{overview.coverageMessage}</Label>
    <Pressable accessibilityRole="button" accessibilityLabel="Quellendetails Dienste" accessibilityState={{expanded:sourceExpanded}} onPress={()=>setSourceExpanded(!sourceExpanded)} style={({pressed})=>[styles.disclosure,pressed&&{opacity:.72}]}>
      <SymbolIcon name="info" size={18}/><Label style={styles.disclosureLabel}>{sourceExpanded?'Quellendetails schließen':'Quellendetails'}</Label><SymbolIcon name={sourceExpanded?'close':'down'} size={16}/>
    </Pressable>
    {sourceExpanded && <View style={styles.group}><Label muted style={styles.sourceNote}>Verein laut Quelle: {overview.clubLabel.trim() || 'Name unbekannt'} · Zuordnung vorläufig</Label><Label muted style={styles.sourceNote}>Quellenstand: {overview.retrievedAt ? new Date(overview.retrievedAt).toLocaleString('de-DE') : 'unbekannt'}</Label></View>}
  </Card>;
}
const styles = StyleSheet.create({
  clubCard: { width: '100%', gap: 12 },
  clubScope: { gap: 4, padding: 12, backgroundColor: colors.raised, borderRadius: 12 },
  scopeDate: { fontWeight: '600' },
  clubRow: { gap: 6, padding: 12, backgroundColor: colors.raised, borderRadius: 12 },
  clubRowHeading: { flexWrap: 'wrap' },
  sourceNote: { fontSize: 12, lineHeight: 18 },
  disclosure: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8 },
  disclosureLabel: { flex: 1, color: colors.cyan, fontSize: 13 },
  group: { gap: 8 },
  row: { gap: 4, paddingHorizontal: 2, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: startTileSurfaces.border },
  heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  duty: { fontWeight: '600', flexShrink: 1 },
  dates: { fontSize: 12, lineHeight: 20, textAlign: 'right', flexShrink: 0, maxWidth: '65%' },
});

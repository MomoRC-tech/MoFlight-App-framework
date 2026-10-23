import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Action, Card, Label, Section, colors } from './theme';
import { ClubHeading, ClubSubheading } from './ClubHeading';
import type { DutyItem, DutyOverview } from '../vereinsflieger/duties';

function DutyRow({ item, expanded = false }: { item: DutyItem; expanded?: boolean }) {
  return <View style={styles.row}>
    <Label style={styles.duty}>{item.duty.trim() || 'Dienstname unbekannt'}{expanded && item.ownState === 'own' ? ' · eigener Dienst' : ''}</Label>
    <Label>{item.period.trim() || 'Zeitraum unbekannt'}</Label>
    <Label muted>{item.people.length ? item.people.join(' · ') : 'Personen unbekannt'}</Label>
    {!item.start && <Label muted>Zeitraum kann nicht sicher eingeordnet werden.</Label>}
  </View>;
}
/** Reuses maintained cards/type. No sharing/export or person identity inference. */
export function DutyRoster({ overview, expanded = false, onOpen }: { overview: DutyOverview; expanded?: boolean; onOpen?: () => void }) {
  const own = overview.ownItems.length ? overview.ownItems.slice(0, 2) : overview.laterOwn.slice(0, 1);
  const club = overview.items.filter(item => item.ownState === 'unknown').slice(0, 3);
  return <Card style={{ width: '100%', maxWidth: 520, alignSelf: 'center' }}>
    {expanded ? <Section title="Dienstübersicht" icon="duty" /> : <ClubHeading clubLabel={overview.clubLabel} onOpen={onOpen} />}
    {expanded && <>
    <Label>{overview.window.start} bis {overview.window.end}</Label>
    <Label muted>Verein laut Quelle: {overview.clubLabel.trim() || 'Name unbekannt'} · Zuordnung vorläufig</Label>
    <Label muted>{overview.status === 'unavailable' ? 'Dienstplan unbekannt' : 'Teilansicht · Dienstplan unvollständig'}</Label>
    {overview.retrievedAt && <Label muted>Quellenstand: {new Date(overview.retrievedAt).toLocaleString('de-DE')}</Label>}
    </>}
    {!expanded && overview.status === 'unavailable' && <Label muted>Dienstplan unbekannt</Label>}
    {expanded ? <View style={styles.group}><ClubSubheading title="Dienste im Zeitraum" />{overview.items.map(item => <DutyRow key={item.key} item={item} expanded />)}</View> : <>
      <View style={styles.group}>
        <ClubSubheading title="Eigene Dienste" />
        {own.length ? own.map(item => <DutyRow key={item.key} item={item} />) : <Label muted>Eigene Dienste im Zeitraum unbekannt.</Label>}
      </View>
      <View style={styles.group}>
        <ClubSubheading title="Weitere Vereinsdienste" icon="club" />
        {club.length ? club.map(item => <DutyRow key={item.key} item={item} />) : <Label muted>Weitere Vereinsdienste unbekannt.</Label>}
      </View>
    </>}
    {expanded && !overview.items.length && overview.status === 'partial' && <Label>Keine zeitlich passenden Dienste im erfassten Ausschnitt. Weitere Dienste sind unbekannt.</Label>}
    {expanded && !!overview.laterOwn.length && <View style={styles.group}><ClubSubheading title="Spätere eigene Dienste · bis zu drei aus dem Ausschnitt" />{overview.laterOwn.map(item => <DutyRow key={item.key} item={item} expanded />)}</View>}
    {expanded && !!overview.unplaced.length && <View style={styles.group}><ClubSubheading title="Zeitraum ungeklärt" />{overview.unplaced.map(item => <DutyRow key={item.key} item={item} expanded />)}</View>}
    {expanded && <Label muted>{overview.coverageMessage}</Label>}
    {!expanded && onOpen && <Action secondary onPress={onOpen}>Alle Dienste ansehen</Action>}
  </Card>;
}
const styles = StyleSheet.create({
  group: { gap: 8 },
  row: { gap: 4, paddingHorizontal: 2, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  duty: { fontWeight: '600' },
});

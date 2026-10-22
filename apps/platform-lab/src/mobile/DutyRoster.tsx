import React from 'react';
import { View } from 'react-native';
import { Action, Card, Label, Section } from './theme';
import type { DutyItem, DutyOverview } from '../vereinsflieger/duties';

function DutyRow({ item }: { item: DutyItem }) {
  return <View style={{ gap: 4 }}>
    <Label>{item.duty.trim() || 'Dienstname unbekannt'}{item.ownState === 'own' ? ' · eigener Dienst' : ' · Zuordnung unbekannt'}</Label>
    <Label>{item.period.trim() || 'Zeitraum unbekannt'}</Label>
    <Label muted>{item.people.length ? `Personen laut Quellzeile: ${item.people.join(' · ')}` : 'Personen unbekannt'}</Label>
    {!item.start && <Label muted>Zeitraum kann nicht sicher eingeordnet werden.</Label>}
  </View>;
}
/** Reuses maintained cards/type. No sharing/export or person identity inference. */
export function DutyRoster({ overview, expanded = false, onOpen }: { overview: DutyOverview; expanded?: boolean; onOpen?: () => void }) {
  const own = overview.ownItems.length ? overview.ownItems.slice(0, 2) : overview.laterOwn.slice(0, 1);
  const club = overview.items.filter(item => item.ownState === 'unknown').slice(0, 3);
  return <Card style={{ width: '100%', maxWidth: 480, alignSelf: 'center' }}>
    <Section title={expanded ? 'Dienstübersicht' : 'Verein'} icon="duty" />
    <Label>{overview.window.start} bis {overview.window.end}</Label>
    <Label muted>Verein laut Quelle: {overview.clubLabel} · Zuordnung vorläufig</Label>
    <Label muted>{overview.status === 'unavailable' ? 'Dienstplan unbekannt' : 'Teilansicht · Dienstplan unvollständig'}</Label>
    {overview.retrievedAt && <Label muted>Quellenstand: {new Date(overview.retrievedAt).toLocaleString('de-DE')}</Label>}
    {expanded ? overview.items.map(item => <DutyRow key={item.key} item={item} />) : <>
      <Label>Eigene Dienste</Label>
      {own.length ? own.map(item => <DutyRow key={item.key} item={item} />) : <Label muted>Eigene Dienste im Zeitraum unbekannt.</Label>}
      {!overview.ownItems.length && !!own.length && <Label muted>Nächster späterer Dienst aus dem Ausschnitt</Label>}
      <Label>Weitere Vereinsdienste</Label>
      {club.length ? club.map(item => <DutyRow key={item.key} item={item} />) : <Label muted>Weitere Vereinsdienste unbekannt.</Label>}
    </>}
    {!overview.items.length && overview.status === 'partial' && <Label>Keine zeitlich passenden Dienste im erfassten Ausschnitt. Weitere Dienste sind unbekannt.</Label>}
    {expanded && !!overview.laterOwn.length && <><Label>Spätere eigene Dienste · bis zu drei aus dem Ausschnitt</Label>{overview.laterOwn.map(item => <DutyRow key={item.key} item={item} />)}</>}
    {expanded && !!overview.unplaced.length && <><Label>Zeitraum ungeklärt</Label>{overview.unplaced.map(item => <DutyRow key={item.key} item={item} />)}</>}
    {!expanded && !!overview.unplaced.length && <Label muted>{overview.unplaced.length} Quellzeilen mit ungeklärtem Zeitraum</Label>}
    <Label muted>{expanded ? overview.coverageMessage : overview.status === 'partial' ? 'Teilansicht; Vollständigkeit und Partner ungeprüft.' : 'Dienstquelle nicht verfügbar. Bitte erneut abrufen.'}</Label>
    {!expanded && onOpen && <Action secondary onPress={onOpen}>Alle Dienste ansehen</Action>}
  </Card>;
}

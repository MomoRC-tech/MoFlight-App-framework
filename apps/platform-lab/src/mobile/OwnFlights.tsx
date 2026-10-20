import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Keyboard, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { Action, Card, Chip, Empty, GliderMark, IconLabel, Label, Section, colors, ui } from './theme';
import { SymbolIcon } from './SymbolIcon';
import { useOwnFlights } from './use-own-flights';
import { ownFlightReadPorts } from './own-flight-reader-native';
import { allOwnFlights, ownFlightYears, ownFlightRegistrations, ownRawValue, selectOwnFlights, type OwnFlightFilters } from './own-flight-model';
import type { OwnFlightReadPorts } from './own-flight-reader';
import { planFlightRetrieval } from '../vereinsflieger/retrieval-policy';
import { dataFreshness } from './data-freshness';
import { reviewDuration, reviewParsedField, reviewRawField } from '../vereinsflieger/capture-review';

export interface OwnFlightHeader { title: string; back?: () => void }
export function OwnFlights({ active, reloadKey, onUpdate, onHeaderChange, ports = ownFlightReadPorts }: {
  active: boolean; reloadKey: number; onUpdate: () => boolean;
  onHeaderChange: (header: OwnFlightHeader) => void; ports?: OwnFlightReadPorts;
}) {
  const data = useOwnFlights(ports, active, reloadKey);
  const [filters, setFilters] = useState<OwnFlightFilters>(allOwnFlights);
  const [filterOpen, setFilterOpen] = useState(false), [notice, setNotice] = useState('');
  const [rawPage, setRawPage] = useState(0), [statusOpen, setStatusOpen] = useState(false);
  const list = useRef<FlatList>(null), offset = useRef(0), scope = useRef<string | null>(null);
  const { width, fontScale } = useWindowDimensions();
  const tablet = width >= 600 && fontScale <= 1.3;
  const flights = data.view?.flights ?? [];
  const selected = useMemo(() => selectOwnFlights(flights, filters), [flights, filters]);
  const years = ownFlightYears(flights), registrations = ownFlightRegistrations(flights);
  const plan = planFlightRetrieval(data.view?.snapshot.savedRetrievals ?? []);
  const freshness = dataFreshness(plan.lastSuccessfulRetrievalAt, data.phase === 'ready' ? 'ready' : 'loading');
  const detailOpen = !!data.detail || data.detailBusy;
  const back = useCallback(() => { Keyboard.dismiss(); setFilterOpen(false); setRawPage(0); data.clearDetail(); }, [data.clearDetail]);
  useEffect(() => { onHeaderChange({ title: filterOpen ? 'Flugfilter' : detailOpen ? 'Flugdetails' : 'Flüge', back: filterOpen || detailOpen ? back : undefined }); }, [filterOpen, detailOpen, back, onHeaderChange]);
  useEffect(() => {
    if (!data.view) return;
    const key = `${data.view.snapshot.ownerId}:${data.view.snapshot.storeId}`;
    if (scope.current !== null && scope.current !== key) { setFilters(allOwnFlights); offset.current = 0; setFilterOpen(false); }
    scope.current = key;
  }, [data.view?.snapshot.ownerId, data.view?.snapshot.storeId]);
  const changeFilters = (next: OwnFlightFilters) => { offset.current = 0; list.current?.scrollToOffset({ offset: 0, animated: false }); setFilters(next); };
  const update = () => { Keyboard.dismiss(); if (!onUpdate()) setNotice('Bitte zuerst den laufenden Anbietervorgang beenden. Deine gespeicherten Flüge bleiben verfügbar.'); };
  const header = <View style={{ gap: 8 }}>
    <Card><Section title="Eigene gespeicherte Flüge" icon="flight-paper-plane" />
      <Label>{selected.length} von {flights.length} gespeicherten Flügen</Label><Label muted>Vereinsflieger · ohne erforderliche Buchzuordnung</Label>
      <Label muted>{freshness.label}</Label>{freshness.reminder && <Label muted>{freshness.note}</Label>}
      {(data.view?.pendingCommand || data.view?.snapshot.recovery.readOnly) && <Label>Eine Speicherung oder Wiederherstellung muss geprüft werden. Der letzte geprüfte Stand bleibt lesbar.</Label>}
      {statusOpen && <>
      {plan.periods.map(p => <Label muted key={p.from}>Abgedeckt: {p.from} bis {p.to}</Label>)}
      {plan.gaps.map(p => <Label key={p.from}>Lücke: {p.from} bis {p.to}</Label>)}
      {!plan.periods.length && <Label muted>Noch kein vollständiger Abruf gespeichert.</Label>}
      <Label muted>Gespeicherte Anbieterwerte, keine Aussage über die gesamte Fluggeschichte. Tracks und Distanzen sind nicht verifiziert.</Label>
      <Action secondary onPress={() => void data.reload()}>Gespeicherte Flüge neu laden</Action></>}
      <Action onPress={update}>Daten aktualisieren</Action>
      <Pressable accessibilityRole="button" accessibilityState={{expanded:statusOpen}} onPress={()=>setStatusOpen(!statusOpen)} style={ui.smallAction}><Label muted>{statusOpen ? 'Datenstand schließen' : 'Abdeckung & Datenstand'}</Label></Pressable>
    </Card>
    {!!notice && <Card><Label>{notice}</Label></Card>}
    <View style={ui.row}><View style={s.searchBox}><SymbolIcon name="search" size={20} tone="muted" /><TextInput
      accessibilityLabel="Flüge durchsuchen" placeholder="Kennzeichen, Ort, Crew …" placeholderTextColor={colors.muted} value={filters.search}
      onChangeText={search => changeFilters({ ...filters, search })} autoCorrect={false} returnKeyType="search" style={s.search} /></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Flugfilter öffnen" onPress={() => { Keyboard.dismiss(); setFilterOpen(true); }} style={s.filter}><SymbolIcon name="filter" size={24} /></Pressable></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 5 }}><Chip title="Alle Jahre" selected={filters.year === null} onPress={() => changeFilters({ ...filters, year: null })} />
      {(filters.year !== null && !years.includes(filters.year) ? [filters.year, ...years] : years).map(year => <Chip key={year} title={String(year)} selected={filters.year === year} onPress={() => changeFilters({ ...filters, year })} />)}</ScrollView>
    {filters.registration !== undefined && <Label>Filter: {filters.registration ?? 'Kennzeichen unbekannt'}</Label>}
  </View>;
  useEffect(() => { if (data.phase !== 'ready') setFilterOpen(false); }, [data.phase]);
  const detail = data.detail, assessment = detail?.facts.assessment;
  return <View style={{ flex: 1 }}>
    <View style={[{ flex: 1 }, (filterOpen || detailOpen || data.phase !== 'ready') && s.hidden]} accessibilityElementsHidden={filterOpen || detailOpen || data.phase !== 'ready'} importantForAccessibility={filterOpen || detailOpen || data.phase !== 'ready' ? 'no-hide-descendants' : 'auto'}>
      <FlatList ref={list} key={tablet ? 'wide' : 'phone'} numColumns={tablet ? 2 : 1} columnWrapperStyle={tablet ? { gap: 8 } : undefined}
        data={selected} keyExtractor={flight => flight.flightId} ListHeaderComponent={header} ListHeaderComponentStyle={{ marginBottom: 8 }}
        renderItem={({ item }) => { const a = item.facts.assessment; return <Card onPress={() => { setRawPage(0); void data.openDetail(item); }}
          label={`Quellflug ${item.sourceFlightRef} ansehen`} style={[s.row, tablet && { flex: 1, maxWidth: '50%' }]}>
          <Label style={{ fontWeight: '600' }}>{reviewParsedField(a.date)}</Label>
          <View style={ui.row}><View style={s.noTrack}><GliderMark color="#7299ab" /><Label muted style={{ fontSize: 10 }}>Kein Track</Label></View>
            <View style={ui.column}><Label>{reviewRawField(a.fields.registration)} · {reviewRawField(a.fields.model)}</Label>
              <Label muted>{reviewRawField(a.fields.departure)} → {reviewRawField(a.fields.arrival)}</Label><IconLabel name="clock" size={16}>{reviewDuration(a.durations.flight)}</IconLabel></View><SymbolIcon name="right" size={16} tone="muted" /></View>
          <Label muted>Quellflug {item.sourceFlightRef} · Fassung {item.factsRevision}</Label>
        </Card>; }}
        ListEmptyComponent={<Card><Empty title={flights.length ? 'Keine passenden Flüge' : 'Noch keine gespeicherten Flüge'}>{flights.length ? 'Suchbegriff oder Filter ändern. Ein leeres Ergebnis ist keine Aussage über die gesamte Fluggeschichte.' : 'Eigene Flüge ausdrücklich abrufen, prüfen und speichern. Ein Flugbuch wird dafür nicht benötigt.'}</Empty></Card>}
        onScroll={event => { offset.current = event.nativeEvent.contentOffset.y; }} scrollEventThrottle={32}
        onContentSizeChange={() => { if (data.phase === 'ready') list.current?.scrollToOffset({ offset: offset.current, animated: false }); }}
        contentContainerStyle={s.canvas} ItemSeparatorComponent={() => <View style={{ height: 7 }} />} initialNumToRender={10} maxToRenderPerBatch={10} windowSize={7} keyboardShouldPersistTaps="handled" />
    </View>
    {data.phase !== 'ready' && <ScrollView contentContainerStyle={s.canvas}><View style={s.group}><Card>
      {!!notice && <Label>{notice}</Label>}
      <Section title={data.phase === 'loading' ? 'Gespeicherte Flüge laden' : data.phase === 'missing' ? 'Eigene Flüge einrichten' : 'Flüge nicht lesbar'} icon="flight-paper-plane" />
      {data.phase === 'loading' ? <ActivityIndicator color={colors.cyan} accessibilityLabel="Eigene gespeicherte Flüge werden geladen" /> : <>
        <Label>{data.detailError ?? (data.phase === 'missing' ? 'Noch keine eigene Flugbibliothek ausgewählt. Bestehende Teststände bleiben getrennt erhalten.' : 'Die gespeicherte Auswahl konnte nicht geprüft werden. Vorhandene Dateien und Aufträge bleiben erhalten.')}</Label>
        <Action secondary onPress={() => void data.reload()}>Gespeicherte Flüge erneut prüfen</Action><Action onPress={update}>{data.phase === 'missing' ? 'Eigene Flüge einrichten' : 'Abruf und Wiederherstellung öffnen'}</Action>
      </>}
    </Card></View></ScrollView>}
    {filterOpen && <ScrollView contentContainerStyle={s.canvas}><View style={s.group}><Card><Section title="Flugfilter" />
      <Label muted>Jahr, Text und gespeichertes Kennzeichen werden gemeinsam angewendet. Crew-Namen sind Suchtext, keine bestätigte Personenidentität oder Rollen-Anrechnung.</Label>
      <Action secondary onPress={() => changeFilters({ ...filters, registration: undefined })}>Alle Kennzeichen</Action>
      {registrations.map(registration => <Chip key={registration} title={registration} selected={filters.registration === registration} onPress={() => changeFilters({ ...filters, registration })} />)}
      {flights.some(f => ownRawValue(f.facts.assessment.fields.registration) === null) && <Chip title="Kennzeichen unbekannt" selected={filters.registration === null} onPress={() => changeFilters({ ...filters, registration: null })} />}
      <Action secondary onPress={() => changeFilters(allOwnFlights)}>Filter zurücksetzen</Action><Action onPress={back}>Gefilterte Liste anzeigen</Action>
    </Card></View></ScrollView>}
    {detailOpen && <ScrollView key={detail?.flightId ?? 'loading-detail'} contentContainerStyle={s.canvas}><View style={s.group}>
      {data.detailBusy && <ActivityIndicator color={colors.cyan} accessibilityLabel="Gespeicherte Flugdetails laden" />}
      {detail && assessment && <>
        <Card><Section title={`Quellflug ${detail.sourceFlightRef}`} /><Label>Fassung {detail.factsRevision} · {detail.factHistory.length} gespeicherte Fassung(en)</Label>
          <Label selectable>Datum: {reviewParsedField(assessment.date)}</Label><Label selectable>Kennzeichen: {reviewRawField(assessment.fields.registration)}</Label>
          <Label selectable>Muster: {reviewRawField(assessment.fields.model)}</Label><Label selectable>Startort: {reviewRawField(assessment.fields.departure)}</Label><Label selectable>Landeort: {reviewRawField(assessment.fields.arrival)}</Label>
          <Label selectable>Start: {reviewParsedField(assessment.clocks.start)} · Landung: {reviewParsedField(assessment.clocks.landing)}</Label><Label selectable>Flugzeit: {reviewDuration(assessment.durations.flight)}</Label>
          <Label muted>Uhrzeitbasis und Landetag sind ungeprüft. Dauer wird nicht aus Uhrzeiten berechnet. Crew-Felder sind Quellenangaben, keine Rollen- oder Buchanrechnung.</Label>
          {(['pilot','pic','companion','companion2','companion3','sic'] as const).map(field => <Label key={field} selectable>{assessment.fields[field].state === 'not-captured' ? field : assessment.fields[field].label}: {reviewRawField(assessment.fields[field])}</Label>)}
          {!!detail.pending.length && <Label>{detail.pending.length} ungeklärte Beobachtung(en) bleiben zur Prüfung erhalten.</Label>}
        </Card>
        <Card><Section title="Originale Anbieterfelder" />
          {assessment.observation.headers.slice(rawPage * 8, rawPage * 8 + 8).map((h,i) => <View key={rawPage * 8 + i} style={{ gap: 2 }}><Label muted>{h || '(ohne Überschrift)'}</Label><Label selectable>{assessment.observation.row.values[rawPage * 8 + i] || 'Leer im Anbieterbeleg'}</Label></View>)}
          <Label muted>Felder {rawPage * 8 + 1}–{Math.min(rawPage * 8 + 8, assessment.observation.headers.length)} von {assessment.observation.headers.length}</Label>
          <Action secondary disabled={rawPage === 0} onPress={() => setRawPage(rawPage - 1)}>Vorherige Anbieterfelder</Action><Action secondary disabled={(rawPage + 1) * 8 >= assessment.observation.headers.length} onPress={() => setRawPage(rawPage + 1)}>Weitere Anbieterfelder</Action>
        </Card><Action secondary onPress={back}>Zur gefilterten Flugliste</Action>
      </>}
    </View></ScrollView>}
  </View>;
}
const s = StyleSheet.create({
  hidden: { display: 'none' }, canvas: { padding: 10, paddingBottom: 20, gap: 8 }, group: { width: '100%', maxWidth: 520, alignSelf: 'center', gap: 8 },
  row: { padding: 7, borderRadius: 13, gap: 3 }, noTrack: { width: 64, minHeight: 64, backgroundColor: '#10282d', borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  searchBox: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 22, backgroundColor: '#11263a', paddingHorizontal: 12, gap: 7 },
  search: { flex: 1, minHeight: 48, color: colors.text, fontSize: 13, paddingVertical: 4 }, filter: { width: 48, minHeight: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
});

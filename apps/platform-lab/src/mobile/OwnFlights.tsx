import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Keyboard, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { Action, Card, Chip, Empty, IconLabel, Label, Section, colors, ui } from './theme';
import { diagnosticJournal } from '../diagnostics';
import { SymbolIcon } from './SymbolIcon';
import type { useOwnFlights } from './use-own-flights';
import { allOwnFlights, ownFlightYears, ownFlightRegistrations, ownRawValue, selectOwnFlights, requestedOwnFlight, type OwnFlightRequest, type OwnFlightFilters } from './own-flight-model';
import { planFlightRetrieval } from '../vereinsflieger/retrieval-policy';
import { dataFreshness } from './data-freshness';
import { summarizeRealFlights, formatReportedMinutes } from './real-flight-statistics';
import { reviewDuration, reviewParsedField, reviewRawField } from '../vereinsflieger/capture-review';

export interface OwnFlightHeader { title: string; back?: () => void }
export function OwnFlights({ active, data, filterRequest, onHeaderChange }: {
  active: boolean; data: ReturnType<typeof useOwnFlights>; filterRequest?: OwnFlightRequest | null; onUpdate?: () => boolean;
  onHeaderChange: (header: OwnFlightHeader) => void;
}) {
  const [filters, setFilters] = useState<OwnFlightFilters>(allOwnFlights);
  const [filterOpen, setFilterOpen] = useState(false);
  const [rawPage, setRawPage] = useState(0), [statusOpen, setStatusOpen] = useState(false);
  const list = useRef<FlatList>(null), offset = useRef(0), scope = useRef<string | null>(null);
  const { width, fontScale } = useWindowDimensions();
  const tablet = width >= 600 && fontScale <= 1.3;
  const flights = useMemo(() => data.view?.flights ?? [], [data.view?.flights]);
  const selected = useMemo(() => selectOwnFlights(flights, filters), [flights, filters]);
  const summary = useMemo(() => summarizeRealFlights(selected), [selected]);
  const years = useMemo(() => ownFlightYears(flights), [flights]);
  const registrations = useMemo(() => ownFlightRegistrations(flights), [flights]);
  const plan = useMemo(() => planFlightRetrieval(data.view?.snapshot.savedRetrievals ?? []), [data.view?.snapshot.savedRetrievals]);
  const freshness = dataFreshness(plan.lastSuccessfulRetrievalAt, data.phase === 'ready' ? 'ready' : 'loading');
  const detailOpen = !!data.detail || data.detailBusy;
  const hasFilters = !!filters.search.trim() || filters.year !== null || filters.registration !== undefined || !!filters.dateRange;
  const back = useCallback(() => { diagnosticJournal.record('back','flights');Keyboard.dismiss(); setFilterOpen(false); setRawPage(0); data.clearDetail(); }, [data.clearDetail]);
  useEffect(() => { onHeaderChange({ title: filterOpen ? 'Flugfilter' : detailOpen ? 'Flugdetails' : 'Flüge', back: filterOpen || detailOpen ? back : undefined }); }, [filterOpen, detailOpen, back, onHeaderChange]);
  useEffect(() => {
    if (!data.view) return;
    const key = `${data.view.snapshot.ownerId}:${data.view.snapshot.storeId}`;
    if (scope.current !== null && scope.current !== key) { setFilters(allOwnFlights); offset.current = 0; setFilterOpen(false); setStatusOpen(false); }
    scope.current = key;
  }, [data.view?.snapshot.ownerId, data.view?.snapshot.storeId]);
  const appliedRequest = useRef<typeof filterRequest>(null);
  useEffect(() => {
    // A newer dashboard request waits for the existing reader to release its
    // lock. Consuming it early would cancel the old read and silently lose the new one.
    if (!active || data.phase !== 'ready' || data.detailBusy || !data.view || !filterRequest || appliedRequest.current === filterRequest) return;
    appliedRequest.current = filterRequest;
    setFilters({ ...allOwnFlights, year: filterRequest.year, dateRange: filterRequest.dateRange });
    offset.current = 0;
    list.current?.scrollToOffset({ offset: 0, animated: false });
    setFilterOpen(false); setRawPage(0); data.clearDetail();
    const requested = requestedOwnFlight(flights, filterRequest);
    if (requested) void data.openDetail(requested);
  }, [active, data.phase, data.detailBusy, data.view, filterRequest, data.clearDetail]);
  const changeFilters = (next: OwnFlightFilters) => { if(next.search!==filters.search)diagnosticJournal.record('filter','search');if(next.year!==filters.year)diagnosticJournal.record('filter','year');if(next.registration!==filters.registration)diagnosticJournal.record('filter','registration'); offset.current = 0; list.current?.scrollToOffset({ offset: 0, animated: false }); setFilters(next); };
  const header = <View style={s.group}>
    <View style={ui.row}><View style={s.searchBox}><SymbolIcon name="search" size={20} tone="muted" /><TextInput
      accessibilityLabel="Flüge durchsuchen" accessibilityHint="Kennzeichen, Ort oder Crew eingeben" placeholder={fontScale > 1.3 ? 'Suchen …' : 'Kennzeichen, Ort, Crew …'} placeholderTextColor={colors.muted} value={filters.search}
      onChangeText={search => changeFilters({ ...filters, search })} onSubmitEditing={Keyboard.dismiss} autoCorrect={false} returnKeyType="search" style={s.search} />{filters.search.length>0&&<Pressable accessibilityRole="button" accessibilityLabel="Suche löschen" onPress={()=>changeFilters({...filters,search:''})} style={s.clear}><Label>×</Label></Pressable>}</View>
      <Pressable accessibilityRole="button" accessibilityLabel="Flugfilter öffnen" onPress={() => { Keyboard.dismiss(); diagnosticJournal.record('action','flight-filter');setFilterOpen(true); }} style={s.filter}><SymbolIcon name="filter" size={24} /></Pressable></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 5 }}><Chip title="Alle Jahre" selected={filters.year === null} onPress={() => changeFilters({ ...filters, year: null, dateRange:null })} />
      {(filters.year !== null && !years.includes(filters.year) ? [filters.year, ...years] : years).map(year => <Chip key={year} title={String(year)} selected={filters.year === year} onPress={() => changeFilters({ ...filters, year, dateRange:null })} />)}</ScrollView>
    {filters.dateRange && <View style={ui.row}><Label muted style={{flex:1}}>{filters.dateRange.from} – {filters.dateRange.to}</Label><Pressable accessibilityRole="button" accessibilityLabel="Zeitraumfilter entfernen" onPress={()=>changeFilters({...filters,dateRange:null})} style={ui.smallAction}><Label>Entfernen</Label></Pressable></View>}
    {filters.registration !== undefined && <Label>Filter: {filters.registration ?? 'Kennzeichen unbekannt'}</Label>}
    <View style={s.resultSummary}><Section title="Eigene gespeicherte Flüge" />
      <Label muted>{summary.count} von {flights.length} gespeicherten Flügen · offline verfügbar</Label>
      <View testID="filtered-flight-summary">
        <Label>Bekannte Flugzeit: {summary.count === 0 ? '—' : summary.knownDurationCount ? `${formatReportedMinutes(summary.knownMinutes)} h` : 'unbekannt'}</Label>
        {summary.unknownDurationCount > 0 && <Label muted>{summary.unknownDurationCount} Flug/Flüge ohne bekannte Flugzeit</Label>}
        <Label muted>Aus den unten aufgeführten Flügen · gemeldete Flugzeit, keine Rollen-Anrechnung</Label>
      </View>
      {hasFilters&&<Action secondary onPress={()=>changeFilters(allOwnFlights)}>Alle Filter zurücksetzen</Action>}
      {(data.view?.pendingCommand || data.view?.snapshot.recovery.readOnly) && <Label>Eine Speicherung oder Wiederherstellung muss geprüft werden. Der letzte geprüfte Stand bleibt lesbar.</Label>}
      {statusOpen && <>
      <Label muted>{freshness.label}</Label>{freshness.reminder && <Label muted>{freshness.note}</Label>}
      <Label muted>{plan.lastSavedAt ? `In der Bibliothek gespeichert: ${new Date(plan.lastSavedAt).toLocaleString('de-DE')}` : 'Noch kein vollständiger Abruf in der Bibliothek gespeichert.'}</Label>
      {plan.periods.map(p => <Label muted key={p.from}>Abgedeckt: {p.from} bis {p.to}</Label>)}
      {plan.gaps.map(p => <Label key={p.from}>Lücke: {p.from} bis {p.to}</Label>)}
      {!plan.periods.length && <Label muted>Noch kein vollständiger Abruf gespeichert.</Label>}
      <Label muted>Gespeicherte Anbieterwerte, keine Aussage über die gesamte Fluggeschichte. Tracks und Distanzen sind nicht verifiziert.</Label>
      <Action secondary onPress={() => void data.reload()}>Gespeicherte Flüge neu laden</Action><Label muted>Neue Daten und Anmeldung erreichst du über „Daten“ oben in der Kopfzeile.</Label></>}
      <Pressable accessibilityRole="button" accessibilityState={{expanded:statusOpen}} onPress={()=>setStatusOpen(!statusOpen)} style={ui.smallAction}><Label muted>{statusOpen ? 'Datenstand schließen' : 'Abdeckung & Datenstand'}</Label></Pressable>
    </View>

  </View>;
  useEffect(() => { if (data.phase !== 'ready') setFilterOpen(false); }, [data.phase]);
  useEffect(()=>{if(active)diagnosticJournal.record('screen',filterOpen?'flight-filter':detailOpen?'flight-detail':'flights');},[active,filterOpen,detailOpen]);
  const detail = data.detail, assessment = detail?.facts.assessment;
  return <View style={{ flex: 1 }}>
    <View style={[{ flex: 1 }, (filterOpen || detailOpen || data.phase !== 'ready') && s.hidden]} accessibilityElementsHidden={filterOpen || detailOpen || data.phase !== 'ready'} importantForAccessibility={filterOpen || detailOpen || data.phase !== 'ready' ? 'no-hide-descendants' : 'auto'}>
      <FlatList ref={list} key={tablet ? 'wide' : 'phone'} numColumns={tablet ? 2 : 1} columnWrapperStyle={tablet ? { gap: 8 } : undefined}
        data={selected} keyExtractor={flight => flight.flightId} ListHeaderComponent={header} ListHeaderComponentStyle={{ marginBottom: 8 }}
        renderItem={({ item }) => { const a = item.facts.assessment; return <Card onPress={() => { diagnosticJournal.record('action','flight-detail');setRawPage(0); void data.openDetail(item); }}
          label={`${reviewParsedField(a.date)}, ${reviewRawField(a.fields.registration)}, ${reviewRawField(a.fields.departure)} nach ${reviewRawField(a.fields.arrival)}, ${reviewDuration(a.durations.flight)} ansehen`} style={[s.row, tablet && { flex: 1, maxWidth: '50%' }]}>
          <View style={[ui.row,{flexWrap:'wrap',justifyContent:'space-between'}]}><Label muted>{reviewParsedField(a.date)}</Label><IconLabel name="clock" size={16}>{reviewDuration(a.durations.flight)}</IconLabel></View>
          <View style={ui.row}>
            <View style={ui.column}><Label style={{fontSize:20,lineHeight:27,fontWeight:'600'}}>{reviewRawField(a.fields.registration)}</Label><Label muted>{reviewRawField(a.fields.model)}</Label>
              <Label>{reviewRawField(a.fields.departure)} → {reviewRawField(a.fields.arrival)}</Label></View><SymbolIcon name="right" size={20} tone="muted" /></View>
        </Card>; }}
        ListEmptyComponent={<Card><Empty title={flights.length ? 'Keine passenden Flüge' : 'Noch keine gespeicherten Flüge'}>{flights.length ? 'Suchbegriff oder Filter ändern. Ein leeres Ergebnis ist keine Aussage über die gesamte Fluggeschichte.' : 'Über „Daten“ oben in der Kopfzeile eigene Flüge laden. Ein Flugbuch wird dafür nicht benötigt.'}</Empty></Card>}
        onScroll={event => { if (active && data.phase === 'ready' && !filterOpen && !detailOpen) offset.current = event.nativeEvent.contentOffset.y; }} scrollEventThrottle={32}
        onContentSizeChange={() => { if (data.phase === 'ready') list.current?.scrollToOffset({ offset: offset.current, animated: false }); }}
        contentContainerStyle={s.canvas} ItemSeparatorComponent={() => <View style={{ height: 7 }} />} initialNumToRender={10} maxToRenderPerBatch={10} windowSize={7} keyboardShouldPersistTaps="handled" />
    </View>
    {data.phase !== 'ready' && <ScrollView contentContainerStyle={s.canvas}><View style={s.group}><Card>

      <Section title={data.phase === 'loading' ? 'Gespeicherte Flüge laden' : data.phase === 'missing' ? 'Eigene Flüge einrichten' : 'Flüge nicht lesbar'} icon="flight-paper-plane" />
      {data.phase === 'loading' ? <ActivityIndicator color={colors.cyan} accessibilityLabel="Eigene gespeicherte Flüge werden geladen" /> : <>
        <Label>{data.detailError ?? (data.phase === 'missing' ? 'Noch keine eigene Flugbibliothek ausgewählt. Bestehende Teststände bleiben getrennt erhalten.' : 'Die gespeicherte Auswahl konnte nicht geprüft werden. Vorhandene Dateien und Aufträge bleiben erhalten.')}</Label>
        <Action secondary onPress={() => void data.reload()}>Gespeicherte Flüge erneut prüfen</Action><Label muted>Neue Daten und Anmeldung erreichst du über „Daten“ oben in der Kopfzeile.</Label>
      </>}
    </Card></View></ScrollView>}
    {filterOpen && <ScrollView contentContainerStyle={s.canvas}><View style={s.group}><Card><Section title="Flugfilter" />
      <Label muted>Jahr, Text und gespeichertes Kennzeichen werden gemeinsam angewendet. Crew-Namen sind Suchtext, keine bestätigte Personenidentität oder Rollen-Anrechnung.</Label>
      <Chip title="Alle Kennzeichen" selected={filters.registration === undefined} onPress={() => changeFilters({ ...filters, registration: undefined })} />
      {registrations.map(registration => <Chip key={registration} title={registration} selected={filters.registration === registration} onPress={() => changeFilters({ ...filters, registration })} />)}
      {flights.some(f => ownRawValue(f.facts.assessment.fields.registration) === null) && <Chip title="Kennzeichen unbekannt" selected={filters.registration === null} onPress={() => changeFilters({ ...filters, registration: null })} />}
      <Action secondary onPress={() => {diagnosticJournal.record('filter','filter-reset');changeFilters(allOwnFlights);}}>Filter zurücksetzen</Action><Action onPress={back}>Gefilterte Liste anzeigen</Action>
    </Card></View></ScrollView>}
    {detailOpen && <ScrollView key={detail?.flightId ?? 'loading-detail'} contentContainerStyle={s.canvas}><View style={s.group}>
      {data.detailBusy && <ActivityIndicator color={colors.cyan} accessibilityLabel="Gespeicherte Flugdetails laden" />}
      {detail && assessment && <>
        <Card><Section title="Gespeicherter Flug" /><Label style={{fontSize:30,lineHeight:38,fontWeight:'700'}}>{reviewRawField(assessment.fields.registration)}</Label>
          <Label style={{color:colors.cyan,fontSize:22,lineHeight:30}}>{reviewDuration(assessment.durations.flight)}</Label>
          <Label selectable>Datum: {reviewParsedField(assessment.date)}</Label><Label selectable>Kennzeichen: {reviewRawField(assessment.fields.registration)}</Label>
          <Label selectable>Muster: {reviewRawField(assessment.fields.model)}</Label><Label selectable>Startort: {reviewRawField(assessment.fields.departure)}</Label><Label selectable>Landeort: {reviewRawField(assessment.fields.arrival)}</Label>
          <Label selectable>Start: {reviewParsedField(assessment.clocks.start)} · Landung: {reviewParsedField(assessment.clocks.landing)}</Label><Label selectable>Flugzeit: {reviewDuration(assessment.durations.flight)}</Label>
          <Label muted>Uhrzeitbasis und Landetag sind ungeprüft. Dauer wird nicht aus Uhrzeiten berechnet. Crew-Felder sind Quellenangaben, keine Rollen- oder Buchanrechnung.</Label>
          {(['pilot','pic','companion','companion2','companion3','sic'] as const).map(field => <Label key={field} selectable>{assessment.fields[field].state === 'not-captured' ? field : assessment.fields[field].label}: {reviewRawField(assessment.fields[field])}</Label>)}
          {!!detail.pending.length && <Label>{detail.pending.length} ungeklärte Beobachtung(en) bleiben zur Prüfung erhalten.</Label>}
        </Card>
        <Card><Section title="Originale Anbieterfelder" /><Label>Fassung {detail.factsRevision} · {detail.factHistory.length} gespeicherte Fassung(en)</Label><Label selectable>Quellflug: {detail.sourceFlightRef}</Label><Label muted>Kein gespeicherter Track. Distanz und Flugweg sind nicht verifiziert.</Label>
          {assessment.observation.headers.slice(rawPage * 8, rawPage * 8 + 8).map((h,i) => <View key={rawPage * 8 + i} style={{ gap: 2 }}><Label muted>{h || '(ohne Überschrift)'}</Label><Label selectable>{assessment.observation.row.values[rawPage * 8 + i] || 'Leer im Anbieterbeleg'}</Label></View>)}
          <Label muted>Felder {rawPage * 8 + 1}–{Math.min(rawPage * 8 + 8, assessment.observation.headers.length)} von {assessment.observation.headers.length}</Label>
          <Action secondary label="Vorherige Anbieterfelder" disabled={rawPage === 0} onPress={() => setRawPage(rawPage - 1)}>Zurück</Action>
          <Action secondary label="Weitere Anbieterfelder" disabled={(rawPage + 1) * 8 >= assessment.observation.headers.length} onPress={() => setRawPage(rawPage + 1)}>Weiter</Action>
        </Card><Action secondary onPress={back}>Zur gefilterten Flugliste</Action>
      </>}
    </View></ScrollView>}
  </View>;
}
const s = StyleSheet.create({
  hidden: { display: 'none' }, canvas: { padding: 18, paddingBottom: 28, gap: 16, width:'100%',maxWidth:960,alignSelf:'center' }, group: { width: '100%', maxWidth: 600, alignSelf: 'center', gap: 12 },
  resultSummary:{gap:6,paddingVertical:8},clear:{minWidth:48,minHeight:48,alignItems:'center',justifyContent:'center'},
  row: { padding: 18, borderRadius: 20, gap: 12 },
  searchBox: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.card, paddingLeft: 14, gap: 7 },
  search: { flex: 1, minHeight: 52, color: colors.text, fontSize: 16, paddingVertical: 8 }, filter: { width: 52, minHeight: 52, borderRadius: 16, backgroundColor:colors.raised,alignItems: 'center', justifyContent: 'center' },
});

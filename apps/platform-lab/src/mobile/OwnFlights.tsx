import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Keyboard, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { Action, Card, Chip, Empty, Label, Section, colors, ui } from './theme';
import { diagnosticJournal } from '../diagnostics';
import { SymbolIcon } from './SymbolIcon';
import type { useOwnFlights } from './use-own-flights';
import { allOwnFlights, ownFlightYears, ownFlightRegistrations, ownRawValue, ownFlightCard, ownFlightFilterTags, removeOwnFlightFilter, selectOwnFlights, requestedOwnFlight, type OwnFlightRequest, type OwnFlightFilters } from './own-flight-model';
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
  const [searchOpen, setSearchOpen] = useState(false);
  const [rawPage, setRawPage] = useState(0), [statusOpen, setStatusOpen] = useState(false);
  const list = useRef<FlatList>(null), offset = useRef(0), scope = useRef<string | null>(null);
  const { width, fontScale } = useWindowDimensions();
  const tablet = width >= 840 && fontScale <= 1.3;
  const flights = useMemo(() => data.view?.flights ?? [], [data.view?.flights]);
  const selected = useMemo(() => selectOwnFlights(flights, filters), [flights, filters]);
  const summary = useMemo(() => summarizeRealFlights(selected), [selected]);
  const years = useMemo(() => ownFlightYears(flights), [flights]);
  const registrations = useMemo(() => ownFlightRegistrations(flights), [flights]);
  const plan = useMemo(() => planFlightRetrieval(data.view?.snapshot.savedRetrievals ?? []), [data.view?.snapshot.savedRetrievals]);
  const freshness = dataFreshness(plan.lastSuccessfulRetrievalAt, data.phase === 'ready' ? 'ready' : 'loading');
  const detailOpen = !!data.detail || data.detailBusy;
  const tags = ownFlightFilterTags(filters), hasFilters = tags.length > 0;
  const back = useCallback(() => { diagnosticJournal.record('back','flights');Keyboard.dismiss(); setFilterOpen(false); setStatusOpen(false); setRawPage(0); data.clearDetail(); }, [data.clearDetail]);
  useEffect(() => { onHeaderChange({ title: filterOpen ? 'Flugfilter' : detailOpen ? 'Flugdetails' : statusOpen ? 'Datenstand' : 'Flüge', back: filterOpen || detailOpen || statusOpen ? back : undefined }); }, [filterOpen, detailOpen, statusOpen, back, onHeaderChange]);
  useEffect(() => {
    if (!data.view) return;
    const key = `${data.view.snapshot.ownerId}:${data.view.snapshot.storeId}`;
    if (scope.current !== null && scope.current !== key) { setFilters(allOwnFlights); offset.current = 0; setFilterOpen(false); setStatusOpen(false); setSearchOpen(false); }
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
    setFilterOpen(false); setStatusOpen(false); setSearchOpen(false); setRawPage(0); data.clearDetail();
    const requested = requestedOwnFlight(flights, filterRequest);
    if (requested) void data.openDetail(requested);
  }, [active, data.phase, data.detailBusy, data.view, filterRequest, data.clearDetail]);
  const changeFilters = (next: OwnFlightFilters) => { if(next.search!==filters.search)diagnosticJournal.record('filter','search');if(next.year!==filters.year)diagnosticJournal.record('filter','year');if(next.registration!==filters.registration)diagnosticJournal.record('filter','registration'); offset.current = 0; list.current?.scrollToOffset({ offset: 0, animated: false }); setFilters(next); };
  const openFilters = () => { Keyboard.dismiss(); diagnosticJournal.record('action','flight-filter'); setFilterOpen(true); };
  const header = <View style={s.filterGroup}>
    <View style={s.controls}>
      <Pressable accessibilityRole="button" accessibilityLabel="Flugfilter öffnen" accessibilityState={{selected:filters.year !== null || !!filters.dateRange}} onPress={openFilters} style={[s.picker, (filters.year !== null || !!filters.dateRange) && s.pickerActive]}><Label style={[s.controlText, (filters.year !== null || !!filters.dateRange) && s.activeText]}>Zeitraum</Label><SymbolIcon name="down" size={14} tone={filters.year!==null||filters.dateRange?'contrast':'muted'}/></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Flugzeugfilter öffnen" accessibilityState={{selected:filters.registration !== undefined}} onPress={openFilters} style={[s.picker, filters.registration !== undefined && s.pickerActive]}><Label style={[s.controlText, filters.registration !== undefined && s.activeText]}>Flugzeug</Label><SymbolIcon name="down" size={14} tone={filters.registration!==undefined?'contrast':'muted'}/></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Flugsuche öffnen" accessibilityState={{expanded:searchOpen,selected:!!filters.search.trim()}} onPress={()=>{Keyboard.dismiss();setSearchOpen(!searchOpen);}} style={[s.searchToggle, !!filters.search.trim() && s.pickerActive]}><SymbolIcon name="search" size={20} tone={filters.search.trim()?'contrast':'default'}/></Pressable>
    </View>
    {searchOpen && <View style={s.searchBox}><TextInput
      accessibilityLabel="Flüge durchsuchen" accessibilityHint="Kennzeichen, Ort oder Crew eingeben" placeholder="Kennzeichen, Ort, Crew …" placeholderTextColor={colors.muted} value={filters.search}
      onChangeText={search => changeFilters({ ...filters, search })} onSubmitEditing={Keyboard.dismiss} autoCorrect={false} returnKeyType="search" style={s.search} />{filters.search.length>0&&<Pressable accessibilityRole="button" accessibilityLabel="Suche löschen" onPress={()=>changeFilters({...filters,search:''})} style={s.clear}><Label>×</Label></Pressable>}</View>}
    {hasFilters && <View style={s.controls} testID="active-flight-filters">
      {tags.map(tag=><Pressable key={tag.key} accessibilityRole="button" accessibilityLabel={tag.key==='dateRange'?'Zeitraumfilter entfernen':`${tag.label} entfernen`} onPress={()=>changeFilters(removeOwnFlightFilter(filters,tag.key))} style={s.activeTag}><Label style={s.tagText}>{tag.label} ×</Label></Pressable>)}
      <Pressable accessibilityRole="button" accessibilityLabel="Alle Filter zurücksetzen" onPress={()=>{diagnosticJournal.record('filter','filter-reset');changeFilters(allOwnFlights);}} style={s.reset}><Label muted style={s.smallText}>Reset</Label></Pressable>
    </View>}
    <View style={s.summaryRow}>
      <View testID="filtered-flight-summary" style={s.summaryText}>
        <Label muted style={s.smallText}>{hasFilters?`${summary.count}/${flights.length}`:summary.count} Flüge · {summary.count === 0 ? '—' : summary.knownDurationCount ? `${formatReportedMinutes(summary.knownMinutes)} h` : '— h'}{summary.unknownDurationCount>0?` · ${summary.unknownDurationCount}× Zeit unbekannt`:''}</Label>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Abdeckung & Datenstand" onPress={()=>{Keyboard.dismiss();setStatusOpen(true);}} style={s.info}><SymbolIcon name="info" size={18} tone="muted"/></Pressable>
    </View>
    {(data.view?.pendingCommand || data.view?.snapshot.recovery.readOnly) && <Label style={s.smallText}>Speicherung oder Wiederherstellung prüfen. Der letzte geprüfte Stand bleibt lesbar.</Label>}
  </View>;
  useEffect(() => { if (data.phase !== 'ready') {setFilterOpen(false);setStatusOpen(false);} }, [data.phase]);
  useEffect(()=>{if(active)diagnosticJournal.record('screen',filterOpen?'flight-filter':detailOpen?'flight-detail':'flights');},[active,filterOpen,detailOpen]);
  const detail = data.detail, assessment = detail?.facts.assessment;
  return <View style={{ flex: 1 }}>
    <View style={[{ flex: 1 }, (filterOpen || detailOpen || statusOpen || data.phase !== 'ready') && s.hidden]} accessibilityElementsHidden={filterOpen || detailOpen || statusOpen || data.phase !== 'ready'} importantForAccessibility={filterOpen || detailOpen || statusOpen || data.phase !== 'ready' ? 'no-hide-descendants' : 'auto'}>
      <View testID="flight-filter-bar" style={s.bar}>{header}</View>
      <FlatList ref={list} key={tablet ? 'wide' : 'phone'} numColumns={tablet ? 2 : 1} columnWrapperStyle={tablet ? { gap: 8 } : undefined}
        data={selected} keyExtractor={flight => flight.flightId}
        renderItem={({ item }) => { const a = item.facts.assessment, card = ownFlightCard(item); return <Card onPress={() => { Keyboard.dismiss();diagnosticJournal.record('action','flight-detail');setRawPage(0); void data.openDetail(item); }}
          label={`${reviewParsedField(a.date)}, ${card.registration}, Start ${card.start}, ${card.route}, ${reviewDuration(a.durations.flight)}, Pilot: ${reviewRawField(a.fields.pilot)}, Begleiter: ${[a.fields.companion,a.fields.companion2,a.fields.companion3].map(reviewRawField).join(' · ')}${card.solo?', Solo im Anbieterbeleg':''}, ansehen`} style={[s.row, tablet && { flex: 1, maxWidth: '50%' }]}>
          <View style={s.flightInfo}>
            <View style={s.identity}><Label muted style={s.smallText}>{card.date}</Label><Label style={s.registration}>{card.registration}</Label><Label muted style={s.smallText}>{card.model}</Label></View>
            <View style={s.crew}>{card.crew.map((person,index)=><Label key={index} style={s.crewText}><Label muted style={s.role}>{person.role} </Label>{person.name}</Label>)}{card.solo&&<Label style={s.solo}>Solo</Label>}</View>
            <Label muted style={s.smallText}>{card.start} · {card.route}</Label>
          </View>
          <Label style={[s.duration,!card.knownDuration&&s.unclearDuration]}>{card.duration}{card.knownDuration&&<Label muted style={s.role}> h</Label>}</Label>
        </Card>; }}
        ListEmptyComponent={<Card><Empty title={flights.length ? 'Keine passenden Flüge' : 'Noch keine gespeicherten Flüge'}>{flights.length ? 'Suchbegriff oder Filter ändern. Ein leeres Ergebnis ist keine Aussage über die gesamte Fluggeschichte.' : 'Über die Verbindung oben in der Kopfzeile eigene Flüge laden. Ein Flugbuch wird dafür nicht benötigt.'}</Empty></Card>}
        onScroll={event => { if (active && data.phase === 'ready' && !filterOpen && !detailOpen && !statusOpen) offset.current = event.nativeEvent.contentOffset.y; }} scrollEventThrottle={32}
        onContentSizeChange={() => { if (data.phase === 'ready') list.current?.scrollToOffset({ offset: offset.current, animated: false }); }}
        contentContainerStyle={[s.canvas,s.flightCanvas,{maxWidth:tablet?960:480}]} ItemSeparatorComponent={() => <View style={{ height: 5 }} />} initialNumToRender={10} maxToRenderPerBatch={10} windowSize={7} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" />
    </View>
    {data.phase !== 'ready' && <ScrollView contentContainerStyle={s.canvas}><View style={s.group}><Card>

      <Section title={data.phase === 'loading' ? 'Gespeicherte Flüge laden' : data.phase === 'missing' ? 'Eigene Flüge einrichten' : 'Flüge nicht lesbar'} icon="flight-paper-plane" />
      {data.phase === 'loading' ? <ActivityIndicator color={colors.cyan} accessibilityLabel="Eigene gespeicherte Flüge werden geladen" /> : <>
        <Label>{data.detailError ?? (data.phase === 'missing' ? 'Noch keine eigene Flugbibliothek ausgewählt. Bestehende Teststände bleiben getrennt erhalten.' : 'Die gespeicherte Auswahl konnte nicht geprüft werden. Vorhandene Dateien und Aufträge bleiben erhalten.')}</Label>
        <View style={s.controls}><Action secondary onPress={() => void data.reload()}>Gespeicherte Flüge erneut prüfen</Action></View><Label muted>Neue Daten und Anmeldung erreichst du über die Verbindung oben in der Kopfzeile.</Label>
      </>}
    </Card></View></ScrollView>}
    {filterOpen && <ScrollView contentContainerStyle={s.canvas}><View style={s.group}><Card><Section title="Zeitraum" />
      <View style={s.controls}><Chip title="Alle Jahre" selected={filters.year === null && !filters.dateRange} onPress={() => changeFilters({ ...filters, year: null, dateRange:null })} />
      {(filters.year !== null && !years.includes(filters.year) ? [filters.year, ...years] : years).map(year => <Chip key={year} title={String(year)} selected={filters.year === year && !filters.dateRange} onPress={() => changeFilters({ ...filters, year, dateRange:null })} />)}</View>
      {filters.dateRange&&<Label>{filters.dateRange.from} – {filters.dateRange.to}</Label>}
      <Section title="Flugzeug" />
      <View style={s.controls}><Chip title="Alle Kennzeichen" selected={filters.registration === undefined} onPress={() => changeFilters({ ...filters, registration: undefined })} />
      {registrations.map(registration => <Chip key={registration} title={registration} selected={filters.registration === registration} onPress={() => changeFilters({ ...filters, registration })} />)}
      {flights.some(f => ownRawValue(f.facts.assessment.fields.registration) === null) && <Chip title="Kennzeichen unbekannt" selected={filters.registration === null} onPress={() => changeFilters({ ...filters, registration: null })} />}
      </View><View style={s.controls}><Action secondary onPress={() => {diagnosticJournal.record('filter','filter-reset');changeFilters(allOwnFlights);}}>Zurücksetzen</Action><Action onPress={back}>Anzeigen</Action></View>
    </Card></View></ScrollView>}
    {statusOpen && <ScrollView contentContainerStyle={s.canvas}><View style={s.group}><Card><Section title="Abdeckung & Datenstand"/>
      <Label muted>{freshness.label}</Label>{freshness.reminder&&<Label muted>{freshness.note}</Label>}
      <Label muted>{plan.lastSavedAt?`Gespeichert: ${new Date(plan.lastSavedAt).toLocaleString('de-DE')}`:'Noch kein vollständiger Abruf gespeichert.'}</Label>
      {plan.periods.map(p=><Label muted key={p.from}>Abgedeckt: {p.from} bis {p.to}</Label>)}
      {plan.gaps.map(p=><Label key={p.from}>Lücke: {p.from} bis {p.to}</Label>)}
      <Label muted>Die Summe zeigt bekannte gemeldete Flugzeit, keine Rollen-Anrechnung. Unbekannte Zeiten werden separat gezählt. Crew-Namen sind Quellenangaben, keine bestätigte Personenidentität. Solo erfordert eine ausdrückliche Angabe im Anbieterbeleg.</Label>
      <Label muted>Gespeicherte Anbieterwerte, keine Aussage über die gesamte Fluggeschichte. Tracks und Distanzen sind nicht verifiziert. Neue Daten erreichst du über Sync in der Kopfzeile.</Label>
      <View style={s.controls}><Action secondary onPress={()=>void data.reload()}>Lokal neu laden</Action><Action onPress={back}>Zurück</Action></View>
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
          <View style={s.controls}><Action secondary label="Vorherige Anbieterfelder" disabled={rawPage === 0} onPress={() => setRawPage(rawPage - 1)}>Zurück</Action>
          <Action secondary label="Weitere Anbieterfelder" disabled={(rawPage + 1) * 8 >= assessment.observation.headers.length} onPress={() => setRawPage(rawPage + 1)}>Weiter</Action></View>
        </Card><View style={s.controls}><Action secondary onPress={back}>Zur gefilterten Flugliste</Action></View>
      </>}
    </View></ScrollView>}
  </View>;
}
const s = StyleSheet.create({
  hidden: { display: 'none' }, canvas: { padding: 18, paddingBottom: 28, gap: 16, width:'100%',maxWidth:960,alignSelf:'center' }, group: { width: '100%', maxWidth: 600, alignSelf: 'center', gap: 12 },
  bar:{width:'100%',maxWidth:960,alignSelf:'center',paddingHorizontal:12,paddingTop:4,paddingBottom:2,borderBottomWidth:1,borderBottomColor:colors.border},
  filterGroup:{width:'100%',maxWidth:600,alignSelf:'center',gap:2},controls:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:5},
  picker:{minHeight:48,paddingHorizontal:12,flexDirection:'row',alignItems:'center',gap:6,justifyContent:'center',borderRadius:12,borderWidth:1,borderColor:colors.border,backgroundColor:colors.card},
  pickerActive:{backgroundColor:colors.cyan,borderColor:colors.cyan},activeText:{color:'#031326'},controlText:{fontSize:14,lineHeight:20},
  searchToggle:{minWidth:48,minHeight:48,alignItems:'center',justifyContent:'center',borderRadius:12},
  activeTag:{minHeight:48,maxWidth:'100%',justifyContent:'center',paddingHorizontal:10,paddingVertical:5,borderRadius:10,backgroundColor:colors.cyan},
  tagText:{fontSize:13,lineHeight:18,color:'#031326',flexShrink:1},reset:{minHeight:48,minWidth:48,paddingHorizontal:6,justifyContent:'center'},
  summaryRow:{flexDirection:'row',alignItems:'center',gap:6},summaryText:{flex:1,minWidth:0},info:{minWidth:48,minHeight:48,alignItems:'center',justifyContent:'center'},
  clear:{minWidth:48,minHeight:48,alignItems:'center',justifyContent:'center'},
  flightCanvas:{paddingHorizontal:12,paddingTop:6,gap:0},
  row: { flexDirection:'row',alignItems:'center',paddingVertical:7,paddingHorizontal:10,borderRadius:10,gap:8,minHeight:48 },
  flightInfo:{flex:1,minWidth:0,gap:2},identity:{flexDirection:'row',flexWrap:'wrap',alignItems:'baseline',gap:7},
  smallText:{fontSize:12,lineHeight:17},registration:{fontSize:14,lineHeight:19,fontWeight:'600'},
  crew:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',columnGap:9,rowGap:2},crewText:{fontSize:13,lineHeight:18,flexShrink:1},role:{fontSize:11,lineHeight:16},
  solo:{fontSize:11,lineHeight:16,color:colors.cyan,borderWidth:1,borderColor:colors.border,borderRadius:4,paddingHorizontal:4},
  duration:{fontSize:20,lineHeight:28,fontWeight:'600',fontVariant:['tabular-nums'],maxWidth:'32%'},unclearDuration:{fontSize:12,lineHeight:17,fontWeight:'400'},
  searchBox: { width:280,maxWidth:'100%',flexDirection:'row',alignItems:'center',borderWidth:1,borderColor:colors.border,borderRadius:12,backgroundColor:colors.card,paddingLeft:10 },
  search: { flex:1,minWidth:0,minHeight:48,color:colors.text,fontSize:16,paddingVertical:6 },
});

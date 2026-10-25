import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Keyboard, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { Action, Card, Chip, Empty, Label, Section, colors, ui } from './theme';
import { FlightCard } from './FlightCard';
import { FlightDetails } from './FlightDetails';
import { diagnosticJournal } from '../diagnostics';
import { SymbolIcon } from './SymbolIcon';
import type { useOwnFlights } from './use-own-flights';
import { allOwnFlights, ownFlightClassificationOptions, ownFlightYears, ownFlightRegistrations, ownRawValue, ownFlightCard, ownFlightFilterTags, removeOwnFlightFilter, selectOwnFlights, requestedOwnFlight, type OwnFlightRequest, type OwnFlightFilters } from './own-flight-model';
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
  const [filterSection,setFilterSection]=useState<'period'|'aircraft'>('period');
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
  const classificationOptions = useMemo(() => ownFlightClassificationOptions(flights), [flights]);
  const aircraftFiltered = filters.registration !== undefined || filters.aircraftCategory !== undefined || filters.launchMethod !== undefined;
  const plan = useMemo(() => planFlightRetrieval(data.view?.snapshot.savedRetrievals ?? []), [data.view?.snapshot.savedRetrievals]);
  const freshness = dataFreshness(plan.lastSuccessfulRetrievalAt, data.phase === 'ready' ? 'ready' : 'loading');
  const detailOpen = !!data.detail || data.detailBusy;
  const tags = ownFlightFilterTags(filters), hasFilters = tags.length > 0;
  const back = useCallback(() => { diagnosticJournal.record('back','flights');Keyboard.dismiss(); setFilterOpen(false); setStatusOpen(false); setRawPage(0); data.clearDetail(); }, [data.clearDetail]);
  useEffect(() => { onHeaderChange({ title: filterOpen ? filterSection==='period'?'Zeitraum wählen':'Flugzeug & Startart' : detailOpen ? 'Flugdetails' : statusOpen ? 'Datenstand' : 'Flüge', back: filterOpen || detailOpen || statusOpen ? back : undefined }); }, [filterOpen,filterSection, detailOpen, statusOpen, back, onHeaderChange]);
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
    setFilters({ ...allOwnFlights, year: filterRequest.year, dateRange: filterRequest.dateRange,flightIds:filterRequest.flightIds });
    offset.current = 0;
    list.current?.scrollToOffset({ offset: 0, animated: false });
    setFilterOpen(false); setStatusOpen(false); setSearchOpen(false); setRawPage(0); data.clearDetail();
    const requested = requestedOwnFlight(flights, filterRequest);
    if (requested) void data.openDetail(requested);
  }, [active, data.phase, data.detailBusy, data.view, filterRequest, data.clearDetail]);
  const changeFilters = (next: OwnFlightFilters) => { if(next.search!==filters.search)diagnosticJournal.record('filter','search');if(next.year!==filters.year)diagnosticJournal.record('filter','year');if(next.registration!==filters.registration)diagnosticJournal.record('filter','registration'); offset.current = 0; list.current?.scrollToOffset({ offset: 0, animated: false }); setFilters({...next,flightIds:undefined}); };
  const openFilters = (section:'period'|'aircraft') => { Keyboard.dismiss(); diagnosticJournal.record('action','flight-filter'); setFilterSection(section);setFilterOpen(true); };
  const header = <View style={s.filterGroup}>
    <View style={s.controls}>
      <Pressable accessibilityRole="button" accessibilityLabel="Flugfilter öffnen" accessibilityState={{selected:filters.year !== null || !!filters.dateRange}} onPress={()=>openFilters('period')} style={[s.picker, (filters.year !== null || !!filters.dateRange) && s.pickerActive]}><Label style={[s.controlText, (filters.year !== null || !!filters.dateRange) && s.activeText]}>Zeitraum</Label><SymbolIcon name="down" size={14} tone={filters.year!==null||filters.dateRange?'contrast':'muted'}/></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Flugzeugfilter öffnen" accessibilityState={{selected:aircraftFiltered}} onPress={()=>openFilters('aircraft')} style={[s.picker, aircraftFiltered && s.pickerActive]}><Label style={[s.controlText, aircraftFiltered && s.activeText]}>Flugzeug & Start</Label><SymbolIcon name="down" size={14} tone={aircraftFiltered?'contrast':'muted'}/></Pressable>
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
        renderItem={({item})=><FlightCard flight={item} onPress={()=>{Keyboard.dismiss();diagnosticJournal.record('action','flight-detail');setRawPage(0);void data.openDetail(item);}} style={tablet?{flex:1,maxWidth:'50%'}:undefined}/>}
        ListEmptyComponent={<Card><Empty title={flights.length ? 'Keine passenden Flüge' : 'Noch keine gespeicherten Flüge'}>{flights.length ? 'Suchbegriff oder Filter ändern. Ein leeres Ergebnis ist keine Aussage über die gesamte Fluggeschichte.' : 'Über die Verbindung oben in der Kopfzeile eigene Flüge laden. Ein Flugbuch wird dafür nicht benötigt.'}</Empty>{hasFilters && <Action secondary onPress={()=>changeFilters(allOwnFlights)}>Alle Filter zurücksetzen</Action>}</Card>}
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
    {filterOpen && <ScrollView contentContainerStyle={s.canvas}><View style={s.group}><Card><Label muted>Änderungen gelten sofort. Zurück behält deine Auswahl.</Label>{filterSection==='period'&&<><Section title="Zeitraum" />
      <View style={s.controls}><Chip title="Alle Jahre" selected={filters.year === null && !filters.dateRange} onPress={() => changeFilters({ ...filters, year: null, dateRange:null })} />
      {(filters.year !== null && !years.includes(filters.year) ? [filters.year, ...years] : years).map(year => <Chip key={year} title={String(year)} selected={filters.year === year && !filters.dateRange} onPress={() => changeFilters({ ...filters, year, dateRange:null })} />)}</View>
      {filters.dateRange&&<Label>{filters.dateRange.from} – {filters.dateRange.to}</Label>}
      </>}{filterSection==='aircraft'&&<><Section title="Luftfahrzeugart" />
      <View style={s.controls}><Chip title="Alle Kategorien" selected={filters.aircraftCategory === undefined} onPress={()=>changeFilters({...filters,aircraftCategory:undefined})}/>
      {classificationOptions.categories.map(option=><Chip key={option.key} title={option.label} selected={filters.aircraftCategory===option.key} onPress={()=>changeFilters({...filters,aircraftCategory:option.key})}/>)}</View>
      <Section title="Startart"/><View style={s.controls}><Chip title="Alle Starts" selected={filters.launchMethod===undefined} onPress={()=>changeFilters({...filters,launchMethod:undefined})}/>
      {classificationOptions.launches.map(option=><Chip key={option.key} title={option.label} selected={filters.launchMethod===option.key} onPress={()=>changeFilters({...filters,launchMethod:option.key})}/>)}</View>
      <Section title="Kennzeichen" />
      <View style={s.controls}><Chip title="Alle Kennzeichen" selected={filters.registration === undefined} onPress={() => changeFilters({ ...filters, registration: undefined })} />
      {registrations.map(registration => <Chip key={registration} title={registration} selected={filters.registration === registration} onPress={() => changeFilters({ ...filters, registration })} />)}
      {flights.some(f => ownRawValue(f.facts.assessment.fields.registration) === null) && <Chip title="Kennzeichen unbekannt" selected={filters.registration === null} onPress={() => changeFilters({ ...filters, registration: null })} />}
      </View></>}<View style={s.controls}><Action secondary onPress={() => {diagnosticJournal.record('filter','filter-reset');changeFilters(allOwnFlights);}}>Zurücksetzen</Action><Action onPress={back}>Zur Flugliste</Action></View>
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
        <FlightDetails key={detail.flightId} detail={detail} rawPage={rawPage} onRawPage={setRawPage}/><View style={s.controls}><Action secondary onPress={back}>Zur gefilterten Flugliste</Action></View>
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

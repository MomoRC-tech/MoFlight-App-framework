import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Keyboard, Modal, Pressable, Text, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
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
  const [picker,setPicker]=useState<'year'|'category'|'registration'|'launch'|null>(null);
  const [optionQuery,setOptionQuery]=useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [rawPage, setRawPage] = useState(0), [statusOpen, setStatusOpen] = useState(false);
  const list = useRef<FlatList>(null), offset = useRef(0), scope = useRef<string | null>(null);
  const { width, height, fontScale } = useWindowDimensions();
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
  const back = useCallback(() => { diagnosticJournal.record('back','flights');Keyboard.dismiss(); setPicker(null); setFilterOpen(false); setStatusOpen(false); setRawPage(0); data.clearDetail(); }, [data.clearDetail]);
  useEffect(() => { onHeaderChange({ title: detailOpen ? 'Flugdetails' : statusOpen ? 'Datenstand' : 'Flüge', back: detailOpen || statusOpen || filterOpen ? back : undefined }); }, [filterOpen, detailOpen, statusOpen, back, onHeaderChange]);
  useEffect(() => {
    if (!data.view) return;
    const key = `${data.view.snapshot.ownerId}:${data.view.snapshot.storeId}`;
    if (scope.current !== null && scope.current !== key) { setFilters(allOwnFlights); offset.current = 0; setFilterOpen(false); setPicker(null); setOptionQuery(''); setStatusOpen(false); setSearchOpen(false); }
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
    setFilterOpen(false); setPicker(null); setOptionQuery(''); setStatusOpen(false); setSearchOpen(false); setRawPage(0); data.clearDetail();
    const requested = requestedOwnFlight(flights, filterRequest);
    if (requested) void data.openDetail(requested);
  }, [active, data.phase, data.detailBusy, data.view, filterRequest, data.clearDetail]);
  const changeFilters = (next: OwnFlightFilters) => { if(next.search!==filters.search)diagnosticJournal.record('filter','search');if(next.year!==filters.year)diagnosticJournal.record('filter','year');if(next.registration!==filters.registration)diagnosticJournal.record('filter','registration'); offset.current = 0; list.current?.scrollToOffset({ offset: 0, animated: false }); setFilters({...next,flightIds:undefined}); };
  const openPicker = (kind: NonNullable<typeof picker>) => {Keyboard.dismiss();setOptionQuery('');setPicker(kind);};
  const field=(title:string,value:string,kind:NonNullable<typeof picker>)=><Pressable key={kind} accessibilityRole="button" accessibilityLabel={`${title}: ${value}, auswählen`} onPress={()=>openPicker(kind)} style={[s.field,fontScale>1.3&&{width:'100%'}]}><Text style={s.fieldLabel}>{title}</Text><View style={s.fieldValue}><Text numberOfLines={1} style={s.fieldText}>{value}</Text><SymbolIcon name="down" size={12} tone="muted"/></View></Pressable>;
  const pick=(next:OwnFlightFilters)=>{changeFilters(next);setPicker(null);};
  const options:{id:string;label:string;selected:boolean;choose:()=>void}[]=picker==='year'?
    [{id:'all',label:'Alle Jahre',selected:filters.year===null&&!filters.dateRange,choose:()=>pick({...filters,year:null,dateRange:null})},...years.map(year=>({id:String(year),label:String(year),selected:filters.year===year,choose:()=>pick({...filters,year,dateRange:null})}))]:picker==='category'?
    [{id:'all',label:'Alle Kategorien',selected:filters.aircraftCategory===undefined,choose:()=>pick({...filters,aircraftCategory:undefined})},...classificationOptions.categories.map(o=>({id:o.key,label:o.label,selected:filters.aircraftCategory===o.key,choose:()=>pick({...filters,aircraftCategory:o.key})}))]:picker==='launch'?
    [{id:'all',label:'Alle Startarten',selected:filters.launchMethod===undefined,choose:()=>pick({...filters,launchMethod:undefined})},...classificationOptions.launches.map(o=>({id:o.key,label:o.label,selected:filters.launchMethod===o.key,choose:()=>pick({...filters,launchMethod:o.key})}))]:picker==='registration'?
    [{id:'all',label:'Alle Kennzeichen',selected:filters.registration===undefined,choose:()=>pick({...filters,registration:undefined})},...registrations.map(registration=>({id:'reg-'+registration,label:registration,selected:filters.registration===registration,choose:()=>pick({...filters,registration})})),...(flights.some(f=>ownRawValue(f.facts.assessment.fields.registration)===null)?[{id:'unknown',label:'Kennzeichen unbekannt',selected:filters.registration===null,choose:()=>pick({...filters,registration:null})}]:[])]:[];
  const search=<View style={s.searchBox}><TextInput accessibilityLabel="Flüge durchsuchen" placeholder="Kennzeichen, Ort, Crew …" placeholderTextColor={colors.muted} value={filters.search} onChangeText={search=>changeFilters({...filters,search})} onSubmitEditing={Keyboard.dismiss} autoCorrect={false} returnKeyType="search" style={s.search}/>{filters.search.length>0&&<Pressable accessibilityRole="button" accessibilityLabel="Suche löschen" onPress={()=>changeFilters({...filters,search:''})} style={s.clear}><Label>×</Label></Pressable>}</View>;
  const header=<View style={s.filterGroup}>
    <View style={s.compactHeader}>
      <Pressable accessibilityRole="button" accessibilityLabel="Flugfilter öffnen" accessibilityState={{expanded:filterOpen,selected:hasFilters}} onPress={()=>{Keyboard.dismiss();setFilterOpen(!filterOpen);}} style={s.filterToggle}><Label style={s.controlText}>Filter{hasFilters?` (${tags.length})`:''} {filterOpen?'↑':'↓'}</Label></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Aktive Filter: ${tags.map(t=>t.label).join(', ')||'keine'}`} onPress={()=>setFilterOpen(!filterOpen)} style={{flex:1,minWidth:0,minHeight:48,justifyContent:'center'}}><Text numberOfLines={1} style={s.summaryCaption}>{tags.map(t=>t.label).join(' · ')||'Alle Flüge'}</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Flugsuche öffnen" accessibilityState={{expanded:searchOpen||filterOpen}} onPress={()=>{Keyboard.dismiss();setSearchOpen(!searchOpen);}} style={s.searchToggle}><SymbolIcon name="search" size={20}/></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Abdeckung & Datenstand" onPress={()=>{Keyboard.dismiss();setStatusOpen(true);}} style={s.info}><SymbolIcon name="info" size={18} tone="muted"/></Pressable>
    </View>
    <View testID="filtered-flight-summary"><Text style={s.summaryCaption}>{hasFilters?`${summary.count}/${flights.length}`:summary.count} Flüge · {summary.count===0?'—':summary.knownDurationCount?`${formatReportedMinutes(summary.knownMinutes)} h`:'— h'}{summary.unknownDurationCount&&summary.knownDurationCount?' bekannt':''}</Text></View>
    {filterOpen?<ScrollView keyboardShouldPersistTaps="handled" style={{maxHeight:Math.max(180,(height||800)*.48)}} contentContainerStyle={{gap:6,paddingTop:6,paddingBottom:4}}>
      {search}
      <View style={s.fields}>
        {field('Zeitraum',filters.dateRange?`${filters.dateRange.from} – ${filters.dateRange.to}`:filters.year===null?'Alle Jahre':String(filters.year),'year')}
        {field('Kategorie',classificationOptions.categories.find(o=>o.key===filters.aircraftCategory)?.label??'Alle Kategorien','category')}
        {field('Kennzeichen',filters.registration===undefined?'Alle':filters.registration??'Unbekannt','registration')}
        {field('Startart',classificationOptions.launches.find(o=>o.key===filters.launchMethod)?.label??'Alle Startarten','launch')}
      </View>
      {filters.flightIds&&<Pressable accessibilityRole="button" accessibilityLabel="Belegfilter entfernen" style={s.filterToggle} onPress={()=>changeFilters({...filters,flightIds:undefined})}><Label muted>Belege: {filters.flightIds.length} · entfernen ×</Label></Pressable>}
      <View style={s.compactHeader}><Pressable accessibilityRole="button" accessibilityLabel="Alle Filter zurücksetzen" onPress={()=>changeFilters(allOwnFlights)} style={s.filterToggle}><Label muted>Zurücksetzen</Label></Pressable><View style={{flex:1}}/><Pressable accessibilityRole="button" accessibilityLabel="Filter schließen" onPress={()=>{Keyboard.dismiss();setFilterOpen(false);setSearchOpen(false);}} style={s.filterToggle}><Label style={{color:colors.cyan}}>{summary.count} Flüge anzeigen ↑</Label></Pressable></View>
    </ScrollView>:searchOpen?search:null}
    {(data.view?.pendingCommand||data.view?.snapshot.recovery.readOnly)&&<Label muted style={s.smallText}>Speicherung oder Wiederherstellung prüfen.</Label>}
  </View>;
  useEffect(() => { if (data.phase !== 'ready') {setFilterOpen(false);setStatusOpen(false);setPicker(null);} }, [data.phase]);
  useEffect(() => { if (!active) setPicker(null); }, [active]);
  useEffect(()=>{if(active)diagnosticJournal.record('screen',filterOpen?'flight-filter':detailOpen?'flight-detail':'flights');},[active,filterOpen,detailOpen]);
  const detail = data.detail, assessment = detail?.facts.assessment;
  return <View style={{ flex: 1 }}>
    <View style={[{ flex: 1 }, (detailOpen || statusOpen || data.phase !== 'ready') && s.hidden]} accessibilityElementsHidden={detailOpen || statusOpen || data.phase !== 'ready'} importantForAccessibility={detailOpen || statusOpen || data.phase !== 'ready' ? 'no-hide-descendants' : 'auto'}>
      <View testID="flight-filter-bar" style={s.bar}>{header}</View>
      <FlatList ref={list} key={tablet ? 'wide' : 'phone'} numColumns={tablet ? 2 : 1} columnWrapperStyle={tablet ? { gap: 8 } : undefined}
        data={selected} keyExtractor={flight => flight.flightId}
        renderItem={({item})=><FlightCard flight={item} onPress={()=>{Keyboard.dismiss();diagnosticJournal.record('action','flight-detail');setRawPage(0);void data.openDetail(item);}} style={tablet?{flex:1,maxWidth:'50%'}:undefined}/>}
        ListEmptyComponent={<Card><Empty title={flights.length ? 'Keine passenden Flüge' : 'Noch keine gespeicherten Flüge'}>{flights.length ? 'Suchbegriff oder Filter ändern. Ein leeres Ergebnis ist keine Aussage über die gesamte Fluggeschichte.' : 'Über die Verbindung oben in der Kopfzeile eigene Flüge laden. Ein Flugbuch wird dafür nicht benötigt.'}</Empty>{hasFilters && <Action secondary onPress={()=>changeFilters(allOwnFlights)}>Alle Filter zurücksetzen</Action>}</Card>}
        onScroll={event => { if (active && data.phase === 'ready' && !detailOpen && !statusOpen) offset.current = event.nativeEvent.contentOffset.y; }} scrollEventThrottle={32}
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
    {picker&&active&&<Modal transparent animationType="fade" onRequestClose={()=>setPicker(null)}><View style={s.scrim}><Pressable accessibilityRole="button" accessibilityLabel="Auswahl schließen" onPress={()=>setPicker(null)} style={StyleSheet.absoluteFill}/><View accessibilityViewIsModal style={s.optionSheet}>
      <View style={s.compactHeader}><Label style={{flex:1,fontWeight:'600'}}>{({year:'Zeitraum',category:'Luftfahrzeugart',registration:'Kennzeichen',launch:'Startart'})[picker]}</Label><Pressable accessibilityRole="button" accessibilityLabel="Auswahl schließen" onPress={()=>setPicker(null)} style={s.clear}><Label>×</Label></Pressable></View>
      {picker==='registration'&&<TextInput accessibilityLabel="Kennzeichen suchen" placeholder="Kennzeichen suchen …" placeholderTextColor={colors.muted} value={optionQuery} onChangeText={setOptionQuery} style={s.search}/>}
      <ScrollView keyboardShouldPersistTaps="handled">{options.filter(o=>o.label.toLocaleLowerCase('de-DE').includes(optionQuery.trim().toLocaleLowerCase('de-DE'))).map(o=><Pressable key={o.id} accessibilityRole="button" accessibilityLabel={o.label} accessibilityState={{selected:o.selected}} onPress={o.choose} style={s.option}><Label style={{flex:1}}>{o.label}</Label>{o.selected&&<Label style={{color:colors.cyan}}>✓</Label>}</Pressable>)}</ScrollView>
    </View></View></Modal>}
    {statusOpen && <ScrollView contentContainerStyle={s.canvas}><View style={s.group}><Card><Section title="Abdeckung & Datenstand"/>
      <Label muted>{freshness.label}</Label>{freshness.reminder&&<Label muted>{freshness.note}</Label>}
      <Label muted>{plan.lastSavedAt?`Gespeichert: ${new Date(plan.lastSavedAt).toLocaleString('de-DE')}`:'Noch kein vollständiger Abruf gespeichert.'}</Label>
      {plan.periods.map(p=><Label muted key={p.from}>Abgedeckt: {p.from} bis {p.to}</Label>)}
      {plan.gaps.map(p=><Label key={p.from}>Lücke: {p.from} bis {p.to}</Label>)}
      <Label muted>Die Summe zeigt bekannte gemeldete Flugzeit, keine Rollen-Anrechnung. Fehlende Angaben findest du in den Flugdetails. Crew-Namen sind Quellenangaben, keine bestätigte Personenidentität. Solo: eine aufgeführte Person als PIC ohne Begleiter oder eine ausdrückliche Solo-Angabe ohne weitere Personen.</Label>
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
  compactHeader:{flexDirection:'row',alignItems:'center',gap:4},filterToggle:{minHeight:48,paddingHorizontal:4,justifyContent:'center'},
  summaryCaption:{color:colors.muted,fontSize:12,lineHeight:18,paddingBottom:2},fields:{flexDirection:'row',flexWrap:'wrap',columnGap:12,rowGap:4},
  field:{width:'48%',minHeight:52,borderBottomWidth:1,borderColor:colors.border,paddingVertical:4},fieldLabel:{fontSize:11,lineHeight:16,color:colors.muted},fieldValue:{flexDirection:'row',alignItems:'center',gap:4},fieldText:{flex:1,fontSize:14,lineHeight:20,color:colors.text},
  scrim:{flex:1,justifyContent:'flex-end',backgroundColor:'#00000088',padding:12},optionSheet:{maxHeight:'70%',width:'100%',maxWidth:520,alignSelf:'center',padding:12,borderRadius:18,backgroundColor:colors.card},option:{minHeight:48,flexDirection:'row',alignItems:'center',gap:8,borderBottomWidth:1,borderColor:colors.border,paddingHorizontal:8,paddingVertical:8},

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
  searchBox: { width:'100%',maxWidth:'100%',flexDirection:'row',alignItems:'center',borderWidth:1,borderColor:colors.border,borderRadius:12,backgroundColor:colors.card,paddingLeft:10 },
  search: { flex:1,minWidth:0,minHeight:48,color:colors.text,fontSize:16,paddingVertical:6 },
});

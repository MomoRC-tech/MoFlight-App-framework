import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, Text, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { Action, Card, Chip, Empty, Label, Section, colors, ui } from './theme';
import { FlightCard } from './FlightCard';
import { FlightDetails } from './FlightDetails';
import { diagnosticJournal } from '../diagnostics';
import { SymbolIcon } from './SymbolIcon';
import type { useOwnFlights } from './use-own-flights';
import { allOwnFlights, ownFlightClassificationOptions, ownFlightRoleOptions, ownFlightYears, ownFlightRegistrations, ownRawValue, ownFlightCard, ownFlightFilterTags, removeOwnFlightFilter, selectOwnFlights, requestedOwnFlight, type OwnFlightRequest, type OwnFlightFilters } from './own-flight-model';
import { planFlightRetrieval } from '../vereinsflieger/retrieval-policy';
import { dataFreshness } from './data-freshness';
import { flightStartGuidance } from './flight-start-guidance';
import { summarizeRealFlights, formatReportedMinutes } from './real-flight-statistics';
import { reviewDuration, reviewParsedField, reviewRawField } from '../vereinsflieger/capture-review';
import { hasSeenFlightHelpHint, markFlightHelpHintSeen } from './help-preferences-native';

export interface OwnFlightHeader { title: string; back?: () => void }
export function OwnFlights({ active, data, filterRequest, onHeaderChange, onHelp, replayHintToken = 0, helpEnabled = true }: {
  active: boolean; data: ReturnType<typeof useOwnFlights>; filterRequest?: OwnFlightRequest | null; onUpdate?: () => boolean;
  onHeaderChange: (header: OwnFlightHeader) => void;
  onHelp?: (entryId: string) => void; replayHintToken?: number; helpEnabled?: boolean;
}) {
  const [filters, setFilters] = useState<OwnFlightFilters>(allOwnFlights);
  const [filterOpen, setFilterOpen] = useState(false);
  const [picker,setPicker]=useState<'year'|'category'|'registration'|'launch'|'role'|null>(null);
  const [optionQuery,setOptionQuery]=useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [rawFlightId,setRawFlightId]=useState<string|null>(null);
  const [rawPage, setRawPage] = useState(0), [statusOpen, setStatusOpen] = useState(false);
  const [picHelpOpen, setPicHelpOpen] = useState(false);
  const [introHintOpen, setIntroHintOpen] = useState(false);
  const [hintSeen, setHintSeen] = useState<boolean | null>(null);
  const replayed = useRef(replayHintToken);
  const list = useRef<FlatList>(null), offset = useRef(0), scope = useRef<string | null>(null);
  const { width, height, fontScale } = useWindowDimensions();
  const tablet = width >= 840 && fontScale <= 1.3;
  const flights = useMemo(() => data.view?.flights ?? [], [data.view?.flights]);
  const selected = useMemo(() => selectOwnFlights(flights, filters), [flights, filters]);
  const summary = useMemo(() => summarizeRealFlights(selected), [selected]);
  const years = useMemo(() => ownFlightYears(flights), [flights]);
  const registrations = useMemo(() => ownFlightRegistrations(flights), [flights]);
  const classificationOptions = useMemo(() => ownFlightClassificationOptions(flights), [flights]);
  const roleOptions = useMemo(() => ownFlightRoleOptions(flights), [flights]);
  const aircraftFiltered = filters.registration !== undefined || filters.aircraftCategory !== undefined || filters.launchMethod !== undefined;
  const plan = useMemo(() => planFlightRetrieval(data.view?.snapshot.savedRetrievals ?? []), [data.view?.snapshot.savedRetrievals]);
  const freshness = dataFreshness(plan.lastSuccessfulRetrievalAt, data.phase === 'ready' ? 'ready' : 'loading');
  const startGuidance = flightStartGuidance({phase:data.phase,accountAssociated:!!data.view?.snapshot.account,
    successfulRetrieval:!!plan.lastSuccessfulRetrievalAt,savedFlights:flights.length});
  const detailOpen = !!data.detail || data.detailBusy;
  useEffect(() => { if (!helpEnabled) { setIntroHintOpen(false); setPicHelpOpen(false); } }, [helpEnabled]);
  useEffect(() => {
    let mounted = true;
    void hasSeenFlightHelpHint().then(seen => { if (mounted) setHintSeen(current => current === true ? true : seen); });
    return () => { mounted = false; };
  }, []);
  useEffect(() => {
    if (replayed.current === replayHintToken || !helpEnabled) return;
    replayed.current = replayHintToken;
    setHintSeen(true); setIntroHintOpen(true); setPicHelpOpen(false);
    data.clearDetail(); setStatusOpen(false); setFilterOpen(false);
  }, [replayHintToken, helpEnabled]);
  useEffect(() => {
    if (helpEnabled && active && data.phase === 'ready' && flights.length > 0 && hintSeen === false && !detailOpen && !statusOpen) {
      setHintSeen(true); setIntroHintOpen(true);
    }
  }, [helpEnabled, active, data.phase, flights.length, hintSeen, detailOpen, statusOpen]);
  const tags = ownFlightFilterTags(filters), hasFilters = tags.length > 0;
  const back = useCallback(() => { diagnosticJournal.record('back','flights');Keyboard.dismiss(); setPicker(null); setFilterOpen(false); setStatusOpen(false); setRawPage(0); setRawFlightId(null); setPicHelpOpen(false); data.clearDetail(); }, [data.clearDetail]);
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
    setFilterOpen(false); setPicker(null); setOptionQuery(''); setStatusOpen(false); setSearchOpen(false); setRawPage(0); setRawFlightId(null); data.clearDetail();
    const requested = requestedOwnFlight(flights, filterRequest);
    if (requested) void data.openDetail(requested);
  }, [active, data.phase, data.detailBusy, data.view, filterRequest, data.clearDetail]);
  const changeFilters = (next: OwnFlightFilters) => { if(next.search!==filters.search)diagnosticJournal.record('filter','search');if(next.year!==filters.year)diagnosticJournal.record('filter','year');if(next.registration!==filters.registration)diagnosticJournal.record('filter','registration');if(next.flightRole!==filters.flightRole)diagnosticJournal.record('filter','flight-filter'); offset.current = 0; list.current?.scrollToOffset({ offset: 0, animated: false }); setFilters({...next,flightIds:undefined}); };
  const openPicker = (kind: NonNullable<typeof picker>) => {Keyboard.dismiss();setOptionQuery('');setPicker(kind);};
  const closePicker = () => { Keyboard.dismiss(); setPicker(null); };
  const field=(title:string,value:string,kind:NonNullable<typeof picker>)=><Pressable key={kind} accessibilityRole="button" accessibilityLabel={`${title}: ${value}, auswählen`} onPress={()=>openPicker(kind)} style={[s.field,fontScale>1.3&&{width:'100%'}]}><Text style={s.fieldLabel}>{title}</Text><View style={s.fieldValue}><Text style={s.fieldText}>{value}</Text><SymbolIcon name="down" size={12} tone="muted"/></View></Pressable>;
  const pick=(next:OwnFlightFilters)=>{Keyboard.dismiss();changeFilters(next);setPicker(null);};
  const options:{id:string;label:string;selected:boolean;choose:()=>void}[]=picker==='year'?
    [{id:'all',label:'Alle Jahre',selected:filters.year===null&&!filters.dateRange,choose:()=>pick({...filters,year:null,dateRange:null})},...years.map(year=>({id:String(year),label:String(year),selected:filters.year===year,choose:()=>pick({...filters,year,dateRange:null})}))]:picker==='category'?
    [{id:'all',label:'Alle Kategorien',selected:filters.aircraftCategory===undefined,choose:()=>pick({...filters,aircraftCategory:undefined})},...classificationOptions.categories.map(o=>({id:o.key,label:o.label,selected:filters.aircraftCategory===o.key,choose:()=>pick({...filters,aircraftCategory:o.key})}))]:picker==='launch'?
    [{id:'all',label:'Alle Startarten',selected:filters.launchMethod===undefined,choose:()=>pick({...filters,launchMethod:undefined})},...classificationOptions.launches.map(o=>({id:o.key,label:o.label,selected:filters.launchMethod===o.key,choose:()=>pick({...filters,launchMethod:o.key})}))]:picker==='registration'?
    [{id:'all',label:'Alle Kennzeichen',selected:filters.registration===undefined,choose:()=>pick({...filters,registration:undefined})},...registrations.map(registration=>({id:'reg-'+registration,label:registration,selected:filters.registration===registration,choose:()=>pick({...filters,registration})})),...(flights.some(f=>ownRawValue(f.facts.assessment.fields.registration)===null)?[{id:'unknown',label:'Kennzeichen unbekannt',selected:filters.registration===null,choose:()=>pick({...filters,registration:null})}]:[])]:picker==='role'?
    [{id:'all',label:'Alle Flugtypen',selected:filters.flightRole===undefined,choose:()=>pick({...filters,flightRole:undefined})},...roleOptions.map(o=>({id:o.key,label:o.label,selected:filters.flightRole===o.key,choose:()=>pick({...filters,flightRole:o.key})}))]:[];
  const search=<View style={s.searchBox}><TextInput accessibilityLabel="Flüge durchsuchen" placeholder="Kennzeichen, Ort, Crew …" placeholderTextColor={colors.muted} value={filters.search} onChangeText={search=>changeFilters({...filters,search})} onSubmitEditing={Keyboard.dismiss} autoCorrect={false} returnKeyType="search" style={s.search}/>{filters.search.length>0&&<Pressable accessibilityRole="button" accessibilityLabel="Suche löschen" onPress={()=>changeFilters({...filters,search:''})} style={s.clear}><Label>×</Label></Pressable>}</View>;
  const header=<View style={s.filterGroup}>
    <View style={s.compactHeader}>
      <Pressable accessibilityRole="button" accessibilityLabel="Flugfilter öffnen" accessibilityState={{expanded:filterOpen,selected:hasFilters}} onPress={()=>{Keyboard.dismiss();setFilterOpen(!filterOpen);}} style={s.filterToggle}><Label style={s.controlText}>Filter{hasFilters?` (${tags.length})`:''} {filterOpen?'↑':'↓'}</Label></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Aktive Filter: ${tags.map(t=>t.label).join(', ')||'keine'}`} onPress={()=>setFilterOpen(!filterOpen)} accessibilityState={{expanded:filterOpen}} style={{flex:1,minWidth:48,minHeight:48,justifyContent:'center'}}><Text numberOfLines={fontScale>1.3?undefined:1} style={s.summaryCaption}>{tags.map(t=>t.label).join(' · ')||'Alle Flüge'}</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Flugsuche öffnen" accessibilityState={{expanded:searchOpen||filterOpen}} onPress={()=>{Keyboard.dismiss();setSearchOpen(!searchOpen);}} style={s.searchToggle}><SymbolIcon name="search" size={20}/></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Abdeckung & Datenstand" onPress={()=>{Keyboard.dismiss();setStatusOpen(true);}} style={s.info}><SymbolIcon name="info" size={18} tone="muted"/></Pressable>
    </View>
    <View testID="filtered-flight-summary"><Text style={s.summaryCaption}>{hasFilters?`${summary.count}/${flights.length}`:summary.count} Flüge · {summary.count===0?'—':summary.knownDurationCount?`${formatReportedMinutes(summary.knownMinutes)} h`:'— h'}{summary.unknownDurationCount&&summary.knownDurationCount?' bekannt':''}</Text></View>
    {filterOpen?<ScrollView keyboardShouldPersistTaps="handled" style={{flexShrink:1,maxHeight:Math.max(180,(height||800)*.48)}} contentContainerStyle={{gap:6,paddingTop:6,paddingBottom:4}}>
      {search}
      <View style={s.fields}>
        {field('Zeitraum',filters.dateRange?`${filters.dateRange.from} – ${filters.dateRange.to}`:filters.year===null?'Alle Jahre':String(filters.year),'year')}
        {field('Kategorie',classificationOptions.categories.find(o=>o.key===filters.aircraftCategory)?.label??'Alle Kategorien','category')}
        {field('Kennzeichen',filters.registration===undefined?'Alle':filters.registration??'Unbekannt','registration')}
        {field('Startart',classificationOptions.launches.find(o=>o.key===filters.launchMethod)?.label??'Alle Startarten','launch')}
        {field('Flugtyp',roleOptions.find(o=>o.key===filters.flightRole)?.label??'Alle Flugtypen','role')}
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
        renderItem={({item})=><FlightCard flight={item} onPress={()=>{Keyboard.dismiss();diagnosticJournal.record('action','flight-detail');setIntroHintOpen(false);setPicHelpOpen(false);setRawPage(0); setRawFlightId(null);void data.openDetail(item);}} style={tablet?{flex:1,maxWidth:'50%'}:undefined}/>}
        ListEmptyComponent={<Card><Empty title={flights.length ? 'Keine passenden Flüge' : startGuidance?.title ?? 'Noch keine gespeicherten Flüge'}>{flights.length ? 'Suchbegriff oder Filter ändern. Ein leeres Ergebnis ist keine Aussage über die gesamte Fluggeschichte.' : startGuidance?.message}</Empty>{hasFilters && <Action secondary onPress={()=>changeFilters(allOwnFlights)}>Alle Filter zurücksetzen</Action>}{helpEnabled && !flights.length && <Action secondary onPress={()=>onHelp?.('empty-flights')}>Warum sehe ich keine Flüge?</Action>}</Card>}
        onScroll={event => { if (active && data.phase === 'ready' && !detailOpen && !statusOpen) offset.current = event.nativeEvent.contentOffset.y; }} scrollEventThrottle={32}
        onContentSizeChange={() => { if (data.phase === 'ready') list.current?.scrollToOffset({ offset: offset.current, animated: false }); }}
        contentContainerStyle={[s.canvas,s.flightCanvas,{maxWidth:tablet?960:480}]} ItemSeparatorComponent={() => <View style={{ height: 5 }} />} initialNumToRender={10} maxToRenderPerBatch={10} windowSize={7} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" />
    </View>
    {helpEnabled && active && introHintOpen && !detailOpen && !statusOpen && data.phase === 'ready' && <View style={s.hintBubble} accessibilityLiveRegion="polite">
      <Label style={{fontWeight:'700'}}>Hier findest du deine Flüge</Label>
      <Label>Öffne einen Flug für Quellenangaben und Details. Filter zeigen nur gespeicherte Flüge.</Label>
      <View style={s.controls}><Action secondary onPress={()=>setIntroHintOpen(false)}>Später</Action><Action secondary onPress={()=>{setIntroHintOpen(false);onHelp?.('flight-details');}}>Hilfe öffnen</Action></View>
      <Action onPress={()=>{setIntroHintOpen(false);void markFlightHelpHintSeen();}}>Verstanden</Action>
    </View>}
    {data.phase !== 'ready' && <ScrollView contentContainerStyle={s.canvas}><View style={s.group}><Card>

      <Section title={data.phase === 'loading' ? 'Gespeicherte Flüge laden' : data.phase === 'missing' ? 'Eigene Flüge einrichten' : 'Flüge nicht lesbar'} icon="flight-paper-plane" />
      {data.phase === 'loading' ? <ActivityIndicator color={colors.cyan} accessibilityLabel="Eigene gespeicherte Flüge werden geladen" /> : <>
        <Label>{data.detailError ?? (data.phase === 'missing' ? 'Noch keine eigene Flugbibliothek ausgewählt. Bestehende Teststände bleiben getrennt erhalten.' : 'Die gespeicherte Auswahl konnte nicht geprüft werden. Vorhandene Dateien und Aufträge bleiben erhalten.')}</Label>
        <View style={s.controls}><Action secondary onPress={() => void data.reload()}>Gespeicherte Flüge erneut prüfen</Action></View><Label muted>Neue Daten und Anmeldung erreichst du über die Verbindung oben in der Kopfzeile.</Label>
      </>}
    </Card></View></ScrollView>}
    {picker&&active&&<Modal transparent animationType="fade" onRequestClose={closePicker}><KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':'height'} style={[s.scrim,width>=600&&s.wideScrim]}><Pressable testID="flight-filter-scrim" accessible={false} importantForAccessibility="no" onPress={closePicker} style={StyleSheet.absoluteFill}/><View accessibilityViewIsModal testID="flight-filter-sheet" style={[s.optionSheet,width>=600&&s.wideSheet]}>
      <View style={s.sheetHeader}><Text accessibilityRole="header" style={s.sheetTitle}>{({year:'Zeitraum',category:'Luftfahrzeugart',registration:'Kennzeichen',launch:'Startart',role:'Flugtyp'})[picker]}</Text><Pressable accessibilityRole="button" accessibilityLabel="Auswahl schließen" onPress={closePicker} style={({pressed})=>[s.sheetClose,pressed&&ui.pressed]}><Label style={s.sheetCloseText}>Schließen</Label></Pressable></View>
      <Label muted style={s.sheetHint}>Eine Auswahl wird sofort übernommen.</Label>
      {picker==='registration'&&<View style={s.sheetSearch}><SymbolIcon name="search" size={20} tone="muted"/><TextInput accessibilityLabel="Kennzeichen suchen" placeholder="Kennzeichen suchen …" placeholderTextColor={colors.muted} value={optionQuery} onChangeText={setOptionQuery} autoCorrect={false} autoCapitalize="characters" returnKeyType="search" onSubmitEditing={Keyboard.dismiss} style={s.search}/>{optionQuery.length>0&&<Pressable accessibilityRole="button" accessibilityLabel="Kennzeichensuche löschen" onPress={()=>setOptionQuery('')} style={s.clear}><Label>×</Label></Pressable>}</View>}
      <ScrollView style={s.sheetOptions} contentContainerStyle={s.sheetOptionsContent} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">{options.filter(o=>o.label.toLocaleLowerCase('de-DE').includes(optionQuery.trim().toLocaleLowerCase('de-DE'))).map(o=><Pressable key={o.id} accessibilityRole="radio" accessibilityLabel={o.label} accessibilityState={{checked:o.selected,selected:o.selected}} onPress={o.choose} style={({pressed})=>[s.option,o.selected&&s.optionSelected,pressed&&ui.pressed]}><Label style={s.optionLabel}>{o.label}</Label><View accessible={false} style={[s.optionRadio,o.selected&&s.optionRadioSelected]}>{o.selected&&<View style={s.optionRadioDot}/>}</View></Pressable>)}
        {!options.some(o=>o.label.toLocaleLowerCase('de-DE').includes(optionQuery.trim().toLocaleLowerCase('de-DE')))&&<View style={s.noOptions} accessibilityLiveRegion="polite"><Label>Kein passendes Kennzeichen</Label><Label muted>Ändere oder lösche den Suchbegriff. Dein Flugfilter bleibt unverändert.</Label></View>}
      </ScrollView>
    </View></KeyboardAvoidingView></Modal>}
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
        <FlightDetails key={detail.flightId} detail={detail} rawPage={rawPage} onRawPage={setRawPage} rawExpanded={rawFlightId===detail.flightId} onToggleRaw={()=>setRawFlightId(current=>current===detail.flightId?null:detail.flightId)} picHelpOpen={picHelpOpen} onTogglePicHelp={helpEnabled?()=>setPicHelpOpen(value=>!value):undefined} onMorePicHelp={helpEnabled?()=>{setPicHelpOpen(false);onHelp?.('pic');}:undefined}/><View style={s.controls}><Action secondary onPress={back}>Zur gefilterten Flugliste</Action></View>
      </>}
    </View></ScrollView>}
  </View>;
}
const s = StyleSheet.create({
  compactHeader:{flexDirection:'row',alignItems:'center',gap:4},filterToggle:{minHeight:48,minWidth:48,paddingHorizontal:4,justifyContent:'center'},
  summaryCaption:{color:colors.muted,fontSize:12,lineHeight:18,paddingBottom:2},fields:{flexDirection:'row',flexWrap:'wrap',columnGap:12,rowGap:4},
  field:{width:'48%',minHeight:52,borderBottomWidth:1,borderColor:colors.border,paddingVertical:4},fieldLabel:{fontSize:11,lineHeight:16,color:colors.muted},fieldValue:{flexDirection:'row',alignItems:'center',gap:4},fieldText:{flex:1,fontSize:14,lineHeight:20,color:colors.text},
  scrim:{flex:1,justifyContent:'flex-end',backgroundColor:'#000712bd',paddingTop:24},wideScrim:{justifyContent:'center',padding:24},
  optionSheet:{maxHeight:'90%',width:'100%',maxWidth:640,alignSelf:'center',paddingTop:16,paddingHorizontal:16,paddingBottom:16,borderTopLeftRadius:28,borderTopRightRadius:28,backgroundColor:colors.raised,elevation:16},wideSheet:{borderRadius:28},
  sheetHeader:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',columnGap:12},sheetTitle:{color:colors.text,flexGrow:1,flexShrink:1,fontSize:22,lineHeight:28,fontWeight:'600'},sheetClose:{minHeight:48,minWidth:48,paddingHorizontal:8,justifyContent:'center'},sheetCloseText:{color:colors.cyan,fontSize:14,lineHeight:20,fontWeight:'600'},
  sheetHint:{fontSize:14,lineHeight:20,marginBottom:16},sheetSearch:{flexDirection:'row',alignItems:'center',gap:8,borderWidth:1,borderColor:'#82959e',borderRadius:12,paddingLeft:12,marginBottom:12,backgroundColor:colors.card},
  sheetOptions:{flexShrink:1},sheetOptionsContent:{gap:4},noOptions:{gap:8,paddingVertical:16},
  option:{minHeight:56,flexDirection:'row',alignItems:'center',gap:16,paddingHorizontal:16,paddingVertical:12,borderRadius:12},optionSelected:{backgroundColor:colors.card},optionLabel:{flex:1,fontSize:16,lineHeight:24},
  optionRadio:{width:20,height:20,borderRadius:10,borderWidth:2,borderColor:colors.muted,alignItems:'center',justifyContent:'center'},optionRadioSelected:{borderColor:colors.cyan},optionRadioDot:{width:10,height:10,borderRadius:5,backgroundColor:colors.cyan},

  hidden: { display: 'none' }, canvas: { padding: 18, paddingBottom: 28, gap: 16, width:'100%',maxWidth:960,alignSelf:'center' }, group: { width: '100%', maxWidth: 600, alignSelf: 'center', gap: 12 },
  bar:{width:'100%',maxWidth:960,maxHeight:'85%',alignSelf:'center',paddingHorizontal:12,paddingTop:4,paddingBottom:2,borderBottomWidth:1,borderBottomColor:colors.border},
  filterGroup:{width:'100%',maxWidth:600,flexShrink:1,alignSelf:'center',gap:2},controls:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:5},
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
  searchBox: { width:'100%',maxWidth:'100%',flexDirection:'row',alignItems:'center',borderWidth:1,borderColor:'#82959e',borderRadius:12,backgroundColor:colors.card,paddingLeft:10 },
  search: { flex:1,minWidth:0,minHeight:48,color:colors.text,fontSize:16,paddingVertical:6 },
  hintBubble: { width:'100%',maxWidth:520,alignSelf:'center',gap:8,padding:14,margin:10,backgroundColor:colors.raised,borderWidth:1,borderLeftWidth:3,borderColor:'#296879',borderLeftColor:colors.cyan,borderRadius:18 },
});

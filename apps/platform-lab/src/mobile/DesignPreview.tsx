import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { ClubEvents, ClubDocumentNotices } from './ClubInformation';
import { Dashboard } from './Dashboard';
import { AppHeader } from './AppHeader';
import { OwnFlights, type OwnFlightHeader } from './OwnFlights';
import { Action, Card, Label, colors } from './theme';
import { createDesignPreviewData, DESIGN_PREVIEW_NOW } from './design-preview-data';
import type { useOwnFlights } from './use-own-flights';
import type { OwnFlightRequest } from './own-flight-model';
import type { RealFlightDetail, RealFlightListItem } from '../vereinsflieger/real-flight-library';
import { StatisticsOverlay } from './StatisticsOverlay';
import { DutyRoster } from './DutyRoster';
import { DataUpdateIndicator } from './DataUpdateIndicator';
import { UpdateResult } from './UpdateResult';
import {SyncProgress} from './SyncProgress';
import {idleSyncProgress,completedSyncProgress,type SyncProgress as Progress} from './sync-progress';
import { CockpitPreview } from './CockpitPreview';

/** Mount directly in the shell's flex content area; OwnFlights owns its list scrolling. */
export function DesignPreview({onClose=()=>{}}:{onClose?:()=>void}={}) {
  const [cockpit,setCockpit]=useState(false);
  const fixture = useMemo(createDesignPreviewData, []);
  const emptyView = useMemo(() => ({ ...fixture.view, flights: [] }), [fixture]);
  const [page, setPage] = useState<'start' | 'flights' | 'club' | 'sync'>('start');
  const [progress,setProgress]=useState<Progress>({state:'active',last:'account',current:'flights'});
  const [mode, setMode] = useState<'populated' | 'empty' | 'error'>('populated');
  const [request, setRequest] = useState<OwnFlightRequest | null>(null);
  const [detail, setDetail] = useState<RealFlightDetail | null>(null);
  const [header, setHeader] = useState<OwnFlightHeader>({ title: 'Flüge' });
  const [paper, setPaper] = useState(false);
  const [statisticsOpen, setStatisticsOpen] = useState(false);
  const [syncDetails, setSyncDetails] = useState(false);
  const [syncReceiptVisible, setSyncReceiptVisible] = useState(true);
  const [dutiesExpanded, setDutiesExpanded] = useState(false);
  const statisticsBack = useRef<() => boolean>(() => false);
  const { width, fontScale } = useWindowDimensions();
  const clearDetail = useCallback(() => setDetail(null), []);
  const openDetail = useCallback(async (selected: RealFlightListItem) => {
    if (mode !== 'populated') return;
    setDetail(fixture.details.find(item => item.flightId === selected.flightId &&
      item.accountRef === selected.accountRef && item.factsRevision === selected.factsRevision) ?? null);
  }, [fixture, mode]);
  const reload = useCallback(async () => { setDetail(null); setMode('populated'); setRequest({ year: null }); }, []);
  const data: ReturnType<typeof useOwnFlights> = {
    view: mode === 'error' ? null : mode === 'empty' ? emptyView : fixture.view,
    phase: mode === 'error' ? 'failed' : 'ready', detail, detailBusy: false,
    detailError: mode === 'error' ? 'Synthetischer Lesefehler für die UI-Vorschau. Erneut prüfen zeigt wieder die erfundenen Flüge; echte Daten bleiben unberührt.' : null,
    openDetail, clearDetail, reload,
  };
  if(cockpit)return <CockpitPreview onClose={()=>setCockpit(false)} onFlights={()=>{setCockpit(false);setPage('flights');}} onStatistics={()=>{setCockpit(false);setStatisticsOpen(true);}}/>;
  if(page==='sync')return <View style={styles.root}>
    <AppHeader title="Synchronisierung" back={()=>setPage('start')}><DataUpdateIndicator receivedAt="2026-10-18T12:00:00.000Z" readState="ready" now={DESIGN_PREVIEW_NOW} syncing={progress.state==='active'||progress.state==='waiting'} onPress={()=>setProgress({state:'active',last:'account',current:'flights'})}/></AppHeader>
    <SyncProgress progress={progress} retry={()=>setProgress({state:'active',last:null,current:'account'})} details={()=>setProgress({state:'partial',last:'save',current:null,message:'Eine Quelle konnte nicht aktualisiert werden.'})}/>
    <ScrollView contentContainerStyle={{padding:18,gap:12}}>
      <Label muted>Synthetische UI-Vorschau · keine Speicherung</Label>
      <Action onPress={()=>setProgress({state:'active',last:'account',current:'flights'})}>Vorschau: Flüge abrufen</Action>
      <Action onPress={()=>setProgress({state:'active',last:'flights',current:'save'})}>Vorschau: Flüge speichern</Action>
      <Action onPress={()=>setProgress({state:'waiting',last:'prepare',current:'sign-in'})}>Vorschau: Anmeldung erforderlich</Action>
      <Action onPress={()=>setProgress(completedSyncProgress({pending:0,medicalStatus:'updated',dutyStatus:'partial',eventsStatus:'failed'}))}>Vorschau: Fehler</Action>
      <Action onPress={()=>setProgress(idleSyncProgress)}>Vorschau: Fertig</Action>
    </ScrollView>
  </View>;
  if (statisticsOpen) return <View style={styles.root}>
    <View style={styles.statisticsFrame}>
      <AppHeader title="Vorschau Flugstatistik" back={() => { if (!statisticsBack.current()) setStatisticsOpen(false); }}>
        <Label muted>Synthetische UI-Vorschau · keine Speicherung</Label>
      </AppHeader>
      <StatisticsOverlay data={data} today="2026-10-22" fontScale={fontScale} onBackHandler={handler => { statisticsBack.current = handler; }} />
    </View>
  </View>;
  const showFlights = (flightId?: string) => {
    setMode('populated');
    clearDetail(); setRequest({ year: null, ...(flightId ? { flightId } : {}) }); setPage('flights');
  };
  const showState = (next: 'empty' | 'error') => {
    clearDetail(); setMode(next); setRequest({ year: null }); setPage('flights');
  };
  const syncPreview = <>
    <View style={{alignItems:'flex-start'}}><DataUpdateIndicator activityChanged scopeKey="synthetic-preview-only" receivedAt="2026-10-18T12:00:00.000Z" readState="ready" now={DESIGN_PREVIEW_NOW}
      connection={{phase:'observed',confirmed:true,lastCheckedAt:'2026-10-22T12:00:00.000Z',observed:{accountNumber:'990001',clubLabel:'Demo Segelflugverein Talwiese',clubIdentity:'display-label-only',verification:'observed-profile-number'}}}
      onPress={()=>{setSyncReceiptVisible(true);setSyncDetails(false);}}/></View>
    {syncReceiptVisible&&<UpdateResult result={{ownerId:'synthetic-preview-only',added:2,changed:1,pending:0,from:'2025-01-01',to:'2026-10-22',completedAt:'2026-10-22T12:00:00.000Z',medicalStatus:'updated',dutyStatus:'partial'}}
      detail={syncDetails} onDetails={()=>setSyncDetails(true)} onDismiss={()=>setSyncReceiptVisible(false)}/>}
    {syncDetails&&<Action secondary onPress={()=>setSyncDetails(false)}>Vorschau Syncdetails schließen</Action>}
  </>;
  return <View style={styles.root}>
    <AppHeader title="Designvorschau" back={onClose}><Action secondary onPress={()=>setCockpit(true)}>Cockpit</Action></AppHeader>
    <View style={styles.toolbar}>
      <Label muted style={styles.notice}>Synthetische UI-Vorschau · keine Speicherung</Label>
      <View style={styles.tabs}>
        <Pressable accessibilityRole="button" accessibilityLabel="Vorschau Synchronisierung" onPress={()=>setPage('sync')} style={styles.tab}><Label>Vorschau Sync</Label></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Vorschau Start" accessibilityState={{ selected: page === 'start' }} onPress={() => setPage('start')} style={[styles.tab, page === 'start' && styles.selected]}><Label>Vorschau Start</Label></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Vorschau Flüge" accessibilityState={{ selected: page === 'flights' }} onPress={() => showFlights()} style={[styles.tab, page === 'flights' && styles.selected]}><Label>Vorschau Flüge</Label></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Vorschau Verein" accessibilityState={{ selected: page === 'club' }} onPress={() => setPage('club')} style={[styles.tab, page === 'club' && styles.selected]}><Label>Vorschau Verein</Label></Pressable>
      </View>
    </View>
    {page === 'start' ? <ScrollView contentContainerStyle={styles.canvas}>
      <Label muted>Festes Demo-Datum: 22.10.2026 · alle Flüge und Belege erfunden.</Label>
      <Dashboard ownFlights={fixture.view} ownFlightPhase="ready" pending={null} width={width} fontScale={fontScale}
        now={DESIGN_PREVIEW_NOW} onPaper={() => setPaper(!paper)} onFlights={() => showFlights()} onFlight={showFlights} onStatistics={() => setStatisticsOpen(true)} />
      {paper && <Card><Label>Papierflugbuch später einrichten</Label><Label muted>Diese Vorschau zeigt nur erfundene Flugdaten. Es wird kein Flugbuch angelegt.</Label></Card>}
      <Action secondary onPress={() => showState('empty')}>Leere Liste ansehen</Action>
      <Action secondary onPress={() => showState('error')}>Lesefehler ansehen</Action>
    </ScrollView> : page === 'club' ? <ScrollView contentContainerStyle={styles.canvas}>
      <Label muted>Erfundene Dienste, Termine und Dokumentenhinweise. Fester Demo-Abruf: 22.10.2026.</Label>
      {syncPreview}
      <DutyRoster overview={fixture.dutyOverview} expanded={dutiesExpanded} onOpen={()=>setDutiesExpanded(true)}/>
      {dutiesExpanded&&<Action secondary onPress={()=>setDutiesExpanded(false)}>Zurück zur Vorschau Verein</Action>}
      <ClubEvents information={fixture.view.featureInformation} />
      <ClubDocumentNotices information={fixture.view.featureInformation} />
    </ScrollView> : <View style={styles.root}>
      {header.back && <Pressable accessibilityRole="button" accessibilityLabel="Zurück zur Vorschau Flugliste" onPress={header.back} style={styles.back}><Label>Zurück · {header.title}</Label></Pressable>}
      <OwnFlights active data={data} filterRequest={request} onHeaderChange={setHeader} />
    </View>}
  </View>;
}
const styles = StyleSheet.create({
  root: { flex: 1 }, toolbar: { paddingHorizontal: 18, paddingTop: 6, gap: 4 },
  notice: { fontSize: 13, lineHeight: 19 }, tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tab: { minHeight: 48, paddingHorizontal: 12, paddingVertical: 10, justifyContent: 'center', borderRadius: 14, borderWidth: 1, borderColor: colors.border },
  selected: { backgroundColor: colors.raised, borderColor: colors.cyan },
  canvas: { padding: 18, paddingBottom: 28, gap: 16, width: '100%', maxWidth: 600, alignSelf: 'center' },
  back: { minHeight: 48, paddingHorizontal: 18, paddingVertical: 10, justifyContent: 'center' },
  statisticsFrame: { flex: 1, alignSelf: 'center', width: '100%', maxWidth: 720, marginVertical: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 22, backgroundColor: colors.background, overflow: 'hidden' },
});

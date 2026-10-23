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

/** Mount directly in the shell's flex content area; OwnFlights owns its list scrolling. */
export function DesignPreview() {
  const fixture = useMemo(createDesignPreviewData, []);
  const emptyView = useMemo(() => ({ ...fixture.view, flights: [] }), [fixture]);
  const [page, setPage] = useState<'start' | 'flights' | 'club'>('start');
  const [mode, setMode] = useState<'populated' | 'empty' | 'error'>('populated');
  const [request, setRequest] = useState<OwnFlightRequest | null>(null);
  const [detail, setDetail] = useState<RealFlightDetail | null>(null);
  const [header, setHeader] = useState<OwnFlightHeader>({ title: 'Flüge' });
  const [paper, setPaper] = useState(false);
  const [statisticsOpen, setStatisticsOpen] = useState(false);
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
  return <View style={styles.root}>
    <View style={styles.toolbar}>
      <Label muted style={styles.notice}>Synthetische UI-Vorschau · keine Speicherung</Label>
      <View style={styles.tabs}>
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
      <Label muted>Erfundene Termine und Dokumentenhinweise. Fester Demo-Abruf: 22.10.2026.</Label>
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

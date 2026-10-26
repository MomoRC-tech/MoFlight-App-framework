import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ImageBackground, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { FlightCard } from './FlightCard';
import { FlightDetails } from './FlightDetails';
import type { RealFlightDetail, RealFlightListItem } from '../vereinsflieger/real-flight-library';
import { reviewDuration, reviewParsedField, reviewRawField } from '../vereinsflieger/capture-review';
import { Action, Card, Chip, Empty, Label, Section, colors, ui } from './theme';
import { formatReportedMinutes } from './real-flight-statistics';
import { SeasonMonthlyCharts } from './SeasonMonthlyCharts';
import { monthlySeasonForCoverage } from './season-dashboard-model';
import { planFlightRetrieval } from '../vereinsflieger/retrieval-policy';
import type { useOwnFlights } from './use-own-flights';
import {
  annualStatisticsComparison, groupStatisticsClassification, groupStatisticsFlightRoles, monthFlightIds, rankStatisticsAircraft,
  selectStatisticsFlights, statisticsCoverageComplete, statisticsDurationGroups,
  statisticsPeriodBounds, statisticsYears, summarizeStatisticsFlights, validStatisticsRange,
  type StatisticsPeriod, type StatisticsSection,
} from './statistics-overlay-model';

const blueprint = require('../../assets/aviation/statistics-glider-blueprint.png');
const monthNames = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
type FlightData = ReturnType<typeof useOwnFlights>;
type Route =
  | { kind: 'section'; section: StatisticsSection; key: string }
  | { kind: 'flights'; title: string; ids: string[]; scope: StatisticsPeriod; key: string }
  | { kind: 'detail'; flightId: string; key: string };

export function StatisticsOverlay({ data, today, fontScale, onBackHandler, initialYear, initialSection = 'overview' }: {
  data: FlightData; today: string; fontScale: number; onBackHandler: (handler: () => boolean) => void; initialYear?: number; initialSection?: StatisticsSection;
}) {
  const [period, setPeriod] = useState<StatisticsPeriod>({ kind: 'year', year: initialYear ?? Number(today.slice(0, 4)) });
  const [fromDraft, setFromDraft] = useState(`${today.slice(0, 4)}-01-01`);
  const [toDraft, setToDraft] = useState(today);
  const [customOpen, setCustomOpen] = useState(false);
  const [informationOpen,setInformationOpen]=useState(false);
  const [rawPage,setRawPage]=useState(0);
  const [routes, setRoutes] = useState<Route[]>([{ kind: 'section', section: initialSection, key: `section-${initialSection}` }]);
  const routeSequence = useRef(0);
  const scrollOffsets = useRef<Record<string, number>>({});
  const scroll = useRef<ScrollView>(null);
  const route = routes[routes.length - 1]!;
  const routeKey = route.key;
  const flights = data.view?.flights ?? [];
  const saved = data.view?.snapshot.savedRetrievals ?? [];
  const selection = useMemo(() => selectStatisticsFlights(flights, period, today), [flights, period, today]);
  const selected = selection.flights;
  const summary = useMemo(() => summarizeStatisticsFlights(selected), [selected]);
  const aircraft = useMemo(() => rankStatisticsAircraft(selected, 'flights'), [selected]);
  const categories = useMemo(() => groupStatisticsClassification(selected, 'aircraftCategory').groups, [selected]);
  const launches = useMemo(() => groupStatisticsClassification(selected, 'launchMethod').groups, [selected]);
  const roles = useMemo(() => groupStatisticsFlightRoles(selected), [selected]);
  const duration = useMemo(() => statisticsDurationGroups(selected), [selected]);
  const years = useMemo(() => statisticsYears(flights, saved, today), [flights, saved, today]);
  const allUnique = useMemo(() => selectStatisticsFlights(flights, { kind: 'all' }, today).flights, [flights, today]);
  const selectedYear = period.kind === 'year' ? period.year : null;
  const chartDate = selectedYear === null ? null : selectedYear === Number(today.slice(0, 4)) ? today : `${String(selectedYear).padStart(4, '0')}-12-31`;
  const chartSeries = useMemo(() => {
    if (!chartDate) return null;
    const periods = planFlightRetrieval(saved, new Date(`${chartDate}T12:00:00`)).periods;
    return monthlySeasonForCoverage(allUnique, periods, chartDate);
  }, [allUnique, chartDate, saved]);
  const annual = selectedYear !== null && selectedYear > 1
    ? annualStatisticsComparison(flights, saved, chartDate!, selectedYear) : null;
  const bounds = statisticsPeriodBounds(period, today);
  const titleForSection = (section: StatisticsSection) => ({ overview: 'Überblick', aircraft: 'Flugzeuge', duration: 'Flugdauer', launch: 'Startarten', roles: 'Flugrollen' }[section]);

  const back = () => {
    if (routes.length < 2) return false;
    if (route.kind === 'detail') data.clearDetail();
    setRoutes(previous => previous.slice(0, -1));
    return true;
  };
  onBackHandler(back);

  const openSection = (section: StatisticsSection) => {
    setRoutes([{ kind: 'section', section, key: `section-${section}` }]);
    scrollOffsets.current[`section-${section}`] = 0;
  };
  const openFlights = (title: string, ids: readonly string[], scope: StatisticsPeriod = period) => {
    const knownIds = new Set(selectStatisticsFlights(allUnique, scope, today).flights.map(flight => flight.flightId));
    const filteredIds = [...new Set(ids)].filter(id => knownIds.has(id));
    if (!filteredIds.length) return;
    const key = `flights-${++routeSequence.current}`;
    setRoutes(previous => [...previous, { kind: 'flights', title, ids: filteredIds, scope, key }]);
  };
  const openFlight = (flight: RealFlightListItem) => {
    setRawPage(0);
    const key = `detail-${++routeSequence.current}`;
    setRoutes(previous => [...previous, { kind: 'detail', flightId: flight.flightId, key }]);
    void data.openDetail(flight);
  };
  const periodLabel = period.kind === 'all' ? 'Gesamter gespeicherter Bestand' : period.kind === 'year'
    ? `${bounds?.from ?? ''} – ${bounds?.to ?? ''}` : `${period.from} – ${period.to}`;
  const minutesLabel = (minutes: number | null, knownCount: number, flightCount: number) => minutes === null || knownCount === 0 && flightCount > 0 ? 'unbekannt' : `${formatReportedMinutes(minutes)} h`;
  const percentLabel = (value: number | null) => value === null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(1)} %`;
  const comparisonReason = (reason: string | null) => ({
    'incomplete-coverage': 'Vergleich nicht berechnet: gespeicherte Abrufe decken beide Zeiträume nicht vollständig ab.',
    'pending-facts': 'Vergleich nicht berechnet: Datum oder Flugbelege sind ungeklärt.',
    'unknown-durations': 'Zeitdifferenz nicht berechnet: mindestens eine Flugzeit ist unbekannt oder strittig.',
    'zero-baseline': 'Prozentdifferenz nicht berechnet: der Vorjahreswert ist null.',
    'unsupported-leap-day': 'Vergleich für diesen Schalttag nicht verfügbar.',
  }[reason ?? ''] ?? null);
  const detail = data.detail?.flightId === (route.kind === 'detail' ? route.flightId : null) ? data.detail : null;
  const detailError = route.kind === 'detail' && !data.detailBusy && !detail;
  const routeItems = route.kind === 'flights' ? selectStatisticsFlights(allUnique, route.scope, today).flights.filter(flight => route.ids.includes(flight.flightId))
    .sort((a, b) => (b.facts.assessment.date.value ?? '').localeCompare(a.facts.assessment.date.value ?? '') || a.flightId.localeCompare(b.flightId)) : [];
  const routeScopeLabel = route.kind === 'flights' ? route.scope.kind === 'all' ? 'dem gesamten gespeicherten Bestand'
    : (() => { const range = statisticsPeriodBounds(route.scope, today); return range ? `${range.from} bis ${range.to}` : 'dem gewählten Zeitraum'; })() : '';

  return <View style={styles.content}>
    <ScrollView ref={scroll} key={routeKey} contentOffset={{ x: 0, y: scrollOffsets.current[routeKey] ?? 0 }}
      onScroll={event => { scrollOffsets.current[routeKey] = event.nativeEvent.contentOffset.y; }} scrollEventThrottle={32}
      onContentSizeChange={() => scroll.current?.scrollTo({ y: scrollOffsets.current[routeKey] ?? 0, animated: false })}
      keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.canvas, fontScale > 1.3 && styles.canvasLarge]}>
      {route.kind === 'section' && <>
        <Section title={titleForSection(route.section)}/>
        <View style={styles.periodPanel}>
          <View style={{flexDirection:'row',flexWrap:'wrap',alignItems:'center',justifyContent:'space-between',gap:6}}><Section title="Zeitraum"/><Pressable accessibilityRole="button" accessibilityLabel="Statistikdatenstand" accessibilityState={{expanded:informationOpen}} onPress={()=>setInformationOpen(!informationOpen)} style={{minHeight:48,maxWidth:'100%',justifyContent:'center'}}><Label style={{color:colors.cyan}}>{informationOpen?'Details schließen':'Datenstand'}</Label></Pressable></View>
          <View style={[styles.chipRow,{flexDirection:'row',flexWrap:'wrap'}]}>
            {years.map(year => <Chip key={year} title={String(year)} selected={period.kind === 'year' && period.year === year} onPress={() => setPeriod({ kind: 'year', year })} />)}
            <Chip title="Alle Jahre" selected={period.kind === 'all'} onPress={() => setPeriod({ kind: 'all' })} />
            <Chip title="Eigener Zeitraum" selected={period.kind === 'custom'} onPress={() => setCustomOpen(open => !open)} />
          </View>
          {customOpen && <View style={styles.customRange}>
            <View style={styles.dateField}><Label muted>Von · JJJJ-MM-TT</Label><TextInput accessibilityLabel="Zeitraum von" value={fromDraft} onChangeText={setFromDraft} placeholder="2026-01-01" placeholderTextColor={colors.muted} autoCorrect={false} autoCapitalize="none" keyboardType="numbers-and-punctuation" style={styles.dateInput} /></View>
            <View style={styles.dateField}><Label muted>Bis · JJJJ-MM-TT</Label><TextInput accessibilityLabel="Zeitraum bis" value={toDraft} onChangeText={setToDraft} placeholder="2026-10-23" placeholderTextColor={colors.muted} autoCorrect={false} autoCapitalize="none" keyboardType="numbers-and-punctuation" style={styles.dateInput} /></View>
            <Action disabled={!validStatisticsRange(fromDraft, toDraft)} onPress={() => setPeriod({ kind: 'custom', from: fromDraft, to: toDraft })}>Zeitraum übernehmen</Action>
            {!validStatisticsRange(fromDraft, toDraft) && <Label muted>Bitte gültige Kalendertage in aufsteigender Reihenfolge eingeben.</Label>}
          </View>}
          <Label muted>{periodLabel}</Label>
          {informationOpen&&<>{bounds && <Label muted>{statisticsCoverageComplete(saved, bounds.from, bounds.to) ? 'Gespeicherte Abrufe decken diesen Zeitraum vollständig ab.' : 'Die gespeicherten Abrufe decken diesen Zeitraum nicht vollständig ab.'}</Label>}
          <Label muted>Die Saisonwerte auf Übersicht zeigen gespeicherte Jahreswerte; die Abdeckung kann je Jahr abweichen oder unvollständig sein.</Label>
          {period.kind === 'all' && <Label muted>Der gespeicherte Bestand belegt keine vollständige Fluggeschichte.</Label>}</>}
        </View>
        <View style={styles.sectionTabs} accessibilityRole="tablist">
          {(['overview', 'aircraft', 'duration', 'launch', 'roles'] as const).map(section => <Chip key={section} title={titleForSection(section)} selected={route.section === section} onPress={() => openSection(section)} />)}
        </View>

        {data.phase === 'loading' && <Card><ActivityIndicator color={colors.cyan} accessibilityLabel="Gespeicherte Flugstatistik wird geprüft" /><Label muted>Gespeicherte Flüge werden lokal geprüft.</Label></Card>}
        {data.phase === 'failed' && <Card><Empty title="Statistik nicht lesbar">Die gespeicherte Flugauswahl konnte nicht geprüft werden. Vorhandene Daten bleiben erhalten.</Empty><Action secondary onPress={() => void data.reload()}>Gespeicherte Flüge erneut prüfen</Action></Card>}
        {(data.phase === 'missing' || !data.view?.snapshot.account) && data.phase !== 'loading' && <Card><Empty title="Noch keine eigenen Flüge">Lade oder öffne zuerst deine lokal gespeicherten Flüge über Daten synchronisieren. Der Statistikbereich startet keinen Abruf.</Empty></Card>}

        {data.phase === 'ready' && data.view?.snapshot.account && route.section === 'overview' && <>
          <Card>
            <Section title="Gespeicherte Flüge" />
            <View style={styles.metrics}>
              <View style={[styles.metric,fontScale>1.3&&{minWidth:'45%'}]}><Label style={styles.metricValue}>{summary.count}</Label><Label muted>Flüge</Label></View>
              <View style={[styles.metric,fontScale>1.3&&{minWidth:'45%'}]}><Label style={styles.metricValue}>{minutesLabel(summary.knownDurationCount ? summary.knownMinutes : null, summary.knownDurationCount, summary.count)}</Label><Label muted>Flugzeit bekannt</Label></View>
              <View style={[styles.metric,fontScale>1.3&&{minWidth:'45%'}]}><Label style={styles.metricValue}>{summary.unknownDurationCount}</Label><Label muted>unbekannte Zeiten</Label></View>
            </View>
            {summary.unknownDateCount > 0 && <Label muted>{summary.unknownDateCount} undatierte Flüge sind nicht in Jahres- oder Zeitraumwerten enthalten.</Label>}
            {summary.conflictingIds.length > 0 && <Label muted>{summary.conflictingIds.length} widersprüchliche Flug-Identität(en) wurden nicht doppelt gezählt.</Label>}
            {summary.conflictingDurationCount > 0 && <Label muted>{summary.conflictingDurationCount} Flugzeit(en) sind strittig oder ungültig; sie ergeben keine bekannten Minuten.</Label>}
            <Label muted>Flugzeit entspricht dem gespeicherten Anbieterwert. Keine Rollen-, Papierbuch- oder Zeitstempel-Anrechnung.</Label>
            <Action secondary onPress={() => openFlights('Alle Flüge im Zeitraum', summary.supportingIds)}>Beitragende Flüge ansehen</Action>
          </Card>
          {annual && <Card>
            <Section title={`Jahresvergleich · ${selectedYear} / ${selectedYear! - 1}`} />
            <View style={styles.compareRow}><Label style={{ flex: 1 }}>Flüge</Label><Label>{annual.current.count} · {annual.previous?.count ?? '—'}</Label><Label style={styles.compareValue}>{percentLabel(annual.countChange.percent)}</Label></View>
            <View style={styles.compareRow}><Label style={{ flex: 1 }}>Bekannte Flugzeit</Label><Label>{minutesLabel(annual.current.knownMinutes, annual.current.knownMinutes === null ? 0 : 1, annual.current.count)} · {annual.previous ? minutesLabel(annual.previous.knownMinutes, annual.previous.knownMinutes === null ? 0 : 1, annual.previous.count) : '—'}</Label><Label style={styles.compareValue}>{percentLabel(annual.knownMinutesChange.percent)}</Label></View>
            <Label muted>Aktuell bis {annual.current.through}; Vorjahr bis gleicher Kalendertag. Angaben beruhen auf den gespeicherten Zeiträumen.</Label>
            {(comparisonReason(annual.countChange.suppressedReason) || comparisonReason(annual.knownMinutesChange.suppressedReason)) && <Label muted>{comparisonReason(annual.countChange.suppressedReason) ?? comparisonReason(annual.knownMinutesChange.suppressedReason)}</Label>}
            {annual.sourceConflictingIds.length > 0 && <Label muted>{annual.sourceConflictingIds.length} widersprüchliche Flug-Identität(en) im gespeicherten Bestand bleiben von Vergleichen ausgeschlossen.</Label>}
            {annual.current.supportingIds.length > 0 && <Action secondary onPress={() => openFlights(`Flüge ${selectedYear}`, annual.current.supportingIds)}>Flüge des Jahres ansehen</Action>}
            {annual.previous?.supportingIds.length ? <Action secondary onPress={() => {
              const previousYear = selectedYear! - 1;
              const previousEnd = `${String(previousYear).padStart(4, '0')}${chartDate!.slice(4)}`;
              openFlights(`Flüge ${previousYear}`, annual.previous!.supportingIds, { kind: 'custom', from: `${String(previousYear).padStart(4, '0')}-01-01`, to: previousEnd });
            }}>Vorjahresflüge ansehen</Action> : null}
          </Card>}
          {chartSeries && <Card><Section title="Monatsvergleich" /><SeasonMonthlyCharts series={chartSeries} fontScale={fontScale} />
            <Label muted>Jan–Dez · gleicher Kalendertag im aktuellen Jahr. ? = unbekannt; · = Abdeckung lückenhaft. Die Darstellung ist kein Vollständigkeitsnachweis.</Label>
            <Section title={`Monatsflüge ${selectedYear}`} />
            <View style={styles.monthButtons}>{monthNames.map((name, index) => {
              const ids = monthFlightIds(selected, selectedYear!, index + 1);
              const month = chartSeries[0]?.[index];
              const caption = month?.count === null ? '?' : String(month?.count ?? ids.length);
              return <Pressable key={name} accessibilityRole="button" accessibilityLabel={`${name} ${selectedYear}: ${caption} Flüge${month?.covered ? ', abgedeckt' : ', Abdeckung unvollständig'}`} accessibilityState={{ disabled: !ids.length }} disabled={!ids.length} onPress={() => openFlights(`${name} ${selectedYear}`, ids)} style={({ pressed }) => [styles.monthButton, !ids.length && styles.disabled, pressed && ui.pressed]}><Label style={styles.monthButtonText}>{name} · {caption}</Label></Pressable>;
            })}</View>
          </Card>}
        </>}

        {data.phase === 'ready' && data.view?.snapshot.account && route.section === 'aircraft' && <Card>
          <Section title="Luftfahrzeugarten" />
          {categories.map(row=><Card key={row.key} onPress={()=>openFlights(row.label,row.supportingIds)} label={`${row.label} · ${row.count} Flüge ansehen`} style={styles.bandRow}><Label>{row.label} · {row.count}</Label><Label muted>{row.knownDurationCount ? `${formatReportedMinutes(row.knownMinutes)} h bekannt${row.unknownDurationCount ? ` · ${row.unknownDurationCount}× Zeit unbekannt` : ''}` : `${row.unknownDurationCount}× Zeit unbekannt`}</Label></Card>)}
          <Section title="Flüge nach Kennzeichen" />
          {aircraft.length === 0 && <Empty title="Keine Flugzeuge im Zeitraum">Für die aktuelle Auswahl liegen keine konfliktfrei identifizierten Flüge vor.</Empty>}
          {aircraft.map(row => <Card key={row.registration ?? 'unknown'} onPress={row.supportingIds.length ? () => openFlights(row.registration ?? 'Kennzeichen unbekannt', row.supportingIds) : undefined} label={`${row.registration ?? 'Kennzeichen unbekannt'} · ${row.count} Flüge ansehen`} style={styles.aircraftRow}>
            <View style={styles.aircraftHeading}><View style={[styles.aircraftSwatch, { backgroundColor: row.color }]} /><View style={{ flex: 1 }}><Label style={styles.aircraftName}>{row.registration ?? 'Kennzeichen unbekannt'}</Label><Label muted>{row.modelConsistent ? row.model : 'Muster nicht einheitlich belegt'}</Label></View><Label>{row.count}</Label></View>
            <Label muted>{minutesLabel(row.knownDurationCount ? row.knownMinutes : null, row.knownDurationCount, row.count)} bekannt · {row.unknownDurationCount} unbekannt/strittig</Label>
          </Card>)}
          <Label muted>Ein Muster wird nur gezeigt, wenn für alle Flüge dieses Kennzeichens dasselbe gespeicherte Muster vorliegt. Kennzeichen sind keine stabile Flugzeugidentität.</Label>
        </Card>}

        {data.phase === 'ready' && data.view?.snapshot.account && route.section === 'duration' && <Card>
          <Section title="Gemeldete Flugdauer" />
          <Label muted>Nur als bekannt gespeicherte Flugdauer zählt. Start- und Landezeiten werden nicht zur Dauer verrechnet; ein bekannter Wert 0 bleibt ein gültiger Nullwert.</Label>
          {duration.bands.map(band => {
            const label = band.through === null ? `${band.from}+ min` : `${band.from}–${band.through} min`;
            return <Card key={band.id} onPress={band.supportingIds.length ? () => openFlights(label, band.supportingIds) : undefined} label={`${label} · ${band.count} Flüge ansehen`} style={styles.bandRow}>
              <View style={styles.aircraftHeading}><Label style={{ flex: 1 }}>{label}</Label><Label style={styles.metricValue}>{band.count}</Label></View>
            </Card>;
          })}
          {duration.unknownIds.length > 0 && <Action secondary onPress={() => openFlights('Flugzeit unbekannt oder strittig', duration.unknownIds)}>Unbekannte/strittige Zeiten · {duration.unknownIds.length}</Action>}
          {duration.sourceConflictingIds.length > 0 && <Label muted>{duration.sourceConflictingIds.length} widersprüchliche Flug-Identität(en) bleiben ohne willkürliche Revisionsauswahl ausgeschlossen.</Label>}
        </Card>}

        {data.phase === 'ready' && data.view?.snapshot.account && route.section === 'launch' && <Card>
          <Section title="Startarten" />
          {launches.length===0&&<Empty title="Keine Flüge im Zeitraum">Wähle einen anderen Zeitraum.</Empty>}
          {launches.map(row=><Card key={row.key} onPress={()=>openFlights(row.label,row.supportingIds)} label={`${row.label} · ${row.count} Flüge ansehen`} style={styles.bandRow}><Label>{row.label} · {row.count}</Label><Label muted>{row.knownDurationCount ? `${formatReportedMinutes(row.knownMinutes)} h bekannt${row.unknownDurationCount ? ` · ${row.unknownDurationCount}× Zeit unbekannt` : ''}` : `${row.unknownDurationCount}× Zeit unbekannt`}</Label></Card>)}
          <Label muted>Ein Flug zählt einmal nach seiner gespeicherten Startart. Fehlende, widersprüchliche oder nicht zugeordnete Angaben bleiben unbekannt; Rohwerte stehen in den Flugdetails.</Label>
        </Card>}

        {data.phase === 'ready' && data.view?.snapshot.account && route.section === 'roles' && <Card>
          <Section title="Ausbildung & Besatzung" />
          <Label muted>Dual: du als SIC, Begleiter als PIC und positive Dual-Zeit. Solo: du als PIC ohne Begleiter. PIC+: du als PIC mit Begleitperson(en), ohne SIC oder Dual-Zeit. Jeder Flug zählt genau einmal.</Label>
          {roles.groups.map(row => <Card key={row.key} onPress={row.count ? () => openFlights(row.label, row.supportingIds) : undefined} label={`${row.label} · ${row.count} Flüge ansehen`} style={styles.bandRow}>
            <View style={styles.aircraftHeading}><Label style={{flex:1}}>{row.label}</Label><Label style={styles.metricValue}>{row.count}</Label></View>
            <Label muted>{row.knownDurationCount ? `${formatReportedMinutes(row.knownMinutes)} h bekannt` : 'Flugzeit unbekannt'}{row.unknownDurationCount ? ` · ${row.unknownDurationCount}× Zeit unbekannt` : ''}</Label>
          </Card>)}
          {roles.soloWithPermission.count > 0 && <Action secondary onPress={() => openFlights('Solo mit Fluggenehmigung', roles.soloWithPermission.supportingIds)}>Davon Solo mit Fluggenehmigung · {roles.soloWithPermission.count}</Action>}
          <Label muted>Begleitpersonen sind ohne eigene Rollenangabe nicht als Passagiere belegt. „Fluggenehmigung von“ belegt keinen mitfliegenden FI. Unklare Rollen bleiben unter „Andere / ungeklärt“. Keine Aussage zur rechtlichen Anrechnung oder vollständigen Fluggeschichte.</Label>
          {roles.conflictingIds.length > 0 && <Label muted>{roles.conflictingIds.length} widersprüchliche Flug-Identität(en) wurden nicht gezählt.</Label>}
        </Card>}
      </>}

      {route.kind === 'flights' && <>
        <Section title={route.title}/><Label muted>{routeItems.length} gespeicherte Flugbelege · gefiltert nach {routeScopeLabel}</Label>
        {routeItems.length === 0 && <Empty title="Keine passenden Flüge">Die gespeicherten Belege haben sich geändert oder sind nicht mehr verfügbar. Zurück zur Statistik.</Empty>}
        <View style={{gap:5}}>{routeItems.map(flight=><FlightCard key={`${flight.flightId}:${flight.factsRevision}`} flight={flight} onPress={()=>openFlight(flight)}/>)}</View>
      </>}

      {route.kind === 'detail' && <StatisticsFlightDetails detail={detail} loading={data.detailBusy} error={detailError ? data.detailError : null} rawPage={rawPage} onRawPage={setRawPage} />}
    </ScrollView>
  </View>;
}

function StatisticsFlightDetails({ detail, loading, error,rawPage,onRawPage }: { detail: RealFlightDetail | null; loading: boolean; error: string | null;rawPage:number;onRawPage:(page:number)=>void }) {
  if (loading) return <Card><ActivityIndicator color={colors.cyan} accessibilityLabel="Gespeicherte Flugdetails werden geprüft" /><Label muted>Flugdetails werden lokal geprüft.</Label></Card>;
  if (!detail) return <Card><Empty title="Flugdetails nicht verfügbar">{error ?? 'Die aktuelle gespeicherte Auswahl konnte nicht bestätigt werden. Kehre zur Statistik zurück und öffne den Flug erneut.'}</Empty></Card>;
  return <FlightDetails detail={detail} rawPage={rawPage} onRawPage={onRawPage}/>;
}

const styles = StyleSheet.create({
  content: { flex: 1, minHeight: 0, width: '100%' }, canvas: { width: '100%', maxWidth: 600, alignSelf: 'center', padding: 12, paddingBottom: 26, gap: 12 }, canvasLarge: { paddingHorizontal: 10, paddingBottom: 22 },
  hero: { minHeight: 142, borderRadius: 20, overflow: 'hidden', backgroundColor: '#0e202c', padding: 16, justifyContent: 'flex-end', gap: 6, borderWidth: 1, borderColor: colors.border }, blueprintImage: { opacity: .72 }, heroShade: { ...StyleSheet.absoluteFill, backgroundColor: '#0b141c3b' }, heroEyebrow: { color: colors.cyan, fontSize: 11, lineHeight: 16, letterSpacing: 1.2, fontWeight: '700' },
  periodPanel: { gap: 8, backgroundColor: colors.card, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: colors.border }, chipRow: { gap: 5, paddingRight: 6 }, customRange: { gap: 8 }, dateField: { gap: 3 }, dateInput: { minHeight: 50, color: colors.text, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.raised, borderRadius: 12, paddingHorizontal: 12, fontSize: 16 }, sectionTabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, metric: { flex: 1, minWidth: 90, gap: 2 }, metricValue: { color: colors.cyan, fontSize: 19, lineHeight: 25, fontWeight: '700' }, compareRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }, compareValue: { color: colors.cyan, minWidth: 72, textAlign: 'right' }, monthButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, monthButton: { flexGrow: 1, flexBasis: '30%', minWidth: 95, minHeight: 48, borderRadius: 13, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.raised, paddingHorizontal: 8 }, monthButtonText: { color: colors.text, textAlign: 'center' }, disabled: { opacity: .55 }, aircraftRow: { padding: 13, gap: 5, borderRadius: 16 }, bandRow: { padding: 13, gap: 5, borderRadius: 16 }, aircraftHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 }, aircraftSwatch: { width: 10, height: 10, borderRadius: 5 }, aircraftName: { fontWeight: '700', fontSize: 17, lineHeight: 23 }, flightTime: { color: colors.cyan, flexShrink: 1 },
  detailDuration: { color: colors.cyan, fontSize: 22, lineHeight: 30, fontWeight: '700' }, detailRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, detailLabel: { minWidth: 102 }, sourceRow: { borderTopWidth: 1, borderColor: colors.border, paddingTop: 6, gap: 2 },
});

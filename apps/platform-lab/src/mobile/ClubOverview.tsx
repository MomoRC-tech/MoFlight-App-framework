import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { DutyOverview } from '../vereinsflieger/duties';
import type { FeatureInformation, FeatureSource, WorkHourItem, WorkSummaryItem } from './feature-information';
import { Card, Label, colors } from './theme';
import { SymbolIcon, type SymbolName } from './SymbolIcon';

export const CLUB_DETAIL_SECTIONS = ['Dienste', 'Termine', 'Arbeitsstunden', 'Aufgaben', 'Dokumente'] as const;
export type ClubDetailSection = typeof CLUB_DETAIL_SECTIONS[number];

export interface ClubOverviewProps {
  clubLabel?: string | null;
  dutyOverview?: DutyOverview | null;
  dutiesLoading?: boolean;
  dutiesReadFailed?: boolean;
  information?: FeatureInformation | null;
  informationLoading?: boolean;
  informationReadFailed?: boolean;
  disabled?: boolean;
  onOpen: (section: ClubDetailSection) => void;
}

type Summary = { visible: string; accessible: string };
type OverviewEntry = { section: ClubDetailSection; icon: SymbolName; summary: Summary };

const value = (text: string | null | undefined) => text?.trim() || 'unbekannt';
const shortValue = (text: string, limit = 48) => text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text;
const countText = (count: number, singular: string, plural: string) => `${count} ${count === 1 ? singular : plural}`;

function withLocalState(summary: Summary, readFailed: boolean, loading: boolean, hasSavedData: boolean): Summary {
  if (readFailed) return {
    visible: `${summary.visible} · ${hasSavedData ? 'letzter Stand · Ladefehler' : 'Ladefehler'}`,
    accessible: `${summary.accessible} ${hasSavedData ? 'Der letzte gespeicherte Stand bleibt sichtbar. ' : ''}Lokales Laden fehlgeschlagen.`,
  };
  if (loading) return {
    visible: `${summary.visible} · ${hasSavedData ? 'wird geladen' : 'lädt lokal'}`,
    accessible: `${summary.accessible} Gespeicherte Daten werden lokal geladen; beim Öffnen erfolgt kein Anbieterabruf.`,
  };
  return summary;
}

function missingSource(noun: string, readFailed: boolean, loading: boolean): Summary {
  if (readFailed) return { visible: 'Unbekannt · Ladefehler', accessible: `${noun} unbekannt; lokales Laden fehlgeschlagen.` };
  if (loading) return { visible: 'Wird geladen', accessible: `${noun} unbekannt; gespeicherte Daten werden lokal geladen.` };
  return { visible: 'Unbekannt', accessible: `${noun} unbekannt; noch keine unterstützte Quelle verfügbar.` };
}

function sourceState<T>(source: FeatureSource<T> | undefined, noun: string, readFailed: boolean, loading: boolean): Summary {
  if (!source || source.status !== 'partial') return missingSource(noun, readFailed, loading);
  if (source.empty) return withLocalState({
    visible: `Keine ${noun} · Ausschnitt`,
    accessible: `Keine ${noun} im erfassten Ausschnitt; weitere Einträge bleiben unbekannt.`,
  }, readFailed, loading, true);
  if (!source.items.length) return withLocalState({
    visible: `${noun} · unbekannt · Ausschnitt`,
    accessible: `${noun} im erfassten Ausschnitt unbekannt.`,
  }, readFailed, loading, true);
  const count = countText(source.items.length, noun.replace(/e$/, ''), noun);
  return withLocalState({
    visible: `${count} · ${source.truncated ? 'gekürzt' : 'Ausschnitt'}`,
    accessible: `${count} im erfassten Ausschnitt. ${source.truncated ? 'Am Erfassungslimit gekürzt. ' : ''}Vollständigkeit ungeprüft.`,
  }, readFailed, loading, true);
}

function eventSummary(information: FeatureInformation | null | undefined, readFailed: boolean, loading: boolean): Summary {
  const source = information?.events;
  if (source?.status === 'partial' && source.items.length) {
    const first = source.items[0]!;
    const count = countText(source.items.length, 'Termin', 'Termine');
    return withLocalState({
      visible: `${count} · ${shortValue(value(first.date), 20)} · ${shortValue(value(first.title), 26)} · ${source.truncated ? 'gekürzt' : 'Ausschnitt'}`,
      accessible: `${count} im erfassten Kalenderausschnitt. Erster gespeicherter Eintrag: ${first.date}, ${first.title}. ${source.truncated ? 'Am Erfassungslimit gekürzt. ' : ''}Vollständigkeit ungeprüft; der Ausschnitt ist keine vollständige Zukunftsvorschau.`,
    }, readFailed, loading, true);
  }
  return sourceState(source, 'Termine', readFailed, loading);
}

function documentSummary(information: FeatureInformation | null | undefined, readFailed: boolean, loading: boolean): Summary {
  const source = information?.documentNotices;
  if (source?.status === 'partial' && source.items.length) {
    const count = countText(source.items.length, 'Hinweis', 'Hinweise');
    return withLocalState({
      visible: `${count} · ${shortValue(value(source.items[0]!.text), 32)} · ${source.truncated ? 'gekürzt' : 'Ausschnitt'}`,
      accessible: `${count} aus dem erfassten Dokumentenausschnitt. Erster Hinweis: ${source.items[0]!.text}. ${source.truncated ? 'Am Erfassungslimit gekürzt. ' : ''}Vollständigkeit ungeprüft.`,
    }, readFailed, loading, true);
  }
  return sourceState(source, 'Dokumentenhinweise', readFailed, loading);
}

function workSummary(information: FeatureInformation | null | undefined, readFailed: boolean, loading: boolean): Summary {
  const annual = information?.workSummary;
  const hours = information?.workHours;
  const visible: string[] = [], details: string[] = [];
  if (annual?.status === 'partial' && annual.items.length) {
    const row = annual.items[0]!;
    visible.push(`${shortValue(value(row.period), 12)}: ${shortValue(value(row.hours), 10)} Std.`);
    details.push(`Jahresübersicht ${row.period}: ${row.hours} Stunden ausgewiesen.`);
  }
  if (hours?.status === 'partial' && hours.items.length) {
    visible.push(`${hours.items.length} Einzelposten`);
    details.push(`${hours.items.length} Arbeitsstunden-Einzelposten im erfassten Ausschnitt.`);
  }
  if (visible.length) {
    const truncated = [annual, hours].some(source => source?.status === 'partial' && source.truncated);
    return withLocalState({
      visible: `${visible.join(' · ')} · ${truncated ? 'gekürzt' : 'Ausschnitt'}`,
      accessible: `${details.join(' ')} Quellenausschnitte können unabhängig voneinander fehlen. ${truncated ? 'Mindestens ein Auszug wurde am Erfassungslimit gekürzt. ' : ''}Vollständigkeit ungeprüft; es wird keine Summe abgeleitet.`,
    }, readFailed, loading, true);
  }
  if (annual?.status !== 'partial' && hours?.status !== 'partial') return missingSource('Arbeitsstunden', readFailed, loading);
  if (annual?.status === 'partial' && annual.empty && hours?.status === 'partial' && hours.empty) return withLocalState({
    visible: 'Keine Einträge · Ausschnitt',
    accessible: 'Keine Arbeitsstunden in den erfassten Jahres- und Einzelstunden-Ausschnitten; weitere Werte bleiben unbekannt.',
  }, readFailed, loading, true);
  if (annual?.status === 'partial' && annual.empty && hours?.status !== 'partial') return withLocalState({
    visible: 'Keine Jahreszeilen · Ausschnitt',
    accessible: 'Keine Jahreszeilen im erfassten Ausschnitt; einzelne Arbeitsstunden unbekannt.',
  }, readFailed, loading, true);
  if (hours?.status === 'partial' && hours.empty && annual?.status !== 'partial') return withLocalState({
    visible: 'Keine Einzelstunden · Ausschnitt',
    accessible: 'Keine Einzelstunden im erfassten Ausschnitt; Jahreswerte unbekannt.',
  }, readFailed, loading, true);
  return withLocalState({ visible: 'Unbekannt · Ausschnitt', accessible: 'Arbeitsstunden im erfassten Ausschnitt unbekannt; Vollständigkeit ungeprüft.' }, readFailed, loading, true);
}

function taskSummary(information: FeatureInformation | null | undefined, readFailed: boolean, loading: boolean): Summary {
  const source = information?.tasks;
  if (source?.status === 'partial' && source.items.length) {
    const first = source.items[0]!;
    const count = countText(source.items.length, 'Aufgabe', 'Aufgaben');
    return withLocalState({
      visible: `${count} · ${shortValue(value(first.title), 28)}${first.due.trim() ? ` · bis ${first.due}` : ''} · ${source.truncated ? 'gekürzt' : 'Ausschnitt'}`,
      accessible: `${count} eigene Aufgaben aus dem erfassten Ausschnitt. Erste Aufgabe: ${first.title}${first.due.trim() ? `, fällig ${first.due}` : ''}. ${source.truncated ? 'Am Erfassungslimit gekürzt. ' : ''}Vollständigkeit ungeprüft.`,
    }, readFailed, loading, true);
  }
  if (source?.status === 'partial' && source.empty) return withLocalState({
    visible: 'Keine Aufgaben · Ausschnitt',
    accessible: 'Keine eigenen Aufgaben im erfassten Ausschnitt; weitere Aufgaben bleiben unbekannt.',
  }, readFailed, loading, true);
  if (source?.status === 'partial') return withLocalState({ visible: 'Unbekannt · Ausschnitt', accessible: 'Eigene Aufgaben im erfassten Ausschnitt unbekannt.' }, readFailed, loading, true);
  return missingSource('Eigene Aufgaben', readFailed, loading);
}

function dutySummary(overview: DutyOverview | null | undefined, readFailed: boolean, loading: boolean): Summary {
  if (!overview && readFailed) return { visible: 'Unbekannt · Ladefehler', accessible: 'Nächster eigener Dienst unbekannt; lokales Laden fehlgeschlagen.' };
  if (!overview && loading) return { visible: 'Wird geladen', accessible: 'Gespeicherte Dienste werden lokal geladen.' };
  if (!overview) return { visible: 'Unbekannt', accessible: 'Nächster eigener Dienst unbekannt; kein gespeicherter Ausschnitt.' };
  if (overview.status !== 'partial') return withLocalState({ visible: 'Unbekannt', accessible: overview.coverageMessage || 'Nächster eigener Dienst unbekannt.' }, readFailed, loading, true);
  const next = overview.ownItems[0] ?? overview.laterOwn[0];
  const ownSource = overview.sources?.find(source => source.source === 'own');
  if (next) return withLocalState({
    visible: `Eigener Dienst · ${shortValue(next.duty.trim() || 'Name unbekannt', 24)} · ${next.start ? formatDutyDay(next.start) : 'Datum unbekannt'} · Ausschnitt`,
    accessible: `Nächster eigener Dienst: ${next.duty.trim() || 'Dienstname unbekannt'}, ${next.start ? formatDutyDay(next.start) : 'Zeitraum unbekannt'}. Dienstplanausschnitt unvollständig; weitere Dienste sind unbekannt.`,
  }, readFailed, loading, true);
  const unplacedOwn = overview.unplaced.find(item => item.ownState === 'own');
  if (unplacedOwn) return withLocalState({
    visible: 'Eigener Dienst · Zeitraum unbekannt · Ausschnitt',
    accessible: `Ein eigener Diensteintrag hat einen unbekannten Zeitraum: ${unplacedOwn.duty || 'Dienstname unbekannt'}.`,
  }, readFailed, loading, true);
  if (ownSource?.state === 'empty-page' && ownSource.rowCount === 0) return withLocalState({
    visible: 'Kein eigener Dienst · Ausschnitt',
    accessible: 'Kein eigener Dienst im erfassten Ausschnitt; weitere Dienstpläne und Seiten bleiben unbekannt.',
  }, readFailed, loading, true);
  return withLocalState({ visible: 'Unbekannt · Ausschnitt', accessible: 'Nächster eigener Dienst im unvollständigen Ausschnitt unbekannt.' }, readFailed, loading, true);
}

function formatDutyDay(day: string) {
  const [year, month, date] = day.split('-');
  return `${date}.${month}.${year}`;
}

function entries(props: ClubOverviewProps): OverviewEntry[] {
  const { information, informationReadFailed = false, informationLoading = false, dutyOverview,
    dutiesReadFailed = false, dutiesLoading = false } = props;
  return [
    { section: 'Dienste', icon: 'duty', summary: dutySummary(dutyOverview, dutiesReadFailed, dutiesLoading) },
    { section: 'Termine', icon: 'calendar-neutral', summary: eventSummary(information, informationReadFailed, informationLoading) },
    { section: 'Arbeitsstunden', icon: 'duty', summary: workSummary(information, informationReadFailed, informationLoading) },
    { section: 'Aufgaben', icon: 'check', summary: taskSummary(information, informationReadFailed, informationLoading) },
    { section: 'Dokumente', icon: 'logbook', summary: documentSummary(information, informationReadFailed, informationLoading) },
  ];
}

/** Read-only Club task menu. Each row opens its existing detail page; browsing never retrieves provider data. */
export function ClubOverview(props: ClubOverviewProps) {
  const { clubLabel, disabled = false, onOpen } = props;
  return <Card style={styles.card}>
    <View style={styles.heading}>
      <SymbolIcon name="club" size={22} />
      <View style={styles.headingText}>
        <Label muted style={styles.caption}>MEIN VEREIN</Label>
        <Label style={styles.clubName}>{clubLabel?.trim() || 'Vereinsname unbekannt'}</Label>
      </View>
    </View>
    <View accessibilityLabel="Vereinsaufgaben" style={styles.menu}>
      {entries(props).map(({ section, icon, summary }) => <Pressable
        key={section}
        testID={`club-overview-${section}`}
        accessibilityRole="button"
        accessibilityLabel={`${section}. ${summary.accessible} Öffnen`}
        accessibilityHint={`${section} anzeigen`}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => onOpen(section)}
        style={({ pressed }) => [styles.row, disabled && styles.disabled, pressed && !disabled && styles.pressed]}>
        <SymbolIcon name={icon} size={20} />
        <View style={styles.rowText}>
          <Label style={styles.title}>{section}</Label>
          <Label muted style={styles.summary}>{summary.visible}</Label>
        </View>
        <SymbolIcon name="right" size={16} tone="muted" />
      </Pressable>)}
    </View>
  </Card>;
}

const styles = StyleSheet.create({
  card: { width: '100%', maxWidth: 520, alignSelf: 'center', gap: 8, padding: 10 },
  heading: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 6, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  headingText: { flex: 1, minWidth: 0, gap: 1 },
  caption: { fontSize: 10, lineHeight: 14, letterSpacing: 1.1 },
  clubName: { fontSize: 15, lineHeight: 21, fontWeight: '600' },
  menu: { gap: 4 },
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.raised },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.cyan },
  summary: { fontSize: 12, lineHeight: 17 },
  disabled: { opacity: .5 },
  pressed: { opacity: .72 },
});

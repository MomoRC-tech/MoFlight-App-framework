import React, { useState } from 'react';
import { View } from 'react-native';
import { Action, Card, Label, Section } from './theme';
import { INFORMATION_TYPES, type InformationCapture, type InformationCategory, type InformationHistory } from '../vereinsflieger/information';

export function InformationReview({ captures, notice, onOpen, disabled, history, historyBusy, historyNotice, onHistory, onReload, reloading, canReload }: { onReload: () => void; reloading: boolean; canReload: boolean; captures: InformationCapture[]; notice: string; onOpen: () => void; disabled: boolean; history: InformationHistory | null; historyBusy: boolean; historyNotice: string; onHistory: (category: InformationCategory, index: number) => void }) {
  const [category, setCategory] = useState<InformationCategory | null>(null), [page, setPage] = useState(0);
  const selectedHistory = history?.category === category ? history : null;
  const capture = selectedHistory ? selectedHistory.capture : captures.find(c => c.category === category);
  const dateOnlyNotice = capture?.category === 'document-notices' && capture.rows.some(r => /^\s*-?\s*\d{2}\.\d{2}\.\d{4}\s*$/.test(r.values[0] ?? ''));
  return <Card><Section title="Gespeicherte Informationen" icon="info" />
    <Label muted>Quellenbelege getrennt von Flügen und Papierflugbuch. Offline lesbar; vorläufige Kontozuordnung. Die bisherige Bibliothek-Sicherung enthält diese Belege nicht.</Label>
    <Action secondary disabled={disabled} onPress={onOpen}>Weitere Informationen erfassen</Action>
    <Action secondary disabled={reloading || !canReload} onPress={onReload}>Gespeicherte Informationen neu laden</Action>
    {reloading && <View accessibilityLiveRegion="polite"><Label>Gespeicherte Informationen werden neu geladen…</Label></View>}
    {!!notice && <View accessibilityLiveRegion="polite"><Label>{notice}</Label></View>}
    {!captures.length && <Label>Noch keine Informationsseite gespeichert.</Label>}
    {captures.map(c => <Action key={c.category} secondary onPress={() => { setCategory(c.category); setPage(0); onHistory(c.category, 0); }}>Ansehen: {INFORMATION_TYPES[c.category].title} · {c.rows.length} Zeilen</Action>)}
    {historyBusy && <View accessibilityLiveRegion="polite"><Label>Gespeicherter Beleg wird geöffnet…</Label></View>}
    {!!category && !!historyNotice && <View accessibilityLiveRegion="polite"><Label>{historyNotice}</Label></View>}
    {selectedHistory?.total === 0 && <Label>Kein gespeicherter Beleg dieses Quelltyps verfügbar.</Label>}
    {capture && <View style={{ gap: 8 }}>
      <Section title={INFORMATION_TYPES[capture.category].title} />
      {selectedHistory && <Label>Gespeicherter Beleg {selectedHistory.index + 1} von {selectedHistory.total}{selectedHistory.index === 0 ? ' · neuester' : ' · älterer Quellenstand'}</Label>}
      {selectedHistory && selectedHistory.index > 0 && <Action secondary disabled={historyBusy} onPress={() => { setPage(0); onHistory(capture.category, selectedHistory.index - 1); }}>Neueren Quellenbeleg ansehen</Action>}
      {selectedHistory && selectedHistory.index + 1 < selectedHistory.total && <Action secondary disabled={historyBusy} onPress={() => { setPage(0); onHistory(capture.category, selectedHistory.index + 1); }}>Älteren Quellenbeleg ansehen</Action>}
      <Label>Erfasst: {new Date(capture.retrievedAt).toLocaleString('de-DE')}</Label>
      <Label muted>Zeilen in diesem Beleg: {capture.rows.length}</Label>
      <Label muted>Nur sichtbare Seite · Seitenabdeckung ungeprüft{capture.coverage.truncated ? ` · auf ${capture.rows.length} Zeilen begrenzt` : ''}. {capture.filters.join(' · ') || 'Zeitraum/Filter nicht erkannt.'}</Label>
      <Label muted>Originalwerte; keine Berechnung oder Bestätigung von Berechtigungen, Kosten oder Vollständigkeit.</Label>
      {dateOnlyNotice && <Label>Dieser Beleg enthält Datumstext ohne bestätigten Dokumenttitel. Der Textauszug ist unvollständig.</Label>}
      {capture.empty && <Label>Quelle meldet keine passenden Daten auf dieser Seite. Keine Aussage über andere Zeiträume.</Label>}
      {capture.rows.slice(page * 5, page * 5 + 5).map(row => <View key={row.position} style={{ gap: 4 }}>
        <Section title={`Quellzeile ${row.position + 1}`} />
        {capture.columns.map((column, index) => <Label key={column.key}>{column.label}: {row.values[index]?.trim() ? row.values[index] : 'Kein unterstützter Textwert erfasst'}</Label>)}
      </View>)}
      {page > 0 && <Action secondary onPress={() => setPage(p => p - 1)}>Vorherige Informationszeilen</Action>}
      {(page + 1) * 5 < capture.rows.length && <Action secondary onPress={() => setPage(p => p + 1)}>Weitere Informationszeilen</Action>}
    </View>}
  </Card>;
}

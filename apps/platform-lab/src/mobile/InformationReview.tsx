import React, { useState } from 'react';
import { View } from 'react-native';
import { Action, Card, Label, Section } from './theme';
import { INFORMATION_TYPES, type InformationCapture, type InformationCategory } from '../vereinsflieger/information';

export function InformationReview({ captures, notice }: { captures: InformationCapture[]; notice: string }) {
  const [category, setCategory] = useState<InformationCategory | null>(null), [page, setPage] = useState(0);
  const capture = captures.find(c => c.category === category);
  return <Card><Section title="Gespeicherte Informationen" icon="info" />
    <Label muted>Quellenbelege getrennt von Flügen und Papierflugbuch. Offline lesbar; vorläufige Kontozuordnung. Die bisherige Bibliothek-Sicherung enthält diese Belege nicht.</Label>
    {!!notice && <View accessibilityLiveRegion="polite"><Label>{notice}</Label></View>}
    {!captures.length && <Label>Noch keine Informationsseite gespeichert.</Label>}
    {captures.map(c => <Action key={c.category} secondary onPress={() => { setCategory(c.category); setPage(0); }}>Ansehen: {INFORMATION_TYPES[c.category].title} · {c.rows.length} Zeilen</Action>)}
    {capture && <View style={{ gap: 8 }}>
      <Section title={INFORMATION_TYPES[capture.category].title} />
      <Label>Erfasst: {new Date(capture.retrievedAt).toLocaleString('de-DE')}</Label>
      <Label muted>Nur sichtbare Seite · Seitenabdeckung ungeprüft{capture.coverage.truncated ? ' · auf 20 Zeilen begrenzt' : ''}. {capture.filters.join(' · ') || 'Zeitraum/Filter nicht erkannt.'}</Label>
      <Label muted>Originalwerte; keine Berechnung oder Bestätigung von Berechtigungen, Kosten oder Vollständigkeit.</Label>
      {capture.empty && <Label>Quelle meldet keine passenden Daten auf dieser Seite. Keine Aussage über andere Zeiträume.</Label>}
      {capture.rows.slice(page * 5, page * 5 + 5).map(row => <View key={row.position} style={{ gap: 4 }}>
        <Section title={`Quellzeile ${row.position + 1}`} />
        {capture.columns.map((column, index) => <Label key={column.key}>{column.label}: {row.values[index]?.trim() ? row.values[index] : 'Leer im Anbieterbeleg'}</Label>)}
      </View>)}
      {page > 0 && <Action secondary onPress={() => setPage(p => p - 1)}>Vorherige Informationszeilen</Action>}
      {(page + 1) * 5 < capture.rows.length && <Action secondary onPress={() => setPage(p => p + 1)}>Weitere Informationszeilen</Action>}
    </View>}
  </Card>;
}

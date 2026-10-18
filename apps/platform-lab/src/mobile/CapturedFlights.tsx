import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Action, Card, Label, Section } from './theme';
import { captureReviewPage, openCaptureReview, reviewDuration, reviewParsedField, reviewRawField } from '../vereinsflieger/capture-review';
import type { ProbeSnapshot } from '../vereinsflieger/probe';
import { assessSourceFlight, type SourceFlightAssessment } from '../vereinsflieger/source-assessment';
import type { CaptureField } from '../vereinsflieger/fields';

const crew: [CaptureField, string][] = [['pilot', 'Pilot'], ['pic', 'PIC'], ['companion', 'Begleiter/FI'], ['companion2', 'Begleiter 2'], ['companion3', 'Begleiter 3'], ['sic', 'SIC']];

function FlightFacts({ flight }: { flight: SourceFlightAssessment }) {
  return <>
    <Label selectable>Datum: {reviewParsedField(flight.date)}</Label>
    <Label selectable>Kennzeichen: {reviewRawField(flight.fields.registration)}</Label>
    <Label selectable>Muster: {reviewRawField(flight.fields.model)}</Label>
    <Label selectable>Start: {reviewParsedField(flight.clocks.start)} · Landung: {reviewParsedField(flight.clocks.landing)}</Label>
    <Label selectable>Flugzeit: {reviewDuration(flight.durations.flight)}</Label>
  </>;
}

/** Only receives the active owner's saved snapshot. Reading never touches the provider. */
export function CapturedFlights({ snapshot, loadState }: { snapshot: ProbeSnapshot | null; loadState: 'loading' | 'ready' | 'failed' }) {
  const [expanded, setExpanded] = useState(false), [page, setPage] = useState(0);
  const [selected, setSelected] = useState<number | null>(null), [rawPage, setRawPage] = useState(0);
  const review = useMemo(() => {
    if (!snapshot) return null;
    try { return openCaptureReview(snapshot); } catch { return null; }
  }, [snapshot]);
  if (!snapshot) return <Card><Section title="Erfasste Flüge" icon="flight-paper-plane" /><Label muted>{loadState === 'loading' ? 'Gespeicherte Belege werden geöffnet…' : loadState === 'failed' ? 'Gespeicherte Belege konnten nicht geöffnet werden. Vorhandene Daten bleiben erhalten.' : 'Noch kein Flugbeleg gespeichert. Melde dich bei Vereinsflieger an und starte einen Abruf.'}</Label></Card>;
  if (!review) return <Card><Section title="Erfasste Flüge" /><Label>Dieser gespeicherte Beleg kann nicht sicher angezeigt werden. Er bleibt unverändert erhalten.</Label></Card>;
  const { pages, offset, flights } = captureReviewPage(review, page);
  const flight = selected === null ? null : assessSourceFlight(review, selected);
  const rawOffset = rawPage * 8;
  return <View style={{ gap: 10 }}>
    <Card><Section title="Erfasste Flüge" icon="flight-paper-plane" />
      <Label>{review.rows.length} Datensätze · lokal gespeichert</Label>
      <Label muted>Abgerufen: {new Date(review.retrievedAt).toLocaleString('de-DE')}</Label>
      <Label muted>{review.coverage === 'complete-requested-list' ? `Erfasster Zeitraum: ${review.exportContext!.from} bis ${review.exportContext!.to} einschließlich · ${review.exportContext!.pageCount} Seite(n). Keine vollständige Gesamthistorie.` : 'Nur die sichtbare persönliche Liste erfasst. Keine vollständige Gesamthistorie.'}</Label>
      <Label muted>Offline lesbar, unabhängig von der Anbietersitzung. Diese Belege sind noch nicht deiner Flugbibliothek oder einem Flugbuch zugeordnet.</Label>
      <Action secondary onPress={() => { setExpanded(!expanded); setSelected(null); setRawPage(0); }}>{expanded ? 'Flugbelege schließen' : 'Erfasste Flüge ansehen'}</Action>
    </Card>
    {expanded && <>
      <Card><Label muted>Uhrzeitbasis und Landetag sind ungeprüft. Angezeigte Uhrzeiten sind Anbieterwerte ohne UTC-Umrechnung. Gemeldete Dauer wird nicht aus Uhrzeiten berechnet.</Label><Label muted>Quellidentität, Besatzungsanrechnung, Luftfahrzeugklasse und Duplikatbehandlung bleiben ungeprüft. Crew-Felder werden getrennt gezeigt.</Label></Card>
      {flight ? <Card>
        <Section title={`Flugbeleg ${selected! + 1}`} />
        <Action secondary icon="back" onPress={() => { setSelected(null); setRawPage(0); }}>Zur erfassten Liste</Action>
        <FlightFacts flight={flight} />
        <Label selectable>Startort: {reviewRawField(flight.fields.departure)} · Landeort: {reviewRawField(flight.fields.arrival)}</Label>
        <Label selectable>Blockzeit: {reviewDuration(flight.durations.block)}</Label>
        <Label selectable>Off-Block: {reviewParsedField(flight.clocks.offBlock)} · On-Block: {reviewParsedField(flight.clocks.onBlock)}</Label>
        {crew.map(([field, title]) => <Label key={field} selectable>{title}: {reviewRawField(flight.fields[field])}</Label>)}
        <Label selectable>Quellreferenz (ungeprüft): {flight.observation.row.sourceFlightId ?? 'Nicht erfasst'}</Label>
        <Section title="Unveränderte Anbieterfelder" />
        <Label muted>Alle Werte einschließlich unbekannter Spalten bleiben lesbar. Leere Felder werden gekennzeichnet; Texte werden nicht gekürzt.</Label>
        {review.headers.slice(rawOffset, rawOffset + 8).map((header, i) => {
          const value = flight.observation.row.values[rawOffset + i]!;
          return <View key={rawOffset + i} style={{ gap: 2 }}><Label muted>Spalte {rawOffset + i + 1}: {header || '(ohne Überschrift)'}</Label><Label selectable>{value.trim() ? value : 'Leer im Anbieterbeleg'}{value.trim() ? '' : value ? ` (${JSON.stringify(value)})` : ''}</Label></View>;
        })}
        <Label muted>Felder {rawOffset + 1}–{Math.min(rawOffset + 8, review.headers.length)} von {review.headers.length}</Label>
        <Action secondary disabled={rawPage === 0} onPress={() => setRawPage(rawPage - 1)}>Vorherige Anbieterfelder</Action>
        <Action secondary disabled={rawOffset + 8 >= review.headers.length} onPress={() => setRawPage(rawPage + 1)}>Weitere Anbieterfelder</Action>
      </Card> : <>
        <Label>{review.rows.length ? `Datensätze ${offset + 1}–${offset + flights.length} von ${review.rows.length}` : 'Keine Flüge im erfassten Zeitraum. Frühere Belege bleiben gespeichert.'}</Label>
        {flights.map(item => <Card key={item.observation.rowIndex}><FlightFacts flight={item} /><Action secondary label={`Flugbeleg ${item.observation.rowIndex + 1} ansehen`} onPress={() => { setSelected(item.observation.rowIndex); setRawPage(0); }}>Flugbeleg {item.observation.rowIndex + 1} ansehen</Action></Card>)}
        {pages > 1 && <Card><Label>Seite {page + 1} von {pages}</Label><Action secondary disabled={page === 0} onPress={() => setPage(page - 1)}>Vorherige Flugbelege</Action><Action secondary disabled={page + 1 >= pages} onPress={() => setPage(page + 1)}>Weitere Flugbelege</Action></Card>}
      </>}
    </>}
  </View>;
}

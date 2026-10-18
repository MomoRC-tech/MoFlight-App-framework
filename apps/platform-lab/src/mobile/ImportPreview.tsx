import React, { useState } from 'react';
import { View } from 'react-native';
import { Action, Card, Chip, Label, Section } from './theme';
import { acceptPreview, confirmPreviewChoice, eligiblePreviewBooks, planImportPreview, recordEvidence, type PreviewRecord, type PreviewRow, type PreviewSession, type SuggestionReason } from '../import-preview';
import { syntheticImportPreview } from '../import-preview-fixture';

const statusText: Record<PreviewRow['status'], string> = { added: 'Neu', changed: 'Geändert', unchanged: 'Unverändert', conflict: 'Widersprüchlich' };
const reasonText: Record<SuggestionReason, string> = {
  confirmed: 'Deine bestätigte Auswahl bleibt erhalten.',
  stale: 'Angaben haben sich geändert. Deine frühere Auswahl bleibt sichtbar und muss erneut geprüft werden.',
  conflict: 'Mehrere Angaben zur selben Quellreferenz. Wähle zuerst eine Variante.',
  duplicate: 'Die Quelle kennzeichnet ein Duplikat. Keine Buchgutschrift vorgeschlagen.',
  'unknown-class': 'Flugzeugklasse unbekannt. Das Kennzeichen allein belegt keine Klasse.',
  'no-book': 'Kein unterstütztes Buch passt zu Klasse und Flugdatum.',
  history: 'Vorschlag aus bestätigten Zuordnungen desselben Testflugzeugs; Klasse und Datum passen.',
  'ambiguous-history': 'Für dieses Testflugzeug sind unterschiedliche Bücher bestätigt. Bitte selbst wählen.',
  category: 'Nur ein unterstütztes Buch passt zu belegter Klasse und Flugdatum.',
  'multiple-books': 'Mehrere Bücher passen zu Klasse und Datum. Bitte selbst wählen.',
};
const classText = { glider: 'Segelflug', TMG: 'TMG', powered: 'Motorflug', ultralight: 'Ultraleicht' };
const fieldText: Record<string, string> = { date: 'Datum', start: 'Start', landing: 'Landung', time_basis: 'Zeitbasis', minutes: 'Flugminuten',
  registration: 'Kennzeichen', aircraft_model: 'Flugzeugtyp', pilot_role: 'Rolle', crew: 'Besatzung', launch: 'Startart', start_place: 'Startort',
  landing_place: 'Landeort', landings: 'Landungen', remarks: 'Bemerkungen', aircraftClass: 'Flugzeugklasse', aircraftRef: 'Flugzeugreferenz', duplicate: 'Duplikat' };
const valueText = (value: unknown): string => value === null ? 'unbekannt' : typeof value === 'boolean' ? value ? 'ja' : 'nein' : Array.isArray(value) ? value.length ? JSON.stringify(value) : 'unbekannt' : String(value);
const recordField = (record: PreviewRecord, key: string) => key in record.flight ? record.flight[key as keyof PreviewRecord['flight']] : record[key as keyof PreviewRecord];
function Facts({ record }: { record: PreviewRecord }) {
  return <View style={{ gap: 4 }}>
    <Label>{record.flight.date} · {record.flight.registration ?? 'Kennzeichen unbekannt'}</Label>
    <Label>{record.flight.aircraft_model ?? 'Flugzeugtyp unbekannt'} · {record.aircraftClass === null ? 'Klasse unbekannt' : classText[record.aircraftClass]}</Label>
    <Label>{record.flight.start ?? '—'} → {record.flight.landing ?? '—'} · {record.flight.time_basis ?? 'Zeitbasis unbekannt'}</Label>
    <Label>Flugminuten: {valueText(record.flight.minutes)} · Rolle: {valueText(record.flight.pilot_role)}</Label>
    <Label muted>Quellreferenz {record.sourceFlightId} · Duplikat: {record.duplicate ? 'ja' : 'nein'}</Label>
  </View>;
}

export function ImportPreview({ session, onChange, onNavigate }: { session: PreviewSession | null; onChange: (session: PreviewSession) => void; onNavigate: () => void }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [variant, setVariant] = useState<string | null>(null);
  const [bookId, setBookId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const plan = session ? planImportPreview(session.workspace, session.batch) : null;
  const active = plan?.rows.find(row => row.id === activeId);
  const selected = active?.variants.find(record => recordEvidence(record) === variant);
  const candidates = session && selected ? eligiblePreviewBooks(session.workspace.books, selected) : [];
  function open(row: PreviewRow) {
    setActiveId(row.id); setVariant(row.selected === null ? null : recordEvidence(row.variants[row.selected]!));
    setBookId(row.bookId); setMessage(null);
    onNavigate();
  }
  function confirm() {
    if (!session || !active || !variant) return;
    try {
      onChange({ ...session, workspace: confirmPreviewChoice(session.workspace, session.batch, active.id, variant, bookId) });
      setActiveId(null); setMessage(`Auswahl für Flug ${active.reference} im Test bestätigt.`);
      onNavigate();
    } catch { setMessage('Auswahl nicht bestätigt. Prüfe die aktuelle Variante und ein passendes Buch oder wähle „Später zuordnen“.'); }
  }
  const bookName = (id: string | null) => id === null ? 'Später zuordnen' : session?.workspace.books.find(book => book.id === id)?.name ?? 'Buch nicht verfügbar';
  return <View style={{ width: '100%', maxWidth: 520, alignSelf: 'center', gap: 10 }}>
    <Card><Section title="Synthetische Importvorschau" icon="flight-paper-plane" />
      <Label>Fiktive Flüge vergleichen und Buchzuordnungen prüfen</Label>
      <Label muted>Dieser getrennte Teststand verändert keine gespeicherten Flüge, Papierstände oder Anbieterbelege. Er bleibt beim Zurückkehren erhalten und wird beim Neustart der App verworfen.</Label>
      <Label muted>Ein Vorschlag wird erst durch deine ausdrückliche Bestätigung zur Testauswahl. Es werden keine echten Flüge importiert.</Label>
    </Card>
    {message && <Card><Label>{message}</Label></Card>}
    {!session ? <Action testID="import-preview-start" icon="flight-paper-plane" onPress={() => { onChange(syntheticImportPreview()); setMessage(null); onNavigate(); }}>Synthetischen Vergleich starten</Action> : plan && <>
      <Card><Section title="Vergleichsergebnis" icon="info" />
        <Label>{plan.counts.added} neu · {plan.counts.changed} geändert · {plan.counts.unchanged} unverändert · {plan.counts.conflict} widersprüchlich</Label>
        <Label muted>{plan.repeatedRows} identische Wiederholungszeile(n) zusammengefasst. Fehlende Flüge werden nicht gelöscht. Zeitraum: {session.batch.coverage.from} bis {session.batch.coverage.through}.</Label>
        <Label>{plan.rows.filter(row => row.reason === 'stale').length} frühere Auswahl(en) erneut prüfen</Label>
      </Card>
      {active ? <>
        <Card><Section title={`Flug ${active.reference} · ${statusText[active.status]}`} icon="flight-paper-plane" />
          <Label>{reasonText[active.reason]}</Label>
          {active.choice && <Label>Frühere Testauswahl: {bookName(active.choice.bookId)}</Label>}
          {active.previous && <View style={{ gap: 4 }}><Label style={{ fontWeight: '600' }}>Bisheriger Teststand</Label><Facts record={active.previous} /></View>}
          {active.changedFields.map(key => <Label key={key}>{fieldText[key] ?? key}: {valueText(recordField(active.previous!, key))} → {valueText(recordField(active.variants[0]!, key))}</Label>)}
        </Card>
        {active.variants.map((record, index) => <Card key={recordEvidence(record)}>
          <Section title={active.variants.length > 1 ? `Quellvariante ${index + 1}` : 'Neue Quellangaben'} />
          <Facts record={record} />
          {active.variants.length > 1 && <Chip title={`Variante ${index + 1} wählen`} selected={variant === recordEvidence(record)} onPress={() => { setVariant(recordEvidence(record)); setBookId(null); }} />}
        </Card>)}
        <Card><Section title="Buchzuordnung prüfen" icon="book" />
          <Label>{selected ? 'Auswahl für diese Quellvariante' : 'Wähle zuerst eine Quellvariante.'}</Label>
          {candidates.map(book => <Chip key={book.id} title={book.name} selected={bookId === book.id} onPress={() => setBookId(book.id)} />)}
          {selected && !candidates.length && <Label muted>Keine Buchgutschrift möglich: Klasse, Duplikat oder Buchgültigkeit sind ungeklärt. Du kannst die Zuordnung auf später verschieben.</Label>}
          <Chip title="Später zuordnen" selected={bookId === null} disabled={!selected} onPress={() => setBookId(null)} />
          <Label>Aktuelle Auswahl: {bookName(bookId)}</Label>
          <Action disabled={!selected || bookId !== null && !candidates.some(book => book.id === bookId)} onPress={confirm}>Auswahl im Test bestätigen</Action>
          <Action secondary onPress={() => { setActiveId(null); setMessage('Nicht bestätigte Bearbeitung verworfen. Frühere Testauswahl bleibt erhalten.'); onNavigate(); }}>Bearbeitung verwerfen</Action>
        </Card>
      </> : <>
        <Action secondary testID="import-preview-repeat" onPress={() => { planImportPreview(session.workspace, session.batch); setMessage('Vergleich erneut geprüft. Bestätigte Testauswahl bleibt erhalten.'); }}>Vergleich erneut prüfen</Action>
        <Action secondary testID="import-preview-failure" onPress={() => {
          try { planImportPreview(session.workspace, { ...session.batch, coverage: { ...session.batch.coverage, complete: false } }); }
          catch { setMessage('Unvollständigen Testabruf abgewiesen. Der letzte Vergleich und deine Testauswahl bleiben erhalten.'); }
        }}>Unvollständigen Testabruf prüfen</Action>
        {plan.rows.map(row => <Card key={row.id}>
          <Section title={`Flug ${row.reference} · ${statusText[row.status]}`} />
          <Label>{row.variants[0]!.flight.date} · {row.variants[0]!.flight.registration ?? 'Kennzeichen unbekannt'}</Label>
          <Label>{row.reason === 'confirmed' ? 'Bestätigt' : row.reason === 'stale' ? 'Erneut prüfen' : row.bookId ? 'Vorschlag' : 'Offen'}: {bookName(row.bookId)}</Label>
          <Label muted>{reasonText[row.reason]}</Label>
          <Action secondary label={`Flug ${row.reference} prüfen`} onPress={() => open(row)}>Zuordnung prüfen</Action>
        </Card>)}
        <Card><Section title="Vergleich im Test übernehmen" icon="check" />
          <Label muted>Übernimmt die gewählten Quellvarianten nur in diesen Teststand. Unaufgelöste Widersprüche bleiben erhalten. Vorschläge ohne Bestätigung erzeugen keine Buchzuordnung.</Label>
          <Label>{plan.rows.filter(row => row.reason !== 'confirmed' || row.bookId === null).length} Flüge ohne bestätigte Buchzuordnung</Label>
          <Action disabled={plan.rows.some(row => row.reason === 'stale')} testID="import-preview-accept" onPress={() => {
            try { onChange({ ...session, workspace: acceptPreview(session.workspace, plan) }); setMessage('Teststand übernommen. Erneuter Vergleich zeigt übernommene Flüge als unverändert; offene Widersprüche bleiben sichtbar.'); }
            catch { setMessage('Teststand nicht übernommen. Vergleiche erneut und prüfe geänderte Angaben.'); }
          }}>Teststand übernehmen</Action>
        </Card>
      </>}
    </>}
  </View>;
}

import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import type { Book, PilotBooks } from '../../../../packages/local-data/src/books';
import { loadBooks } from '../book-storage';
import { restorePilotBackup, savePilotBackupToFolder, sharePilotBackup } from '../pilot-backup';
import { Action, Card, Label, Section, colors } from './theme';

export function LibraryBackup({ onBusyChange }: { onBusyChange: (busy: boolean) => void }) {
  const library = useRef<PilotBooks | null>(null), alive = useRef(false), lock = useRef(false);
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState(false), [message, setMessage] = useState('');
  const close = async (value: PilotBooks | null) => { await value?.db.close().catch(() => {}); };
  const load = async () => {
    setLoading(true); setError(false);
    let candidate: PilotBooks | null = null;
    try {
      candidate = (await loadBooks()).lib;
      const currentBooks = await candidate.books();
      if (!alive.current) return;
      const previous = library.current; library.current = candidate; candidate = null;
      setBooks(currentBooks); await close(previous);
    } catch { if (alive.current) setError(true); }
    finally { await close(candidate); if (alive.current) setLoading(false); }
  };
  useEffect(() => {
    alive.current = true; void load();
    return () => { alive.current = false; if (!lock.current) { const previous = library.current; library.current = null; void close(previous); } };
  }, []);
  const run = async (work: (value: PilotBooks) => Promise<string>) => {
    if (!alive.current || lock.current || loading || !library.current) return;
    lock.current = true; setBusy(true); setError(false); setMessage(''); onBusyChange(true);
    try { const outcome = await work(library.current); if (alive.current) setMessage(outcome); }
    catch { if (alive.current) setError(true); }
    finally {
      lock.current = false;
      if (alive.current) { setBusy(false); onBusyChange(false); }
      else { const previous = library.current; library.current = null; await close(previous); }
    }
  };
  const disabled = loading || busy || !library.current;
  return <View style={{ width: '100%', maxWidth: 520, alignSelf: 'center', gap: 10 }}>
    <Card><Section title="Sicherung & Wiederherstellung" icon="book" />
      <Label>{library.current ? `Lokale synthetische Bibliothek · ${books.length} Flugbücher` : loading ? 'Bibliothek wird geladen…' : 'Bibliothek nicht verfügbar'}</Label>
      <Label muted>Die Sicherung enthält alle Flugbücher dieser Bibliothek mit Quellbelegen, Entscheidungen, Papierständen und Schreibvorlagen. Sie ist unverschlüsselt.</Label>
      <Label muted>Anzeigename, Anbietersitzung, Zugangsdaten und rohe Vereinsflieger-Abrufe sind nicht enthalten. Eine externe Sicherung schützt vor App-Deinstallation oder Geräteverlust.</Label>
    </Card>
    {(loading || busy) && <ActivityIndicator color={colors.cyan} accessibilityLabel={busy ? 'Sicherung wird verarbeitet' : 'Bibliothek wird geladen'} />}
    {busy && <Label>Bitte den Vorgang oder die geöffnete Systemauswahl abschließen. Die App-Ansicht bleibt währenddessen erhalten.</Label>}
    {error && <Card><Label>Der Vorgang konnte nicht bestätigt werden. Vorhandene Bibliotheken bleiben erhalten; eine externe Sicherung ist nicht bestätigt.</Label>{!library.current && <Action secondary disabled={loading} onPress={() => void load()}>Bibliothek erneut laden</Action>}</Card>}
    {!!message && <View accessibilityLiveRegion="polite"><Label>{message}</Label></View>}
    <Card><Section title="Sicherung erstellen" icon="book" />
      {Platform.OS === 'android' && <Action testID="backup-save-folder" icon="book" disabled={disabled} onPress={() => void run(async value => await savePilotBackupToFolder(value) === 'saved' ? 'Sicherung im gewählten Geräteordner gespeichert und zurückgelesen.' : 'Ordnerauswahl abgebrochen. Bibliothek unverändert.')} >In Geräteordner sichern</Action>}
      <Action testID="backup-share" secondary icon="arrow" disabled={disabled} onPress={() => void run(async value => await sharePilotBackup(value) === 'prepared' ? 'Sicherung vorbereitet. Teilen oder das Schließen des Dialogs bestätigt keine externe Speicherung.' : 'Sicherung im App-Speicher vorbereitet. Teilen ist auf diesem Gerät nicht verfügbar; externe Speicherung nicht bestätigt.')} >Sicherung teilen</Action>
    </Card>
    <Card><Section title="Sicherung wiederherstellen" icon="refresh" />
      <Label muted>Nur das vorhandene Format dieser synthetischen Bibliothek, maximal 2 MB. Eine geprüfte Sicherung wird in einer neuen lokalen Datenbank geöffnet. Die bisherige Bibliothek bleibt erhalten; es werden keine Daten zusammengeführt.</Label>
      <Action testID="backup-restore" secondary icon="refresh" disabled={disabled} onPress={() => void run(async value => {
        const result = await restorePilotBackup(value);
        if (result.state === 'cancelled') return 'Dateiauswahl abgebrochen. Aktuelle Bibliothek unverändert.';
        const previous = library.current; library.current = result.library;
        if (alive.current) setBooks(result.books);
        await close(previous);
        return 'Sicherung in neuer Bibliothek geöffnet. Bisherige Bibliothek erhalten. Beim Zurückkehren werden die Flüge neu geladen.';
      })}>Sicherung auswählen</Action>
    </Card>
  </View>;
}

import React, { useEffect, useState } from 'react';
import { Share, View } from 'react-native';
import { diagnosticJournal, type DiagnosticAction, type DiagnosticOutcome } from '../diagnostics';
import { Action, Card, Label, Section } from './theme';

const actions: Record<DiagnosticAction, string> = { 'update-flights': 'Flüge laden / aktualisieren', 'open-flight-tools': 'Flugdaten öffnen', 'library-operation': 'Bibliotheksaktion', 'read-flights': 'Gespeicherte Flüge laden', 'read-flight-detail': 'Flugdetails öffnen' };
const outcomes: Record<DiagnosticOutcome, string> = { running: 'Läuft', success: 'Erfolgreich', partial: 'Teilweise erfolgreich', failed: 'Fehlgeschlagen', blocked: 'Gesperrt', cancelled: 'Abgebrochen', interrupted: 'Unterbrochen' };
export function Diagnostics() {
  const [, update] = useState(0);
  const [sharing, setSharing] = useState(false), [message, setMessage] = useState('');
  useEffect(() => diagnosticJournal.subscribe(() => update(value => value + 1)), []);
  const entries = diagnosticJournal.snapshot();
  async function share() {
    if (sharing) return;
    setSharing(true); setMessage('');
    try { await Share.share({ title: 'MoFlight Diagnose', message: diagnosticJournal.export() }); }
    catch { setMessage('Teilen fehlgeschlagen. Du kannst den Bericht unten markieren und kopieren.'); }
    finally { setSharing(false); }
  }
  return <View style={{ width: '100%', maxWidth: 520, alignSelf: 'center', gap: 10 }}>
    <Card><Section title="Diagnose" icon="info" />
      <Label>Die letzten fünf technischen Vorgänge mit Ergebnis, Prüfcodes und Verarbeitungszeiten.</Label>
      <Label muted>Nur auf diesem Gerät, auch nach einem Neustart. Keine Namen, Kontokennungen, Fluginhalte, Passwörter oder Originalfehlermeldungen. Es wird nichts automatisch gesendet.</Label>
      <Label muted>Teile den Bericht bei einem Problem mit dem Support. Prüfe vor dem Senden den ausgewählten Empfänger.</Label>
      <Action testID="diagnostics-share" disabled={sharing || !entries.length} onPress={() => void share()}>Diagnosebericht teilen</Action>
      <Action testID="diagnostics-clear" secondary disabled={sharing || !entries.length} onPress={() => { diagnosticJournal.clear(); setMessage('Diagnosejournal geleert.'); }}>Diagnosejournal leeren</Action>
      {!!message && <View accessibilityLiveRegion="polite"><Label>{message}</Label></View>}
      {diagnosticJournal.storageFailed && <Label>Das Diagnosejournal konnte nicht dauerhaft gespeichert werden. Der Bericht dieser Sitzung bleibt hier verfügbar.</Label>}
    </Card>
    {!entries.length && <Card><Label>Noch keine Diagnoseeinträge. Führe den betroffenen Vorgang aus und öffne diese Seite erneut.</Label></Card>}
    {[...entries].reverse().map(entry => <Card key={entry.sequence}>
      <Section title={`${entry.sequence}. ${actions[entry.action]}`} />
      <Label>{outcomes[entry.outcome]} · {entry.milliseconds} ms</Label>
      <Label selectable>Code: {entry.code}</Label>
      {entry.stages.map(stage => <Label selectable muted key={stage.name}>{stage.name}: {stage.milliseconds} ms · {stage.calls} Aufruf(e) · {stage.failures} fehlgeschlagen</Label>)}
    </Card>)}
    {!!entries.length && <Card><Section title="Bericht zum Kopieren" /><Label muted>Text lange drücken, markieren und kopieren. Zeiten verschachtelter Phasen überlappen; sie werden nicht addiert. Laufende Zeiten werden beim Export aktualisiert.</Label><View testID="diagnostics-report"><Label selectable>{diagnosticJournal.export()}</Label></View></Card>}
  </View>;
}

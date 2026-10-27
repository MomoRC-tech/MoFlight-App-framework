import React, { useEffect, useState } from 'react';
import { Pressable, Share, Text, View } from 'react-native';
import { diagnosticJournal, type DiagnosticAction, type DiagnosticOutcome } from '../diagnostics';
import { shareDiagnosticFile } from './diagnostics-native';
import { Action, Card, Label, Section, colors } from './theme';
import { SettingsContentDisclosure, SettingsContentGroup, settingsContentStyles } from './settings-secondary-content';

const actions: Record<DiagnosticAction, string> = { 'start-screen': 'Start · JavaScript bis Datenanzeige', 'start-presentation': 'Start · React-Anzeige', 'update-flights': 'Flüge laden / aktualisieren', 'open-flight-tools': 'Flugdaten öffnen', 'library-operation': 'Bibliotheksaktion', 'read-flights': 'Gespeicherte Flüge laden', 'read-flight-detail': 'Flugdetails öffnen' };
const outcomes: Record<DiagnosticOutcome, string> = { running: 'Läuft', success: 'Erfolgreich', partial: 'Teilweise erfolgreich', failed: 'Fehlgeschlagen', blocked: 'Gesperrt', cancelled: 'Abgebrochen', interrupted: 'Unterbrochen' };
export function Diagnostics() {
  const [, update] = useState(0);
  const [sharing, setSharing] = useState(false), [message, setMessage] = useState('');
  const [view, setView] = useState<'operations'|'journey'|'failures'>('operations'), [page, setPage] = useState(0);
  useEffect(() => diagnosticJournal.subscribe(() => update(value => value + 1)), []);
  const entries = diagnosticJournal.snapshot(), events = diagnosticJournal.journey(), failures = diagnosticJournal.failureSnapshot(), stats = diagnosticJournal.stats();
  const items = view === 'operations' ? entries : view === 'journey' ? events : failures;
  const pages = Math.max(1, Math.ceil(items.length / 10)), currentPage = Math.min(page, pages - 1);
  const available = !!(entries.length || events.length || failures.length);
  async function share(full: boolean) {
    if (sharing) return;
    setSharing(true); setMessage(''); diagnosticJournal.record('action','share-report');
    try { if(full)await shareDiagnosticFile(); else await Share.share({ title: 'MoFlight Diagnose — Kurzbericht', message: diagnosticJournal.shortReport() }); }
    catch { setMessage('Teilen fehlgeschlagen. Du kannst den Kurzbericht unten markieren und kopieren.'); }
    finally { setSharing(false); }
  }
  function choose(next: typeof view) { setView(next); setPage(0); }
  return <View style={settingsContentStyles.content}>
    <Card><Label>{stats.actions} Aktionen · {stats.operations} Vorgänge · {stats.failures} geschützte Fehler</Label>
      <Label muted>Nur auf diesem Gerät, auch nach einem Neustart. Keine Namen, Kontokennungen, Fluginhalte, Eingabewerte, Passwörter oder Originalfehlermeldungen. Es wird nichts automatisch gesendet.</Label>
    </Card>
    <SettingsContentGroup title="Bericht & Speicher"><View style={{ padding: 16, gap: 10 }}>
      <Action testID="diagnostics-share" disabled={sharing || !available} onPress={() => void share(true)}>Diagnosebericht teilen</Action>
      <Action testID="diagnostics-short-share" secondary disabled={sharing || !available} onPress={() => void share(false)}>Kurzbericht teilen / kopieren</Action>
      {sharing && <View accessible accessibilityLiveRegion="polite" accessibilityState={{ busy: true }}><Label>Teilen läuft … Schließe die Systemauswahl ab, um fortzufahren.</Label></View>}
      <Label muted>Der vollständige Bericht wird als JSON-Datei geteilt. Der Kurzbericht enthält nur die jüngsten Einträge. Prüfe vor dem Senden den ausgewählten Empfänger.</Label>
      {!!message && <View accessibilityLiveRegion="polite"><Label>{message}</Label></View>}
      {diagnosticJournal.storageFailed && <Label>Das Diagnosejournal konnte nicht dauerhaft gespeichert werden. Der Bericht dieser Sitzung bleibt hier verfügbar.</Label>}
      </View><SettingsContentDisclosure title="Speichergrenzen & Bereinigung" testID="diagnostics-storage-details">
      <Label>Bis zu 2.000 Aktionen und 600 technische Vorgänge, höchstens 14 Tage. Die Speichergrenzen können die Anzahl früher begrenzen.</Label>
      <Label muted>Maximal 1 MB insgesamt, einschließlich der Exportdatei. Technische Vorgänge und geschützte Fehler haben eigene Bereiche; automatische Lesevorgänge verdrängen den Bedienverlauf nicht.</Label>
      <Label muted>Leeren entfernt nur Diagnosejournal und Exportdatei.</Label>
      <Action testID="diagnostics-clear" secondary disabled={sharing || !available} onPress={() => { diagnosticJournal.clear();setPage(0);setMessage('Diagnosejournal und Exportdatei geleert.'); }}>Diagnosejournal leeren</Action>
    </SettingsContentDisclosure></SettingsContentGroup>
    <SettingsContentGroup title="Verlauf ansehen">
      {([['operations', 'Technische Vorgänge', 'diagnostics-operations'], ['journey', 'Bedienverlauf & Wege', 'diagnostics-journey'], ['failures', 'Geschützte Fehler', 'diagnostics-failures']] as const).map(([key, title, testID]) => <Pressable key={key} testID={testID} accessibilityRole="button" accessibilityState={{ selected: view === key }} onPress={() => choose(key)} style={({ pressed }) => [settingsContentStyles.row, (view === key || pressed) && settingsContentStyles.pressed]}>
        <Text style={[settingsContentStyles.title, { flex: 1, color: view === key ? colors.cyan : colors.text }]}>{title}</Text><Text accessibilityElementsHidden importantForAccessibility="no" style={settingsContentStyles.supporting}>{view === key ? '✓' : ''}</Text>
      </Pressable>)}
      <View style={{ padding: 16, gap: 8 }}>
      <Label>Seite {currentPage+1} von {pages}</Label>
      <Action testID="diagnostics-previous" secondary disabled={currentPage===0} onPress={()=>setPage(currentPage-1)}>Neuere Einträge</Action>
      <Action testID="diagnostics-next" secondary disabled={currentPage+1>=pages} onPress={()=>setPage(currentPage+1)}>Ältere Einträge</Action>
      </View>
    </SettingsContentGroup>
    {!available && <Card><Label>Noch keine Diagnoseeinträge. Führe den betroffenen Vorgang aus und öffne diese Seite erneut.</Label></Card>}
    {available && items.length === 0 && <Card><Label>{view === 'failures' ? 'Keine geschützten Fehler erfasst.' : view === 'journey' ? 'Noch kein Bedienverlauf erfasst.' : 'Noch keine technischen Vorgänge erfasst.'}</Label><Label muted>Die anderen Verlaufsbereiche bleiben oben erreichbar.</Label></Card>}
    {view==='operations' && [...entries].reverse().slice(currentPage*10,currentPage*10+10).map(entry=><Card key={entry.sequence}>
      <Section title={`${entry.sequence}. ${actions[entry.action]}`} />
      <Label>{outcomes[entry.outcome]} · {entry.milliseconds} ms</Label><Label selectable>Code: {entry.code} · Sitzung {entry.session} · {entry.trigger}</Label>
      <SettingsContentDisclosure title="Technische Phasen" summary={`${entry.stages.length} erfasste Phasen`}>
      {!!entry.activeStages.length && <Label>Offene Phase: {entry.activeStages.join(', ')}</Label>}
      {entry.stages.map(stage=><Label selectable muted key={stage.name}>{stage.name}: {stage.milliseconds} ms · max. {stage.maximum} ms · {stage.calls} Aufruf(e) · {stage.failures} fehlgeschlagen</Label>)}
      </SettingsContentDisclosure>
    </Card>)}
    {view==='failures' && [...failures].reverse().slice(currentPage*10,currentPage*10+10).map((failure,index)=><Card key={index}><Section title={actions[failure.operation.action]} /><Label>{outcomes[failure.operation.outcome]} · {failure.operation.code}</Label><Label muted>{failure.preceding.map(event=>`${event.kind}: ${event.target}`).join(' → ') || 'Kein vorheriger Bedienverlauf erfasst.'}</Label></Card>)}
    {view==='journey' && <><Card><Section title="Beobachtete Wege" /><Label muted>Dies sind beobachtete Wechsel, keine bestätigten Absichten. Teilverläufe und Supportberichte bilden nicht die Nutzung aller Personen ab.</Label>{diagnosticJournal.journeySummary().slice(0,5).map(path=><Label selectable key={path.path}>{path.path} · {path.occurrences} Mal</Label>)}</Card>
      {[...events].reverse().slice(currentPage*10,currentPage*10+10).map(event=><Card key={event.sequence}><Label selectable>{event.sequence}. {event.kind}: {event.target}</Label><Label muted>Sitzung {event.session} · +{event.offset} ms</Label></Card>)}
    </>}
    {available && <SettingsContentGroup title="Kurzbericht"><SettingsContentDisclosure title="Kurzbericht zum Kopieren" testID="diagnostics-copy-details"><Label muted>Text lange drücken, markieren und kopieren. Zeiten verschachtelter Phasen und Zähler überlappen; sie werden nicht addiert. Der vollständige Verlauf steht in der Exportdatei.</Label><View testID="diagnostics-report"><Label selectable>{diagnosticJournal.shortReport()}</Label></View></SettingsContentDisclosure></SettingsContentGroup>}
  </View>;
}

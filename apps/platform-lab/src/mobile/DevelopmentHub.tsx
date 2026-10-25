import React, { useRef, useState } from 'react';
import { View } from 'react-native';
import { Action, Card, Label, Section } from './theme';

export function DevelopmentHub({ onFlights, onBooks, onImportPreview, onCoreFlights, profileTools, onSelectBook, onBackup, onPaper, onDesignPreview, onBusyChange }: { onBusyChange?: (busy:boolean)=>void; onDesignPreview?: () => void; onPaper: () => void; profileTools?: React.ReactNode; onSelectBook: () => void; onBackup: () => void; onFlights: () => void; onBooks: () => void; onProvider?: () => void; onImportPreview: () => void; onCoreFlights: () => void }) {
  const [targetProof,setTargetProof]=useState<string|null>(null),[proofBusy,setProofBusy]=useState(false);
  const running=useRef(false);
  const runTargetProof=async()=>{
    if(running.current)return;
    running.current=true;setProofBusy(true);onBusyChange?.(true);setTargetProof(null);
    try {
      const {runDutyTargetBackupFixture}=await import('../development/duty-target-backup-fixture');
      const result=await runDutyTargetBackupFixture();
      setTargetProof(`Sollstunden-Nachweis bestanden: ${result.checks.length} Prüfungen. ${result.limitation}`);
    } catch(error){setTargetProof(`Sollstunden-Nachweis fehlgeschlagen: ${error instanceof Error?error.message:String(error)}`);}
    finally{running.current=false;setProofBusy(false);onBusyChange?.(false);}
  };
  return <View style={{ width: '100%', maxWidth: 520, alignSelf: 'center', gap: 10 }}>
    <Card><Section title="Entwicklung" icon="info" />
      <Label>Testwerkzeuge dieses experimentellen Lab-Builds</Label>
      <Label muted>Hier sind synthetische Testdaten und ältere Funktionsnachweise gebündelt. Öffnen allein lädt keine Fixtures und startet keinen Anbieterabruf. Diese Seite ist keine Zugriffssperre und keine Freigabe für eine spätere Produktversion.</Label>
    </Card>
    {onDesignPreview&&<Card><Section title="Designvorschau" icon="glider"/><Label muted>Fiktive Flüge, leere Listen und Fehlerzustände. Keine Speicherung und kein Anbieterzugriff.</Label><Action onPress={onDesignPreview}>Designvorschau öffnen</Action></Card>}
    <Card><Section title="Sollstunden-Dateinachweis"/><Label muted>Nur fest abgegrenzte synthetische Konten. Prüft lokale Dateien und stellt deren vorherigen Inhalt wieder her; keine Anbieterabfrage.</Label><Action disabled={proofBusy} onPress={()=>void runTargetProof()}>Sollstunden-Dateinachweis starten</Action>{targetProof&&<Label selectable>{targetProof}</Label>}</Card>
    <Card><Section title="Eigene Flugbibliothek" icon="flight-paper-plane" />
      <Label muted>Neue lokale Bibliothek für eigene Vereinsflieger-Flüge. Abruf prüfen, ausdrücklich ohne Buchzuordnung speichern und offline wieder öffnen. Bestehende Belege und Teststände bleiben getrennt.</Label>
      <Action testID="development-own-flight-library" icon="flight-paper-plane" onPress={onCoreFlights}>Eigene Flugbibliothek öffnen</Action>
    </Card>
    <Card><Section title="Synthetische Importvorschau" icon="flight-paper-plane" />
      <Label muted>Neue, geänderte und widersprüchliche Testflüge vergleichen und Buchvorschläge korrigieren. Getrennter Teststand ohne Änderungen an deiner Bibliothek.</Label>
      <Action testID="development-import-preview" secondary icon="flight-paper-plane" onPress={onImportPreview}>Importvorschau öffnen</Action>
    </Card>
    <Card><Section title="Datensätze & Flugworkflow" icon="flight-paper-plane" />
      <Label muted>Getrennte Datensätze A/B, vorbereitete CSV- und Papierdaten, Abgleich, Abfragen und ältere Schreibnachweise. Englische Lab-Oberfläche; keine Live-Importvorschau.</Label>
      <Action testID="development-flight-lab" secondary icon="flight-paper-plane" onPress={onFlights}>Datensatztest öffnen</Action>
    </Card>
    {profileTools}
    <Card><Section title="Synthetische Bibliothek" icon="book" /><Action secondary onPress={onPaper}>Synthetischen Papierstand ansehen</Action><Action secondary onPress={onSelectBook}>Synthetisches Flugbuch auswählen</Action><Action secondary onPress={onBackup}>Synthetische Bibliothek sichern & wiederherstellen</Action><Label muted>Diese Sicherung enthält keine eigenen Vereinsflieger-Flüge oder Medical-Angaben.</Label></Card>
    <Card><Section title="Flugbücher & Papierexperimente" icon="book" />
      <Label muted>Vier synthetische Bücher, Formatvorschau, Korrekturen, feste Schreibstände und ältere Kopierbestätigungen. Änderungen betreffen die aktuelle synthetische Bibliothek. Der neue Papierablauf ist noch nicht umgesetzt.</Label>
      <Action testID="development-book-lab" secondary icon="book" onPress={onBooks}>Flugbuchtest öffnen</Action>
    </Card>
    <Card><Section title="Anbieterdiagnose" icon="chain" />
      <Label muted>Neue Daten und Anmeldung erreichst du ausschließlich über die Verbindung oben in der Kopfzeile. Die lokale Diagnose bleibt unter Profil verfügbar.</Label>
    </Card>
  </View>;
}

export function DevelopmentNotice() {
  return <View style={{ padding: 10, width: '100%', maxWidth: 720, alignSelf: 'center' }}><Label muted>Entwicklung · ältere englische Nachweise mit synthetischen Daten. Kein fertiger Import- oder Papierablauf.</Label></View>;
}

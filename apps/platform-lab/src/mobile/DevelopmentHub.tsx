import React, { useEffect, useRef, useState } from 'react';
import { AppState, View } from 'react-native';
import { Action, Card, Label } from './theme';
import { SettingsContentDisclosure, SettingsContentGroup, SettingsContentRow, settingsContentStyles } from './settings-secondary-content';

export function DevelopmentHub({ onDetailHttpPoc, onFlights, onBooks, onImportPreview, onCoreFlights, profileTools, onSelectBook, onBackup, onPaper, onDesignPreview, onBusyChange }: { onDetailHttpPoc?:()=>void; onBusyChange?: (busy:boolean)=>void; onDesignPreview?: () => void; onPaper: () => void; profileTools?: React.ReactNode; onSelectBook: () => void; onBackup: () => void; onFlights: () => void; onBooks: () => void; onProvider?: () => void; onImportPreview: () => void; onCoreFlights: () => void }) {
  const [targetProof,setTargetProof]=useState<string|null>(null),[proofBusy,setProofBusy]=useState(false);
  const running=useRef(false);
  const active=useRef(true),[financialProof,setFinancialProof]=useState<string|null>(null);
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  const runFinancialProof=async(reopen=false)=>{
    if(running.current)return;
    running.current=true;setProofBusy(true);onBusyChange?.(true);setFinancialProof(null);
    try {
      const proof=await import('../development/financial-native-proof-native');
      const result=await (reopen?proof.reopenFinancialNativeProofNative:proof.runFinancialNativeProofNative)(()=>active.current&&AppState.currentState==='active');
      if(active.current)setFinancialProof(result.state==='passed'?`Finanzdatei-Nachweis bestanden (${result.checks.length}). Synthetische Daten; kein Anbieter- oder Dateiauswahl-Nachweis.`:'Finanzdatei-Nachweis fehlgeschlagen. Vorhandene Testdateien bleiben erhalten.');
    }catch{if(active.current)setFinancialProof('Finanzdatei-Nachweis nicht verfügbar. Vorhandene Daten bleiben erhalten.');}
    finally{running.current=false;if(active.current)setProofBusy(false);onBusyChange?.(false);}
  };
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
  return <View style={settingsContentStyles.content}>
    <Card>
      <Label>Testwerkzeuge dieses experimentellen Lab-Builds</Label>
      <Label muted>Hier sind synthetische Testdaten und ältere Funktionsnachweise gebündelt. Öffnen allein lädt keine Fixtures und startet keinen Anbieterabruf.</Label>
      <Label muted>Diese Seite ist keine Zugriffssperre und keine Freigabe für eine spätere Produktversion.</Label>
    </Card>
    <SettingsContentGroup title="Vorschau & lokale Nachweise">
      <SettingsContentDisclosure title="Finanzdatei-Nachweis" summary="Getrennte synthetische Dateien; kein Anbieterzugriff" testID="development-financial-proof-details">
        <Label muted>Prüft native SQLite-Belege, Version 4 und Wiederaufnahme nach unterbrochener Bestätigung. Bestehende Konten, Belege und Anmeldungen bleiben unverändert.</Label>
        <Action disabled={proofBusy} onPress={()=>void runFinancialProof()}>Finanzdatei-Nachweis starten</Action>
        <Action secondary disabled={proofBusy} onPress={()=>void runFinancialProof(true)}>Finanznachweis offline wieder öffnen</Action>
        {financialProof&&<View accessibilityLiveRegion="polite"><Label selectable>{financialProof}</Label></View>}
      </SettingsContentDisclosure>
      {onDesignPreview && <SettingsContentRow title="Designvorschau" summary="Fiktive Flüge, leere Listen und Fehlerzustände. Keine Speicherung und kein Anbieterzugriff." onPress={onDesignPreview} />}
      <SettingsContentDisclosure title="Sollstunden-Dateinachweis" summary="Nur fest abgegrenzte synthetische Konten" testID="development-target-proof-details">
        <Label muted>Prüft lokale Dateien und stellt deren vorherigen Inhalt wieder her; keine Anbieterabfrage.</Label>
        <Action disabled={proofBusy} onPress={() => void runTargetProof()}>{proofBusy ? 'Nachweis läuft …' : 'Sollstunden-Dateinachweis starten'}</Action>
        {targetProof && <View accessibilityLiveRegion="polite"><Label selectable>{targetProof}</Label></View>}
      </SettingsContentDisclosure>
    </SettingsContentGroup>
    <SettingsContentGroup title="Flüge & Import">
      {onDetailHttpPoc && <SettingsContentRow testID="development-detail-http-poc" title="HTTP-Flugdetail vergleichen" summary="Ein eigenes Detail per HTTP und normaler Seite prüfen; getrennte lokale Testbelege. Unterbricht den Anbieter-Controller, ohne die Bibliothek zu ändern." onPress={onDetailHttpPoc} />}
      <SettingsContentRow testID="development-own-flight-library" title="Eigene Flugbibliothek" summary="Eigene Vereinsflieger-Flüge lokal prüfen, ausdrücklich ohne Buchzuordnung speichern und offline wieder öffnen. Bestehende Belege und Teststände bleiben getrennt." onPress={onCoreFlights} />
      <SettingsContentRow testID="development-import-preview" title="Synthetische Importvorschau" summary="Neue, geänderte und widersprüchliche Testflüge vergleichen und Buchvorschläge korrigieren. Getrennter Teststand ohne Änderungen an deiner Bibliothek." onPress={onImportPreview} />
      <SettingsContentRow testID="development-flight-lab" title="Datensätze & Flugworkflow" summary="Getrennte Datensätze A/B, vorbereitete CSV- und Papierdaten, Abgleich, Abfragen und ältere Schreibnachweise. Englische Lab-Oberfläche; keine Live-Importvorschau." onPress={onFlights} />
    </SettingsContentGroup>
    {profileTools}
    <SettingsContentGroup title="Synthetische Bibliothek">
      <SettingsContentRow title="Synthetischen Papierstand ansehen" onPress={onPaper} />
      <SettingsContentRow title="Synthetisches Flugbuch auswählen" onPress={onSelectBook} />
      <SettingsContentRow title="Sichern & wiederherstellen" summary="Diese Sicherung enthält keine eigenen Vereinsflieger-Flüge oder Medical-Angaben." onPress={onBackup} />
      <SettingsContentRow testID="development-book-lab" title="Flugbücher & Papierexperimente" summary="Vier synthetische Bücher, Formatvorschau, Korrekturen, feste Schreibstände und ältere Kopierbestätigungen. Änderungen betreffen die aktuelle synthetische Bibliothek. Der neue Papierablauf ist noch nicht umgesetzt." onPress={onBooks} />
    </SettingsContentGroup>
    <Card><Label muted>Neue Daten und Anmeldung erreichst du ausschließlich über Sync oben in der Kopfzeile. Die lokale Diagnose bleibt unter Profil verfügbar.</Label></Card>
  </View>;
}

export function DevelopmentNotice() {
  return <View style={{ padding: 10, width: '100%', maxWidth: 720, alignSelf: 'center' }}><Label muted>Entwicklung · ältere englische Nachweise mit synthetischen Daten. Kein fertiger Import- oder Papierablauf.</Label></View>;
}

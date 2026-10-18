import React from 'react';
import { View } from 'react-native';
import { Action, Card, Label, Section } from './theme';

export function PaperStatus({ bookName, pending, onBooks, onFlights, onBackup }: {
  bookName: string | null; pending: number | null; onBooks: () => void; onFlights: () => void; onBackup: () => void;
}) {
  return <View style={{ width: '100%', maxWidth: 520, alignSelf: 'center', gap: 10 }}>
    <Card><Section title="Gespeicherter Papierstand" icon="book" />
      <Label>{bookName ?? 'Noch kein Flugbuch ausgewählt'}</Label>
      <Label>{pending === null ? 'Papierstand unbekannt' : `${pending} Flüge ohne gespeicherten Papiernachweis`}</Label>
      <Label muted>Synthetische lokale Bibliothek. Die Anzeige beschreibt gespeicherte Nachweise und bestätigt keine tatsächlichen Einträge im Papierbuch.</Label>
      <Action secondary icon="book" onPress={onBooks}>Flugbuch auswählen</Action>
    </Card>
    <Card><Section title="Papierabgleich wird vorbereitet" icon="info" />
      <Label>Letzten Eintrag prüfen, Abweichungen klären und eine neue Schreibvorlage vorbereiten: Dieser vollständige Ablauf ist noch nicht verfügbar.</Label>
      <Label muted>Hier werden keine Testdaten erzeugt und keine Einträge als geschrieben bestätigt. Bestehende Papiernachweise und Schreibstände bleiben erhalten.</Label>
      <Action secondary icon="flight-paper-plane" onPress={onFlights}>Gespeicherte Flüge ansehen</Action>
    </Card>
    <Action secondary icon="book" onPress={onBackup}>Sicherung & Wiederherstellung</Action>
  </View>;
}

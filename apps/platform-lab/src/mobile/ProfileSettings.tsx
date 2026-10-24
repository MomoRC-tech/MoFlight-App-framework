import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, StyleSheet, Text, TextInput, View } from 'react-native';
import { Action, Card, Label, Section, colors } from './theme';
import { AI_BACKUP_NOTICE } from '../ai/backup-notice';

export interface ProfileSettingsProps {
  connectionSummary?: React.ReactNode;
  displayName: string;
  nameDraft: string;
  onNameDraftChange: (value: string) => void;
  busy: boolean;
  error: string | null;
  onSaveName: (value: string) => Promise<boolean>;
  onRetry: () => void;
  onTools: () => void;
  onStatus: () => void;
  onConnections?: () => void;
  onCredits: () => void;
  onBooks: () => void;
  onBackup: () => void;
  onDiagnostics: () => void;
}
export function ProfileSettings({ connectionSummary, onBackup, onDiagnostics, onCredits, onTools,onConnections,onStatus }: ProfileSettingsProps) {
  return <View style={styles.content}>
    <View style={{gap:6}}>{connectionSummary ?? <Card><Section title="Vereinsflieger & Daten" /><Label muted>Neue Daten und Anmeldung erreichst du über die Verbindung oben in der Kopfzeile.</Label></Card>}<Action secondary onPress={onStatus}>Verbindung & Datenstatus</Action></View>
    {onConnections&&<Card><Section title="Verbindung"/><Action secondary onPress={onConnections}>Vereinsflieger-Einstellungen</Action></Card>}
    <Card><Section title="Sicherung" icon="book" />
      <Label muted>Sichert eigene Flüge und Belege, die ausgewählte lokale Flugbuchbibliothek mit Profil sowie unterstützte eigene Quellen einschließlich Medical. Unverschlüsselt; Anmeldungen, Dienstpläne und temporäre Dateien sind ausgeschlossen.</Label>
      <Label muted>{AI_BACKUP_NOTICE}</Label>
      <Action secondary icon="book" onPress={onBackup}>Daten sichern & wiederherstellen</Action>
    </Card>
    <Card><Section title="Support & Über MoFlight" />
      <Action testID="diagnostics-entry" secondary icon="info" onPress={onDiagnostics}>Diagnose öffnen</Action>
      <Action secondary onPress={onCredits}>Bildnachweise & Lizenzen</Action>
      <Label muted>Sprache: Deutsch · Textgröße nach Geräteeinstellung.</Label>
    </Card>
    <Card><Section title="Erweitert" />
      <Action testID="development-entry" secondary icon="info" onPress={onTools}>Entwicklung öffnen</Action>
      <Label muted>Synthetische Teststände, Demoprofil und ältere Nachweise.</Label>
    </Card>
  </View>;
}
export function SyntheticProfileSettings({ displayName, nameDraft: name, onNameDraftChange, busy, error, onSaveName, onRetry }: Pick<ProfileSettingsProps, 'displayName' | 'nameDraft' | 'onNameDraftChange' | 'busy' | 'error' | 'onSaveName' | 'onRetry'>) {
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const alive = useRef(false);
  const saving = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  useEffect(() => { setSaveError(null); setSaved(false); }, [displayName]);
  const save = async () => {
    if (busy || saving.current) return;
    saving.current = true; setSaveError(null); setSaved(false);
    try {
      const succeeded = await onSaveName(name);
      if (alive.current && succeeded) { setSaved(true); Keyboard.dismiss(); }
    } catch { if (alive.current) setSaveError('Speichern fehlgeschlagen. Bitte erneut versuchen.'); }
    finally { saving.current = false; }
  };
  return <View style={styles.content}>
    <Card>
      <Section title="Lokales Demoprofil" />
      <Label muted>Dein Anzeigename wird nur in dieser lokalen Demobibliothek gespeichert. Ein MoFlight-Konto ist noch nicht verbunden.</Label>
      <Label style={styles.fieldLabel}>Anzeigename</Label>
      <TextInput accessibilityLabel="Anzeigename" value={name} onChangeText={value => { onNameDraftChange(value); setSaved(false); setSaveError(null); }} editable={!busy && !error} maxLength={60} autoCapitalize="words" autoCorrect={false} returnKeyType="done" onSubmitEditing={() => void save()} placeholder="Dein Name (optional)" placeholderTextColor={colors.muted} style={styles.input} />
      {busy && <ActivityIndicator color={colors.cyan} accessibilityLabel="Profil wird verarbeitet" />}
      {(error || saveError) && <Label style={{ color: '#ffba9b' }}>{error ?? saveError}</Label>}
      {saved && <Text style={{ color: colors.green, fontSize: 13, lineHeight: 18 }} accessibilityLiveRegion="polite">Anzeigename gespeichert.</Text>}
      <Action disabled={busy || !!error} onPress={() => void save()}>Anzeigename speichern</Action>
      {error && <Action secondary disabled={busy} onPress={onRetry}>Profil erneut laden</Action>}
      <Label muted>Der Name gilt für diese Bibliothek, nicht für einzelne Flugbücher. Er ist nicht Teil der Flugbuch-Sicherung.</Label>
    </Card>
  </View>;
}
const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: 480, alignSelf: 'center', gap: 12 },
  fieldLabel: { marginTop: 4, fontWeight: '600' },
  input: { minHeight: 48, color: colors.text, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
});

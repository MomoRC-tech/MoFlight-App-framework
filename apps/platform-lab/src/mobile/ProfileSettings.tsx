import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, StyleSheet, Text, TextInput, View } from 'react-native';
import { Action, Card, Label, Section, colors } from './theme';

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
  onConnections: () => void;
  onCredits: () => void;
  onBooks: () => void;
  onBackup: () => void;
  onDiagnostics: () => void;
}
export function ProfileSettings({ connectionSummary, displayName, nameDraft: name, onNameDraftChange, busy, error, onSaveName, onRetry, onTools, onStatus, onCredits, onBooks, onBackup, onConnections, onDiagnostics }: ProfileSettingsProps) {
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
    {connectionSummary ?? <Card><Section title="Vereinsflieger & Daten" /><Action secondary onPress={onConnections}>Vereinsflieger & Daten öffnen</Action></Card>}
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
    <Card>
      <Section title="Flugbücher & Daten" />
      <Action secondary onPress={onBooks}>Meine Flugbücher</Action>
      <Action secondary icon="book" onPress={onBackup}>Sicherung & Wiederherstellung</Action>
      <Action secondary onPress={onStatus}>Datenstatus</Action>
    </Card>
    <Card>
      <Section title="Darstellung" />
      <Label>Sprache: Deutsch</Label>
      <Label muted>Die Textgröße folgt den Systemeinstellungen deines Geräts.</Label>
    </Card>
    <Card>
      <Section title="Über MoFlight" />
      <Action testID="diagnostics-entry" secondary icon="info" onPress={onDiagnostics}>Diagnose öffnen</Action>
      <Action secondary onPress={onCredits}>Bildnachweise & Lizenzen</Action>
    </Card>
    <Card>
      <Section title="Entwicklung" />
      <Action testID="development-entry" secondary icon="info" onPress={onTools}>Entwicklung öffnen</Action>
      <Label muted>Die Werkzeuge enthalten synthetische Testabläufe. Die Anmeldung bei Vereinsflieger ist separat; sie erstellt kein MoFlight-Konto.</Label>
    </Card>
  </View>;
}
const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: 480, alignSelf: 'center', gap: 12 },
  fieldLabel: { marginTop: 4, fontWeight: '600' },
  input: { minHeight: 48, color: colors.text, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
});

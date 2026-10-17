import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, StyleSheet, Text, TextInput, View } from 'react-native';
import { loadBooks, openBooks } from '../book-storage';
import { readLocalDisplayName, saveLocalDisplayName } from './local-profile';
import { Action, Card, Label, Section, colors } from './theme';

export interface ProfileSettingsProps {
  onTools: () => void;
  onStatus: () => void;
  onCredits: () => void;
  onBooks: () => void;
  onSaved?: (displayName: string) => void;
}
export function ProfileSettings({ onTools, onStatus, onCredits, onBooks, onSaved }: ProfileSettingsProps) {
  const [name, setName] = useState('');
  const [library, setLibrary] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const alive = useRef(false);
  const saving = useRef(false);
  useEffect(() => {
    let current = true; alive.current = true;
    setBusy(true); setError(null); setLibrary(null);
    void (async () => {
      let loaded: Awaited<ReturnType<typeof loadBooks>> | undefined;
      try {
        loaded = await loadBooks();
        const value = await readLocalDisplayName(loaded.lib.db, loaded.lib.owner);
        if (current) { setName(value); setLibrary(loaded.name); }
      } catch { if (current) setError('Profil konnte nicht geladen werden. Gespeicherte Daten bleiben erhalten.'); }
      finally { try { await loaded?.lib.db.close(); } catch { /* No reset on close failure. */ } if (current) setBusy(false); }
    })();
    return () => { current = false; alive.current = false; };
  }, [attempt]);
  const save = async () => {
    if (!library || busy || saving.current) return;
    saving.current = true; setBusy(true); setError(null); setSaved(false);
    let lib: Awaited<ReturnType<typeof openBooks>> | undefined;
    try {
      lib = await openBooks(library);
      const value = await saveLocalDisplayName(lib.db, lib.owner, name);
      if (alive.current) { setName(value); setSaved(true); onSaved?.(value); Keyboard.dismiss(); }
    } catch { if (alive.current) setError('Speichern fehlgeschlagen. Verwende höchstens 60 Zeichen und versuche es erneut.'); }
    finally { try { await lib?.db.close(); } catch { /* No reset on close failure. */ } saving.current = false; if (alive.current) setBusy(false); }
  };
  return <View style={styles.content}>
    <Card>
      <Section title="Lokales Demoprofil" />
      <Label muted>Dein Anzeigename wird nur in dieser lokalen Demobibliothek gespeichert. Ein MoFlight-Konto ist noch nicht verbunden.</Label>
      <Label style={styles.fieldLabel}>Anzeigename</Label>
      <TextInput accessibilityLabel="Anzeigename" value={name} onChangeText={value => { setName(value); setSaved(false); }} editable={!busy && !!library} maxLength={60} autoCapitalize="words" autoCorrect={false} returnKeyType="done" onSubmitEditing={() => void save()} placeholder="Dein Name (optional)" placeholderTextColor={colors.muted} style={styles.input} />
      {busy && <ActivityIndicator color={colors.cyan} accessibilityLabel="Profil wird verarbeitet" />}
      {error && <Label style={{ color: '#ffba9b' }}>{error}</Label>}
      {saved && <Text style={{ color: colors.green, fontSize: 13, lineHeight: 18 }} accessibilityLiveRegion="polite">Anzeigename gespeichert.</Text>}
      {library ? <Action disabled={busy} onPress={() => void save()}>Anzeigename speichern</Action> : !busy && <Action onPress={() => setAttempt(value => value + 1)}>Profil erneut laden</Action>}
      <Label muted>Der Name gilt für diese Bibliothek, nicht für einzelne Flugbücher. Er ist nicht Teil der Flugbuch-Sicherung.</Label>
    </Card>
    <Card>
      <Section title="Flugbücher & Daten" />
      <Action secondary onPress={onBooks}>Meine Flugbücher</Action>
      <Action secondary onPress={onStatus}>Datenstatus & Verbindungen</Action>
    </Card>
    <Card>
      <Section title="Darstellung" />
      <Label>Sprache: Deutsch</Label>
      <Label muted>Die Textgröße folgt den Systemeinstellungen deines Geräts.</Label>
    </Card>
    <Card>
      <Section title="Über MoFlight" />
      <Action secondary onPress={onCredits}>Bildnachweise & Lizenzen</Action>
      <Action secondary onPress={onTools}>Entwicklungswerkzeuge öffnen</Action>
      <Label muted>Die Werkzeuge enthalten synthetische Testabläufe. Die Anmeldung bei Vereinsflieger ist separat; sie erstellt kein MoFlight-Konto.</Label>
    </Card>
  </View>;
}
const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: 480, alignSelf: 'center', gap: 12 },
  fieldLabel: { marginTop: 4, fontWeight: '600' },
  input: { minHeight: 48, color: colors.text, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
});

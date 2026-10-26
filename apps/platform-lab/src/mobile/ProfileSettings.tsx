import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
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
  onHelp: (entryId?: string) => void;
  helpEnabled: boolean | null;
  helpSaving: boolean;
  helpError: boolean;
  onToggleHelp: () => void;
}
export function ProfileSettings({ connectionSummary, onBackup, onDiagnostics, onHelp, helpEnabled, helpSaving, helpError, onToggleHelp, onCredits, onTools,onConnections,onStatus }: ProfileSettingsProps) {
  const [backupDetails, setBackupDetails] = useState(false);
  return <View style={styles.content}>
    <View style={styles.summary}>{connectionSummary}<Label muted>Synchronisieren und anmelden: über Sync in der Kopfzeile.</Label></View>
    <SettingsGroup title="Daten & Verbindung">
      <SettingsRow title="Verbindung & Datenstatus" summary="Gespeicherte Quellen und letzte Aktualisierung" onPress={onStatus} />
      {onConnections && <SettingsRow title="Vereinsflieger-Einstellungen" summary="Sitzung und Zugang verwalten" onPress={onConnections} />}
      <SettingsRow title="Daten sichern & wiederherstellen" summary="Lokale Sicherung und geprüfte Wiederherstellung" onPress={onBackup} />
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: backupDetails }} onPress={() => setBackupDetails(value => !value)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
        <Text style={styles.rowTitle}>Was wird gesichert?</Text><Text accessibilityElementsHidden importantForAccessibility="no" style={styles.chevron}>{backupDetails ? '−' : '+'}</Text>
      </Pressable>
      {backupDetails && <View style={styles.details}>
        <Label muted>Sichert eigene Flüge und Belege, die ausgewählte lokale Flugbuchbibliothek mit Profil sowie unterstützte eigene Quellen einschließlich Medical. Unverschlüsselt; Anmeldungen, Dienstpläne und temporäre Dateien sind ausgeschlossen.</Label>
        <Label muted>{AI_BACKUP_NOTICE}</Label>
        {helpEnabled && <SettingsRow title="Hilfe zur Sicherung" onPress={() => onHelp('backup')} />}
      </View>}
    </SettingsGroup>
    <SettingsGroup title="Hilfe & Informationen">
      <SettingsRow testID="help-entry" title="Hilfe & Einführung" summary="Offline suchen und nachlesen" onPress={() => onHelp()} />
      <View style={styles.row}>
        <View style={styles.rowCopy}><Text style={styles.rowTitle}>Kontexthilfe</Text><Text style={styles.supporting}>{helpEnabled === null ? 'Wird geladen …' : helpSaving ? 'Wird gespeichert …' : 'Hinweise direkt am passenden Ort'}</Text></View>
        <Switch testID="help-toggle" accessibilityLabel="Kontexthilfe" accessibilityHint="Die Hilfethemen bleiben unter Hilfe & Einführung erreichbar." value={helpEnabled === true} disabled={helpEnabled === null || helpSaving} onValueChange={() => { if (helpEnabled !== null && !helpSaving) onToggleHelp(); }} trackColor={{ false: colors.border, true: colors.cyan }} thumbColor={helpEnabled ? colors.background : colors.muted} style={styles.switch} />
      </View>
      {helpError && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>Die Einstellung konnte nicht gespeichert werden. Bitte erneut versuchen.</Text>}
      <SettingsRow testID="diagnostics-entry" title="Diagnose" summary="Lokalen Bericht ansehen" onPress={onDiagnostics} />
      <SettingsRow title="Über MoFlight" summary="Bildnachweise & Lizenzen" onPress={onCredits} />
    </SettingsGroup>
    <SettingsGroup title="Erweitert">
      <SettingsRow testID="development-entry" title="Entwicklung" summary="Synthetische Teststände, Demoprofil und Nachweise" onPress={onTools} />
    </SettingsGroup>
    <Text style={styles.footer}>Sprache: Deutsch · Textgröße nach Geräteeinstellung.</Text>
  </View>;
}
function SettingsGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.group}><Text accessibilityRole="header" style={styles.groupTitle}>{title}</Text><View style={styles.groupSurface}>{children}</View></View>;
}
function SettingsRow({ title, summary, onPress, testID }: { title: string; summary?: string; onPress: () => void; testID?: string }) {
  return <Pressable testID={testID} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
    <View style={styles.rowCopy}><Text style={styles.rowTitle}>{title}</Text>{summary && <Text style={styles.supporting}>{summary}</Text>}</View>
    <Text accessibilityElementsHidden importantForAccessibility="no" style={styles.chevron}>›</Text>
  </Pressable>;
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
  summary: { backgroundColor: colors.card, borderRadius: 16, padding: 16, gap: 8 },
  group: { gap: 8 },
  groupTitle: { color: colors.cyan, fontSize: 14, lineHeight: 20, fontWeight: '600', paddingHorizontal: 4 },
  groupSurface: { backgroundColor: colors.card, borderRadius: 16, overflow: 'hidden' },
  row: { minHeight: 56, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowCopy: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { flexShrink: 1, color: colors.text, fontSize: 16, lineHeight: 24 },
  supporting: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  chevron: { color: colors.muted, fontSize: 24, lineHeight: 28, marginLeft: 'auto' },
  switch: { minHeight: 48, minWidth: 48 },
  pressed: { backgroundColor: colors.raised },
  details: { paddingHorizontal: 16, paddingBottom: 16, gap: 10 },
  error: { color: '#ffb4ab', paddingHorizontal: 16, paddingBottom: 12, fontSize: 14, lineHeight: 20 },
  footer: { color: colors.muted, fontSize: 14, lineHeight: 20, paddingHorizontal: 4 },
  fieldLabel: { marginTop: 4, fontWeight: '600' },
  input: { minHeight: 48, color: colors.text, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
});

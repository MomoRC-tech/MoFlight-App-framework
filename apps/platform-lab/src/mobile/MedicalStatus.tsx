import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MedicalIcon } from './ShellIcons';
import { Card, Label, Section, colors } from './theme';
import type { InformationCapture } from '../vereinsflieger/information';

/** Source availability only; never a fitness or legal-validity indicator. */
export function MedicalIndicator({ onPress, active = false, disabled = false, capture = null }: { onPress: () => void; active?: boolean; disabled?: boolean; capture?: InformationCapture | null }) {
  const available = !!capture?.rows.length;
  return <Pressable accessibilityRole="button" accessibilityLabel={available ? 'Medical Quellenangaben vorhanden. Gültigkeit ungeprüft. Details öffnen' : 'Medical unbekannt. Details öffnen'} accessibilityState={{ selected: active, disabled }} disabled={disabled} onPress={onPress} style={[styles.control, disabled && { opacity: .5 }]}>
    <View accessible={false} style={styles.title}><MedicalIcon /><Text style={styles.label}>Med</Text></View>
    <Text style={styles.status}>{available ? 'Angaben' : 'unbekannt'}</Text>
  </Pressable>;
}

export function MedicalDetails({ capture = null, loading = false, needsReload = false }: { capture?: InformationCapture | null; loading?: boolean; needsReload?: boolean } = {}) {
  return <Card style={styles.details}>
    <Section title="Medical" />
    <Label style={{ fontWeight: '600' }}>Gültigkeit ungeprüft</Label>
    {loading && <Label muted>Gespeicherte Angaben werden geladen…</Label>}
    {needsReload && <Label muted>Der neueste gespeicherte Stand muss erneut geladen werden. Vorhandene Angaben bleiben lesbar.</Label>}
    {capture ? <>
      <Label muted>Quelle: Vereinsflieger · eigene Profilseite · abgerufen am {new Date(capture.retrievedAt).toLocaleString('de-DE')}</Label>
      {capture.rows.map(row => <View key={row.position} style={{ gap: 4 }}>
        {capture.columns.map((column, index) => <Label selectable key={column.key}>{column.label}: {row.values[index]?.trim() ? row.values[index] : 'Unbekannt / leer in der Quelle'}</Label>)}
      </View>)}
      {!capture.rows.length && <Label>Im erfassten Seitenausschnitt wurden keine Medical-Angaben gefunden. Der Status bleibt unbekannt.</Label>}
      <Label muted>{capture.coverage.truncated ? 'Der erfasste Ausschnitt ist unvollständig. ' : ''}Originalangaben aus dem gespeicherten Seitenausschnitt; Vollständigkeit und Gültigkeit sind nicht bestätigt.</Label>
    </> : <><Label>Status unbekannt</Label><Label>In dieser lokalen Ansicht sind noch keine Medical-Quellenangaben verfügbar.</Label></>}
    <Label muted>Diese Angaben bestätigen weder Flugtauglichkeit noch eine Flugberechtigung.</Label>
  </Card>;
}

const styles = StyleSheet.create({
  control: { minWidth: 72, minHeight: 48, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 12, backgroundColor: '#102d47aa', alignItems: 'center', justifyContent: 'center' },
  title: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 },
  label: { color: colors.text, fontSize: 12, lineHeight: 16, fontWeight: '600' },
  status: { color: colors.muted, fontSize: 11, lineHeight: 15 },
  details: { width: '100%', maxWidth: 480, alignSelf: 'center' },
});

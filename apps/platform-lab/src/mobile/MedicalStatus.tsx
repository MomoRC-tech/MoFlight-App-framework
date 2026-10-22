import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolIcon } from './SymbolIcon';
import { Card, Label, Section, colors } from './theme';
import type { InformationCapture } from '../vereinsflieger/information';
import { medicalExpiry, medicalExpiryStatusText, type MedicalExpiryState } from './medical-expiry';

function dateColor(state: MedicalExpiryState) {
  if (state === 'expired') return '#ff7777';
  if (state === 'soon') return '#f9b65b';
  return colors.muted;
}

/** Shows a source-date reminder only; it never states fitness or legal eligibility. */
export function MedicalIndicator({ onPress, active = false, disabled = false, capture = null, now = Date.now() }: { onPress: () => void; active?: boolean; disabled?: boolean; capture?: InformationCapture | null; now?: number }) {
  const assessment = medicalExpiry(capture, now);
  const status = assessment.date ? `${assessment.date}${assessment.issues.length ? '*' : ''}` : 'unbekannt';
  const dateDescription = assessment.date ? `Erfasstes frühestes Ablaufdatum: ${assessment.date}. ${medicalExpiryStatusText(assessment.state)}${assessment.issues.length ? '. Weitere Medical-Angaben sind teilweise unbekannt' : ''}.` : 'Medical-Ablaufdatum unbekannt. Einordnung unbekannt.';
  return <Pressable accessibilityRole="button" accessibilityLabel={`Medical. ${dateDescription} Details öffnen`} accessibilityState={{ selected: active, disabled }} disabled={disabled} onPress={onPress} style={[styles.control, disabled && { opacity: .5 }]}>
    <View accessible={false} style={styles.title}><SymbolIcon name="medical-card" size={28} /><Text style={styles.label}>Med</Text></View>
    <Text style={[styles.status, assessment.date ? { color: dateColor(assessment.state) } : undefined]}>{status}</Text>
  </Pressable>;
}

export function MedicalDetails({ capture = null, loading = false, needsReload = false, refreshFailed = false, now = Date.now() }: { capture?: InformationCapture | null; loading?: boolean; needsReload?: boolean; refreshFailed?:boolean; now?: number } = {}) {
  const assessment = medicalExpiry(capture, now);
  return <Card style={styles.details}>
    <Section title="Medical" />
    <Label style={{ fontWeight: '600' }}>Erfasstes Ablaufdatum</Label>
    {capture && (assessment.date ? <Label style={{ color: dateColor(assessment.state) }}>
      {assessment.date}{assessment.issues.length ? '*' : ''} · {medicalExpiryStatusText(assessment.state)}
    </Label> : <Label style={{ color: colors.muted }}>Kein eindeutig lesbares Datum · Einordnung unbekannt</Label>)}
    {capture && assessment.issues.map((issue, index) => <Label key={`issue-${index}`} style={{ color: '#f9b65b' }}>{issue}</Label>)}
    {loading && <Label muted>Gespeicherte Angaben werden geladen…</Label>}
    {needsReload && <Label muted>Der neueste gespeicherte Stand muss erneut geladen werden. Vorhandene Angaben bleiben lesbar.</Label>}
    {refreshFailed && <Label muted>Medical konnte beim letzten Abruf nicht aktualisiert werden. Angezeigt wird die gespeicherte Quelle, sofern vorhanden.</Label>}
    {capture ? <>
      <Label muted>Quelle: Vereinsflieger · eigene Profilseite · abgerufen am {new Date(capture.retrievedAt).toLocaleString('de-DE')}</Label>
      {capture.rows.map(row => <View key={row.position} style={{ gap: 4 }}>
        {capture.columns.map((column, index) => <Label selectable key={column.key}>{column.label}: {row.values[index]?.trim() ? row.values[index] : 'Unbekannt / leer in der Quelle'}</Label>)}
      </View>)}
      {!capture.rows.length && <Label>Im erfassten Seitenausschnitt wurden keine Medical-Angaben gefunden. Der Status bleibt unbekannt.</Label>}
      <Label muted>{capture.coverage.truncated ? 'Der erfasste Ausschnitt ist unvollständig. ' : ''}Originalangaben aus dem gespeicherten Seitenausschnitt; Vollständigkeit und Gültigkeit sind nicht bestätigt.</Label>
    </> : <><Label>Status unbekannt</Label><Label>In dieser lokalen Ansicht sind noch keine Medical-Quellenangaben verfügbar.</Label></>}
    <Label muted>Diese Quellangaben sind keine Bestätigung der Flugtauglichkeit oder einer Flugberechtigung.</Label>
  </Card>;
}

const styles = StyleSheet.create({
  control: { minWidth: 72, minHeight: 48, paddingHorizontal: 10, paddingVertical: 2, borderRadius: 14, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  title: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  label: { color: colors.text, fontSize: 12, lineHeight: 17, fontWeight: '600' },
  status: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  details: { width: '100%', maxWidth: 480, alignSelf: 'center' },
});

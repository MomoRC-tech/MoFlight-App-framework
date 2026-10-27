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
    <View style={styles.face}><SymbolIcon name="medical-card" size={24} />
    <View accessible={false} style={styles.copy}><Text style={styles.label}>Med</Text>
      <Text style={[styles.status, assessment.date ? { color: dateColor(assessment.state) } : undefined]}>{status}</Text></View></View>
  </Pressable>;
}

export function MedicalDetails({ capture = null, loading = false, needsReload = false, refreshFailed = false, now = Date.now() }: { capture?: InformationCapture | null; loading?: boolean; needsReload?: boolean; refreshFailed?:boolean; now?: number } = {}) {
  const assessment = medicalExpiry(capture, now);
  return <View style={styles.details}>
    <Card>
      <Section title="Erfasstes Ablaufdatum" />
      {capture && (assessment.date ? <>
        <Label style={[styles.expiryDate, { color: dateColor(assessment.state) }]}>{assessment.date}{assessment.issues.length ? '*' : ''}</Label>
        <Label muted>{medicalExpiryStatusText(assessment.state)}</Label>
      </> : <Label muted>Kein eindeutig lesbares Datum · Einordnung unbekannt</Label>)}
      {!capture && !loading && <><Label>Status unbekannt</Label><Label muted>In dieser lokalen Ansicht sind noch keine Medical-Quellenangaben verfügbar.</Label></>}
      {(loading || needsReload || refreshFailed) && <View accessibilityLiveRegion="polite" style={styles.feedback}>
        {loading && <View accessible accessibilityState={{busy:true}}><Label muted>Gespeicherte Angaben werden geladen…</Label></View>}
        {needsReload && <Label muted>Der neueste gespeicherte Stand muss erneut geladen werden. Vorhandene Angaben bleiben lesbar.</Label>}
        {refreshFailed && <Label muted>Medical konnte beim letzten Abruf nicht aktualisiert werden. Angezeigt wird die gespeicherte Quelle, sofern vorhanden.</Label>}
      </View>}
      {capture && assessment.issues.length > 0 && <View style={styles.notices}>
        {assessment.issues.map((issue, index) => <Label key={`issue-${index}`} style={{ color: '#f9b65b' }}>{issue}</Label>)}
      </View>}
    </Card>
    {capture ? <>
      <View style={styles.sourceHeading}>
        <Section title="Gespeicherte Quelle" />
        <Label muted>Quelle: Vereinsflieger · eigene Profilseite · abgerufen am {new Date(capture.retrievedAt).toLocaleString('de-DE')}</Label>
      </View>
      {capture.rows.map((row, rowIndex) => <Card key={row.position}>
        <Section title={`Quelleneintrag ${rowIndex + 1}`} />
        {capture.columns.map((column, index) => <View key={column.key} style={styles.sourceFact}>
          <Label muted style={styles.factLabel}>{column.label}</Label>
          <Label selectable style={styles.factValue}>{row.values[index]?.trim() ? row.values[index] : 'Unbekannt / leer in der Quelle'}</Label>
        </View>)}
      </Card>)}
      {!capture.rows.length && <Label>Im erfassten Seitenausschnitt wurden keine Medical-Angaben gefunden. Der Status bleibt unbekannt.</Label>}
    </> : null}
    <View style={styles.caveats}>
      <Section title="Einordnung der Angaben" />
      {capture && <Label muted>{capture.coverage.truncated ? 'Der erfasste Ausschnitt ist unvollständig. ' : ''}Originalangaben aus dem gespeicherten Seitenausschnitt; Vollständigkeit und Gültigkeit sind nicht bestätigt.</Label>}
      <Label muted>Diese Quellangaben sind keine Bestätigung der Flugtauglichkeit oder einer Flugberechtigung.</Label>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  control: { minWidth: 94, minHeight: 48, justifyContent: 'center', flexShrink: 1 },
  face: { minHeight: 40, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, backgroundColor: colors.card, flexDirection: 'row', gap: 5, alignItems: 'center', justifyContent: 'center' },
  copy: { flexShrink: 1 },
  label: { color: colors.text, fontSize: 12, lineHeight: 16, fontWeight: '600' },
  status: { color: colors.muted, fontSize: 11, lineHeight: 15 },
  details: { width: '100%', maxWidth: 480, alignSelf: 'center', gap: 16 },
  expiryDate: { fontSize: 24, lineHeight: 32, fontWeight: '600' },
  notices: { gap: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 },
  feedback: { gap: 8 },
  sourceHeading: { gap: 8, paddingTop: 8 },
  sourceFact: { gap: 4 },
  factLabel: { fontSize: 14, lineHeight: 20 },
  factValue: { fontSize: 16, lineHeight: 24 },
  caveats: { gap: 8, paddingVertical: 8 },
});

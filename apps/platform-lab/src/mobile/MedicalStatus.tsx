import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MedicalIcon } from './ShellIcons';
import { Card, Label, Section, colors } from './theme';

/** Presentation only: no medical source, record, date or eligibility is inferred. */
export function MedicalIndicator({ onPress, active = false, disabled = false }: { onPress: () => void; active?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel="Medical unbekannt. Details öffnen" accessibilityState={{ selected: active, disabled }} disabled={disabled} onPress={onPress} style={[styles.control, disabled && { opacity: .5 }]}>
    <View accessible={false} style={styles.title}><MedicalIcon /><Text style={styles.label}>Med</Text></View>
    <Text style={styles.status}>unbekannt</Text>
  </Pressable>;
}

export function MedicalDetails() {
  return <Card style={styles.details}>
    <Section title="Medical" />
    <Label style={{ fontWeight: '600' }}>Status unbekannt</Label>
    <Label>In MoFlight ist noch kein Medical-Nachweis hinterlegt. Eine Datenquelle ist noch nicht verbunden.</Label>
    <Label muted>Klasse, Gültigkeitsdatum und Quelle sind unbekannt.</Label>
  </Card>;
}

const styles = StyleSheet.create({
  control: { minWidth: 72, minHeight: 48, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 12, backgroundColor: '#102d47aa', alignItems: 'center', justifyContent: 'center' },
  title: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 },
  label: { color: colors.text, fontSize: 12, lineHeight: 16, fontWeight: '600' },
  status: { color: colors.muted, fontSize: 11, lineHeight: 15 },
  details: { width: '100%', maxWidth: 480, alignSelf: 'center' },
});

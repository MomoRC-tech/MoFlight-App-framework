import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Label, colors } from './theme';
import { SymbolIcon } from './SymbolIcon';
import { dataUpdateStatus, type CaptureReadState } from './data-freshness';

/** A manual data update action. Saved-data age is independent of login proof. */
export function DataUpdateIndicator({ receivedAt, readState, now, disabled = false, onPress }: {
  receivedAt: string | null; readState: CaptureReadState; now: number; disabled?: boolean; onPress: () => void;
}) {
  const status = dataUpdateStatus(receivedAt, readState, now);
  const tint = status.state === 'fresh' ? '#74dfba' : status.state === 'older' ? '#ffc477' : colors.muted;
  return <Pressable accessibilityRole="button" accessibilityLabel={`Vereinsflieger-Daten aktualisieren. ${status.description}`}
    accessibilityHint="Lädt neue Daten. Falls nötig, öffnet sich die Anmeldung."
    accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={[styles.button, { borderColor: tint }, disabled && { opacity: .5 }]}>
    <View style={styles.row}><SymbolIcon name="refresh" size={20} tone={status.state === 'fresh' ? 'default' : 'muted'} />
      <Label style={[styles.title, { color: tint }]}>Daten</Label></View>
    <Label style={[styles.age, { color: tint }]}>{status.caption}</Label>
  </Pressable>;
}

const styles = StyleSheet.create({
  button: { minWidth: 74, minHeight: 48, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14,
    borderWidth: 1, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  title: { fontSize: 12, lineHeight: 17, fontWeight: '600' },
  age: { fontSize: 12, lineHeight: 17 },
});

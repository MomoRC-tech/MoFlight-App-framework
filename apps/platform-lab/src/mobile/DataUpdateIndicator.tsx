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
    style={[styles.button, disabled && { opacity: .5 }]}>
    <View accessible={false} style={styles.row}><SymbolIcon name="refresh" size={28} />
      <Label style={styles.title}>Daten</Label></View>
    <Label style={[styles.age, { color: tint }]}>{status.caption}</Label>
  </Pressable>;
}

const styles = StyleSheet.create({
  // The 28 dp symbol matches Profile; compact padding keeps the fixed header no taller.
  button: { minWidth: 74, minHeight: 48, paddingHorizontal: 10, paddingVertical: 2, borderRadius: 14,
    backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  title: { fontSize: 12, lineHeight: 17, fontWeight: '600' },
  age: { fontSize: 12, lineHeight: 17 },
});

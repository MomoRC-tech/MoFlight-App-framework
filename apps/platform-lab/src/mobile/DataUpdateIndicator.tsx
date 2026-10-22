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
    <View style={styles.face}><SymbolIcon name="refresh" size={24} />
    <View accessible={false} style={styles.copy}><Label style={styles.title}>Daten</Label>
      <Label style={[styles.age, { color: tint }]}>{status.caption}</Label></View></View>
  </Pressable>;
}

const styles = StyleSheet.create({
  button: { minWidth: 94, minHeight: 48, justifyContent: 'center', flexShrink: 1 },
  face: { minHeight: 40, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, backgroundColor: colors.card, flexDirection: 'row', gap: 5, alignItems: 'center', justifyContent: 'center' },
  copy: { flexShrink: 1 },
  title: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  age: { fontSize: 11, lineHeight: 15 },
});

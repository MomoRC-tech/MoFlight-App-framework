import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { BadgeTone } from './sync-status';

/** Decorative Material-style status label; the owning action announces its meaning. */
export function StatusBadge({ mark, tone, testID }: { mark: string; tone: BadgeTone; testID?: string }) {
  if (!mark) return null;
  return <View testID={testID} accessible={false} importantForAccessibility="no-hide-descendants" pointerEvents="none" style={[styles.badge, styles[tone]]}>
    <Text style={[styles.label, tone === 'error' && styles.errorText]}>{mark}</Text>
  </View>;
}
const styles = StyleSheet.create({
  badge: { position: 'absolute', top: 0, right: 0, minWidth: 16, minHeight: 16, borderRadius: 10, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 11, lineHeight: 16, fontWeight: '600', color: '#001b29' },
  neutral: { backgroundColor: '#a9bed3' }, success: { backgroundColor: '#48dba5' }, advice: { backgroundColor: '#ffd28b' }, error: { backgroundColor: '#ffb4ab' },
  errorText: { color: '#690005' },
});

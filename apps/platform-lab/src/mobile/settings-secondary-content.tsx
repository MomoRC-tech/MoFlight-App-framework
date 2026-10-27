import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from './theme';

// Scoped to the remaining Settings child pages; does not restyle shared app controls.
export function SettingsContentGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={settingsContentStyles.group}><Text accessibilityRole="header" style={settingsContentStyles.heading}>{title}</Text><View style={settingsContentStyles.surface}>{children}</View></View>;
}
export function SettingsContentRow({ title, summary, onPress, testID, expanded, disabled = false }: { title: string; summary?: string; onPress: () => void; testID?: string; expanded?: boolean; disabled?: boolean }) {
  return <Pressable testID={testID} accessibilityRole="button" accessibilityState={{ disabled, ...(expanded === undefined ? {} : { expanded }) }} disabled={disabled} onPress={onPress} style={({ pressed }) => [settingsContentStyles.row, pressed && settingsContentStyles.pressed, disabled && { opacity: .5 }]}>
    <View style={settingsContentStyles.copy}><Text style={settingsContentStyles.title}>{title}</Text>{summary && <Text style={settingsContentStyles.supporting}>{summary}</Text>}</View>
    <Text accessibilityElementsHidden importantForAccessibility="no" style={settingsContentStyles.chevron}>{expanded === undefined ? '›' : expanded ? '−' : '+'}</Text>
  </Pressable>;
}
export function SettingsContentDisclosure({ title, summary, children, testID }: { title: string; summary?: string; children: React.ReactNode; testID?: string }) {
  const [expanded, setExpanded] = useState(false);
  return <View><SettingsContentRow title={title} summary={summary} testID={testID} expanded={expanded} onPress={() => setExpanded(value => !value)} />{expanded && <View style={settingsContentStyles.details}>{children}</View>}</View>;
}
export const settingsContentStyles = StyleSheet.create({
  content: { width: '100%', maxWidth: 520, alignSelf: 'center', gap: 16 },
  group: { gap: 8 },
  heading: { color: colors.cyan, fontSize: 14, lineHeight: 20, fontWeight: '600', paddingHorizontal: 4 },
  surface: { backgroundColor: colors.card, borderRadius: 16, overflow: 'hidden' },
  row: { minHeight: 56, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  copy: { flex: 1, minWidth: 0, gap: 4 },
  title: { color: colors.text, fontSize: 16, lineHeight: 24 },
  supporting: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  chevron: { color: colors.muted, fontSize: 24, lineHeight: 28 },
  details: { paddingHorizontal: 16, paddingBottom: 16, gap: 10 },
  pressed: { backgroundColor: colors.raised },
});

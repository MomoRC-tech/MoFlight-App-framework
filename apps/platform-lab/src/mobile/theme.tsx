import React from 'react';
import { ImageBackground, Pressable, StyleSheet, Text, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';

export const colors = { background: '#020f19', card: '#091f32', raised: '#102a43', border: '#254761', text: '#f5f7ff', muted: '#adbed5', blue: '#279bff', cyan: '#46ccff', purple: '#231e63', orange: '#ff772b', green: '#48dba5' };
export function GliderMark({ color = colors.text, large = false }: { color?: string; large?: boolean }) {
  return <View accessible={false} style={{ width: large ? 68 : 28, height: 30, transform: [{ rotate: '-12deg' }] }}>
    <View style={{ position: 'absolute', width: large ? 66 : 28, height: 2, top: 11, backgroundColor: color, borderRadius: 2 }} />
    <View style={{ position: 'absolute', width: 2, height: 27, top: 0, left: large ? 33 : 13, backgroundColor: color, borderRadius: 2, transform: [{ rotate: '-22deg' }] }} />
    <View style={{ position: 'absolute', width: large ? 18 : 10, height: 2, top: 24, left: large ? 29 : 10, backgroundColor: color, borderRadius: 2 }} />
  </View>;
}
export function ClubMark({ color = colors.muted }: { color?: string }) {
  return <View accessible={false} style={{ width: 28, height: 30 }}>{[2, 14].map((left, index) => <View key={left} style={{ position: 'absolute', left, top: index ? 3 : 0 }}><View style={{ width: 8, height: 8, borderWidth: 1.5, borderColor: color, borderRadius: 4, marginLeft: 2 }} /><View style={{ width: 12, height: 16, borderWidth: 1.5, borderColor: color, borderRadius: 4, marginTop: 2 }} /></View>)}</View>;
}
export function Label({ children, muted = false, style, selectable }: { children: React.ReactNode; muted?: boolean; style?: StyleProp<import('react-native').TextStyle>; selectable?: boolean }) {
  return <Text selectable={selectable} style={[ui.text, muted && ui.muted, style]}>{children}</Text>;
}
export function Card({ children, style, onPress, label }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; label?: string }) {
  if (onPress) return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [ui.card, style, pressed && ui.pressed]}>{children}</Pressable>;
  return <View style={[ui.card, style]}>{children}</View>;
}
export function Action({ children, onPress, secondary = false, disabled = false, label }: { children: React.ReactNode; onPress: () => void; secondary?: boolean; disabled?: boolean; label?: string }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [ui.action, secondary && ui.secondary, disabled && { opacity: .5 }, pressed && ui.pressed]}><Text style={[ui.actionText, secondary && { color: colors.text }]}>{children}</Text></Pressable>;
}
export function Chip({ title, selected, onPress, disabled = false }: { title: string; selected?: boolean; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ selected: !!selected, disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [ui.chip, selected && ui.chipSelected, disabled && { opacity: .45 }, pressed && ui.pressed]}><Text style={[ui.chipText, selected && { color: '#031326', fontWeight: '700' }]}>{title}</Text></Pressable>;
}
export function Section({ title, action, onPress }: { title: string; action?: string; onPress?: () => void }) {
  return <View style={ui.section}><Text accessibilityRole="header" style={ui.heading}>{title}</Text>{action && onPress && <Pressable accessibilityRole="button" onPress={onPress} style={ui.smallAction}><Label style={{ color: colors.cyan }}>{action}</Label></Pressable>}</View>;
}
export function Empty({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={ui.empty}><Label style={{ fontWeight: '600' }}>{title}</Label><Label muted>{children}</Label></View>;
}
export function Photo({ source, children, style, tint }: { source?: ImageSourcePropType; children?: React.ReactNode; style?: StyleProp<ViewStyle>; tint?: string }) {
  if (!source) return <View style={[ui.photo, style]}>{children}</View>;
  return <ImageBackground source={source} resizeMode="cover" style={[ui.photo, style]} imageStyle={{ borderRadius: 16 }}><View style={[ui.shade, tint ? { backgroundColor: tint } : undefined]}>{children}</View></ImageBackground>;
}
export const ui = StyleSheet.create({
  text: { color: colors.text, fontSize: 14, lineHeight: 21 }, muted: { color: colors.muted },
  title: { color: colors.text, fontSize: 27, fontWeight: '700', letterSpacing: -.7 },
  heading: { color: colors.text, fontSize: 16, lineHeight: 23, fontWeight: '600' },
  card: { backgroundColor: colors.card, experimental_backgroundImage: 'linear-gradient(140deg, #102c46, #061824)', borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 14, gap: 9, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  grid: { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
  column: { flex: 1, minWidth: 0, gap: 8 },
  action: { minHeight: 48, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
  actionText: { color: '#031326', fontSize: 14, lineHeight: 21, fontWeight: '600' },
  secondary: { backgroundColor: colors.raised, borderWidth: 1, borderColor: colors.border },
  chip: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 24, paddingHorizontal: 15, paddingVertical: 12, justifyContent: 'center', alignItems: 'center', backgroundColor: '#071724' },
  chipSelected: { backgroundColor: colors.blue, borderColor: '#5fbaff' }, chipText: { color: colors.text, fontSize: 13, lineHeight: 20 },
  section: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  smallAction: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 4 },
  empty: { gap: 5, paddingVertical: 8 }, pressed: { opacity: .72 },
  photo: { backgroundColor: '#162a42', borderRadius: 16, overflow: 'hidden' },
  shade: { backgroundColor: '#00102288', padding: 14, gap: 7, flex: 1 },
});

import React from 'react';
import { ImageBackground, Pressable, StyleSheet, Text, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';
import { SymbolIcon, legacyIconTone, type SymbolName, type SymbolTone } from './SymbolIcon';

export const colors = { background: '#000d18', card: '#071929', raised: '#11263b', border: '#244760', text: '#f5f7ff', muted: '#adbed5', blue: '#3595fe', cyan: '#46ccff', purple: '#231e63', orange: '#fc6a2d', green: '#48dba5' };
export function GliderMark({ color = colors.text, large = false }: { color?: string; large?: boolean }) {
  return <SymbolIcon name="glider" size={large ? 68 : 28} tone={legacyIconTone(color)} />;
}
export function ClubMark({ color = colors.muted }: { color?: string }) {
  return <SymbolIcon name="club" size={28} tone={legacyIconTone(color)} tile />;
}
export function IconLabel({ name, children, size = 18, tone = 'default', muted = false, style }: {
  name: SymbolName; children: React.ReactNode; size?: number; tone?: SymbolTone; muted?: boolean; style?: StyleProp<import('react-native').TextStyle>;
}) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><SymbolIcon name={name} size={size} tone={tone} /><Label muted={muted} style={[{ flexShrink: 1 }, style]}>{children}</Label></View>;
}
export function Label({ children, muted = false, style, selectable }: { children: React.ReactNode; muted?: boolean; style?: StyleProp<import('react-native').TextStyle>; selectable?: boolean }) {
  return <Text selectable={selectable} style={[ui.text, muted && ui.muted, style]}>{children}</Text>;
}
export function Card({ children, style, onPress, label }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; label?: string }) {
  if (onPress) return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [ui.card, style, pressed && ui.pressed]}>{children}</Pressable>;
  return <View style={[ui.card, style]}>{children}</View>;
}
export function Action({ children, onPress, secondary = false, disabled = false, label, testID, icon }: { children: React.ReactNode; onPress: () => void; secondary?: boolean; disabled?: boolean; label?: string; testID?: string; icon?: SymbolName }) {
  return <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [ui.action, secondary && ui.secondary, disabled && { opacity: .5 }, pressed && ui.pressed]}><View style={ui.actionContent}>{icon && <SymbolIcon name={icon} size={20} tone={secondary ? 'default' : 'contrast'} />}<Text style={[ui.actionText, { flexShrink: 1 }, secondary && { color: colors.text }]}>{children}</Text></View></Pressable>;
}
export function Chip({ title, selected, onPress, disabled = false, icon }: { title: string; selected?: boolean; onPress: () => void; disabled?: boolean; icon?: SymbolName }) {
  // Recreate the native label when weight changes. Android retained the earlier
  // glyph layout and dropped the book suffix after selection at font scale 1.6.
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ selected: !!selected, disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [ui.chipTouch, disabled && { opacity: .45 }, pressed && ui.pressed]}><View style={[ui.chip, selected && ui.chipSelected, ui.actionContent]}><Text key={selected ? 'selected' : 'default'} style={[ui.chipText, selected && { color: '#031326', fontWeight: '700' }]}>{title}</Text>{icon && <SymbolIcon name={icon} size={16} tone={selected ? 'contrast' : 'muted'} />}</View></Pressable>;
}
export function Section({ title, action, onPress, icon }: { title: string; action?: string; onPress?: () => void; icon?: SymbolName }) {
  return <View style={ui.section}>{icon && <SymbolIcon name={icon} size={20} />}<Text accessibilityRole="header" style={[ui.heading, (icon || action && onPress) ? { flex: 1, minWidth: 0 } : undefined]}>{title}</Text>{action && onPress && <Pressable accessibilityRole="button" onPress={onPress} style={[ui.smallAction, { width: '40%' }]}><Label style={{ color: colors.cyan, width: '100%', textAlign: 'right' }}>{action}</Label></Pressable>}</View>;
}
export function Empty({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={ui.empty}><Label style={{ fontWeight: '600' }}>{title}</Label><Label muted>{children}</Label></View>;
}
export function Photo({ source, children, style, contentStyle, tint, radius = 14 }: { source?: ImageSourcePropType; children?: React.ReactNode; style?: StyleProp<ViewStyle>; contentStyle?: StyleProp<ViewStyle>; tint?: string; radius?: number }) {
  if (!source) return <View style={[ui.photo, style]}>{children}</View>;
  return <ImageBackground source={source} resizeMode="cover" style={[ui.photo, { borderRadius: radius }, style]} imageStyle={{ borderRadius: radius }}><View style={[ui.shade, tint ? { backgroundColor: tint } : undefined, contentStyle]}>{children}</View></ImageBackground>;
}
export const ui = StyleSheet.create({
  text: { color: colors.text, fontSize: 13, lineHeight: 18 }, muted: { color: colors.muted },
  title: { color: colors.text, fontSize: 26, fontWeight: '700', letterSpacing: -.6 },
  heading: { color: colors.text, fontSize: 15, lineHeight: 20, fontWeight: '600' },
  card: { backgroundColor: colors.card, experimental_backgroundImage: 'linear-gradient(140deg, #0c2d4a, #04131e)', borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 11, gap: 6, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  grid: { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
  column: { flex: 1, minWidth: 0, gap: 8 },
  action: { minHeight: 48, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
  actionText: { color: '#031326', fontSize: 13, lineHeight: 18, fontWeight: '600' },
  actionContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  secondary: { backgroundColor: colors.raised, borderWidth: 1, borderColor: colors.border },
  chipTouch: { minHeight: 48, justifyContent: 'center' },
  chip: { minHeight: 34, minWidth: 66, borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingHorizontal: 13, paddingVertical: 6, justifyContent: 'center', alignItems: 'center', backgroundColor: '#061522' },
  chipSelected: { backgroundColor: colors.blue, experimental_backgroundImage: 'linear-gradient(180deg, #46acff, #238bf5)', borderColor: '#68baff', boxShadow: '0 0 7px #1889ff55' }, chipText: { color: colors.text, fontSize: 13, lineHeight: 20 },
  section: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  smallAction: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 4 },
  empty: { gap: 4, paddingVertical: 5 }, pressed: { opacity: .72 },
  photo: { backgroundColor: '#162a42', borderRadius: 16, overflow: 'hidden' },
  shade: { backgroundColor: '#00102277', padding: 12, gap: 6, flex: 1 },
});

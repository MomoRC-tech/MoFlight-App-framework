import React from 'react';
import { ImageBackground, Pressable, StyleSheet, Text, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';
import { SymbolIcon, legacyIconTone, type SymbolName, type SymbolTone } from './SymbolIcon';

// Content, shell and Start tiles have separately scoped surface roles.
export const colors = { background: '#001b29', card: '#103546', raised: '#1a4356', border: '#31586b', text: '#f4f8fc', muted: '#a9bed3', blue: '#27d3d2', cyan: '#27d3d2', purple: '#231e63', orange: '#fc6a2d', green: '#48dba5' };
export const startSurfaces = { card: '#062331', raised: '#0c3041', border: '#183d50' };
// Brighter Start tiles; keep the header/bottom-navigation palette above unchanged.
export const startTileSurfaces = { card: '#164154', raised: '#235469', border: '#60889e' };
export function GliderMark({ color = colors.text, large = false }: { color?: string; large?: boolean }) {
  return <SymbolIcon name="glider" size={large ? 68 : 28} tone={legacyIconTone(color)} />;
}
export function ClubMark({ color = colors.muted }: { color?: string }) {
  return <SymbolIcon name="club" size={28} tone={legacyIconTone(color)} />;
}
export function IconLabel({ name, children, size = 18, tone = 'default', muted = false, style }: {
  name: SymbolName; children: React.ReactNode; size?: number; tone?: SymbolTone; muted?: boolean; style?: StyleProp<import('react-native').TextStyle>;
}) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><SymbolIcon name={name} size={size} tone={tone} /><Label muted={muted} style={[{ flexShrink: 1 }, style]}>{children}</Label></View>;
}
export function Label({ children, muted = false, style, selectable }: { children: React.ReactNode; muted?: boolean; style?: StyleProp<import('react-native').TextStyle>; selectable?: boolean }) {
  return <Text selectable={selectable} style={[ui.text, muted && ui.muted, style]}>{children}</Text>;
}
export function Card({ children, style, onPress, label, surface = 'content' }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; label?: string; surface?: 'content' | 'start' }) {
  const cardStyle = [ui.card, surface === 'start' && ui.startCard, style];
  if (onPress) return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [cardStyle, pressed && ui.pressed]}>{children}</Pressable>;
  return <View style={cardStyle}>{children}</View>;
}
export function Action({ children, onPress, secondary = false, disabled = false, label, testID, icon, surface = 'content' }: { children: React.ReactNode; onPress: () => void; secondary?: boolean; disabled?: boolean; label?: string; testID?: string; icon?: SymbolName; surface?: 'content' | 'start' }) {
  return <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [ui.actionTouch, secondary && ui.secondaryTouch, disabled && { opacity: .5 }, pressed && ui.pressed]}><View style={[ui.action, secondary && ui.secondary, secondary && surface === 'start' && ui.startSecondary]}><View style={ui.actionContent}>{icon && <SymbolIcon name={icon} size={20} tone={secondary ? 'default' : 'contrast'} />}<Text style={[ui.actionText, { flexShrink: 1 }, secondary && { color: colors.text }]}>{children}</Text></View></View></Pressable>;
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
  text: { color: colors.text, fontSize: 15, lineHeight: 22 }, muted: { color: colors.muted },
  title: { color: colors.text, fontSize: 26, fontWeight: '700', letterSpacing: -.6 },
  heading: { color: colors.text, fontSize: 19, lineHeight: 26, fontWeight: '600' },
  card: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 16, gap: 10, overflow: 'hidden' },
  startCard: { backgroundColor: startTileSurfaces.card, borderColor: startTileSurfaces.border },
  headerAction: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  cockpitImage: { opacity: .82 },
  cockpitShade: { backgroundColor: '#001b2944' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  grid: { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
  column: { flex: 1, minWidth: 0, gap: 8 },
  actionTouch: { minHeight: 48, minWidth: 48, justifyContent: 'center', maxWidth: '100%' },
  secondaryTouch: { alignSelf: 'flex-start' },
  action: { minHeight: 40, minWidth: 48, alignSelf: 'stretch', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
  actionText: { color: '#031326', fontSize: 15, lineHeight: 22, fontWeight: '600' },
  actionContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  secondary: { backgroundColor: colors.raised, borderWidth: 1, borderColor: colors.border },
  startSecondary: { backgroundColor: startTileSurfaces.raised, borderColor: startTileSurfaces.border },
  chipTouch: { minHeight: 48, justifyContent: 'center' },
  chip: { minHeight: 40, minWidth: 66, borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.card },
  chipSelected: { backgroundColor: colors.blue, borderColor: colors.blue }, chipText: { color: colors.text, fontSize: 14, lineHeight: 20 },
  section: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  smallAction: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 4 },
  empty: { gap: 4, paddingVertical: 5 }, pressed: { opacity: .72 },
  photo: { backgroundColor: '#162a42', borderRadius: 16, overflow: 'hidden' },
  shade: { backgroundColor: '#00102277', padding: 12, gap: 6, flex: 1 },
});

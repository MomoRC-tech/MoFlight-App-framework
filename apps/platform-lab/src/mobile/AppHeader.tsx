import React from 'react';
import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions, type ImageSourcePropType } from 'react-native';
import { Photo, colors } from './theme';
import { SymbolIcon } from './SymbolIcon';

const brandLogo = require('../../assets/branding/moflight-ai-logo-dark.png');

/** One app-owned active header; controls never enter the provider document. */
export function AppHeader({ title, subtitle, source, back, backDisabled = false, children }: {
  title: string; subtitle?: string; source?: ImageSourcePropType;
  back?: () => void; backDisabled?: boolean; children: React.ReactNode;
}) {
  const { width, fontScale } = useWindowDimensions();
  const secondRow = fontScale > 1.3;
  const controls = <View style={[styles.controls, secondRow && styles.controlsSecondRow]}>{children}</View>;
  return <Photo source={source} radius={0} style={styles.header} contentStyle={styles.content} tint="#001022df">
    <View style={styles.row}>
      {back ? <Pressable accessibilityRole="button" accessibilityLabel="Zur vorherigen App-Ansicht" accessibilityState={{ disabled: backDisabled }} disabled={backDisabled} onPress={back} style={[styles.back, backDisabled && { opacity: .5 }]}><SymbolIcon name="back" size={28} tone="contrast" /></Pressable>
        : <Image source={brandLogo} accessibilityLabel="MoFlight Thermik Logo" style={styles.logo} resizeMode="contain" />}
      <View style={styles.titleGroup}><Text accessibilityRole="header" numberOfLines={1} style={styles.title}>{title}</Text>
        {subtitle && width >= 412 && !secondRow && <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>}
      </View>
      {!secondRow && controls}
    </View>
    {secondRow && controls}
  </Photo>;
}

const styles = StyleSheet.create({
  header: { width: '100%', maxWidth: 960, alignSelf: 'center', borderBottomWidth: 1, borderBottomColor: colors.border },
  content: { flex: 0, paddingHorizontal: 10, paddingVertical: 5, gap: 4, minHeight: 64 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, flexShrink: 0 },
  controlsSecondRow: { width: '100%', flexWrap: 'wrap' },
  titleGroup: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontSize: 18, lineHeight: 24, fontWeight: '700' },
  subtitle: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  logo: { width: 52, height: 52, borderRadius: 8 },
  back: { width: 48, height: 48, borderRadius: 16, backgroundColor: '#a4adff', borderWidth: 1, borderColor: '#d0d5ff', alignItems: 'center', justifyContent: 'center' },
});

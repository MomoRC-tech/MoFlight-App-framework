import React from 'react';
import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions, type ImageSourcePropType } from 'react-native';
import { colors } from './theme';
import { SymbolIcon } from './SymbolIcon';
import { FlightScene } from './FlightScene';

const brandLogo = require('../../assets/branding/moflight-ai-logo-dark.png');

/** One app-owned active header; controls never enter the provider document. */
export function AppHeader({ title, subtitle, back, backDisabled = false, children }: {
  title: string; subtitle?: string; source?: ImageSourcePropType;
  back?: () => void; backDisabled?: boolean; children: React.ReactNode;
}) {
  const { width, fontScale } = useWindowDimensions();
  const secondRow = width < 600 || fontScale > 1.3;
  const controls = <View style={[styles.controls, secondRow && styles.controlsSecondRow]}>{children}</View>;
  return <View style={[styles.header, styles.content]}>
    <FlightScene />
    <View style={styles.row}>
      {back ? <Pressable accessibilityRole="button" accessibilityLabel="Zur vorherigen App-Ansicht" accessibilityState={{ disabled: backDisabled }} disabled={backDisabled} onPress={back} style={[styles.back, backDisabled && { opacity: .5 }]}><SymbolIcon name="back" size={28} tone="contrast" /></Pressable>
        : <Image source={brandLogo} accessibilityLabel="MoFlight Thermik Logo" style={styles.logo} resizeMode="contain" />}
      <View style={styles.titleGroup}><Text accessibilityRole="header" style={styles.title}>{title}</Text>
        {subtitle && !secondRow && <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>}
      </View>
      {!secondRow && controls}
    </View>
    {secondRow && controls}
  </View>;
}

const styles = StyleSheet.create({
  header: { width: '100%', maxWidth: 960, alignSelf: 'center', backgroundColor: colors.background, overflow: 'hidden', borderBottomWidth: 1, borderBottomColor: '#26444b' },
  content: { flex: 0, paddingHorizontal: 18, paddingVertical: 10, gap: 10, minHeight: 64 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, flexShrink: 0 },
  controlsSecondRow: { width: '100%', flexWrap: 'wrap', justifyContent: 'flex-start', gap: 8 },
  titleGroup: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -.7 },
  subtitle: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  logo: { width: 46, height: 46, borderRadius: 10 },
  back: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
});

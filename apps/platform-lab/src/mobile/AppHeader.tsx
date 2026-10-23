import React from 'react';
import { Image, Pressable, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import { colors } from './theme';
import { SymbolIcon } from './SymbolIcon';
const brandLogo = require('../../assets/branding/moflight-ai-logo-dark.png');
/** Original, unmodified brand asset; one flowing toolbar on every route. */
export function AppHeader({ title, back, backDisabled = false, children, profile }: {
  title: string; subtitle?: string; source?: ImageSourcePropType;
  back?: () => void; backDisabled?: boolean; children: React.ReactNode; profile?: React.ReactNode;
}) {
  return <View style={styles.header}><View style={styles.row}>
    {back ? <Pressable accessibilityRole="button" accessibilityLabel="Zur vorherigen App-Ansicht" accessibilityState={{ disabled: backDisabled }} disabled={backDisabled} onPress={back} style={[styles.back, backDisabled && { opacity: .5 }]}><SymbolIcon name="back" size={24} /></Pressable>
      : <Image source={brandLogo} accessibilityLabel="MoFlight Thermik Logo" style={styles.logo} resizeMode="contain" />}
    <View style={styles.body}><Text style={styles.brand}>MoFlight <Text style={styles.ai}>AI</Text></Text><Text accessibilityRole="header" style={styles.title}>{title}</Text></View>
    <View style={styles.controls}>{children}{profile}</View>
  </View></View>;
}
const styles = StyleSheet.create({
  header: { width: '100%', maxWidth: 960, alignSelf: 'center', backgroundColor: colors.background, paddingHorizontal: 12, paddingVertical: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 60 },
  body: { flex: 1, minWidth: 0 }, controls: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  brand: { color: colors.text, fontSize: 19, lineHeight: 25, fontWeight: '700' }, ai: { color: colors.cyan, fontSize: 13 },
  title: { color: colors.muted, fontSize: 12, lineHeight: 18 }, logo: { width: 48, height: 48, borderRadius: 8 },
  back: { width: 48, height: 48, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
});

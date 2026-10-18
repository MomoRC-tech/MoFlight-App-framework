import React from 'react';
import { Image, StyleSheet, Text, View, useWindowDimensions, type ImageSourcePropType } from 'react-native';
import { Action, Photo, colors } from './theme';

const brandLogo = require('../../assets/branding/moflight-ai-logo-dark.png');

/** One app-owned active header; controls never enter the provider document. */
export function AppHeader({ title, subtitle, source, back, children }: {
  title: string; subtitle?: string; source?: ImageSourcePropType;
  back?: () => void; children: React.ReactNode;
}) {
  const { width, fontScale } = useWindowDimensions();
  const secondRow = fontScale > 1.3;
  const controls = <View style={styles.controls}>{children}</View>;
  return <Photo source={source} radius={0} style={styles.header} contentStyle={styles.content} tint="#001022df">
    <View style={styles.row}>
      {back ? <View style={styles.back}><Action secondary label="Zur vorherigen App-Ansicht" onPress={back}>‹</Action></View>
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
  titleGroup: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontSize: 18, lineHeight: 24, fontWeight: '700' },
  subtitle: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  logo: { width: 52, height: 52, borderRadius: 8 }, back: { width: 48 },
});

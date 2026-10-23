import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { SymbolIcon, type SymbolName } from './SymbolIcon';
import { Label, colors } from './theme';

/** Saved source label only; the airfield is decorative, never a club/location claim. */
export function ClubHeading({ clubLabel }: { clubLabel?: string | null }) {
  const name = clubLabel?.trim();
  return <><View style={styles.heading}>
    <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
      <Image source={require('../../assets/aviation/club-heading-airfield-v2.png')} resizeMode="cover" style={styles.image} />
      <View style={styles.leadingShade} />
    </View>
    <SymbolIcon name="club" size={20} />
    <Text accessibilityRole="header" style={styles.title}>{name ? `Mein Verein: ${name}` : 'Mein Verein'}</Text>
  </View>{!name && <Label muted>Vereinsname unbekannt</Label>}</>;
}

/** A quieter hierarchy within a club card, using the maintained symbol family. */
export function ClubSubheading({ title, icon = 'duty' }: { title: string; icon?: SymbolName }) {
  return <View style={styles.subheading}>
    <SymbolIcon name={icon} size={16} />
    <Text accessibilityRole="header" style={styles.subtitle}>{title}</Text>
  </View>;
}

const styles = StyleSheet.create({
  heading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: -18, paddingHorizontal: 18, overflow: 'hidden' },
  image: { position: 'absolute', right: 0, top: -14, width: 160, height: 54 },
  leadingShade: { position: 'absolute', top: 0, bottom: 0, left: 0, right: '35%', backgroundColor: '#14232f66' },
  title: { flex: 1, minWidth: 0, color: colors.text, fontSize: 18, lineHeight: 26, fontWeight: '600', textShadowColor: '#14232f', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  subheading: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: colors.raised, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  subtitle: { flex: 1, minWidth: 0, color: colors.text, fontSize: 14, lineHeight: 22, fontWeight: '600' },
});

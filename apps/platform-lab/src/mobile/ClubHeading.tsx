import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolIcon, type SymbolName } from './SymbolIcon';
import { Label, colors } from './theme';

/** Saved source label only; the airfield is decorative, never a club/location claim. */
export function ClubHeading({ clubLabel, location, onOpen }: { clubLabel?: string | null; location?: string | null; onOpen?: () => void }) {
  const name=clubLabel?.trim();
  const content=<><SymbolIcon name="club" size={24}/><View style={{flex:1,minWidth:0}}><Label muted style={{fontSize:11,lineHeight:16}}>Mein Verein</Label><Text accessibilityRole="header" style={styles.title}>{name||'Vereinsname unbekannt'}</Text><Label muted style={{fontSize:12,lineHeight:18}}>{location||'Ort unbekannt'}</Label></View><Image accessible={false} source={require('../../assets/aviation/club-heading-airfield-v2.png')} resizeMode="cover" style={styles.image}/>{onOpen&&<SymbolIcon name="right" size={18}/>}</>;
  return onOpen?<Pressable accessibilityRole="button" accessibilityLabel={`Mein Verein: ${name||'Name unbekannt'}. Vereinsübersicht öffnen`} onPress={onOpen} style={styles.heading}>{content}</Pressable>:<View style={styles.heading}>{content}</View>;
}

/** A quieter hierarchy within a club card, using the maintained symbol family. */
export function ClubSubheading({ title, icon = 'duty' }: { title: string; icon?: SymbolName }) {
  return <View style={styles.subheading}>
    <SymbolIcon name={icon} size={16} />
    <Text accessibilityRole="header" style={styles.subtitle}>{title}</Text>
  </View>;
}

const styles = StyleSheet.create({
  heading: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 10, borderBottomWidth: 1, borderColor: colors.border },
  image: { width: 64, height: 48, borderRadius: 10 },
  leadingShade: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: '#14232f88' },
  title: { color: colors.text, fontSize: 15, lineHeight: 21, fontWeight: '600' },
  subheading: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: colors.raised, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  subtitle: { flex: 1, minWidth: 0, color: colors.text, fontSize: 14, lineHeight: 22, fontWeight: '600' },
});

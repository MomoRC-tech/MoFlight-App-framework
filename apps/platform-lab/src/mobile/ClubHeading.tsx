import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolIcon, type SymbolName } from './SymbolIcon';
import { Label, colors, startTileSurfaces } from './theme';

/** Saved source label only; the airfield is decorative, never a club/location claim. */
export function ClubHeading({ clubLabel, onOpen }: { clubLabel?: string | null; onOpen?: () => void }) {
  const name=clubLabel?.trim();
  const content=<View style={styles.heading}><SymbolIcon name="club" size={24}/><View style={{flex:1,minWidth:0}}><Label muted style={styles.caption}>MEIN VEREIN</Label><Text accessibilityRole="header" style={styles.title}>{name||'Vereinsname unbekannt'}</Text></View>{onOpen&&<SymbolIcon name="right" size={18}/>}</View>;
  return onOpen?<Pressable accessibilityRole="button" accessibilityLabel={`Mein Verein: ${name||'Name unbekannt'}. Vereinsübersicht öffnen`} onPress={onOpen} style={styles.frame}>{content}</Pressable>:<View style={styles.frame}>{content}</View>;
}

/** A quieter hierarchy within a club card, using the maintained symbol family. */
export function ClubSubheading({ title, icon = 'duty', surface = 'content' }: { title: string; icon?: SymbolName; surface?: 'content' | 'start' }) {
  return <View style={[styles.subheading, surface === 'start' && { backgroundColor: startTileSurfaces.raised }]}>
    <SymbolIcon name={icon} size={16} />
    <Text accessibilityRole="header" style={styles.subtitle}>{title}</Text>
  </View>;
}

const styles = StyleSheet.create({
  frame: { marginHorizontal:-12,marginTop:-12,borderBottomWidth:1,borderColor:startTileSurfaces.border },
  heading: { minHeight:64,flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:12,paddingVertical:10,backgroundColor:colors.raised,experimental_backgroundImage:'linear-gradient(115deg, #51436d55, #292d4300)' },
  caption: { fontSize:10,lineHeight:16,letterSpacing:1.5,color:colors.muted,textShadowColor:colors.background,textShadowOffset:{width:0,height:1},textShadowRadius:3 },
  title: { color:colors.text,fontSize:15,lineHeight:21,fontWeight:'600',textShadowColor:colors.background,textShadowOffset:{width:0,height:1},textShadowRadius:3 },
  subheading: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: colors.raised, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  subtitle: { flex: 1, minWidth: 0, color: colors.text, fontSize: 14, lineHeight: 22, fontWeight: '600' },
});

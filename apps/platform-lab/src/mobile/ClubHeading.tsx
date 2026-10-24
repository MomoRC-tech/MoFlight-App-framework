import React from 'react';
import { ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolIcon, type SymbolName } from './SymbolIcon';
import { Label, colors, ui } from './theme';

/** Saved source label only; the airfield is decorative, never a club/location claim. */
export function ClubHeading({ clubLabel, location, onOpen }: { clubLabel?: string | null; location?: string | null; onOpen?: () => void }) {
  const name=clubLabel?.trim();
  const content=<ImageBackground accessible={false} source={require('../../assets/aviation/club-heading-airfield-v2.png')} resizeMode="cover" imageStyle={ui.cockpitImage} style={{width:'100%'}}><View style={[ui.cockpitShade,styles.heading]}><SymbolIcon name="club" size={24}/><View style={{flex:1,minWidth:0}}><Label muted style={styles.caption}>Mein Verein</Label><Text accessibilityRole="header" style={styles.title}>{name||'Vereinsname unbekannt'}</Text><Label muted style={styles.caption}>{location||'Ort unbekannt'}</Label></View>{onOpen&&<SymbolIcon name="right" size={18}/>}</View></ImageBackground>;
  return onOpen?<Pressable accessibilityRole="button" accessibilityLabel={`Mein Verein: ${name||'Name unbekannt'}. Vereinsübersicht öffnen`} onPress={onOpen} style={styles.frame}>{content}</Pressable>:<View style={styles.frame}>{content}</View>;
}

/** A quieter hierarchy within a club card, using the maintained symbol family. */
export function ClubSubheading({ title, icon = 'duty' }: { title: string; icon?: SymbolName }) {
  return <View style={styles.subheading}>
    <SymbolIcon name={icon} size={16} />
    <Text accessibilityRole="header" style={styles.subtitle}>{title}</Text>
  </View>;
}

const styles = StyleSheet.create({
  frame: { marginHorizontal:-16,marginTop:-16,borderBottomWidth:1,borderColor:colors.border },
  heading: { minHeight:80,flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:16,paddingVertical:12 },
  caption: { fontSize:12,lineHeight:18,color:colors.muted,textShadowColor:colors.background,textShadowOffset:{width:0,height:1},textShadowRadius:3 },
  title: { color:colors.text,fontSize:15,lineHeight:21,fontWeight:'600',textShadowColor:colors.background,textShadowOffset:{width:0,height:1},textShadowRadius:3 },
  subheading: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: colors.raised, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  subtitle: { flex: 1, minWidth: 0, color: colors.text, fontSize: 14, lineHeight: 22, fontWeight: '600' },
});

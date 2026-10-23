import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Label, colors, ui } from './theme';
import { SymbolIcon } from './SymbolIcon';
import { medicalExpiry } from './medical-expiry';
import type { InformationCapture } from '../vereinsflieger/information';

export function OverviewTiles({medical = null, now, onMedical, onPaper, pending = null, bookName = null}: {
  medical?: InformationCapture | null; now: number; onMedical: () => void; onPaper: () => void; pending?: number | null; bookName?: string | null;
}) {
  const assessment = medicalExpiry(medical, now);
  return <View style={styles.row}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Medical. ${assessment.date ? `Erfasstes Ablaufdatum ${assessment.date}` : 'Ablaufdatum unbekannt'}. Details öffnen`} onPress={onMedical} style={({pressed})=>[styles.tile,pressed&&ui.pressed]}>
      <SymbolIcon name="medical-card" size={28}/><View style={styles.copy}><Label style={styles.title}>Medical</Label><Label muted style={styles.small}>{assessment.date?'Erfasst bis':'Status unbekannt'}</Label>{assessment.date&&<Label style={[styles.value,{color:assessment.state==='expired'?'#ff7777':assessment.state==='soon'?'#f9b65b':colors.text}]}>{assessment.date}{assessment.issues.length?'*':''}</Label>}<Label style={styles.link}>Details ›</Label></View>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={`Papierflugbuch. ${bookName ? `${bookName}, ${pending === null ? 'Papierstand unbekannt' : pending+' Flüge offen'}` : 'Einrichtung in Vorbereitung'}. Öffnen`} onPress={onPaper} style={({pressed})=>[styles.tile,pressed&&ui.pressed]}>
      <SymbolIcon name="book" size={28}/><View style={styles.copy}><Label style={styles.title}>Papierflugbuch</Label><Label muted style={styles.small}>{bookName??'Noch nicht eingerichtet'}</Label><Label style={styles.link}>{bookName?(pending===null?'Stand ansehen ›':`${pending} offen ›`):'In Vorbereitung ›'}</Label></View>
    </Pressable>
  </View>;
}
const styles = StyleSheet.create({
  row:{flexDirection:'row',gap:8,width:'100%',maxWidth:520,alignSelf:'center'},
  tile:{flex:1,minWidth:0,minHeight:100,padding:12,gap:8,flexDirection:'row',flexWrap:'wrap',alignItems:'flex-start',borderWidth:1,borderColor:colors.border,borderRadius:16,backgroundColor:colors.card},
  copy:{flex:1,minWidth:90,gap:2},title:{fontSize:14,lineHeight:20,fontWeight:'600'},small:{fontSize:12,lineHeight:18},value:{fontWeight:'600',fontSize:14,lineHeight:20},link:{fontSize:12,lineHeight:18,color:colors.cyan},
});

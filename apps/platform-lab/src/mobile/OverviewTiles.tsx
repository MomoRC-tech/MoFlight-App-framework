import React from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Label, colors, ui } from './theme';
import { SymbolIcon } from './SymbolIcon';
import { medicalExpiry, medicalExpiryStatusText } from './medical-expiry';
import type { InformationCapture } from '../vereinsflieger/information';

export function OverviewTiles({medical = null, now, onMedical, onPaper, pending = null, bookName = null}: {
  medical?: InformationCapture | null; now: number; onMedical: () => void; onPaper: () => void; pending?: number | null; bookName?: string | null;
}) {
  const assessment = medicalExpiry(medical, now);
  const kindPosition = medical?.columns.findIndex(column => column.key === 'kind') ?? -1;
  const entries = medical?.rows.map(row => {
    const expiry = medicalExpiry({ ...medical, rows: [row] }, now);
    const name = row.values[kindPosition]?.trim() || 'Medical-Art unbekannt';
    return { ...expiry, name, text: `${name} bis ${expiry.date ?? 'unbekannt'}` };
  }) ?? [];
  const medicalDescription = entries.length
    ? entries.map(entry => `${entry.text}. ${medicalExpiryStatusText(entry.state)}`).join('. ')
    : 'Ablaufdatum unbekannt';
  const {fontScale}=useWindowDimensions();
  return <View style={[styles.row,fontScale>1.3&&{flexDirection:'column'}]}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Medical. ${medicalDescription}.${entries.length && assessment.issues.length ? ' Quellenangaben teilweise unbekannt oder uneindeutig.' : ''} Details öffnen`} onPress={onMedical} style={({pressed})=>[styles.tile,fontScale>1.3&&{flex:0,width:'100%'},pressed&&ui.pressed]}>
      <SymbolIcon name="medical-card" size={28}/><View style={styles.copy}><Label style={styles.title}>Medical</Label>{entries.length ? entries.map((entry,index)=><Label key={index} style={[styles.value,{color:entry.state==='expired'?'#ff7777':entry.state==='soon'?'#f9b65b':colors.text}]}>{entry.text}{assessment.issues.length?'*':''}</Label>) : <Label muted style={styles.small}>Status unbekannt</Label>}<Label style={styles.link}>Details ›</Label></View>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={`Papierflugbuch. ${bookName ? `${bookName}, ${pending === null ? 'Papierstand unbekannt' : pending+' Flüge offen'}` : 'Einrichtung in Vorbereitung'}. Öffnen`} onPress={onPaper} style={({pressed})=>[styles.tile,fontScale>1.3&&{flex:0,width:'100%'},pressed&&ui.pressed]}>
      <SymbolIcon name="book" size={28}/><View style={styles.copy}><Label style={styles.title}>Papierflugbuch</Label><Label muted style={styles.small}>{bookName??'Noch nicht eingerichtet'}</Label><Label style={styles.link}>{bookName?(pending===null?'Stand ansehen ›':`${pending} offen ›`):'In Vorbereitung ›'}</Label></View>
    </Pressable>
  </View>;
}
const styles = StyleSheet.create({
  row:{flexDirection:'row',gap:8,width:'100%',maxWidth:520,alignSelf:'center'},
  tile:{flex:1,minWidth:0,minHeight:100,padding:12,gap:8,flexDirection:'row',flexWrap:'wrap',alignItems:'flex-start',borderWidth:1,borderColor:colors.border,borderRadius:16,backgroundColor:colors.card},
  copy:{flex:1,minWidth:90,gap:2},title:{fontSize:14,lineHeight:20,fontWeight:'600'},small:{fontSize:12,lineHeight:18},value:{fontWeight:'600',fontSize:14,lineHeight:20},link:{fontSize:12,lineHeight:18,color:colors.cyan},
});

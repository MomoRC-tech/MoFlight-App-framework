import React from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Label, colors as contentColors, startTileSurfaces, ui } from './theme';
import { SymbolIcon } from './SymbolIcon';
import { medicalExpiry, medicalExpiryStatusText } from './medical-expiry';
import type { InformationCapture } from '../vereinsflieger/information';

const colors = { ...contentColors, ...startTileSurfaces };
const expiryBadges = {
  later: { symbol: '✓', color: '#48dba5', backgroundColor: '#123f38' },
  soon: { symbol: '!', color: '#f9b65b', backgroundColor: '#513b22' },
  expired: { symbol: '×', color: '#ff7777', backgroundColor: '#512c36' },
  unknown: { symbol: '?', color: '#a9bed3', backgroundColor: '#293e4c' },
};

export function OverviewTiles({medical = null, medicalLoading = false, now, onMedical, onPaper, pending = null, bookName = null}: {
  medicalLoading?: boolean; medical?: InformationCapture | null; now: number; onMedical: () => void; onPaper: () => void; pending?: number | null; bookName?: string | null;
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
    : medicalLoading ? 'Gespeicherte Angaben werden geladen' : 'Ablaufdatum unbekannt';
  const {fontScale}=useWindowDimensions();
  return <View style={[styles.row,fontScale>1.3&&{flexDirection:'column'}]}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Medical. ${medicalDescription}.${entries.length && assessment.issues.length ? ' Quellenangaben teilweise unbekannt oder uneindeutig.' : ''} Details öffnen`} onPress={onMedical} style={({pressed})=>[styles.tile,fontScale>1.3&&{flex:0,width:'100%'},styles.medicalTile,pressed&&ui.pressed]}>
      <View style={styles.medicalCopy}><View style={styles.medicalHeading}>
        <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.medicalHeaderBackground}><View style={styles.medicalHeaderMotif}><SymbolIcon name="medical-card" size={44}/></View></View>
        <SymbolIcon name="medical-card" size={20}/><Label style={styles.title}>Medical</Label>
      </View>{entries.length ? entries.map((entry,index)=>{
        const badge=expiryBadges[entry.state];
        return <View key={index} style={styles.medicalRow}>
          <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.medicalBadge,{backgroundColor:badge.backgroundColor,borderColor:badge.color}]}><Text numberOfLines={1} style={[styles.medicalBadgeText,{color:badge.color}]}>{badge.symbol}</Text></View>
          <Text numberOfLines={1} ellipsizeMode="tail" style={[ui.text,styles.medicalName]}>{entry.name}</Text><Text numberOfLines={1} style={[ui.text,styles.medicalDate,{color:entry.state==='expired'?'#ff7777':entry.state==='soon'?'#f9b65b':colors.text}]}>{entry.date??'unbekannt'}{assessment.issues.length?'*':''}</Text>
        </View>;
      }) : <Label muted style={styles.small}>{medicalLoading?'Wird geladen…':'Status unbekannt'}</Label>}<Label style={styles.link}>Details ›</Label></View>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={`Papierflugbuch. ${bookName ? `${bookName}, ${pending === null ? 'Papierstand unbekannt' : pending+' Flüge offen'}` : 'Einrichtung in Vorbereitung'}. Öffnen`} onPress={onPaper} style={({pressed})=>[styles.tile,fontScale>1.3&&{flex:0,width:'100%'},pressed&&ui.pressed]}>
      <SymbolIcon name="book" size={28}/><View style={styles.copy}><Label style={styles.title}>Papierflugbuch</Label><Label muted style={styles.small}>{bookName??'Noch nicht eingerichtet'}</Label><Label style={styles.link}>{bookName?(pending===null?'Stand ansehen ›':`${pending} offen ›`):'In Vorbereitung ›'}</Label></View>
    </Pressable>
  </View>;
}
const styles = StyleSheet.create({
  row:{flexDirection:'row',gap:8,width:'100%',maxWidth:520,alignSelf:'center'},
  tile:{flex:1,minWidth:0,minHeight:100,padding:12,gap:8,flexDirection:'row',flexWrap:'wrap',alignItems:'flex-start',borderWidth:1,borderColor:colors.border,borderRadius:16,backgroundColor:colors.card},
  copy:{flex:1,minWidth:90,gap:2},title:{fontSize:14,lineHeight:20,fontWeight:'600'},small:{fontSize:12,lineHeight:18},link:{fontSize:12,lineHeight:18,color:colors.cyan},
  medicalTile:{overflow:'hidden'},medicalCopy:{width:'100%',minWidth:0,gap:4},medicalHeading:{flexDirection:'row',alignItems:'center',gap:6},
  // Paint into the existing tile inset: the title/rows add no vertical space.
  medicalHeaderBackground:{position:'absolute',top:-12,left:-12,right:-12,bottom:-2,overflow:'hidden',backgroundColor:colors.raised,experimental_backgroundImage:'linear-gradient(110deg, #235469, #103546)',borderBottomWidth:1,borderBottomColor:colors.border},
  medicalHeaderMotif:{position:'absolute',right:8,top:-5,opacity:.18},
  medicalRow:{flexDirection:'row',alignItems:'center',gap:4},medicalName:{flex:1,minWidth:0,fontSize:12,lineHeight:18},medicalDate:{flexShrink:0,fontWeight:'600',fontSize:12,lineHeight:18,fontVariant:['tabular-nums']},
  medicalBadge:{minWidth:14.4,minHeight:14.4,paddingHorizontal:2.4,borderRadius:99,borderWidth:.8,alignItems:'center',justifyContent:'center'},medicalBadgeText:{fontSize:9.6,lineHeight:14.4,fontWeight:'700',textAlign:'center'},
});

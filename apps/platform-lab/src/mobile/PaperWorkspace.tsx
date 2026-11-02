import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Action, Card, Label, colors } from './theme';
import { SymbolIcon } from './SymbolIcon';

export function PaperWorkspace({onFlights}:{onFlights:()=>void}) {
  return <View style={s.page}>
    <View style={s.intro}><SymbolIcon name="book" size={36} tone="paper"/><Label style={s.title}>Vom Flug ins Buch</Label></View>
    <Card>
      <View style={s.step}><Label style={s.number}>01</Label><View style={s.copy}><Label style={s.stepTitle}>Flüge prüfen</Label><Action onPress={onFlights}>Flugliste öffnen</Action></View></View>
      <View style={s.step}><Label muted style={s.number}>02</Label><View style={s.copy}><Label style={s.stepTitle}>Papierstand abgleichen</Label><Label style={s.soon}>In Vorbereitung</Label></View></View>
      <View style={s.step}><Label muted style={s.number}>03</Label><View style={s.copy}><Label style={s.stepTitle}>Schreibvorlage</Label><Label style={s.soon}>In Vorbereitung</Label></View></View>
    </Card>
    <Label muted style={s.note}>Hier wird kein Flug als abgeschrieben markiert.</Label>
  </View>;
}
const s=StyleSheet.create({page:{maxWidth:560,width:'100%',alignSelf:'center',gap:24},intro:{gap:14,paddingTop:20},title:{fontSize:32,lineHeight:40,fontWeight:'600',letterSpacing:-.7},step:{flexDirection:'row',gap:16,paddingVertical:14,borderTopWidth:1,borderColor:colors.border},number:{fontSize:18,lineHeight:27,color:colors.cyan},copy:{flex:1,gap:8},stepTitle:{fontSize:17,lineHeight:25,fontWeight:'600'},soon:{fontSize:12,lineHeight:18,color:'#f2c49c'},note:{fontSize:12,lineHeight:20}});

import React from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { colors, ui } from './theme';
import { SymbolIcon, type SymbolName } from './SymbolIcon';

export const subapps:readonly {id:Subapp;title:string;icon:SymbolName}[]=[
  {id:'flights',title:'Flüge',icon:'glider'},
  {id:'logbook',title:'Flugbuch',icon:'book'},
  {id:'club',title:'Verein',icon:'club'},
  {id:'costs',title:'Kosten',icon:'chart'},
  {id:'statistics',title:'Statistik',icon:'chart'},
  {id:'ai',title:'Assistent',icon:'sparkle'},
];
export type Subapp='flights'|'logbook'|'club'|'costs'|'statistics'|'ai';
/** Six persistent destinations are an explicit owner choice beyond M3's 3–5 guidance. */
export function SubappNavigation({selected,rail,onSelect,onHome,disabled=false}:{selected:Subapp|null;rail:boolean;onSelect:(id:Subapp)=>void;onHome:()=>void;disabled?:boolean}) {
  const {fontScale}=useWindowDimensions(),wrap=!rail&&fontScale>1.3;
  return <View accessibilityRole="tablist" style={[s.nav,rail&&s.rail,wrap&&s.wrap]}>
    {rail&&<Pressable accessibilityRole="button" accessibilityLabel="Start öffnen" disabled={disabled} accessibilityState={{disabled}} onPress={onHome} style={s.home}><SymbolIcon name="home" size={24}/><Text style={s.label}>Start</Text></Pressable>}
    {subapps.map(item=><Pressable key={item.id} testID={`tab-${item.id}`} accessibilityRole="tab" accessibilityLabel={item.title} disabled={disabled} accessibilityState={{selected:selected===item.id,disabled}} onPress={()=>onSelect(item.id)} style={({pressed})=>[s.item,rail&&s.railItem,wrap&&s.wrapItem,disabled&&{opacity:.5},pressed&&ui.pressed]}>
      <View style={[s.icon,selected===item.id&&s.selected]}>{item.id==='costs'?<Text style={{fontSize:23,lineHeight:28,color:selected===item.id?colors.cyan:colors.muted}}>€</Text>:<SymbolIcon name={item.icon} size={24} tone={selected===item.id?'default':'muted'}/>}</View>
      <Text style={[s.label,selected===item.id&&s.active]}>{item.title}</Text>
    </Pressable>)}
  </View>;
}
const s=StyleSheet.create({nav:{flexDirection:'row',width:'100%',paddingHorizontal:4,paddingVertical:6,gap:0,backgroundColor:colors.background,borderTopWidth:1,borderColor:colors.border},rail:{width:108,flexDirection:'column',borderTopWidth:0,borderRightWidth:1,paddingVertical:16,gap:12},wrap:{flexWrap:'wrap'},item:{flex:1,minWidth:48,minHeight:64,alignItems:'center',justifyContent:'center',gap:4},railItem:{flex:0,width:'100%'},wrapItem:{flex:0,width:'33.333%'},icon:{width:48,height:30,borderRadius:18,alignItems:'center',justifyContent:'center'},selected:{backgroundColor:'#144b6c'},label:{fontSize:12,lineHeight:18,textAlign:'center',color:colors.muted},active:{color:colors.cyan,fontWeight:'600'},home:{alignItems:'center',minHeight:64,justifyContent:'center',gap:4,borderBottomWidth:1,borderColor:colors.border,marginBottom:8,paddingBottom:12}});

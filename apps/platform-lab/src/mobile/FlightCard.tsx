import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { RealFlightListItem } from '../vereinsflieger/real-flight-library';
import { ownFlightCard, ownFlightClassification } from './own-flight-model';
import { Card, Label, colors } from './theme';

export function FlightCard({flight,onPress,style}:{flight:RealFlightListItem;onPress:()=>void;style?:StyleProp<ViewStyle>}) {
  const card=ownFlightCard(flight);
  const classification=ownFlightClassification(flight);
  const label=[flight.facts.assessment.date.value,card.registration,card.start&&`Start ${card.start}`,card.route,card.duration,classification.category.key==='unknown'?'':classification.categoryLabel,classification.launch.key==='unknown'?'':classification.launchLabel,...card.crew.map(person=>`${person.role}: ${person.name}`),card.solo?'Solo':'','ansehen'].filter(Boolean).join(', ');
  return <Card onPress={onPress} label={label} style={[s.row,style]}>
    <View style={s.info}><View style={s.identity}><Label muted style={s.small}>{card.date}</Label><Label style={s.registration}>{card.registration}</Label><Label muted style={s.small}>{card.model}</Label></View>
      {(classification.category.key!=='unknown'||classification.launch.key!=='unknown')&&<View style={s.identity}>{classification.category.key!=='unknown'&&<Label style={s.category}>{classification.categoryLabel}</Label>}{classification.launch.key!=='unknown'&&<Label muted style={s.small}>{classification.launchLabel}</Label>}</View>}
      {card.crew.length>0&&<View style={s.crew}>{card.crew.map((person,index)=><Label key={index} style={s.person}><Label muted style={s.role}>{person.role} </Label>{person.name}</Label>)}{card.solo&&<Label style={s.solo}>Solo</Label>}</View>}
      {(card.start||card.route)&&<Label muted style={s.small}>{[card.start,card.route].filter(Boolean).join(' · ')}</Label>}
    </View>
    {card.knownDuration&&<Label style={s.duration}>{card.duration}<Label muted style={s.role}> h</Label></Label>}
  </Card>;
}
const s=StyleSheet.create({
  row:{flexDirection:'row',alignItems:'center',paddingVertical:7,paddingHorizontal:10,borderRadius:10,gap:8,minHeight:48},
  info:{flex:1,minWidth:0,gap:2},identity:{flexDirection:'row',flexWrap:'wrap',alignItems:'baseline',gap:7},
  small:{fontSize:12,lineHeight:17},registration:{fontSize:14,lineHeight:19,fontWeight:'600'},
  crew:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',columnGap:9,rowGap:2},person:{fontSize:13,lineHeight:18,flexShrink:1},role:{fontSize:11,lineHeight:16},
  solo:{fontSize:11,lineHeight:16,color:colors.cyan,borderWidth:1,borderColor:colors.border,borderRadius:4,paddingHorizontal:4},
  category:{fontSize:11,lineHeight:16,color:colors.cyan,borderWidth:1,borderColor:colors.border,borderRadius:4,paddingHorizontal:4,flexShrink:1},
  duration:{fontSize:20,lineHeight:28,fontWeight:'600',maxWidth:'32%',color:colors.text,fontVariant:['tabular-nums']},unclearDuration:{fontSize:12,lineHeight:17,fontWeight:'400',color:colors.muted},
});

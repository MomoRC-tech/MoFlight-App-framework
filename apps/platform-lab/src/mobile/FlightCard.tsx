import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { RealFlightListItem } from '../vereinsflieger/real-flight-library';
import { reviewParsedField, reviewRawField } from '../vereinsflieger/capture-review';
import { ownFlightCard, ownFlightClassification } from './own-flight-model';
import { Card, Label, colors } from './theme';

export function FlightCard({flight,onPress,style}:{flight:RealFlightListItem;onPress:()=>void;style?:StyleProp<ViewStyle>}) {
  const a=flight.facts.assessment,card=ownFlightCard(flight);
  const classification=ownFlightClassification(flight);
  return <Card onPress={onPress} label={`${reviewParsedField(a.date)}, ${card.registration}, Start ${card.start}, ${card.route}, ${card.duration}, ${classification.categoryLabel}, ${classification.launchLabel}, Pilot: ${reviewRawField(a.fields.pilot)}, Begleiter: ${[a.fields.companion,a.fields.companion2,a.fields.companion3].map(reviewRawField).join(' · ')}${card.solo?', Solo im Anbieterbeleg':''}, ansehen`} style={[s.row,style]}>
    <View style={s.info}><View style={s.identity}><Label muted style={s.small}>{card.date}</Label><Label style={s.registration}>{card.registration}</Label><Label muted style={s.small}>{card.model}</Label></View>
      <View style={s.identity}><Label style={s.category}>{classification.categoryLabel}</Label><Label muted style={s.small}>{classification.launchLabel}</Label></View>
      <View style={s.crew}>{card.crew.map((person,index)=><Label key={index} style={s.person}><Label muted style={s.role}>{person.role} </Label>{person.name}</Label>)}{card.solo&&<Label style={s.solo}>Solo</Label>}</View>
      <Label muted style={s.small}>{card.start} · {card.route}</Label>
    </View>
    <Label style={[s.duration,!card.knownDuration&&s.unclearDuration]}>{card.duration}{card.knownDuration&&<Label muted style={s.role}> h</Label>}</Label>
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

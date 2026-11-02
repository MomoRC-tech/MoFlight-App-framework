import React, { useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Line, Rect } from 'react-native-svg';
import { colors, Label } from './theme';

export const priorYearColor = '#809cb3';
const initials = ['J','F','M','A','M','J','J','A','S','O','N','D'];
const months = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];

/** Both years share a zero baseline and scale. Empty, zero and partial stay distinct. */
export function MonthlyBars({ values, prior, uncertain, priorUncertain, future, formatValue, onOpen, accessibilityLabel }: {
  values: readonly (number|null)[]; prior: readonly (number|null)[];
  uncertain: readonly boolean[]; priorUncertain: readonly boolean[]; future: readonly boolean[];
  formatValue: (value:number)=>string; onOpen: ()=>void; accessibilityLabel: string;
}) {
  const [width,setWidth] = useState(300);
  const {fontScale} = useWindowDimensions();
  const known = [...values,...prior].filter((value):value is number=>value!==null);
  const maximum = Math.max(1,...known), height=78, bottom=height-3, step=width/12, bar=Math.min(10,step*.29);
  const renderBar = (value:number|null,index:number,isPrior:boolean) => {
    if(future[index]) return null;
    const x=(index+.5)*step+(isPrior?-bar-1:1), color=isPrior?priorYearColor:colors.cyan;
    if(value===null) return <Line key={`${index}-${isPrior}`} x1={x+bar/2-2} x2={x+bar/2+2} y1={bottom} y2={bottom} stroke={color} strokeWidth={1} opacity={.6}/>;
    if(value===0) return <Circle key={`${index}-${isPrior}`} cx={x+bar/2} cy={bottom} r={1.7} fill={color}/>;
    const h=value/maximum*(height-9), partial=(isPrior?priorUncertain:uncertain)[index];
    return <Rect key={`${index}-${isPrior}`} x={x} y={bottom-h} width={bar} height={h} rx={Math.min(2.5,h/2)} fill={color} fillOpacity={partial ? .32 : 1} stroke={color} strokeWidth={partial?1:0} strokeDasharray={partial?'2 2':undefined}/>;
  };
  return <Pressable testID="start-monthly-bars" accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityHint="Detaillierten Monatsvergleich in Statistik öffnen" onPress={onOpen} onLayout={event=>{const next=event.nativeEvent.layout.width;if(next>0&&Math.abs(next-width)>1)setWidth(next);}} style={{minHeight:48,gap:2}}>
    <View style={{alignItems:'flex-end'}}><Label muted style={{fontSize:10,lineHeight:14}}>{known.length?`0–${formatValue(Math.max(0,...known))}`:'Keine belegten Monatswerte'}</Label></View>
    <Svg width={width} height={height} accessible={false}>
      <Line x1={0} x2={width} y1={bottom} y2={bottom} stroke={colors.border} strokeWidth={.7}/>
      <Line x1={0} x2={width} y1={bottom/2} y2={bottom/2} stroke={colors.border} strokeWidth={.5} strokeDasharray="2 5"/>
      {Array.from({length:12},(_,index)=><React.Fragment key={index}>{renderBar(prior[index]??null,index,true)}{renderBar(values[index]??null,index,false)}</React.Fragment>)}
    </Svg>
    <View style={{flexDirection:'row'}}>{(width/fontScale>=280?months:initials).map((label,index)=><View key={index} style={{flex:1,alignItems:'center'}}><Label muted style={{fontSize:10,lineHeight:14}}>{label}</Label></View>)}</View>
  </Pressable>;
}

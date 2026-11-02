import React,{useId,useState} from 'react';
import {Pressable,View,useWindowDimensions} from 'react-native';
import Svg,{Circle,Defs,Line,LinearGradient,Path,Rect,Stop} from 'react-native-svg';
import {trendGeometry} from './chart-geometry';
import {Label,colors} from './theme';

/** One vector viewport; accessible month/value controls remain with the caller. */
export function TrendChart({values,prior,labels,selectedIndex,onSelect,color=colors.cyan,height=190,accessibilityLabel,formatValue,uncertain=[],priorUncertain=[]}:{
  values:readonly (number|null)[];prior?:readonly (number|null)[];labels:readonly string[];selectedIndex?:number|null;
  onSelect:(index:number)=>void;color?:string;height?:number;accessibilityLabel:string;formatValue:(value:number)=>string;uncertain?:readonly boolean[];priorUncertain?:readonly boolean[];
}) {
  const [width,setWidth]=useState(300),{fontScale}=useWindowDimensions();
  const id=useId().replace(/[^a-zA-Z0-9]/g,''),gradient=`trend${id}`;
  const finite=[...values,...(prior??[])].filter((v):v is number=>v!==null&&Number.isFinite(v));
  const low=Math.min(0,...finite),high=Math.max(0,...finite)||1;
  const range:[number,number]=[low,high],current=trendGeometry(values,uncertain,width,height,range);
  const previous=prior?trendGeometry(prior,priorUncertain,width,height,range):null;
  const selected=selectedIndex===null||selectedIndex===undefined?null:current.points.find(p=>p.index===selectedIndex);
  const selectedPrior=selectedIndex===null||selectedIndex===undefined?null:previous?.points.find(p=>p.index===selectedIndex);
  const cursor=selectedIndex===null||selectedIndex===undefined?null:current.x(selectedIndex);
  const tickCount=width/fontScale>=520?labels.length:width/fontScale>=260?6:4;
  const ticks=[...new Set(Array.from({length:Math.min(tickCount,labels.length)},(_,i)=>Math.round(i*(labels.length-1)/Math.max(1,Math.min(tickCount,labels.length)-1))))];
  if(!finite.length)return <View style={{height,justifyContent:'center',alignItems:'center',borderRadius:18,backgroundColor:colors.raised}}><Label muted>Keine belegten Werte</Label></View>;
  return <View style={{gap:4,minWidth:0}} onLayout={e=>{const w=e.nativeEvent.layout.width;if(w>0&&Math.abs(w-width)>1)setWidth(w);}}>
    <View style={{height:18*fontScale,flexDirection:'row',justifyContent:'space-between'}}><Label muted style={{fontSize:10,lineHeight:16,fontVariant:['tabular-nums']}}>{formatValue(high)}</Label>{low<0&&<Label muted style={{fontSize:10,lineHeight:16}}>{formatValue(low)}</Label>}</View>
    <View style={{height}}>
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} accessible={false}>
        <Defs><LinearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={color} stopOpacity={.28}/><Stop offset="1" stopColor={color} stopOpacity={.015}/></LinearGradient></Defs>
        {[12,height/2,height-12].map(y=><Line key={y} x1={12} x2={width-12} y1={y} y2={y} stroke={colors.muted} strokeOpacity={.13} strokeDasharray="2 7"/>)}
        {low<0&&<Line x1={12} x2={width-12} y1={current.y(0)} y2={current.y(0)} stroke={colors.muted} strokeOpacity={.25}/>}
        {cursor!==null&&<Rect x={Math.max(0,cursor-14)} y={0} width={28} height={height} rx={12} fill={color} opacity={.055}/>}
        {current.segments.filter(s=>s.points.length>1).map((s,i)=><Path key={`area${i}`} d={s.area} fill={`url(#${gradient})`}/>)}
        {previous?.segments.filter(s=>s.points.length>1).map((s,i)=><Path key={`prior${i}`} d={s.line} fill="none" stroke={colors.orange} strokeWidth={1.7} strokeOpacity={.55} strokeDasharray="4 6" strokeLinecap="round"/>)}
        {current.segments.filter(s=>s.points.length>1).map((s,i)=><React.Fragment key={i}><Path d={s.line} fill="none" stroke={color} strokeWidth={9} strokeOpacity={.045} strokeLinecap="round"/><Path d={s.line} fill="none" stroke={color} strokeWidth={2.6} strokeLinejoin="round" strokeLinecap="round"/></React.Fragment>)}
        {previous?.points.filter(p=>!previous.segments.some(s=>s.points.length>1&&s.points.includes(p))).map(p=><Circle key={p.index} cx={p.x} cy={p.y} r={2.5} fill={priorUncertain[p.index]?colors.card:colors.orange} stroke={colors.orange} strokeWidth={1.5} opacity={.6}/>)}
        {current.points.map(p=><Circle key={p.index} cx={p.x} cy={p.y} r={uncertain[p.index]?3.5:2.2} stroke={color} strokeWidth={1.5} fill={uncertain[p.index]?colors.card:color}/>)}
        {cursor!==null&&<Line x1={cursor} x2={cursor} y1={4} y2={height-4} stroke={color} strokeOpacity={.65} strokeDasharray="3 5"/>}
        {selectedPrior&&<Circle cx={selectedPrior.x} cy={selectedPrior.y} r={4} stroke={colors.orange} strokeWidth={2} fill={colors.card}/>}
        {selected&&<><Circle cx={selected.x} cy={selected.y} r={11} fill={color} opacity={.16}/><Circle cx={selected.x} cy={selected.y} r={5} fill={colors.text} stroke={color} strokeWidth={2.5}/></>}
      </Svg>
      <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityHint="Monat wählen. Die Einzelwerte sind auch über die beschrifteten Optionen erreichbar." onPress={e=>{if(labels.length)onSelect(Math.max(0,Math.min(labels.length-1,Math.round((e.nativeEvent.locationX-12)/Math.max(1,width-24)*(labels.length-1)))));}} style={{position:'absolute',inset:0,minHeight:48}}/>
    </View>
    <View accessibilityLabel="Monatsachse Januar bis Dezember" style={{height:20*fontScale}}>{ticks.map(i=>{const w=Math.min(width,40*fontScale),left=Math.max(0,Math.min(width-w,current.x(i)-w/2));return <View key={i} style={{position:'absolute',left,width:w,alignItems:'center'}}><Label muted style={{fontSize:10,lineHeight:16}}>{labels[i]}</Label></View>;})}</View>
  </View>;
}

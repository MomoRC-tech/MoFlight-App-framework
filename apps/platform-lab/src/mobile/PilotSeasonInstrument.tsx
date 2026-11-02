import React from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Label, colors, ui } from './theme';
import { seasonDifference, seasonRingSlices, type AircraftSeasonShare, type RingSlice } from './season-model';
import { formatReportedMinutes } from './real-flight-statistics';
import type { StartDashboard } from './start-preview';
import { SymbolIcon } from './SymbolIcon';

const count=(value:string|undefined)=>value&&/^\d+$/.test(value)&&Number.isSafeInteger(Number(value))?Number(value):null;
/** Reuses the established native strip-ring technique; arcs encode facts, never a goal. */
function Arc({slices,size,inset,thickness}:{slices:readonly RingSlice[];size:number;inset:number;thickness:number}) {
  const diameter=size-inset*2,radius=(diameter-thickness)/2;
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    <View style={{position:'absolute',left:inset,top:inset,width:diameter,height:diameter,borderRadius:diameter/2,borderWidth:thickness,borderColor:'#214863'}}/>
    {slices.flatMap((slice,i)=>{
      const gap=slices.length>1?Math.min(3,slice.sweep/4):0,sweep=slice.sweep-gap,steps=Math.max(1,Math.ceil(sweep/3)),step=sweep/steps;
      return Array.from({length:steps},(_,n)=>{
        const angle=slice.start+gap/2+step*(n+.5),radians=angle*Math.PI/180,length=2*radius*Math.sin(step*Math.PI/360)+1;
        return <View key={`${i}:${n}`} style={{position:'absolute',width:length,height:thickness,left:size/2+radius*Math.cos(radians)-length/2,top:size/2+radius*Math.sin(radians)-thickness/2,backgroundColor:slice.color,transform:[{rotate:`${angle+90}deg`}]}}/>;
      });
    })}
  </View>;
}

export function PilotSeasonInstrument({year,values,aircraft,onOpen,onFlights,onAircraft}:{year:number;values:StartDashboard|null;aircraft:readonly AircraftSeasonShare[];onOpen:()=>void;onFlights:()=>void;onAircraft:()=>void}) {
  const {fontScale}=useWindowDimensions(),size=164*Math.min(Math.max(1,fontScale),1.4);
  const current=count(values?.current.starts),prior=count(values?.prior.starts),maximum=Math.max(current??0,prior??0);
  const ratio=current!==null&&maximum>0?current/maximum:null,priorRatio=prior!==null&&maximum>0?prior/maximum:null;
  const difference=seasonDifference(current,prior,'starts');
  const shares=seasonRingSlices(aircraft,'knownMinutes');
  const total=aircraft.reduce((sum,a)=>sum+(a.knownMinutes??0),0);
  const leaders=[...aircraft].sort((a,b)=>(b.knownMinutes??0)-(a.knownMinutes??0)).slice(0,3);
  const markerAngle=((priorRatio??0)*360-90)*Math.PI/180,markerRadius=(size-38-5)/2;
  return <View style={s.instrument}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Saison ${year}, Statistik öffnen`} onPress={onOpen} style={s.heading}><Label style={s.kicker}>SAISON {year}</Label><SymbolIcon name="arrow" size={20}/></Pressable>
    <View style={[s.body,fontScale>1.3&&s.stacked]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Flugzeit ${values?.current.time??'unbekannt'} Stunden und Minuten. Außen: Anteile bekannter Flugzeit nach Flugzeug. Innen: ${current??'unbekannt'} Flüge; Vorjahresmarke ${prior??'unbekannt'}. Beide Flugzahlen relativ zum größeren gespeicherten Jahreswert, kein Ziel. Gespeicherte Teilstände, keine gleich langen Zeiträume. Statistik öffnen.`} onPress={onOpen} style={{width:size,height:size,alignSelf:'center'}}>
        <Arc size={size} inset={2} thickness={9} slices={shares}/>
        <Arc size={size} inset={19} thickness={5} slices={ratio===null||ratio===0?[]:[{start:-90,sweep:ratio*360,color:colors.cyan}]}/>
        {priorRatio!==null&&<View style={{position:'absolute',left:size/2+markerRadius*Math.cos(markerAngle)-4,top:size/2+markerRadius*Math.sin(markerAngle)-4,width:8,height:8,backgroundColor:'#f7c46b',transform:[{rotate:'45deg'}],borderWidth:1,borderColor:colors.background}}/>}
        <View pointerEvents="none" style={s.center}><Label style={s.time}>{values?.current.time??'—'}</Label><Label muted style={s.small}>h:min</Label></View>
      </Pressable>
      <View style={s.facts}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${current??'unbekannt'} Saisonflüge. Flugliste öffnen`} onPress={onFlights} style={s.count}><Label style={s.countValue}>{values?.current.starts??'—'}</Label><Label muted style={s.small}>Flüge</Label><Label style={s.delta}>{difference.value===null?'Vorjahr —':`${difference.text} zum Vorjahr`}</Label></Pressable>
        <View style={s.prior}><View style={s.marker}/><Label muted style={s.small}>{year-1} · {values?.prior.starts??'—'} Flüge</Label></View>
        <Label muted style={s.small}>{values?.prior.time??'—'} h:min</Label>
      </View>
    </View>
    <View style={s.legendTitle}><Label muted style={s.small}>Außen Flugzeit · innen Flüge</Label><View style={[s.prior,{marginTop:0}]}><View style={s.marker}/><Label muted style={s.small}>{year-1}</Label></View></View>
    {leaders.length?<Pressable accessibilityRole="button" accessibilityLabel="Flugzeit nach Flugzeug, vollständige Aufteilung öffnen" onPress={onAircraft} style={s.aircraft}>
      {leaders.map(a=><View key={a.aircraft} style={s.aircraftRow}><View style={[s.dot,{backgroundColor:a.color}]}/><Label style={s.registration}>{a.aircraft}</Label><View style={s.barTrack}><View style={{width:`${total?(a.knownMinutes??0)/total*100:0}%`,height:3,backgroundColor:a.color,borderRadius:2}}/></View><Label style={s.aircraftValue}>{a.knownMinutes===null?'—':formatReportedMinutes(a.knownMinutes)}</Label></View>)}
      {aircraft.length>3&&<Label muted style={s.small}>+{aircraft.length-3} Flugzeuge ›</Label>}
    </Pressable>:<Label muted style={s.small}>Flugzeuganteile noch unbekannt</Label>}
    {!!values?.current.unknownDurationCount&&<Label muted style={s.small}>{values.current.unknownDurationCount} Zeiten offen</Label>}
    {!!values?.current.unknownDateCount&&<Label muted style={s.small}>{values.current.unknownDateCount} ohne Datum</Label>}
  </View>;
}
const s=StyleSheet.create({instrument:{paddingHorizontal:18,paddingBottom:16,paddingTop:4,borderRadius:22,backgroundColor:'#103757',experimental_backgroundImage:'linear-gradient(130deg, #14476e, #092a43)',gap:8},heading:{minHeight:48,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},kicker:{fontSize:12,lineHeight:18,letterSpacing:1.5,fontWeight:'600',color:'#b5d2e6'},body:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:14},stacked:{flexDirection:'column'},center:{position:'absolute',left:30,right:30,top:40,bottom:40,alignItems:'center',justifyContent:'center'},time:{fontSize:27,lineHeight:36,fontWeight:'600',letterSpacing:-1,fontVariant:['tabular-nums']},facts:{flex:1,minWidth:0,gap:4},count:{minHeight:86,justifyContent:'center',gap:0},countValue:{fontSize:38,lineHeight:46,fontWeight:'600',fontVariant:['tabular-nums']},delta:{fontSize:12,lineHeight:19,color:colors.cyan},prior:{flexDirection:'row',alignItems:'center',gap:6,marginTop:8},marker:{width:6,height:6,backgroundColor:'#f7c46b',transform:[{rotate:'45deg'}]},small:{fontSize:12,lineHeight:19},legendTitle:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',gap:6,paddingTop:6},aircraft:{gap:10,minHeight:48,paddingTop:8,borderTopWidth:1,borderColor:'#315a76'},aircraftRow:{flexDirection:'row',alignItems:'center',gap:7},dot:{width:5,height:5,borderRadius:3},registration:{fontSize:12,lineHeight:19,width:74},barTrack:{flex:1,height:3,borderRadius:2,backgroundColor:'#214863'},aircraftValue:{fontSize:12,lineHeight:19,minWidth:38,textAlign:'right',fontVariant:['tabular-nums']}});

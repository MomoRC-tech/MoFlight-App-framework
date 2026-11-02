import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Action, Card, Label, Section, colors, ui } from './theme';
import { SymbolIcon, type SymbolName } from './SymbolIcon';
import type { OwnFlightView } from './own-flight-reader';
import { startDashboard, type StartPreview } from './start-preview';
import type { DutyOverview } from '../vereinsflieger/duties';
import { dutyDates } from './DutyRoster';
import { HomeCosts } from './HomeCosts';
import { PilotSeasonInstrument } from './PilotSeasonInstrument';
import { summarizeRealFlights } from './real-flight-statistics';
import type { StatisticsSection } from './statistics-overlay-model';
import { medicalExpiry, medicalExpiryStatusText } from './medical-expiry';
import type { InformationCapture } from '../vereinsflieger/information';

export function PilotLink({ title, detail, icon, onPress }: {title:string; detail:string; icon:SymbolName; onPress:()=>void}) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({pressed})=>[styles.link,pressed&&ui.pressed]}>
    <View style={styles.icon}><SymbolIcon name={icon} size={22}/></View>
    <View style={styles.linkCopy}><Label style={styles.linkTitle}>{title}</Label><Label muted style={styles.small}>{detail}</Label></View>
    <SymbolIcon name="right" size={18}/>
  </Pressable>;
}

/** Presentation only. Existing deterministic projection owns all season values. */
export function PilotHome({ view, preview, phase, now, duties, medical, medicalLoading, onPaper, onFlights, onFlight, onStatistics, onCosts, onDuties, onAssistant, onMedical, onUpdate, onClub, active, reload }: {
  active:boolean; reload:number; onClub:()=>void;
  view:OwnFlightView|null; preview:StartPreview|null; phase:'loading'|'ready'|'missing'|'failed'; now:number;
  duties:DutyOverview|null; medical:InformationCapture|null; medicalLoading:boolean;
  onPaper:()=>void; onFlights:()=>void; onFlight:(id:string)=>void; onStatistics:(section?:StatisticsSection)=>void; onCosts:()=>void;
  onDuties:()=>void; onAssistant:()=>void; onMedical:()=>void; onUpdate:()=>void;
}) {
  const date=new Date(now),year=date.getFullYear(),today=`${year}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const {width,fontScale}=useWindowDimensions(),wide=width>=840&&fontScale<=1.3;
  const values=useMemo(()=>phase==='failed'?null:view?.snapshot.account?startDashboard(view,year,today):preview?.dashboard??null,[view,preview,phase,year,today]);
  const aircraft=useMemo(()=>phase!=='failed'&&view?.flights?summarizeRealFlights(view.flights,year).season.aircraft:[],[view?.flights,year,phase]);
  const own=duties?.ownItems[0]??duties?.laterOwn[0];
  const expiry=medicalExpiry(medical,now);
  const medicalText=medicalLoading?'Wird geladen':expiry.date?`${expiry.date} · ${medicalExpiryStatusText(expiry.state)}`:'Datum unbekannt';
  return <View style={styles.container}>
    <View style={styles.intro}><Label muted style={styles.eyebrow}>{date.toLocaleDateString('de-DE',{weekday:'long',day:'numeric',month:'long'})}</Label><Label style={styles.headline}>Dein Cockpit</Label></View>
    {phase==='failed'&&<Card><Label>Gespeicherte Daten konnten nicht geprüft werden.</Label><Label muted>Deine Daten bleiben erhalten. Öffne die Flugliste, um das lokale Laden erneut zu versuchen.</Label><Action secondary onPress={onFlights}>Flugliste öffnen</Action></Card>}
    {phase==='loading'&&<Label muted style={styles.small}>{preview?'Letzter gespeicherter Stand · wird geprüft':'Gespeicherte Daten werden geladen …'}</Label>}
    {phase==='missing'&&<Card><Section title="Willkommen an Bord"/><Label muted>Verbinde Vereinsflieger, um deine Flüge und Vereinsdaten auf diesem Gerät verfügbar zu machen.</Label><Action onPress={onUpdate}>Vereinsflieger verbinden</Action></Card>}
    <View style={[styles.columns,wide&&styles.wide]}>
      <View style={styles.column}>
        <PilotSeasonInstrument year={year} values={values} aircraft={aircraft} onOpen={()=>onStatistics()} onFlights={onFlights} onAircraft={()=>onStatistics('aircraft')}/>
        <View style={styles.flightSection}>
          <View style={styles.sectionHead}><Label style={styles.kicker}>FLÜGE</Label><Pressable accessibilityRole="button" onPress={onFlights} style={styles.textAction}><Label style={styles.actionText}>Alle Flüge ›</Label></Pressable></View>
          {values?.latest?<PilotLink icon="glider" title={`${values.latest.model} · ${values.latest.registration}`} detail={`${values.latest.date} · ${values.latest.duration}${values.latest.orderUnknown?' · Reihenfolge offen':''}`} onPress={()=>onFlight(values.latest!.flightId)}/>:<PilotLink icon="glider" title="Deine Flugliste" detail="Gespeicherte Flüge ansehen" onPress={onFlights}/>}
        </View>
        <Card onPress={onClub} label="Verein öffnen" style={styles.club}>
          <View style={styles.sectionHead}><View style={styles.inline}><SymbolIcon name="club" size={20}/><Label style={styles.kicker}>VEREIN</Label></View><SymbolIcon name="right" size={18}/></View>
          {own?<View style={styles.duty}><View style={styles.dutyHeading}><Label style={styles.linkTitle}>{own.duty||'Dienstname unbekannt'}</Label><Label style={styles.dutyDate}>{dutyDates(own)}</Label></View><Label muted style={styles.small}>{own.people.join(' · ')||'Personen unbekannt'}</Label></View>:<Label muted style={styles.small}>Dein nächster Dienst ist noch unbekannt.</Label>}
          <Label muted style={styles.small}>Dienstplan · gespeicherte Teilansicht</Label>
        </Card>
      </View>
      <View style={styles.column}>
        <View style={[styles.pair,fontScale>1.3&&{flexDirection:'column'}]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Papierflugbuch öffnen. Schreibvorlagen in Vorbereitung" onPress={onPaper} style={({pressed})=>[styles.module,styles.paper,pressed&&ui.pressed]}>
            <View style={styles.sectionHead}><SymbolIcon name="book" size={26} tone="paper"/><SymbolIcon name="right" size={16}/></View><Label style={styles.moduleTitle}>Flugbuch</Label><Label style={styles.small}>Schreibvorlagen</Label><Label muted style={styles.small}>In Vorbereitung</Label>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Assistent öffnen. AI-Dienst noch nicht freigeschaltet" onPress={onAssistant} style={({pressed})=>[styles.module,styles.assistant,pressed&&ui.pressed]}>
            <View style={styles.sectionHead}><SymbolIcon name="sparkle" size={26} tone="assistant"/><SymbolIcon name="right" size={16}/></View><Label style={styles.moduleTitle}>Assistent</Label><Label style={styles.small}>Analyse & Fragen</Label><Label muted style={styles.small}>AI noch nicht aktiv</Label>
          </Pressable>
        </View>
        <HomeCosts view={view} active={active} reload={reload} year={year} onOpen={onCosts}/>
      </View>
    </View>
    <PilotLink icon="medical-card" title="Medical" detail={medicalText} onPress={onMedical}/>
    <Label muted style={styles.footer}>Offline gespeichert{preview&&!view?` Stand: ${new Date(preview.savedAt).toLocaleString('de-DE')}.`:''}</Label>
  </View>;
}
const styles=StyleSheet.create({
  container:{width:'100%',maxWidth:1000,alignSelf:'center',gap:14},intro:{gap:3,paddingTop:4,paddingBottom:4},
  eyebrow:{fontSize:12,lineHeight:19,color:'#9fb9ce'},headline:{fontSize:30,lineHeight:38,fontWeight:'700',letterSpacing:-1},
  columns:{gap:14},wide:{flexDirection:'row',alignItems:'flex-start'},column:{flex:1,minWidth:0,gap:14},
  sectionHead:{minHeight:36,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},kicker:{fontSize:12,lineHeight:18,letterSpacing:1.2,color:'#b5d2e6',fontWeight:'600'},
  flightSection:{paddingHorizontal:4},textAction:{minHeight:48,justifyContent:'center',paddingHorizontal:4},actionText:{fontSize:12,lineHeight:19,color:colors.cyan},
  pair:{flexDirection:'row',gap:12},module:{flex:1,minWidth:0,borderRadius:18,padding:16,gap:6},paper:{backgroundColor:'#1b2f40'},assistant:{backgroundColor:'#1c2948'},moduleTitle:{fontSize:20,lineHeight:28,fontWeight:'600',letterSpacing:-.4},
  club:{gap:6,paddingVertical:12},inline:{flexDirection:'row',alignItems:'center',gap:8},duty:{gap:3},dutyHeading:{flexDirection:'row',flexWrap:'wrap',alignItems:'baseline',justifyContent:'space-between',gap:6},dutyDate:{color:colors.cyan,fontSize:12,lineHeight:19},
  link:{flexDirection:'row',alignItems:'center',gap:12,paddingVertical:12,minHeight:64},
  linkCopy:{flex:1,gap:3},linkTitle:{fontSize:15,lineHeight:22,fontWeight:'600',flexShrink:1},icon:{width:32,alignItems:'center'},small:{fontSize:12,lineHeight:19},footer:{fontSize:12,lineHeight:18,paddingBottom:8},
});

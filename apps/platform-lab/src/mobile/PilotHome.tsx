import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Action, Card, Label, Section, colors, ui } from './theme';
import { SymbolIcon, type SymbolName } from './SymbolIcon';
import type { OwnFlightView } from './own-flight-reader';
import { startDashboard, type StartPreview } from './start-preview';
import type { DutyOverview } from '../vereinsflieger/duties';
import { dutyDates } from './DutyRoster';
import { HomeCosts } from './HomeCosts';
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
  onPaper:()=>void; onFlights:()=>void; onFlight:(id:string)=>void; onStatistics:()=>void; onCosts:()=>void;
  onDuties:()=>void; onAssistant:()=>void; onMedical:()=>void; onUpdate:()=>void;
}) {
  const date=new Date(now),year=date.getFullYear(),today=`${year}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const {width,fontScale}=useWindowDimensions(),wide=width>=840&&fontScale<=1.3;
  const values=useMemo(()=>phase==='failed'?null:view?.snapshot.account?startDashboard(view,year,today):preview?.dashboard??null,[view,preview,phase,year,today]);
  const own=duties?.ownItems[0]??duties?.laterOwn[0];
  const expiry=medicalExpiry(medical,now);
  const medicalText=medicalLoading?'Angaben werden geladen':`${expiry.date??'Datum unbekannt'} · ${medicalExpiryStatusText(expiry.state)}`;
  return <View style={styles.container}>
    <View style={styles.intro}><Label muted style={styles.eyebrow}>{date.toLocaleDateString('de-DE',{weekday:'long',day:'numeric',month:'long'})}</Label><Label style={styles.headline}>Dein Flugtag. Im Blick.</Label><Label muted>Flüge festhalten. Im Verein mitdenken.</Label></View>
    {phase==='failed'&&<Card><Label>Gespeicherte Daten konnten nicht geprüft werden.</Label><Label muted>Deine Daten bleiben erhalten. Öffne die Flugliste, um das lokale Laden erneut zu versuchen.</Label><Action secondary onPress={onFlights}>Flugliste öffnen</Action></Card>}
    {phase==='loading'&&<Label muted style={styles.small}>{preview?'Letzter gespeicherter Stand · wird geprüft':'Gespeicherte Daten werden geladen …'}</Label>}
    {phase==='missing'&&<Card><Section title="Willkommen an Bord"/><Label muted>Verbinde Vereinsflieger, um deine Flüge und Vereinsdaten auf diesem Gerät verfügbar zu machen.</Label><Action onPress={onUpdate}>Vereinsflieger verbinden</Action></Card>}
    <View style={[styles.columns,wide&&styles.wide]}>
      <View style={styles.column}>
        <Card style={styles.paper}>
          <View style={styles.paperHeading}><SymbolIcon name="book" size={28} tone="paper"/><Label style={styles.heroTitle}>Papierflugbuch</Label></View>
          <Label muted>Vom gespeicherten Flug zur Schreibvorlage für dein Buch.</Label>
          <View style={styles.availability}><View style={styles.dot}/><Label style={styles.small}>Schreibvorlagen in Vorbereitung</Label></View>
          <Action icon="book" onPress={onPaper}>Flugbuch öffnen</Action>
        </Card>
        <Card>
          <Section title="Verein" action="Öffnen" onPress={onClub}/>
          {own?<Pressable accessibilityRole="button" onPress={onDuties} style={styles.duty}><Label style={styles.dutyDate}>{dutyDates(own)}</Label><Label style={styles.linkTitle}>{own.duty||'Dienstname unbekannt'}</Label><Label muted>{own.people.join(' · ')||'Personen unbekannt'}</Label></Pressable>:<Label muted>{duties?.status==='partial'?'Kein eigener kommender Dienst im gespeicherten Ausschnitt.':'Dein nächster Dienst ist noch unbekannt.'}</Label>}
          <Label muted style={styles.small}>Gespeicherter Ausschnitt · kein vollständiger Dienstplan</Label>
          <PilotLink icon="club" title="Am Flugplatz" detail="Dienste, Termine & Vereinsinformationen" onPress={onClub}/>
        </Card>
      </View>
      <View style={styles.column}>
        <Card>
          <Section title={`Deine Saison ${year}`} action="Statistik" onPress={onStatistics}/>
          <View style={styles.metrics}>
            <Pressable accessibilityRole="button" accessibilityLabel="Saisonflugzeit, Statistik öffnen" onPress={onStatistics} style={styles.metric}><Label style={styles.number}>{values?.current.time??'—'}</Label><Label muted style={styles.small}>Flugzeit · h:min</Label></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Saisonflüge, Flugliste öffnen" onPress={onFlights} style={styles.metric}><Label style={styles.number}>{values?.current.starts??'—'}</Label><Label muted style={styles.small}>Flüge</Label></Pressable>
          </View>
          {!!values?.current.unknownDurationCount&&<Label muted style={styles.small}>{values.current.unknownDurationCount} Flugzeiten unbekannt</Label>}
          {!!values?.current.unknownDateCount&&<Label muted style={styles.small}>{values.current.unknownDateCount} Flüge ohne zugeordnetes Datum</Label>}
        </Card>
        <Card><Section title="Flüge" action="Öffnen" onPress={onFlights}/>
          {values?.latest?<PilotLink icon="glider" title={`${values.latest.model} · ${values.latest.registration}`} detail={`Letzter Flug ${values.latest.date} · ${values.latest.duration}${values.latest.orderUnknown?' · Reihenfolge offen':''}`} onPress={()=>onFlight(values.latest!.flightId)}/>:<PilotLink icon="glider" title="Deine Flugliste" detail="Gespeicherte Flüge suchen und ansehen" onPress={onFlights}/>}
        </Card>
        <HomeCosts view={view} active={active} reload={reload} year={year} onOpen={onCosts}/>
        <Card><Section title="Assistent" action="Öffnen" onPress={onAssistant}/><Label style={styles.linkTitle}>Was möchtest du besser verstehen?</Label><Label muted>Deine Flüge analysieren oder einen Segelflugbegriff klären.</Label><Label muted style={styles.small}>Entwürfe bleiben lokal. AI-Dienst noch nicht freigeschaltet.</Label></Card>
      </View>
    </View>
    <PilotLink icon="medical-card" title="Medical im Blick" detail={medicalText} onPress={onMedical}/>
    <Label muted style={styles.footer}>Deine gespeicherten Daten bleiben offline verfügbar.{preview&&!view?` Stand: ${new Date(preview.savedAt).toLocaleString('de-DE')}.`:''}</Label>
  </View>;
}
const styles=StyleSheet.create({
  container:{width:'100%',maxWidth:1000,alignSelf:'center',gap:22},intro:{gap:6,paddingTop:12,paddingBottom:2},
  eyebrow:{fontSize:12,lineHeight:18,letterSpacing:1},headline:{fontSize:29,lineHeight:37,fontWeight:'700',letterSpacing:-.8},
  columns:{gap:16},wide:{flexDirection:'row',alignItems:'flex-start'},column:{flex:1,minWidth:0,gap:16},
  paper:{backgroundColor:'#1d2e3b',borderColor:'#3e5662',padding:20,gap:12},paperHeading:{flexDirection:'row',alignItems:'center',gap:12},
  heroTitle:{fontSize:22,lineHeight:30,fontWeight:'600',letterSpacing:-.5,flexShrink:1},
  availability:{flexDirection:'row',alignItems:'center',gap:8},dot:{width:6,height:6,borderRadius:3,backgroundColor:'#f2c49c'},
  metrics:{flexDirection:'row',gap:12,paddingVertical:8},metric:{flex:1,minHeight:70,gap:3},number:{fontSize:35,lineHeight:44,fontWeight:'600',fontVariant:['tabular-nums'],letterSpacing:-1},
  duty:{gap:5,paddingVertical:6,minHeight:48},dutyDate:{color:colors.cyan,fontSize:13,lineHeight:20,fontWeight:'600'},
  links:{paddingVertical:0,gap:0},link:{flexDirection:'row',alignItems:'center',gap:12,paddingVertical:16,minHeight:72,borderTopWidth:1,borderTopColor:colors.border},
  linkCopy:{flex:1,gap:3},linkTitle:{fontSize:15,lineHeight:22,fontWeight:'600'},icon:{width:34,alignItems:'center'},small:{fontSize:12,lineHeight:19},footer:{fontSize:12,lineHeight:18,paddingBottom:8},
});

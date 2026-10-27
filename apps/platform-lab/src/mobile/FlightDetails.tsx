import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { RealFlightDetail } from '../vereinsflieger/real-flight-library';
import { reviewDuration, reviewParsedField, reviewRawField } from '../vereinsflieger/capture-review';
import { Action, Card, Label, Section, colors } from './theme';
import { ownFlightClassification, ownFlightCrew } from './own-flight-model';
import { SymbolIcon } from './SymbolIcon';
import { helpEntry } from './help-catalog';

const picHelp = helpEntry('pic')!;

/** Shared source presentation; callers own identity validation and return state. */
export function FlightDetails({detail,rawPage,onRawPage,rawExpanded=false,onToggleRaw,picHelpOpen=false,onTogglePicHelp,onMorePicHelp}:{detail:RealFlightDetail;rawPage:number;onRawPage:(page:number)=>void;rawExpanded?:boolean;onToggleRaw:()=>void;picHelpOpen?:boolean;onTogglePicHelp?:()=>void;onMorePicHelp?:()=>void}) {
  const classification=ownFlightClassification(detail), crew=ownFlightCrew(detail);
  const a=detail.facts.assessment, page=Math.max(0,Math.min(rawPage,Math.max(0,Math.ceil(a.observation.headers.length/8)-1)));
  const labels={picTime:'PIC-Zeit',dualTime:'Doppelsteuer-Zeit',instructorTime:'Lehrer-Zeit'};
  return <>
    <Card><Section title="Gespeicherter Flug"/>
      <View style={styles.fields}>
        <View style={styles.field}><Label muted>Kennzeichen</Label><Label selectable style={{fontSize:22,lineHeight:30,fontWeight:'700'}}>{reviewRawField(a.fields.registration)}</Label></View>
        <View style={styles.field}><Label muted>Gemeldete Flugzeit</Label><Label selectable style={{color:colors.cyan,fontSize:22,lineHeight:30}}>{reviewDuration(a.durations.flight)}</Label></View>
      </View>
      <Label selectable>Datum: {reviewParsedField(a.date)}</Label>
      <Label selectable>{reviewRawField(a.fields.model)}</Label>
      <View style={styles.fields}><DetailField title="Luftfahrzeugart" value={classification.categoryLabel}/><DetailField title="Startart" value={classification.launchLabel}/></View>
      <Label muted>Unbekannte oder widersprüchliche Angaben bleiben ungeklärt.</Label>
      {!!detail.pending.length&&<Label>{detail.pending.length} ungeklärte Beobachtung(en) bleiben zur Prüfung erhalten.</Label>}
    </Card>
    <Card><Section title="Route & Zeiten"/>
      <View style={styles.fields}>
        <DetailField title="Startort" value={reviewRawField(a.fields.departure)}/><DetailField title="Landeort" value={reviewRawField(a.fields.arrival)}/>
        <DetailField title="Start" value={reviewParsedField(a.clocks.start)}/><DetailField title="Landung" value={reviewParsedField(a.clocks.landing)}/>
        {(['offBlock','onBlock'] as const).map(field=><DetailField key={field} title={field==='offBlock'?'Off-Block':'On-Block'} value={reviewParsedField(a.clocks[field])}/>)}
      </View>
      <Label muted>Uhrzeitbasis und Landetag sind ungeprüft. Dauer wird nicht aus Uhrzeiten berechnet.</Label>
    </Card>
    <Card><Section title="Crew & Rollen"/>
      <Label muted>Crew-Felder sind Quellenangaben, keine Rollen- oder Buchanrechnung.</Label>
      {crew.crew.map((person,index)=><Label key={index} selectable>{person.role}: {person.name}</Label>)}
      {crew.picKnown && onTogglePicHelp && onMorePicHelp && <>
        <Pressable testID="pic-help-trigger" accessibilityRole="button" accessibilityLabel="Info zu PIC" accessibilityState={{expanded:picHelpOpen}} onPress={onTogglePicHelp} style={styles.helpTrigger}><SymbolIcon name="info" size={20}/><Label style={{color:colors.cyan}}>Was bedeutet PIC?</Label></Pressable>
        {picHelpOpen && <View style={styles.helpBubble} accessibilityLiveRegion="polite">
          <Label style={{fontWeight:'700'}}>PIC · Pilot-in-command</Label>
          <Label>{picHelp.short}</Label>
          <Label muted>Die gespeicherte Rolle allein bestimmt keine Flugbuch-Anrechnung.</Label>
          <View style={styles.helpActions}><Action secondary onPress={onTogglePicHelp}>Schließen</Action><Action secondary onPress={onMorePicHelp}>Mehr erfahren</Action></View>
        </View>}
      </>}
      {!crew.picKnown&&<Label muted>PIC nicht angegeben</Label>}
      <Label muted>{crew.solo?'Solo':crew.instructor==='recorded'?'Fluglehrer an Bord':'Fluglehrer: nicht eindeutig angegeben'}{crew.soloSource==='one-pic'?' · ein PIC, keine Begleitung erfasst':''}</Label>
      <View style={styles.fields}>{(['picTime','dualTime','instructorTime'] as const).map(field=><DetailField key={field} title={labels[field]} value={reviewRawField(a.fields[field])}/>)}</View>
    </Card>
    <Card>
      <Pressable accessibilityRole="button" accessibilityLabel="Originale Anbieterfelder" accessibilityState={{expanded:rawExpanded}} onPress={onToggleRaw} style={styles.disclosure}>
        <View style={{flex:1}}><Section title="Originale Anbieterfelder"/></View><Label style={{color:colors.cyan,fontSize:22}}>{rawExpanded?'−':'+'}</Label>
      </Pressable>
      <Label>Fassung {detail.factsRevision} · {detail.factHistory.length} gespeicherte Fassung(en)</Label><Label selectable>Quellflug: {detail.sourceFlightRef}</Label>
      <Label muted>Kein gespeicherter Track. Distanz und Flugweg sind nicht verifiziert.</Label>
      {rawExpanded&&<>
      <Label muted selectable>Quelle: {[...classification.category.evidence,...classification.launch.evidence].map(item=>`${item.label}: ${item.raw || '(leer)'}`).join(' · ') || 'Nicht erfasst'}. Unbekannte oder widersprüchliche Angaben bleiben ungeklärt.</Label>
      {a.observation.headers.slice(page*8,page*8+8).map((header,index)=><View key={page*8+index} style={{gap:2}}><Label muted>{header||'(ohne Überschrift)'}</Label><Label selectable>{a.observation.row.values[page*8+index]||'Leer im Anbieterbeleg'}</Label></View>)}
      <Label muted>Felder {a.observation.headers.length?page*8+1:0}–{Math.min(page*8+8,a.observation.headers.length)} von {a.observation.headers.length}</Label>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}><Action secondary label="Vorherige Anbieterfelder" disabled={page===0} onPress={()=>onRawPage(page-1)}>Zurück</Action><Action secondary label="Weitere Anbieterfelder" disabled={(page+1)*8>=a.observation.headers.length} onPress={()=>onRawPage(page+1)}>Weiter</Action></View>
      </>}
    </Card>
  </>;
}
function DetailField({title,value}:{title:string;value:string}) {
  return <View style={styles.field}><Label muted>{title}:</Label><Label selectable>{value}</Label></View>;
}
const styles = StyleSheet.create({
  fields: { flexDirection:'row', flexWrap:'wrap', gap:14 },
  field: { flexBasis:'45%', flexGrow:1, minWidth:120, gap:2 },
  disclosure: { minHeight:48, flexDirection:'row', alignItems:'center', gap:12 },
  helpTrigger: { minHeight: 48, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 6 },
  helpBubble: { padding: 14, gap: 8, backgroundColor: colors.raised, borderWidth: 1, borderColor: '#296879', borderRadius: 18 },
  helpActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});

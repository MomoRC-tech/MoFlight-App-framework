import React from 'react';
import { View } from 'react-native';
import type { RealFlightDetail } from '../vereinsflieger/real-flight-library';
import { reviewDuration, reviewParsedField, reviewRawField } from '../vereinsflieger/capture-review';
import { Action, Card, Label, Section, colors } from './theme';

/** Shared source presentation; callers own identity validation and return state. */
export function FlightDetails({detail,rawPage,onRawPage}:{detail:RealFlightDetail;rawPage:number;onRawPage:(page:number)=>void}) {
  const a=detail.facts.assessment, page=Math.max(0,Math.min(rawPage,Math.max(0,Math.ceil(a.observation.headers.length/8)-1)));
  const labels={pilot:'Pilot',pic:'PIC',companion:'Begleitung',companion2:'Begleitung 2',companion3:'Begleitung 3',sic:'SIC',picTime:'PIC-Zeit',dualTime:'Doppelsteuer-Zeit',instructorTime:'Lehrer-Zeit'};
  return <>
    <Card><Section title="Gespeicherter Flug"/>
      <View style={{flexDirection:'row',flexWrap:'wrap',alignItems:'baseline',gap:10}}><Label style={{fontSize:22,lineHeight:30,fontWeight:'700'}}>{reviewRawField(a.fields.registration)}</Label><Label style={{color:colors.cyan,fontSize:22,lineHeight:30}}>{reviewDuration(a.durations.flight)}</Label></View>
      <Label selectable>Datum: {reviewParsedField(a.date)} · {reviewRawField(a.fields.model)}</Label>
      <Label selectable>Startort: {reviewRawField(a.fields.departure)} · Landeort: {reviewRawField(a.fields.arrival)}</Label>
      <Label selectable>Start: {reviewParsedField(a.clocks.start)} · Landung: {reviewParsedField(a.clocks.landing)}</Label>
      {(['offBlock','onBlock'] as const).map(field=><Label key={field} selectable>{field==='offBlock'?'Off-Block':'On-Block'}: {reviewParsedField(a.clocks[field])}</Label>)}
      <Label muted>Uhrzeitbasis und Landetag sind ungeprüft. Dauer wird nicht aus Uhrzeiten berechnet. Crew-Felder sind Quellenangaben, keine Rollen- oder Buchanrechnung.</Label>
      {(['pilot','pic','companion','companion2','companion3','sic','picTime','dualTime','instructorTime'] as const).map(field=><Label key={field} selectable>{a.fields[field].state==='not-captured'?labels[field]:a.fields[field].label}: {reviewRawField(a.fields[field])}</Label>)}
      {!!detail.pending.length&&<Label>{detail.pending.length} ungeklärte Beobachtung(en) bleiben zur Prüfung erhalten.</Label>}
    </Card>
    <Card><Section title="Originale Anbieterfelder"/>
      <Label>Fassung {detail.factsRevision} · {detail.factHistory.length} gespeicherte Fassung(en)</Label><Label selectable>Quellflug: {detail.sourceFlightRef}</Label>
      <Label muted>Kein gespeicherter Track. Distanz und Flugweg sind nicht verifiziert.</Label>
      {a.observation.headers.slice(page*8,page*8+8).map((header,index)=><View key={page*8+index} style={{gap:2}}><Label muted>{header||'(ohne Überschrift)'}</Label><Label selectable>{a.observation.row.values[page*8+index]||'Leer im Anbieterbeleg'}</Label></View>)}
      <Label muted>Felder {a.observation.headers.length?page*8+1:0}–{Math.min(page*8+8,a.observation.headers.length)} von {a.observation.headers.length}</Label>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}><Action secondary label="Vorherige Anbieterfelder" disabled={page===0} onPress={()=>onRawPage(page-1)}>Zurück</Action><Action secondary label="Weitere Anbieterfelder" disabled={(page+1)*8>=a.observation.headers.length} onPress={()=>onRawPage(page+1)}>Weiter</Action></View>
    </Card>
  </>;
}

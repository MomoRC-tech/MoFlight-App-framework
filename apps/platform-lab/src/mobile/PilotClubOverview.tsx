import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, Label, Section } from './theme';
import { PilotLink } from './PilotHome';
import type { DutyOverview } from '../vereinsflieger/duties';
import type { FeatureInformation } from './feature-information';

export function PilotClubOverview({duties,information,readFailed,onSection}:{duties:DutyOverview|null;information?:FeatureInformation|null;readFailed?:boolean;onSection:(section:'Dienste'|'Termine'|'Dokumente'|'Arbeitsstunden'|'Aufgaben')=>void}) {
  const events=information?.events,work=information?.workSummary,tasks=information?.tasks,docs=information?.documentNotices;
  const count=(source:{status:string;items:unknown[]}|undefined)=>source?.status==='partial'?`${source.items.length} im gespeicherten Ausschnitt`:'Noch kein gespeicherter Ausschnitt';
  return <View style={s.page}>
    <View style={s.intro}><Label muted>DEIN VEREINSLEBEN</Label><Label style={s.title}>{duties?.clubLabel||'Am Flugplatz'}</Label><Label muted>Was ansteht und wo du gebraucht wirst.</Label></View>
    {readFailed&&<Card><Label>Vereinsinformationen konnten nicht vollständig gelesen werden.</Label><Label muted>Der zuletzt geladene Ausschnitt bleibt sichtbar.</Label></Card>}
    <Card style={s.menu}>
      <PilotLink icon="duty" title="Dienste" detail={duties?.status==='partial'?`${duties.ownItems.length} eigene im angezeigten Zeitraum · Teilansicht`:'Dienstplan noch unbekannt'} onPress={()=>onSection('Dienste')}/>
      <PilotLink icon="calendar-neutral" title="Termine" detail={count(events)} onPress={()=>onSection('Termine')}/>
      <PilotLink icon="duty" title="Arbeitsstunden" detail={count(work)} onPress={()=>onSection('Arbeitsstunden')}/>
      <PilotLink icon="book" title="Meine Aufgaben" detail={count(tasks)} onPress={()=>onSection('Aufgaben')}/>
      <PilotLink icon="logbook" title="Dokumentenhinweise" detail={count(docs)} onPress={()=>onSection('Dokumente')}/>
    </Card>
    <Card><Section title="Flugbetrieb & Vereinsnews"/><Label muted>Wer heute fliegt und aktuelle Vereinsnachrichten sind noch nicht angebunden.</Label><Label muted style={s.small}>Gespeicherte Termine und Dokumenthinweise sind keine Live-Nachrichten. Fehlende Einträge bestätigen keinen freien Tag.</Label></Card>
  </View>;
}
const s=StyleSheet.create({page:{width:'100%',maxWidth:560,alignSelf:'center',gap:20},intro:{gap:8,paddingVertical:12},title:{fontSize:28,lineHeight:36,fontWeight:'600'},menu:{paddingVertical:0,gap:0},small:{fontSize:12,lineHeight:19}});

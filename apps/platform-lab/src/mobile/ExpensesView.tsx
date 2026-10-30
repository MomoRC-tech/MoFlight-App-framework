import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import type { ExpensePeriod } from '../expenses/expense-types';
import { readFinancialAnalysisNative, type FinancialExpectedOwner } from '../vereinsflieger/expense-analysis-native';
import { expenseDate, expenseMoney, expenseMonths, expensePeriodLabel, financialAnalysisView, type FinancialAnalysisData } from './financial-analysis-model';
import { validStatisticsRange } from './statistics-overlay-model';
import { Action, Card, Chip, Empty, Label, Section, colors } from './theme';

type Sheet = null | 'period' | 'sources' | {aircraft:string|null} | {account:number};
/** Opening/filtering is entirely local. Only the explicit refresh enters the provider controller. */
export function ExpensesView({expected,reloadKey,period,onPeriod,onRefresh,onBackHandler}:{expected:FinancialExpectedOwner|null;reloadKey:number;period:ExpensePeriod;onPeriod:(value:ExpensePeriod)=>void;onRefresh:()=>void;onBackHandler:(handler:()=>boolean)=>void}) {
  const [stored,setStored]=useState<{key:string;data:FinancialAnalysisData|null}|null>(null),[readPhase,setPhase]=useState<'loading'|'ready'|'failed'>('loading'),[retry,setRetry]=useState(0);
  const [sheet,setSheet]=useState<Sheet>(null),[from,setFrom]=useState(''),[through,setThrough]=useState(''),[year,setYear]=useState(''),[month,setMonth]=useState(1);
  const [periodMode,setPeriodMode]=useState<ExpensePeriod['mode']>('year');
  const generation=useRef(0);
  const owner=expected?.ownerId,store=expected?.storeId,account=expected?.accountRef;
  const key=JSON.stringify([owner,store,account]),data=stored?.key===key?stored.data:null,phase=stored&&stored.key!==key?'loading':readPhase;
  useEffect(()=>{
    let mounted=true;const read=()=>{const id=++generation.current;setStored(null);setPhase('loading');
      if(!owner||!store||!account){setPhase('ready');return;}
      const current=()=>{if(!mounted||id!==generation.current||AppState.currentState!=='active')throw Error('Financial view changed.');};
      void readFinancialAnalysisNative({ownerId:owner,storeId:store,accountRef:account},current).then(value=>{current();setStored({key,data:value});setPhase('ready');}).catch(()=>{if(mounted&&id===generation.current)setPhase('failed');});};
    if(AppState.currentState==='active')read();
    const sub=AppState.addEventListener('change',state=>{generation.current++;setStored(null);if(state==='active')read();else setPhase('loading');});
    return()=>{mounted=false;generation.current++;sub.remove();};
  },[owner,store,account,reloadKey,retry]);
  onBackHandler(()=>{if(sheet){setSheet(null);return true;}return false;});
  const view=useMemo(()=>data?financialAnalysisView(data,period):null,[data,period]);
  const openPeriod=()=>{setPeriodMode(period.mode);setYear(String(period.mode==='custom'?Number(period.from.slice(0,4)):period.year));setMonth(period.mode==='month'?period.month:1);setFrom(period.mode==='custom'?period.from:`${period.mode==='year'||period.mode==='month'?period.year:new Date().getFullYear()}-01-01`);setThrough(period.mode==='custom'?period.through:`${period.mode==='year'||period.mode==='month'?period.year:new Date().getFullYear()}-12-31`);setSheet('period');};
  const yearValid=/^\d{4}$/.test(year)&&Number(year)>=1900&&Number(year)<=9999;
  const valid=periodMode==='custom'?validStatisticsRange(from,through):yearValid;
  const p=view?.projection,latest=view?.latest;
  const aircraft=sheet&&typeof sheet==='object'&&'aircraft' in sheet?sheet.aircraft:undefined;
  const contributions=p?.contributions.filter(row=>aircraft===undefined||row.aircraftRef===aircraft)??[];
  const accountDetail=sheet&&typeof sheet==='object'&&'account' in sheet?view?.accounts[sheet.account]:undefined;
  const maximum=Math.max(1,...(view?.monthly.map(row=>row.knownMinor??0)??[]));
  return <View style={s.page}>
    <View style={s.wrap}><Chip title={expensePeriodLabel(period)} icon="filter" onPress={openPeriod}/><Action secondary icon="refresh" disabled={!expected||phase==='loading'} onPress={onRefresh}>Belege abrufen</Action></View>
    {phase==='loading'?<Card><ActivityIndicator color={colors.cyan}/><Label>Gespeicherte Finanzbelege werden geprüft.</Label></Card>:phase==='failed'?<Card><Empty title="Kosten nicht lesbar">Die gespeicherte Auswahl konnte nicht geprüft werden. Es werden keine früheren Beträge angezeigt.</Empty><Action onPress={()=>setRetry(n=>n+1)}>Lokal erneut prüfen</Action></Card>:!view?<Card><Empty title="Deine Kosten, mit Belegen">Rufe die Abrechnungen deiner gespeicherten eigenen Flüge ab. Danach kannst du sie auch offline ansehen.</Empty>{!expected&&<Label muted>Zuerst eigene Flüge über Sync laden und das Anbieter-Konto zuordnen.</Label>}<Label muted>PDFs werden nicht geladen. Fehlende Belege bleiben unbekannt.</Label></Card>:<>
      <Card style={s.hero}>
        <Label muted>ERFASSTE FLUGKOSTEN</Label><Label style={s.amount}>{expenseMoney(p!.flying.knownMinor)}</Label>
        <Label style={{color:p!.state==='conflict'?colors.orange:colors.cyan,fontWeight:'700'}}>{p!.state==='conflict'?'Widersprüchliche Belege':p!.flying.knownMinor===null?'Betrag noch unbekannt':'Bekannter Teilbetrag'}</Label>
        <Label muted>Volle abgerechnete Flugpreise nach Buchungsdatum. Kein vollständiger Zeitraum und keine Aussage über bezahlte Beträge.</Label>
        <Label muted>{p!.contributions.length} belegte Flugabrechnung(en) · {p!.issues.length} offene Prüfung(en)</Label>
        <Action secondary onPress={()=>setSheet('sources')}>Quellen & offene Angaben</Action>
      </Card>
      {view.monthly.length>0&&<Card><Section title={`Monatsvergleich ${view.year}`}/><Label muted>Volle Flugpreise · nur bekannte Teilbeträge</Label>
        <View style={s.months}>{view.monthly.map(row=><Pressable key={row.month} accessibilityRole="button" accessibilityLabel={`${row.label} ${row.year}: ${expenseMoney(row.knownMinor)}${row.state==='conflict'?', Widerspruch':''}`} accessibilityState={{selected:period.mode==='month'&&period.month===row.month}} onPress={()=>onPeriod({mode:'month',year:row.year,month:row.month})} style={s.month}>
          <View style={s.track}><View style={{width:'100%',height:row.knownMinor===null?2:Math.max(3,72*Math.max(0,row.knownMinor)/maximum),backgroundColor:row.state==='conflict'?colors.orange:row.knownMinor===null?colors.muted:colors.cyan,borderRadius:3}}/></View><Label style={s.small}>{row.label}</Label><Label muted style={s.small}>{row.knownMinor===null?'—':row.knownMinor===0?'0':'•'}</Label>
        </Pressable>)}</View><Label muted>— unbekannt · • bekannter Betrag · Orange: Widerspruch. Monat antippen für Beträge und Belege.</Label>
      </Card>}
      <Card><Section title="Nach Flugzeug"/>{!p!.aircraft.length?<Label muted>Keine belegten Flugkosten in diesem Zeitraum.</Label>:p!.aircraft.map(row=><Pressable key={row.aircraftRef??'unknown'} accessibilityRole="button" onPress={()=>setSheet({aircraft:row.aircraftRef})} style={s.row}><Label style={s.grow}>{row.aircraftRef??'Kennzeichen unbekannt'}</Label><Label style={s.number}>{expenseMoney(row.amount.knownMinor)}</Label><Label muted>›</Label></Pressable>)}</Card>
      {p!.annual&&<Card><Section title="Jahresabgleich"/><Label muted>Die Pauschale wird nur hier betrachtet. Ohne belegte Zuordnung wird sie nicht von Flugpreisen abgezogen.</Label><MoneyRow title="Pauschalgebühr" value={p!.annual.allowanceFee.knownMinor}/><MoneyRow title="Nachweislich abgedeckt" value={p!.annual.covered.knownMinor}/><MoneyRow title="Zusätzliche Flugkosten" value={p!.annual.extraFlying.knownMinor}/><MoneyRow title="Eigener Jahresgesamtbetrag" value={p!.annual.overallOwn.knownMinor}/><Label muted>Unbekannt, bis Gebühren, Deckung und Zuordnung belegt sind.</Label></Card>}
      <Card><Section title="Verein & Konten"/><MoneyRow title="Vereinskosten" value={p!.club.knownMinor}/><Label muted>Kontobewegungen und Rechnungen werden separat angezeigt und nicht zu Flugkosten addiert. Zahlung, Erstattung und Pauschalentransfer sind ohne eindeutigen Quellnachweis nicht klassifiziert.</Label>
        {view.accounts.map((item,index)=><Pressable key={item.observation.sourceAccount.selector} accessibilityRole="button" onPress={()=>setSheet({account:index})} style={s.account}><Label style={{fontWeight:'600'}}>{item.observation.sourceAccount.label}</Label><Label muted>{item.rows.length} erfasste Zeile(n) im Zeitraum · Saldo nach letzter angezeigter Buchung{item.balanceDateRaw?` (${item.balanceDateRaw})`:''}</Label><Label style={s.number}>{expenseMoney(item.balanceMinor)} ›</Label></Pressable>)}
        {!view.accounts.length&&<Label muted>Keine Kontobelege gespeichert.</Label>}
        <Action secondary onPress={()=>setSheet('sources')}>Rechnungen ansehen</Action>
      </Card>
      <Label muted>{latest?`Letzter Quellenabruf: ${new Date(latest.retrievedAt).toLocaleString('de-DE')}. ${latest.selection.sourceFlightRefs.length} eigene Quellflüge geprüft; ${latest.unknown.length} ohne auswertbare Abrechnung.`:'Noch keine dauerhafte Rechnungszuordnung gespeichert.'} Aktuell sichtbare Anbieterzeilen sind begrenzt. Ältere und andere Kosten können fehlen.</Label>
    </>}
    <Modal transparent visible={sheet!==null} animationType="slide" onRequestClose={()=>setSheet(null)}>
      <KeyboardAvoidingView style={s.scrim} behavior={Platform.OS==='ios'?'padding':'height'}><View style={s.sheet}>
        <View style={s.sheetHeader}><Label style={{fontSize:20,fontWeight:'700',flex:1}}>{sheet==='period'?'Zeitraum':accountDetail?'Kontobelege':aircraft!==undefined?aircraft??'Kennzeichen unbekannt':'Quellen & offene Angaben'}</Label><Action secondary onPress={()=>setSheet(null)}>Schließen</Action></View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:18,gap:16,paddingBottom:36}}>
          {sheet==='period'?<>
            <View style={s.wrap}>{(['year','month','custom'] as const).map((mode,index)=><Chip key={mode} title={['Jahr','Monat','Eigener Zeitraum'][index]!} selected={periodMode===mode} onPress={()=>setPeriodMode(mode)}/>)}</View>
            {periodMode==='custom'?<><Label>Von · JJJJ-MM-TT</Label><TextInput accessibilityLabel="Kosten von" value={from} onChangeText={setFrom} placeholder="2026-01-01" placeholderTextColor={colors.muted} style={s.input} maxLength={10}/><Label>Bis einschließlich · JJJJ-MM-TT</Label><TextInput accessibilityLabel="Kosten bis" value={through} onChangeText={setThrough} placeholder="2026-12-31" placeholderTextColor={colors.muted} style={s.input} maxLength={10}/></>:<><Label>Jahr</Label><TextInput accessibilityLabel="Kosten Jahr" value={year} onChangeText={setYear} keyboardType="number-pad" maxLength={4} style={s.input}/>{periodMode==='month'&&<View style={s.wrap}>{expenseMonths.map((label,index)=><Chip key={label} title={label} selected={month===index+1} onPress={()=>setMonth(index+1)}/>)}</View>}</>}
            {!valid&&<Label>Bitte einen gültigen Zeitraum eingeben.</Label>}<Action disabled={!valid} onPress={()=>{if(!valid)return;onPeriod(periodMode==='custom'?{mode:'custom',from,through}:periodMode==='year'?{mode:'year',year:Number(year)}:{mode:'month',year:Number(year),month});setSheet(null);}}>Anwenden</Action>
          </>:accountDetail?<>
            <Label style={{fontWeight:'700'}}>{accountDetail.observation.sourceAccount.label}</Label><Label muted>Unveränderte Quellwerte. Saldo ist der Stand nach der jeweiligen Buchung; keine vollständige Kontohistorie.</Label>
            {accountDetail.rows.map((row,index)=><Card key={index}>{accountDetail.observation.capture.columns.map((column,i)=><Label key={column.key}>{column.label}: {row.values[i]||'unbekannt / leer'}</Label>)}</Card>)}{!accountDetail.rows.length&&<Label>Keine erfassten Zeilen im gewählten Zeitraum.</Label>}
          </>:aircraft!==undefined?<>
            <Label muted>Belegte Abrechnungen nach Buchungsdatum; keine automatische Auswahl einer neueren Fassung.</Label>
            {contributions.map(row=>{const receipts=data?.receipts.filter(receipt=>receipt.kind==='billed-flight'&&row.evidenceRefs.includes(`bill:${receipt.id}`))??[];return <Card key={row.chargeRef}><Label style={{fontWeight:'700'}}>{expenseMoney(row.amountMinor)}</Label><Label>Buchungsdatum: {expenseDate(row.bookingDate)}</Label><Label muted>Quellflug: {row.chargeRef}</Label>{receipts.map(receipt=>{const value=receipt.value as import('../vereinsflieger/expense-flight-billing').FlightBillingObservation;return <View key={receipt.id} style={{gap:6}}><Label>Leistungsdatum: {value.source.dateRaw}</Label><Label muted>Abgerechnet: {value.source.billedRaw} · {value.source.billingModeRaw}</Label>{value.source.lines.map(line=><View key={line.position} style={{gap:3}}><Label>{line.descriptionRaw}</Label><Label muted>{line.recipientRaw} · {line.amountRaw}</Label></View>)}<Label>Quellsumme: {value.source.statedTotalRaw}</Label></View>;})}{row.evidenceRefs.map(ref=><Label selectable muted key={ref}>Beleg: {ref}</Label>)}</Card>;})}
          </>:<>
            <Label muted>Rechnungsbeträge dienen der Quellenprüfung. Sie werden nicht zusätzlich zu Flugpreisen summiert.</Label>
            {view?.statements.map((row,index)=><Card key={index}><Label style={{fontWeight:'700'}}>{row.titleRaw||`Rechnung ${row.numberRaw}`}</Label><Label>Rechnung {row.numberRaw} · Rechnungsdatum {row.dateRaw}</Label><Label>{expenseMoney(row.amountMinor)}</Label><Label muted>Empfänger: {row.recipientRaw}</Label></Card>)}
            {!view?.statements.length&&<Label>Keine erfassten Rechnungen im Zeitraum.</Label>}
            <Section title="Offene Angaben"/><Label muted>Vollständigkeit, Quellrevisionen, Zahlungs- und Erstattungsarten sowie Pauschalendeckung sind nicht bewiesen. Leere oder fehlende Werte sind keine Nullbeträge.</Label>
            {p?.issues.map((issue,index)=><Card key={index}><Label>{issueLabel(issue.code)}</Label>{issue.evidenceRefs.map(ref=><Label selectable muted key={ref}>{ref}</Label>)}</Card>)}
            {latest?.unknown.map(row=><Label muted key={row.sourceFlightRef}>Quellflug {row.sourceFlightRef}: {row.reason==='unbilled'?'noch nicht abgerechnet':'Abrechnung nicht verfügbar'}</Label>)}
          </>}
        </ScrollView>
      </View></KeyboardAvoidingView>
    </Modal>
  </View>;
}
function MoneyRow({title,value}:{title:string;value:number|null}){return <View style={s.row}><Label style={s.grow}>{title}</Label><Label style={s.number}>{expenseMoney(value)}</Label></View>;}
function issueLabel(code:string){return code.includes('conflict')||code.includes('variant')?'Abweichende Belege: dieser Betrag bleibt ungeklärt.':code.includes('date')?'Buchungsdatum nicht eindeutig belegt.':code.includes('liability')?'Eigene Zahlungspflicht nicht eindeutig belegt.':code.includes('coverage')?'Vollständigkeit des Zeitraums unbekannt.':'Quellangabe noch nicht eindeutig auswertbar.';}
const s=StyleSheet.create({page:{gap:16,width:'100%',maxWidth:600,alignSelf:'center'},wrap:{flexDirection:'row',flexWrap:'wrap',gap:8,alignItems:'center'},hero:{borderRadius:22,padding:20},amount:{fontSize:36,lineHeight:46,fontWeight:'700',fontVariant:['tabular-nums'],color:colors.text},grow:{flex:1,minWidth:0},number:{fontWeight:'600',fontVariant:['tabular-nums'],flexShrink:1},row:{minHeight:56,paddingVertical:8,flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:12},account:{minHeight:72,paddingVertical:12,gap:4,borderTopWidth:1,borderTopColor:colors.border},months:{flexDirection:'row',flexWrap:'wrap',gap:4},month:{width:'15.2%',minWidth:48,minHeight:124,alignItems:'center',paddingHorizontal:4,paddingVertical:8},track:{height:72,width:16,justifyContent:'flex-end'},small:{fontSize:12,lineHeight:20,textAlign:'center'},scrim:{flex:1,justifyContent:'flex-end',backgroundColor:'#00000088'},sheet:{width:'100%',maxWidth:600,maxHeight:'92%',alignSelf:'center',backgroundColor:colors.background,borderTopLeftRadius:24,borderTopRightRadius:24,borderWidth:1,borderColor:colors.border,overflow:'hidden'},sheetHeader:{flexDirection:'row',alignItems:'center',gap:8,padding:16,borderBottomWidth:1,borderColor:colors.border},input:{minHeight:56,padding:14,color:colors.text,backgroundColor:colors.card,borderWidth:1,borderColor:colors.border,borderRadius:12,fontSize:16}});

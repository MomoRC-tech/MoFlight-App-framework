import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import type { AiBudget, AiFeature } from '../../../../packages/ai-contracts/src/index.ts';
import type { ChatConversation, ChatMessage } from '../ai/chat-model';
import { Action, Card, Label, Section, colors, ui } from './theme';
import { SymbolIcon } from './SymbolIcon';

export interface AiChatProps {
  active?: boolean;
  conversations: ChatConversation[];
  selectedId: string | null;
  enabled: boolean;
  busy: boolean;
  loading: boolean;
  storageReady?: boolean;
  onRetryLoad?: () => void;
  notice: string | null;
  usage: AiBudget | null;
  usageAt?:string|null;
  usageStale?:boolean;
  feature: AiFeature;
  onCreate(): void;
  onSelect(id: string): void;
  onDelete(id: string): void;
  onDraft(text: string): void;
  onSend(): void;
  onCancel(): void;
  onToggle(enabled: boolean): void;
  onFeature(feature: AiFeature): void;
  onEvidence(message: ChatMessage, referenceIds: string[]): void;
}

const features: { id: AiFeature; title: string }[] = [
  { id: 'question', title: 'Frage' },
  { id: 'review', title: 'Prüfen' },
  { id: 'progress', title: 'Fortschritt' },
  { id: 'term', title: 'Begriff' },
];

const statusLabels: Record<ChatMessage['status'], string> = {
  pending: 'Wartet',
  running: 'Wird verarbeitet',
  'needs-clarification': 'Rückfrage erforderlich',
  complete: 'Abgeschlossen',
  partial: 'Teilweise beantwortet',
  interrupted: 'Unterbrochen',
  failed: 'Fehlgeschlagen',
  cancelled: 'Abgebrochen',
};

const metricLabels = {
  count: 'Flüge',
  knownMinutes: 'Bekannte Flugminuten',
  averageKnownMinutes: 'Durchschnitt bekannte Flugminuten',
} as const;

function formatEuro(microEur: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 6,
  }).format(microEur / 1_000_000);
}

function formatMetric(value: number | null, unit: 'flights' | 'minutes'): string {
  if (value === null) return 'unbekannt';
  const formatted = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(value);
  return unit === 'flights' ? formatted : `${formatted} min`;
}

function ConversationChoice({ conversation, selected, onPress }: {
  conversation: ChatConversation; selected: boolean; onPress(): void;
}) {
  const title = conversation.title.trim() || 'Unterhaltung ohne Titel';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}${selected ? ', ausgewählt' : ', auswählen'}`}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.conversationChoice, selected && styles.conversationChoiceSelected, pressed && ui.pressed]}
    >
      <Label style={[styles.conversationChoiceText, selected && styles.conversationChoiceTextSelected]}>{title}</Label>
    </Pressable>
  );
}

function MessageEvidence({ message, onEvidence }: {
  message: ChatMessage; onEvidence(message: ChatMessage, referenceIds: string[]): void;
}) {
  const answer = message.answer;
  if (!answer) return null;

  const suppliedIds = answer.evidence.map(reference => reference.id);
  const suppliedIdSet = new Set(suppliedIds);
  const actions = answer.actions.filter(action => action.referenceIds.length > 0 &&
    action.referenceIds.every(referenceId => suppliedIdSet.has(referenceId)));

  if (suppliedIds.length === 0 && actions.length === 0) return null;
  return (
    <View style={styles.evidenceGroup}>
      <Label style={styles.groupHeading}>Belege und Flüge</Label>
      <View style={styles.actionList}>
      {suppliedIds.length > 0 && (
        <View style={styles.actionCell}>
          <Action
            secondary
            label={`Belege anzeigen (${suppliedIds.length})`}
            onPress={() => onEvidence(message, suppliedIds)}
          >
            Belege anzeigen ({suppliedIds.length})
          </Action>
        </View>
      )}
      {actions.map((action, index) => {
        const title = action.kind === 'open-flight' ? 'Flug öffnen' : 'Flüge anzeigen';
        return (
          <View key={`${action.kind}-${index}`} style={styles.actionCell}>
            <Action
              secondary
              label={title}
              onPress={() => onEvidence(message, action.referenceIds)}
            >
              {title}
            </Action>
          </View>
        );
      })}
      </View>
    </View>
  );
}

export function AiChat({
  conversations, selectedId, enabled, busy, loading, notice, usage, feature, active=true, storageReady=true, onRetryLoad,
  onCreate, onSelect, onDelete, onDraft, onSend, onCancel, onToggle, onFeature, onEvidence,usageAt,usageStale,
}: AiChatProps) {
  const {width,height,fontScale}=useWindowDimensions();
  const composerMinHeight=Math.max(48,Math.ceil(22*fontScale+20));
  const composerMaxHeight=Math.max(composerMinHeight,Math.min(Math.round(112*fontScale),Math.round(height*.3)));
  const stackedFacts=fontScale>1.3;
  const factRow=[styles.budgetRow,stackedFacts&&styles.stackedBudgetRow];
  const selected=conversations.find(c=>c.id===selectedId)??null;
  const draft=selected?.draft??'';
  const [sheet,setSheet]=useState<'history'|'options'|'privacy'|'usage'|'tasks'|null>(null);
  const [query,setQuery]=useState(''),[inputHeight,setInputHeight]=useState(44),[showLatest,setShowLatest]=useState(false);
  const sheetPositions=useRef<Record<string,number>>({});
  const transcript=useRef<ScrollView>(null),positions=useRef<Record<string,number>>({}),follow=useRef(true);
  const key=selectedId??'new';
  const cannotCreate=busy||!storageReady;
  const cannotSend=!draft.trim()||!storageReady;
  useEffect(()=>{follow.current=positions.current[key]===undefined;setShowLatest(false);setInputHeight(44);},[key]);
  useEffect(()=>{if(!active){setSheet(null);Keyboard.dismiss();}},[active]);
  const open=(next:NonNullable<typeof sheet>)=>{Keyboard.dismiss();setSheet(next);};
  const detailSheet=sheet==='privacy'||sheet==='usage';
  const closeSheet=()=>setSheet(detailSheet?'options':null);
  const create=()=>{if(cannotCreate)return;setSheet(null);follow.current=true;onCreate();};
  const bottom=()=>{follow.current=true;setShowLatest(false);transcript.current?.scrollToEnd({animated:false});};
  const menuAction=(title:string,action:()=>void,label=title,destructive=false)=><Pressable accessibilityRole="button" accessibilityLabel={label} onPress={action} style={({pressed})=>[styles.menuRow,pressed&&ui.pressed]}><Label style={[styles.menuLabel,destructive&&styles.destructive]}>{title}</Label><Text accessible={false} style={styles.menuChevron}>›</Text></Pressable>;
  return <View style={styles.root}>
    <View style={styles.toolbar}>
      <Pressable accessibilityRole="button" accessibilityLabel="Chats öffnen" onPress={()=>open('history')} style={styles.iconButton}><SymbolIcon name="messages" size={22}/></Pressable>
      <Text numberOfLines={1} style={styles.chatTitle}>{selected?.title||'Neuer Chat'}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Neue Unterhaltung erstellen" disabled={cannotCreate} accessibilityState={{disabled:cannotCreate}} onPress={create} style={[styles.iconButton,cannotCreate&&styles.disabled]}><SymbolIcon name="plus" size={22}/></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Chatoptionen öffnen" onPress={()=>open('options')} style={styles.iconButton}><Text style={styles.icon}>…</Text></Pressable>
    </View>
    <ScrollView key={key} ref={transcript} testID="ai-transcript" style={styles.transcript} contentContainerStyle={styles.messages} contentOffset={{x:0,y:positions.current[key]??0}} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
      onScroll={event=>{const {contentOffset,contentSize,layoutMeasurement}=event.nativeEvent;positions.current[key]=contentOffset.y;follow.current=contentSize.height-contentOffset.y-layoutMeasurement.height<64;setShowLatest(!follow.current);}} scrollEventThrottle={32}
      onContentSizeChange={()=>{if(follow.current)transcript.current?.scrollToEnd({animated:false});}} onLayout={()=>{if(follow.current)transcript.current?.scrollToEnd({animated:false});}}>
      {loading&&<View accessible accessibilityLiveRegion="polite" accessibilityRole="progressbar" accessibilityLabel="Unterhaltungen werden geladen" accessibilityState={{busy:true}} style={styles.progress}><ActivityIndicator color={colors.cyan}/><Label muted>Unterhaltungen werden geladen …</Label></View>}
      {!loading&&onRetryLoad&&<Action secondary label="Gespeicherte Chats erneut laden" onPress={onRetryLoad}>Erneut lokal laden</Action>}
      {storageReady&&!loading&&!selected?.messages.length&&<View style={styles.welcome}><Label>Was möchtest du über deine Flüge wissen?</Label><Label muted>Schreibe eine Frage. Dein Entwurf bleibt lokal.</Label></View>}
      {selected?.messages.map(message=><View key={message.id} style={styles.exchange}>
        <View style={styles.userMessage}><Label selectable>{message.input}</Label></View>
        {message.status!=='complete'&&<Label muted style={styles.messageHeading}>{statusLabels[message.status]}</Label>}
        {message.answer&&<View style={styles.answer}><Label muted style={styles.messageHeading}>MoFlight AI</Label><Label selectable>{message.answer.text}</Label>
          {message.answer.metrics.length>0&&<View style={styles.metricRows}><Label style={styles.groupHeading}>Kennzahlen</Label>{message.answer.metrics.map(metric=><View key={metric.referenceId} style={factRow}><Label muted style={[styles.budgetName,stackedFacts&&styles.stackedBudgetName]}>{metricLabels[metric.measure]}</Label><Label style={styles.budgetValue}>{formatMetric(metric.value,metric.unit)}</Label></View>)}</View>}
          <MessageEvidence message={message} onEvidence={onEvidence}/>
        </View>}
      </View>)}
    </ScrollView>
    {busy&&<View accessible accessibilityLiveRegion="polite" accessibilityRole="progressbar" accessibilityLabel="Antwort wird verarbeitet" accessibilityState={{busy:true}} style={styles.progress}><ActivityIndicator color={colors.cyan}/><Label muted>Antwort wird verarbeitet …</Label></View>}
    {showLatest&&<Pressable accessibilityRole="button" accessibilityLabel="Zur neuesten Nachricht" onPress={bottom} style={styles.latest}><Label>Neueste Nachricht ↓</Label></Pressable>}
    {(notice||!enabled)&&<Pressable accessibilityRole="button" accessibilityLabel="KI-Status und Details öffnen" onPress={()=>open('options')} style={styles.status}><Text accessibilityLiveRegion="polite" style={styles.statusText}>{notice||'KI-Anfragen aus · Entwurf bleibt lokal'}</Text></Pressable>}
    <View testID="ai-composer" style={styles.composerPanel}>
      {feature!=='question'&&<Pressable accessibilityRole="button" accessibilityLabel="Aufgabe ändern" onPress={()=>open('tasks')} style={styles.mode}><Label muted>{features.find(f=>f.id===feature)?.title} · ändern</Label></Pressable>}
      <View style={styles.composerRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="Chatwerkzeuge öffnen" onPress={()=>open('tasks')} style={styles.iconButton}><SymbolIcon name="plus" size={22}/></Pressable>
        <TextInput accessibilityLabel="Frage oder Nachrichtenentwurf" accessibilityHint="Wird lokal gespeichert. Senden erfolgt nur mit der Sendetaste." editable={!busy&&storageReady} accessibilityState={{disabled:busy||!storageReady}} maxLength={16000} multiline scrollEnabled value={draft} onChangeText={onDraft} placeholder="Nachricht …" placeholderTextColor={colors.muted} selectionColor={colors.cyan} onContentSizeChange={e=>setInputHeight(e.nativeEvent.contentSize.height)} style={[styles.composer,{minHeight:composerMinHeight,maxHeight:composerMaxHeight,height:Math.max(composerMinHeight,Math.min(composerMaxHeight,inputHeight))}]}/>
        {busy?<Pressable accessibilityRole="button" accessibilityLabel="Laufende Antwort abbrechen" onPress={onCancel} style={styles.iconButton}><SymbolIcon name="close" size={22}/></Pressable>:<Pressable accessibilityRole="button" accessibilityLabel="Nachricht senden" disabled={cannotSend} accessibilityState={{disabled:cannotSend}} onPress={()=>{bottom();onSend();}} style={[styles.iconButton,cannotSend&&styles.disabled]}><SymbolIcon name="send" size={24}/></Pressable>}
      </View>
    </View>
    {sheet&&active&&<Modal transparent animationType="slide" onRequestClose={closeSheet} statusBarTranslucent><KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':'height'} style={[styles.scrim,width>=600&&styles.wideScrim]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Chatmenü schließen" onPress={()=>setSheet(null)} style={StyleSheet.absoluteFill}/>
      <View accessibilityViewIsModal style={styles.sheet}>
        <View style={styles.sheetHeader}>{detailSheet&&<Pressable accessibilityRole="button" accessibilityLabel="Zurück zu Chatoptionen" onPress={()=>setSheet('options')} style={styles.iconButton}><SymbolIcon name="back" size={22}/></Pressable>}<Text accessibilityRole="header" style={styles.sheetTitle}>{({history:'Chats',options:'Chatoptionen',privacy:'Dienst und Datenschutz',usage:'KI-Nutzung',tasks:'Chatwerkzeuge'})[sheet]}</Text><Pressable accessibilityRole="button" accessibilityLabel="Chatmenü schließen" onPress={()=>setSheet(null)} style={styles.iconButton}><SymbolIcon name="close" size={22}/></Pressable></View>
        {sheet==='history'&&<TextInput accessibilityLabel="Chats suchen" placeholder="Chats suchen …" value={query} onChangeText={setQuery} placeholderTextColor={colors.muted} style={styles.historySearch}/>}
        <ScrollView key={sheet} style={styles.sheetScroll} testID="ai-menu-content" contentOffset={{x:0,y:sheetPositions.current[sheet]??0}} onScroll={event=>{sheetPositions.current[sheet]=event.nativeEvent.contentOffset.y;}} scrollEventThrottle={32} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetBody}>
          {sheet==='history'&&<>{!cannotCreate&&menuAction('Neuer Chat',create,'Neue Unterhaltung erstellen')}{conversations.filter(c=>c.title.toLocaleLowerCase('de-DE').includes(query.toLocaleLowerCase('de-DE'))).map(c=><ConversationChoice key={c.id} conversation={c} selected={c.id===selectedId} onPress={()=>{onSelect(c.id);setSheet(null);}}/>)}{!conversations.length&&<Label muted>{loading?'Unterhaltungen werden geladen ...':storageReady?'Noch keine gespeicherten Chats':'Gespeicherte Chats sind gerade nicht verfügbar.'}</Label>}{conversations.length>0&&!conversations.some(c=>c.title.toLocaleLowerCase('de-DE').includes(query.toLocaleLowerCase('de-DE')))&&<Label muted>Keine passenden Chats. Ändere deinen Suchtext.</Label>}</>}
          {sheet==='options'&&<>{notice&&<View style={styles.statusGroup}><Label muted>Status</Label><Label>{notice}</Label></View>}<View style={styles.menuGroup}>{menuAction('Dienst und Datenschutz',()=>setSheet('privacy'))}{menuAction('Nutzung und Limit',()=>setSheet('usage'))}</View>{selected&&!busy&&<View style={styles.menuGroup}>{menuAction('Unterhaltung löschen',()=>{setSheet(null);onDelete(selected.id);},'Ausgewählte Unterhaltung löschen',true)}</View>}</>}
          {sheet==='privacy'&&<>      <Card style={styles.card}>
        <Section title="Dienst und Datenschutz" />
        <Label>{enabled?'Freigegeben. Eine Modellanfrage beginnt nur durch Senden.':'KI-Anfragen sind ausgeschaltet. Dein Entwurf bleibt lokal.'}</Label>
        <Label muted>Deine Unterhaltungen und Entwürfe bleiben lokal gespeichert. Wenn Anfragen verfügbar sind, können deine Frage und die für die Antwort benötigten Flugdaten an das MoFlight-Relay auf Supabase, OpenRouter und den freigegebenen Azure-Endpunkt übermittelt werden.</Label>
        <Label muted>Das persönliche Nutzungslimit beträgt 1,00 EUR je Kalendermonat (Europe/Berlin). Es gibt keine automatische Aufladung.</Label>
        <Label muted>KI-Chats und Entwürfe sind in manuellen Sicherungen enthalten. Sicherungen sind unverschlüsselt.</Label>
        <Label muted>Die KI führt keine Schreibaktionen im Web, bei Vereinsflieger oder in deinem Flugbuch aus.</Label>
        <View style={styles.toggleRow}>
          <Label style={styles.toggleState}>{enabled ? 'KI-Anfragen sind freigegeben' : 'KI-Anfragen sind ausgeschaltet'}</Label>
          <View style={styles.actionCell}>
            <Action
              secondary
              label={enabled ? 'KI-Anfragen ausschalten' : 'KI-Anfragen freigeben'}
              onPress={() => onToggle(!enabled)}
            >
              {enabled ? 'Ausschalten' : 'Freigeben'}
            </Action>
          </View>
        </View>
      </Card>

</>}
          {sheet==='usage'&&<>      {usage !== null && (
        <Card style={styles.card}>
          <Section title="KI-Nutzung" />
          <Label muted>Zeitraum: {usage.period} · {usage.timezone}</Label>
          <Label muted>{usageAt?`Abgerufen: ${usageAt}`:'Stand unbekannt'}{usageStale?' · Aktualisierung nicht verfügbar':''}</Label>
          <View style={styles.budgetRows}>
            <View style={factRow}><Label style={[styles.budgetName,stackedFacts&&styles.stackedBudgetName]}>Limit</Label><Label style={styles.budgetValue}>{formatEuro(usage.capMicroEur)}</Label></View>
            <View style={factRow}><Label style={[styles.budgetName,stackedFacts&&styles.stackedBudgetName]}>Abgerechnet</Label><Label style={styles.budgetValue}>{formatEuro(usage.settledMicroEur)}</Label></View>
            <View style={factRow}><Label style={[styles.budgetName,stackedFacts&&styles.stackedBudgetName]}>Reserviert</Label><Label style={styles.budgetValue}>{formatEuro(usage.reservedMicroEur)}</Label></View>
            <View style={factRow}><Label style={[styles.budgetName,stackedFacts&&styles.stackedBudgetName]}>Kosten ungeklärt</Label><Label style={styles.budgetValue}>{formatEuro(usage.unknownMicroEur)}</Label></View>
            <View style={factRow}><Label style={[styles.budgetName,stackedFacts&&styles.stackedBudgetName]}>Noch verfügbar</Label><Label style={styles.budgetValue}>{formatEuro(usage.remainingMicroEur)}</Label></View>
          </View>
        </Card>
      )}

{usage===null&&<Label muted>Nutzungsstand nicht verfügbar. Es wird kein Guthaben angenommen.</Label>}</>}
          {sheet==='tasks'&&<>{features.map(f=><Pressable key={f.id} accessibilityRole="button" accessibilityLabel={f.title} accessibilityState={{selected:feature===f.id}} onPress={()=>{onFeature(f.id);setSheet(null);}} style={styles.menuRow}><Label>{f.title}{feature===f.id?' ✓':''}</Label></Pressable>)}</>}
        </ScrollView>
      </View>
    </KeyboardAvoidingView></Modal>}
  </View>;
}

const styles=StyleSheet.create({
 disabled:{opacity:.4},progress:{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:8,paddingHorizontal:14,paddingVertical:8},
 root:{flex:1,minHeight:0,width:'100%',maxWidth:600,alignSelf:'center'},toolbar:{flexDirection:'row',alignItems:'center',gap:4,minHeight:48,paddingHorizontal:6},chatTitle:{flex:1,minWidth:0,fontSize:15,fontWeight:'600',color:colors.text},iconButton:{minWidth:48,minHeight:48,alignItems:'center',justifyContent:'center'},icon:{fontSize:23,color:colors.text},sendIcon:{fontSize:25,color:colors.cyan},
 transcript:{flex:1,minHeight:0},messages:{padding:14,gap:18},welcome:{paddingVertical:24,gap:8},exchange:{gap:8},userMessage:{alignSelf:'flex-end',maxWidth:'90%',backgroundColor:colors.raised,borderRadius:16,padding:12},answer:{gap:8},messageHeading:{fontSize:12,lineHeight:18},
 status:{minHeight:48,justifyContent:'center',paddingHorizontal:14,paddingVertical:4},statusText:{fontSize:12,lineHeight:17,color:colors.muted},composerPanel:{paddingHorizontal:6,paddingBottom:6,borderTopWidth:1,borderColor:colors.border},composerRow:{flexDirection:'row',alignItems:'flex-end'},composer:{flex:1,minWidth:0,paddingHorizontal:10,paddingVertical:10,color:colors.text,fontSize:16,lineHeight:22,backgroundColor:colors.card,borderRadius:14,textAlignVertical:'top'},mode:{minHeight:48,justifyContent:'center',paddingHorizontal:10},latest:{alignSelf:'center',paddingHorizontal:12,minHeight:48,justifyContent:'center',borderRadius:16,backgroundColor:colors.raised},
 scrim:{flex:1,justifyContent:'flex-end',backgroundColor:'#000712bd',padding:12,paddingTop:24},wideScrim:{justifyContent:'center'},sheet:{maxHeight:'85%',width:'100%',maxWidth:520,alignSelf:'center',backgroundColor:colors.raised,borderRadius:28,paddingBottom:12,overflow:'hidden'},sheetHeader:{flexDirection:'row',alignItems:'center',gap:4,paddingLeft:20,paddingRight:8,paddingVertical:12},sheetTitle:{flex:1,minWidth:0,fontSize:22,lineHeight:28,fontWeight:'600',color:colors.text},sheetScroll:{flexShrink:1,minHeight:0},sheetBody:{padding:12,gap:8},historySearch:{minHeight:52,color:colors.text,paddingHorizontal:16,paddingVertical:12,fontSize:16,marginHorizontal:16,marginBottom:4,borderRadius:12,borderWidth:1,borderColor:colors.muted,backgroundColor:colors.card},menuRow:{minHeight:56,flexDirection:'row',alignItems:'center',gap:12,paddingHorizontal:16,paddingVertical:12},menuLabel:{flex:1},menuChevron:{color:colors.muted,fontSize:24},destructive:{color:'#ffb39e'},menuGroup:{backgroundColor:colors.card,borderRadius:18,overflow:'hidden'},statusGroup:{padding:16,gap:8,backgroundColor:colors.card,borderRadius:18},
 card:{gap:10},toggleRow:{gap:8},toggleState:{fontWeight:'600'},actionList:{flexDirection:'row',flexWrap:'wrap',gap:8},actionCell:{flexGrow:1,flexBasis:160,minWidth:140},conversationChoice:{minHeight:56,justifyContent:'center',paddingVertical:12,paddingHorizontal:16,borderRadius:14,backgroundColor:colors.card},conversationChoiceSelected:{backgroundColor:colors.raised},conversationChoiceText:{fontSize:15,lineHeight:22},conversationChoiceTextSelected:{color:colors.cyan},groupHeading:{fontSize:14,lineHeight:20,fontWeight:'600'},evidenceGroup:{padding:12,gap:8,borderRadius:16,borderWidth:1,borderColor:colors.border},metricRows:{padding:12,gap:8,borderRadius:16,backgroundColor:colors.card},budgetRows:{gap:4},budgetRow:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',gap:8},budgetName:{flexGrow:1,flexShrink:1,flexBasis:120},budgetValue:{flexShrink:1,maxWidth:'100%'},stackedBudgetRow:{flexDirection:'column',alignItems:'stretch'},stackedBudgetName:{flexGrow:0,flexBasis:'auto'},
});

import React from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import type { AiBudget, AiFeature } from '../../../../packages/ai-contracts/src/index.ts';
import type { ChatConversation, ChatMessage } from '../ai/chat-model';
import { Action, Card, Chip, Empty, Label, Section, colors, ui } from './theme';

export interface AiChatProps {
  conversations: ChatConversation[];
  selectedId: string | null;
  enabled: boolean;
  busy: boolean;
  loading: boolean;
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
  );
}

export function AiChat({
  conversations, selectedId, enabled, busy, loading, notice, usage, feature,
  onCreate, onSelect, onDelete, onDraft, onSend, onCancel, onToggle, onFeature, onEvidence,usageAt,usageStale,
}: AiChatProps) {
  const selected = conversations.find(conversation => conversation.id === selectedId) ?? null;
  const draft = selected?.draft ?? '';
  const canSend = draft.trim().length > 0 && !busy;

  return (
    <View style={styles.root}>
      <Section title="MoFlight AI" />

      <Card style={styles.card}>
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

      {notice !== null && (
        <Card style={styles.noticeCard}>
          <View accessibilityLiveRegion="polite">
            <Label>{notice}</Label>
          </View>
        </Card>
      )}

      {usage !== null && (
        <Card style={styles.card}>
          <Section title="KI-Nutzung" />
          <Label muted>Zeitraum: {usage.period} · {usage.timezone}</Label>
          <Label muted>{usageAt?`Abgerufen: ${usageAt}`:'Stand unbekannt'}{usageStale?' · Aktualisierung nicht verfügbar':''}</Label>
          <View style={styles.budgetRows}>
            <View style={styles.budgetRow}><Label style={styles.budgetName}>Limit</Label><Label>{formatEuro(usage.capMicroEur)}</Label></View>
            <View style={styles.budgetRow}><Label style={styles.budgetName}>Abgerechnet</Label><Label>{formatEuro(usage.settledMicroEur)}</Label></View>
            <View style={styles.budgetRow}><Label style={styles.budgetName}>Reserviert</Label><Label>{formatEuro(usage.reservedMicroEur)}</Label></View>
            <View style={styles.budgetRow}><Label style={styles.budgetName}>Kosten ungeklärt</Label><Label>{formatEuro(usage.unknownMicroEur)}</Label></View>
            <View style={styles.budgetRow}><Label style={styles.budgetName}>Noch verfügbar</Label><Label>{formatEuro(usage.remainingMicroEur)}</Label></View>
          </View>
        </Card>
      )}

      <Card style={styles.card}>
        <Section title="Unterhaltungen" />
        {loading && <Label muted>Unterhaltungen werden geladen …</Label>}
        {!loading && conversations.length === 0 && (
          <Empty title="Noch keine Unterhaltung">Erstelle eine Unterhaltung, um einen lokalen Entwurf zu beginnen.</Empty>
        )}
        {conversations.length > 0 && (
          <View style={styles.conversationChoices}>
            {conversations.map(conversation => (
              <ConversationChoice
                key={conversation.id}
                conversation={conversation}
                selected={conversation.id === selectedId}
                onPress={() => onSelect(conversation.id)}
              />
            ))}
          </View>
        )}
        <View style={styles.actionList}>
          <View style={styles.actionCell}>
            <Action label="Neue Unterhaltung erstellen" onPress={onCreate}>Neue Unterhaltung</Action>
          </View>
          <View style={styles.actionCell}>
            <Action
              secondary
              disabled={selected === null}
              label="Ausgewählte Unterhaltung löschen"
              onPress={() => { if (selected) onDelete(selected.id); }}
            >
              Unterhaltung löschen
            </Action>
          </View>
        </View>
        {selectedId !== null && selected === null && <Label muted>Die ausgewählte Unterhaltung ist nicht verfügbar.</Label>}
      </Card>

      <Card style={styles.card}>
        <Section title="Aufgabe auswählen" />
        <View style={styles.featureChoices}>
          {features.map(item => (
            <Chip
              key={item.id}
              title={item.title}
              selected={feature === item.id}
              onPress={() => onFeature(item.id)}
            />
          ))}
        </View>
      </Card>

      {selected && (
        <>
          <View style={styles.transcript}>
            {selected.messages.length === 0 && (
              <Card style={styles.card}>
                <Empty title="Noch keine Nachrichten">Deine Frage und Antwort erscheinen hier.</Empty>
              </Card>
            )}
            {selected.messages.map(message => (
              <Card key={message.id} style={styles.messageCard}>
                <Label muted style={styles.messageHeading}>Du · {statusLabels[message.status]}</Label>
                <Label selectable>{message.input}</Label>
                {message.answer && (
                  <>
                    <Label muted style={styles.messageHeading}>MoFlight AI</Label>
                    <Label selectable>{message.answer.text}</Label>
                    {message.answer.metrics.length > 0 && (
                      <View style={styles.metricRows}>
                        {message.answer.metrics.map(metric => (
                          <View key={metric.referenceId} style={styles.budgetRow}>
                            <Label muted style={styles.budgetName}>{metricLabels[metric.measure]}</Label>
                            <Label>{formatMetric(metric.value, metric.unit)}</Label>
                          </View>
                        ))}
                      </View>
                    )}
                    <MessageEvidence message={message} onEvidence={onEvidence} />
                  </>
                )}
              </Card>
            ))}
          </View>

          <Card style={styles.card}>
            <Section title="Dein Entwurf" />
            {busy && <Label muted>Antwort wird verarbeitet. Du kannst den Vorgang abbrechen.</Label>}
            <TextInput
              accessibilityLabel="Frage oder Nachrichtenentwurf"
              accessibilityHint="Der Entwurf wird in der ausgewählten Unterhaltung lokal gespeichert."
              editable={!busy}
              maxLength={16000}
              multiline
              scrollEnabled={false}
              value={draft}
              onChangeText={onDraft}
              placeholder="Schreibe deine Frage …"
              placeholderTextColor={colors.muted}
              selectionColor={colors.cyan}
              style={styles.composer}
            />
            <View style={styles.actionList}>
              <View style={styles.actionCell}>
                <Action disabled={!canSend} label="Nachricht senden" onPress={onSend}>Senden</Action>
              </View>
              {busy && (
                <View style={styles.actionCell}>
                  <Action secondary label="Laufende Antwort abbrechen" onPress={onCancel}>Antwort abbrechen</Action>
                </View>
              )}
            </View>
          </Card>
        </>
      )}

      {!selected && (
        <Card style={styles.card}>
          <Empty title="Wähle eine Unterhaltung">Erstelle eine neue Unterhaltung, um deinen Entwurf lokal zu speichern.</Empty>
          {busy && <Action secondary label="Laufende Antwort abbrechen" onPress={onCancel}>Antwort abbrechen</Action>}
        </Card>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { width: '100%', maxWidth: 520, alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 8, gap: 12 },
  card: { width: '100%', gap: 10 },
  noticeCard: { width: '100%', borderColor: colors.cyan },
  toggleRow: { flexDirection: 'row', alignItems: 'stretch', flexWrap: 'wrap', gap: 8 },
  toggleState: { flex: 1, minWidth: 160, alignSelf: 'center', fontWeight: '600' },
  actionList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionCell: { flexGrow: 1, flexBasis: 160, minWidth: 140 },
  conversationChoices: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'stretch', gap: 8 },
  conversationChoice: {
    minHeight: 48, minWidth: 66, maxWidth: '100%', alignSelf: 'flex-start', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: colors.card,
  },
  conversationChoiceSelected: { backgroundColor: colors.blue, borderColor: colors.blue },
  conversationChoiceText: { flexShrink: 1, fontSize: 14, lineHeight: 20 },
  conversationChoiceTextSelected: { color: '#031326', fontWeight: '700' },
  featureChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  transcript: { width: '100%', gap: 10 },
  messageCard: { width: '100%', gap: 8 },
  messageHeading: { fontWeight: '600' },
  metricRows: { gap: 4, paddingTop: 4 },
  budgetRows: { gap: 4 },
  budgetRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  budgetName: { flex: 1, minWidth: 120 },
  composer: {
    width: '100%', minHeight: 120, borderWidth: 1, borderColor: colors.border, borderRadius: 20,
    backgroundColor: colors.background, paddingHorizontal: 16, paddingVertical: 14,
    color: colors.text, fontSize: 16, lineHeight: 24, textAlignVertical: 'top',
  },
});

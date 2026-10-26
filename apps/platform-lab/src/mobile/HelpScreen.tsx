import React from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Action, Chip, Label, Section, colors, ui } from './theme';
import { HELP_CATEGORIES, helpEntry, searchHelpEntries, type HelpCategory } from './help-catalog';
import { SymbolIcon } from './SymbolIcon';

export interface HelpScreenProps {
  entryId: string | null;
  query: string;
  category: HelpCategory | null;
  onQuery: (query: string) => void;
  onCategory: (category: HelpCategory | null) => void;
  onEntry: (id: string | null) => void;
  onReturn: () => void;
  onReplay: () => void;
  onStatus: () => void;
  returnLabel: string;
  helpEnabled: boolean;
}

/** Curated local answers only. This surface has no chat composer or provider access. */
export function HelpScreen({ entryId, query, category, onQuery, onCategory, onEntry, onReturn, onReplay, onStatus, returnLabel, helpEnabled }: HelpScreenProps) {
  const selected = entryId ? helpEntry(entryId) : null;
  if (entryId) return <View style={s.body}>
    <Label style={s.eyebrow}>HILFE · OFFLINE</Label>
    <Section title={selected?.title ?? 'Antwort nicht verfügbar'} />
    {selected ? <>
      <View style={s.answer}>
        <Label selectable>{selected.answer}</Label>
        {selected.boundary && <View style={s.boundary}><Label selectable>{selected.boundary}</Label></View>}
        <Label muted style={s.source}>Quelle: {selected.source} · Inhaltstand {selected.updatedAt}</Label>
        {selected.sourceUrl && <Pressable accessibilityRole="link" accessibilityLabel="Externe Quelle öffnen, Internet erforderlich" onPress={() => { void Linking.openURL(selected.sourceUrl!).catch(() => {}); }} style={({ pressed }) => [s.link, pressed && ui.pressed]}><Label style={s.linkText}>Externe Quelle öffnen</Label><Label muted>Internet erforderlich</Label></Pressable>}
      </View>
      {selected.id === 'empty-flights' || selected.id === 'partial-update' ? <Action secondary onPress={onStatus}>Datenstatus öffnen</Action> : null}
    </> : <View style={s.answer}><Label>Dazu haben wir noch keine geprüfte Hilfe.</Label><Label muted>Du kannst die Themen durchsuchen. Es wird keine Antwort geraten oder online angefragt.</Label></View>}
    <Action secondary onPress={() => onEntry(null)}>Alle Hilfethemen</Action>
    <Action onPress={onReturn}>{returnLabel}</Action>
  </View>;

  const results = searchHelpEntries(query, category);
  return <View style={s.body}>
    <Label style={s.eyebrow}>HILFE · OFFLINE</Label>
    <View style={s.searchBox}><SymbolIcon name="search" size={20} tone="muted"/><TextInput testID="help-search" accessibilityLabel="Hilfe durchsuchen" value={query} onChangeText={onQuery} placeholder="Hilfe durchsuchen …" placeholderTextColor={colors.muted} returnKeyType="search" style={s.search} /></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={s.categories} accessibilityLabel="Hilfethemen">
      <Chip title="Alle" selected={category === null} onPress={() => onCategory(null)} />
      {HELP_CATEGORIES.map(item => <Chip key={item} title={item} selected={category === item} onPress={() => onCategory(item)} />)}
    </ScrollView>
    <View style={s.topics}><Section title={query.trim() ? 'Suchergebnisse' : category ?? 'Häufig gefragt'} />
      {results.length ? results.map(entry => <Pressable key={entry.id} accessibilityRole="button" accessibilityLabel={entry.title} onPress={() => onEntry(entry.id)} style={({ pressed }) => [s.result, pressed && ui.pressed]}>
        <View style={s.resultText}><Label style={s.resultTitle}>{entry.title}</Label><Label muted>{entry.short}</Label></View><Text style={s.arrow}>›</Text>
      </Pressable>) : <Label muted>Keine geprüfte Hilfe gefunden. Anderen Begriff oder ein anderes Thema wählen.</Label>}
    </View>
    <View style={s.introduction}><Section title="Einführung" />{helpEnabled ? <><Label muted>Öffne den Hinweis zu Flüge erneut. Dabei werden weder Daten abgerufen noch geändert.</Label><Action secondary onPress={onReplay}>Hinweis zu Flüge ansehen</Action></> : <Label muted>Kontexthilfe ist ausgeschaltet. Du kannst die Hilfethemen weiter lesen und die Hinweise im Profil wieder einschalten.</Label>}</View>
    <Label muted style={s.footer}>Die Antworten sind lokal gespeichert. Externe Quellen öffnen sich nur, wenn du den Link auswählst. AI-Anfragen bleiben im separaten AI-Bereich.</Label>
  </View>;
}

const s = StyleSheet.create({
  body: { width: '100%', maxWidth: 520, alignSelf: 'center', gap: 16 },
  eyebrow: { color: colors.cyan, fontSize: 12, lineHeight: 18, fontWeight: '700', letterSpacing: .8 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, borderWidth: 1, borderColor: '#82959e', borderRadius: 12, backgroundColor: colors.card, paddingHorizontal: 12 },
  search: { flex: 1, minHeight: 48, color: colors.text, fontSize: 16 },
  categories: { gap: 6, alignItems: 'center', paddingRight: 12 },
  topics: { gap: 8 },
  result: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  resultText: { flex: 1, minWidth: 0, gap: 2 }, resultTitle: { fontWeight: '600' },
  arrow: { color: colors.cyan, fontSize: 24 },
  answer: { gap: 16, padding: 16, borderRadius: 12, backgroundColor: colors.card },
  boundary: { borderLeftWidth: 2, borderLeftColor: colors.cyan, paddingLeft: 12 },
  source: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12, fontSize: 12, lineHeight: 18 },
  link: { minHeight: 48, justifyContent: 'center', gap: 2 }, linkText: { color: colors.cyan, fontWeight: '600' },
  introduction: { gap: 10, paddingTop: 8 },
  footer: { fontSize: 12, lineHeight: 18 },
});

import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { expenseMoney, type financialAnalysisView } from './financial-analysis-model';
import { Label, colors } from './theme';

type Month = ReturnType<typeof financialAnalysisView>['monthly'][number];

/** One chronological axis; exact values remain readable without estimating bars. */
export function ExpenseMonthlyChart({ months, selectedMonth, onMonth }: {
  months: readonly Month[]; selectedMonth?: number; onMonth: (month: Month) => void;
}) {
  const maximum = Math.max(1, ...months.map(month => month.knownMinor ?? 0));
  return <View style={{ gap: 8 }}>
    <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={s.months}>
      {months.map(month => <Pressable key={`${month.year}-${month.month}`} accessibilityRole="button"
        accessibilityLabel={`${month.label} ${month.year}: ${expenseMoney(month.knownMinor)}${month.knownMinor === null ? ', Betrag unbekannt' : ', bekannter Teilbetrag'}${month.state === 'conflict' ? ', Widerspruch' : ''}`}
        accessibilityState={{ selected: selectedMonth === month.month }} onPress={() => onMonth(month)}
        style={[s.month, selectedMonth === month.month && s.selected]}>
        <View style={s.track}><View style={{ width: 20, height: month.knownMinor === null ? 2 : Math.max(3, 72 * Math.max(0, month.knownMinor) / maximum),
          backgroundColor: month.state === 'conflict' ? colors.orange : month.knownMinor === null ? colors.muted : colors.cyan, borderRadius: 3 }} /></View>
        <Label style={s.label}>{month.label}</Label>
        <Label style={s.amount}>{expenseMoney(month.knownMinor)}</Label>
        {month.state === 'conflict' && <Label style={s.warning}>Widerspruch</Label>}
      </Pressable>)}
    </ScrollView>
    <Label muted>Monate seitlich ansehen · Monat antippen für Belege. — unbekannt; 0,00 € ist ein belegter Nullbetrag.</Label>
  </View>;
}

const s = StyleSheet.create({
  months: { gap: 4, paddingVertical: 4 },
  month: { minWidth: 80, minHeight: 124, alignItems: 'center', padding: 8, gap: 4, borderWidth: 1, borderColor: 'transparent', borderRadius: 12 },
  selected: { borderColor: colors.cyan, backgroundColor: colors.raised },
  track: { height: 72, justifyContent: 'flex-end', alignItems: 'center' },
  label: { fontWeight: '600' },
  amount: { fontSize: 13, lineHeight: 20, fontVariant: ['tabular-nums'] },
  warning: { color: colors.orange, fontSize: 12, lineHeight: 18 },
});

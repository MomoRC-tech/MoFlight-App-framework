import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { expenseMoney, type financialAnalysisView } from './financial-analysis-model';
import { TrendChart } from './TrendChart';
import { Label, colors } from './theme';

type Month = ReturnType<typeof financialAnalysisView>['monthly'][number];

/** Full-year price trend with compact, exact month choices and parent-owned period selection. */
export function ExpenseMonthlyChart({ months, selectedMonth, onMonth }: {
  months: readonly Month[]; selectedMonth?: number; onMonth: (month: Month) => void;
}) {
  const selectedIndex = selectedMonth === undefined ? -1 : months.findIndex(month => month.month === selectedMonth);
  const selected = selectedIndex >= 0 ? months[selectedIndex] : undefined;
  const selectMonth = (index: number) => {
    const month = months[index];
    if (month) onMonth(month);
  };
  return <View style={s.chart}>
    <TrendChart
      values={months.map(month => month.knownMinor)}
      labels={months.map(month => month.label)}
      uncertain={months.map(month => month.state === 'conflict')}
      selectedIndex={selectedIndex >= 0 ? selectedIndex : null}
      onSelect={selectMonth}
      color={colors.cyan}
      height={124}
      accessibilityLabel="Monatsvergleich der bekannten Teilbeträge in Euro. Unbekannte Beträge bleiben als Lücken sichtbar; Widersprüche sind markiert."
      formatValue={expenseMoney}
    />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.months}>
      {months.map(month => <Pressable key={`${month.year}-${month.month}`} accessibilityRole="button"
        accessibilityLabel={`${month.label} ${month.year}: ${expenseMoney(month.knownMinor)}${month.knownMinor === null ? ', Betrag unbekannt' : ', bekannter Teilbetrag'}${month.state === 'conflict' ? ', Widerspruch' : ''}`}
        accessibilityState={{ selected: selectedMonth === month.month }} onPress={() => onMonth(month)}
        style={[s.month, selectedMonth === month.month && s.selected]}>
        <Label style={[s.monthLabel, selectedMonth === month.month && s.selectedText]}>{month.label}</Label>
        {month.state === 'conflict' && <View accessible={false} style={s.conflictMark}><Label style={s.warning}>!</Label></View>}
      </Pressable>)}
    </ScrollView>
    {selected && <View style={s.selection}>
      <Label muted style={s.selectedLabel}>{selected.label} {selected.year}</Label>
      <Label style={s.selectedAmount}>{expenseMoney(selected.knownMinor)}</Label>
      {selected.state === 'conflict' && <Label style={s.warningText}>Widerspruch</Label>}
    </View>}
    {months.some(month => month.knownMinor === null) && <Label muted style={s.legend}>— Betrag unbekannt</Label>}
  </View>;
}

const s = StyleSheet.create({
  chart: { gap: 4 },
  months: { gap: 4, paddingVertical: 2 },
  month: { minWidth: 48, minHeight: 48, paddingHorizontal: 10, borderWidth: 1, borderColor: 'transparent', borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4 },
  selected: { borderColor: colors.cyan, backgroundColor: colors.raised },
  monthLabel: { fontSize: 12, lineHeight: 18, fontWeight: '600', fontVariant: ['tabular-nums'] },
  selectedText: { color: colors.text },
  conflictMark: { width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffb49a22' },
  warning: { color: colors.orange, fontSize: 11, lineHeight: 15, fontWeight: '800' },
  selection: { minHeight: 36, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, paddingHorizontal: 4 },
  selectedLabel: { fontSize: 12, lineHeight: 18 },
  selectedAmount: { fontSize: 15, lineHeight: 22, fontWeight: '700', fontVariant: ['tabular-nums'] },
  warningText: { color: colors.orange, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  legend: { fontSize: 11, lineHeight: 16, paddingHorizontal: 4 },
});

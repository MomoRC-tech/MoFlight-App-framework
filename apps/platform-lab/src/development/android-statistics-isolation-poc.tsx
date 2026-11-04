import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import MobileApp from '../mobile/MobileApp';
import { colors } from '../mobile/theme';
import { cleanupStatisticsIsolationProof, prepareStatisticsIsolationProof } from './android-statistics-isolation-fixture';
import type { PreparedStatisticsIsolationProof, StatisticsIsolationAccountReport, StatisticsIsolationOwnerKey,
  StatisticsIsolationProofReport } from './android-statistics-isolation-fixture';

type Fixture = PreparedStatisticsIsolationProof['fixture'];
type BuildMode = 'seed' | 'verify';
let buildNamespace = '', buildMode: BuildMode = 'verify';

/** Build-only entry; the ordinary Expo entry never imports this selector. */
export function configureStatisticsIsolationProof(namespace: string, mode: BuildMode): void {
  if (!/^[a-z][a-z0-9-]{0,30}$/.test(namespace) || !['seed', 'verify'].includes(mode)) {
    throw new Error('Invalid Statistics isolation proof configuration.');
  }
  buildNamespace = namespace;
  buildMode = mode;
}

function reportLine(report: StatisticsIsolationAccountReport): string {
  return `${report.key} / ${report.accountRef}: 2026 ${report.year.count} · ${report.year.durationLabel} h · Quellen ${report.year.contributorRefs.join(', ')} · Zeit unbekannt ${report.year.unknownDurationRefs.join(', ') || 'keine'} · 2025 leer; alle ${report.all.count} · ${report.all.durationLabel} h · undatiert ${report.all.unknownDateCount} · Cache ${report.preview.staleSelectionRejected ? 'alt verworfen' : 'frisch geprüft'}`;
}

function replaceReport(previous: StatisticsIsolationProofReport, next: StatisticsIsolationAccountReport): StatisticsIsolationProofReport {
  return { ...previous, selectedKey: next.key, accounts: previous.accounts.map(account => account.key === next.key ? next : account) };
}

export default function AndroidStatisticsIsolationProof() {
  const [fixture, setFixture] = useState<Fixture | null>(null);
  const [report, setReport] = useState<StatisticsIsolationProofReport | null>(null);
  const [state, setState] = useState('STATISTICS_ISOLATION_STARTING');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shellKey, setShellKey] = useState(0);

  useEffect(() => {
    let active = true;
    void prepareStatisticsIsolationProof(progress => { if (active) setState(progress); }).then(prepared => {
      if (!active) return;
      setFixture(prepared.fixture);
      setReport(prepared.report);
      setState(prepared.mode === 'seed' ? 'STATISTICS_ISOLATION_SEEDED_OFFLINE' : 'STATISTICS_ISOLATION_REOPENED_OFFLINE');
    }).catch(cause => {
      if (!active) return;
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      setState('STATISTICS_ISOLATION_FAILED_PRESERVE_FIXTURE');
      console.error('MOFLIGHT_STATISTICS_ISOLATION_FAILED', message);
    });
    return () => { active = false; };
  }, []);

  const select = async (key: StatisticsIsolationOwnerKey) => {
    if (!fixture || busy) return;
    setBusy(true);
    setError(null);
    setState(`STATISTICS_ISOLATION_SWITCHING_${key}`);
    setFixture(null); // Unmount the production shell before changing its durable owner selection.
    try {
      await new Promise<void>(resolve => { setTimeout(resolve, 0); });
      const selected = await fixture.select(key);
      setReport(previous => previous ? replaceReport(previous, selected) : previous);
      setShellKey(value => value + 1);
      setFixture(fixture);
      setState(`STATISTICS_ISOLATION_SELECTED_${key}_OFFLINE`);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      setState('STATISTICS_ISOLATION_SWITCH_FAILED');
      console.error('MOFLIGHT_STATISTICS_ISOLATION_SWITCH_FAILED', message);
    } finally { setBusy(false); }
  };

  const cleanup = async () => {
    if (busy) return;
    setBusy(true);
    setFixture(null);
    try {
      await new Promise<void>(resolve => { setTimeout(resolve, 0); });
      const removed = fixture ? (await fixture.cleanup(), true) : await cleanupStatisticsIsolationProof();
      setReport(null);
      setState(removed ? 'STATISTICS_ISOLATION_CLEANED_OWNED_FIXTURE' : 'STATISTICS_ISOLATION_NO_FIXTURE');
      setError(null);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      setState('STATISTICS_ISOLATION_CLEANUP_FAILED_PRESERVE_DATA');
      console.error('MOFLIGHT_STATISTICS_ISOLATION_CLEANUP_FAILED', message);
    } finally { setBusy(false); }
  };

  const current = report?.accounts.find(account => account.key === report.selectedKey);
  return <SafeAreaProvider>
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <View style={{ paddingHorizontal: 10, paddingTop: 4, paddingBottom: 6, gap: 4 }}>
          <Text accessibilityRole="header" style={{ color: colors.cyan, fontSize: 13, fontWeight: '700' }}>
            Test-only fixture selector · {buildNamespace || 'unconfigured'} · build {buildMode}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['A', 'B'] as const).map(key => <Pressable key={key} accessibilityRole="button"
              accessibilityLabel={`Fixturekonto ${key} · ${key === 'A' ? '101' : '202'} auswählen`}
              accessibilityState={{ disabled: !fixture || busy }} disabled={!fixture || busy} onPress={() => void select(key)}
              style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, backgroundColor: colors.raised, opacity: !fixture || busy ? 0.55 : 1 }}>
              <Text style={{ color: colors.text, fontWeight: '600' }}>Konto {key} · {key === 'A' ? '101' : '202'}</Text>
            </Pressable>)}
            <Pressable accessibilityRole="button" accessibilityLabel="Synthetische Statistikdaten bereinigen"
              accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => void cleanup()}
              style={{ marginLeft: 'auto', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, backgroundColor: colors.raised, opacity: busy ? 0.55 : 1 }}>
              <Text style={{ color: colors.text }}>Bereinigen</Text>
            </Pressable>
          </View>
          <Text accessibilityLiveRegion="polite" style={{ color: error ? colors.orange : colors.green, fontSize: 10 }}>
            {state}{current ? ` · ausgewählt ${current.key}/${current.accountRef} · Jahr ${current.year.count} / ${current.year.durationLabel} h · gesamt ${current.all.count} / ${current.all.durationLabel} h` : ''}
          </Text>
          {error && <Text style={{ color: colors.orange, fontSize: 10 }}>{error}</Text>}
          {report && <ScrollView style={{ maxHeight: 56 }}>
            {report.accounts.map(account => <Text key={account.key} style={{ color: colors.muted, fontSize: 9 }}>
              {reportLine(account)}
            </Text>)}
          </ScrollView>}
        </View>
      </SafeAreaView>
      <View style={{ flex: 1 }}>
        {fixture ? <MobileApp key={shellKey} ownFlightReadPorts={fixture.ports} /> : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: colors.text }}>{state}</Text>
        </View>}
      </View>
    </View>
  </SafeAreaProvider>;
}

import React, { useEffect, useState } from 'react';
import { ScrollView, Text, View, useWindowDimensions } from 'react-native';
import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';
import { File, Paths } from 'expo-file-system';
import { openRealFlightNativeDriver } from '../vereinsflieger/real-flight-native-driver';
import { Dashboard } from '../mobile/Dashboard';
import { OwnFlights, type OwnFlightHeader } from '../mobile/OwnFlights';
import { StatisticsOverlay } from '../mobile/StatisticsOverlay';
import type { StatisticsSection } from '../mobile/statistics-overlay-model';
import type { useOwnFlights } from '../mobile/use-own-flights';
import type { RealFlightDetail } from '../vereinsflieger/real-flight-library';
import { Action, colors } from '../mobile/theme';
import { DUPLICATE_PROOF_MARKER, duplicateCountProof, duplicateProofFile } from './duplicate-count-proof';

/** Build-only synthetic entry. No ordinary registry, provider or user settings. */
export default function DuplicateCountProof() {
  const [loaded, setLoaded] = useState<Awaited<ReturnType<typeof duplicateCountProof>> | null>(null);
  const [status, setStatus] = useState('RUNNING'), [runId, setRunId] = useState<string | null>(null);
  const [page, setPage] = useState<'start' | 'statistics' | 'flights'>('start');
  const [section, setSection] = useState<StatisticsSection>('overview');
  const [detail, setDetail] = useState<RealFlightDetail | null>(null);
  const [header, setHeader] = useState<OwnFlightHeader>({ title: 'Flüge' });
  const { width, fontScale } = useWindowDimensions();
  useEffect(() => {
    let active = true;
    void (async () => {
      const marker = new File(Paths.document, DUPLICATE_PROOF_MARKER);
      const seed = !marker.exists;
      const id = seed ? Crypto.randomUUID() : (await marker.text()).trim();
      const value = await duplicateCountProof({
        open: name => openRealFlightNativeDriver(name, (n, options) => SQLite.openDatabaseAsync(n, options)),
        hash: text => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text), uuid: Crypto.randomUUID,
      }, id, seed);
      if (seed) { marker.create({ overwrite: false }); marker.write(id); }
      console.info('MOFLIGHT_DUPLICATE_PROOF ' + JSON.stringify(value.report));
      if (active) { setLoaded(value); setRunId(id); setStatus('DUPLICATE_PROOF_PASSED ' + value.report.mode); }
    })().catch(() => { if (active) setStatus('DUPLICATE_PROOF_FAILED'); });
    return () => { active = false; };
  }, []);
  const data: ReturnType<typeof useOwnFlights> = {
    preview: null, view: loaded?.view ?? null, phase: loaded ? 'ready' : 'loading', detail,
    detailBusy: false, detailError: null, clearDetail: () => setDetail(null), reload: async () => {},
    openDetail: async flight => { setDetail(loaded?.details.find(row => row.flightId === flight.flightId) ?? null); },
  };
  const cleanup = async () => {
    if (!runId) return;
    await SQLite.deleteDatabaseAsync(duplicateProofFile(runId));
    new File(Paths.document, DUPLICATE_PROOF_MARKER).delete();
    setLoaded(null); setRunId(null); setStatus('DUPLICATE_PROOF_CLEANED');
  };
  return <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: 28 }}>
    <Text style={{ color: colors.text }}>Synthetic duplicate count proof · {status}</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
      <Action secondary onPress={() => setPage('start')}>Proof Start</Action>
      <Action secondary onPress={() => { setSection('overview'); setPage('statistics'); }}>Proof Statistics</Action>
      <Action secondary onPress={() => { setDetail(null); setPage('flights'); }}>Proof Flights</Action>
      <Action secondary onPress={() => { void cleanup().catch(() => setStatus('DUPLICATE_PROOF_CLEANUP_FAILED')); }}>Cleanup proof</Action>
    </View>
    {loaded && (page === 'statistics' ? <StatisticsOverlay data={data} initialYear={2026} initialSection={section}
      today="2026-10-20" fontScale={fontScale} onBackHandler={() => {}} onClose={() => setPage('start')} />
      : page === 'flights' ? <View style={{ flex: 1 }}>
        {header.back && <Action secondary onPress={header.back}>Proof detail Back</Action>}
        <OwnFlights active data={data} onHeaderChange={setHeader} />
      </View> : <ScrollView contentContainerStyle={{ padding: 12 }}>
        <Dashboard persistDutyTarget={false} ownFlights={loaded.view} ownFlightPhase="ready" pending={null}
          width={width} fontScale={fontScale} now={Date.parse('2026-10-20T12:00:00Z')}
          onPaper={() => {}} onFlights={() => setPage('flights')} onFlight={() => setPage('flights')}
          onStatistics={(_year, selected = 'overview') => { setSection(selected); setPage('statistics'); }} />
      </ScrollView>)}
  </View>;
}

import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Directory, File, Paths } from 'expo-file-system';
import { StorageAccessFramework } from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import * as Crypto from 'expo-crypto';
import { LocalLogbook } from '@moflight/local-data';
import { findings, query, reviewRequired, literalFields, counterKeys, type Source, type Page, type History, type Template, type Filters, type Counters } from '@moflight/flight-logbook';
import fixture from '../../../tests/fixtures/local-logbook/mobile.json';
import { loadSelections, saveSelection, open, type Selection } from './storage';
import { AccessProbe } from './vereinsflieger/AccessProbe';
import { BookLab } from './BookLab';
import { activatePrepared } from './activation';

const empty: History = { source: null, lastAttempt: null, flights: [], paper: [], findings: [], decisions: [] };
const choices: [string, Filters][] = [
  ['D-EX01', { registration: 'D-EX01' }], ['ASK 21', { aircraft_model: 'ASK 21' }],
  ['Example Alex · p1 · instructor', { person_id: 'fixture:p1', role: 'instructor' }],
  ['Example Alex · p2 · instructor', { person_id: 'fixture:p2', role: 'instructor' }],
];
function Button({ title, onPress, disabled = false }: { title: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[styles.button, disabled && styles.disabled]}><Text style={styles.buttonText}>{title}</Text></Pressable>;
}
function Totals({ title, values }: { title: string; values: Counters | null }) {
  return <View style={styles.card}><Text style={styles.heading}>{title}</Text>{values ? counterKeys.map(k => <Text key={k} style={styles.body}>{k.replaceAll('_', ' ')}: {k === 'landings' ? values[k] : `${Math.floor(values[k] / 60)}:${String(values[k] % 60).padStart(2, '0')}`} {k === 'landings' ? '' : 'h:mm'}</Text>) : <Text style={styles.body}>Leave every total field blank — partial page.</Text>}</View>;
}
export default function App() {
  const [showBooks, setShowBooks] = useState(false);
  const [showAccessProbe, setShowAccessProbe] = useState(false);
  const repo = useRef<LocalLogbook | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [history, setHistory] = useState<History>(empty);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [filterIndex, setFilterIndex] = useState(0);
  const [basis, setBasis] = useState<'effective' | 'source' | 'paper'>('effective');
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState('Opening remembered local state…');
  async function refresh(next: LocalLogbook = repo.current!) {
    setHistory(await next.history());
    const ts = await next.list<Template>('template'); setTemplates(ts);
    setTemplateId(old => ts.some(t => t.id === old) ? old : ts.at(-1)?.id ?? null);
  }
  async function install(next: LocalLogbook, s: Selection) {
    // Stage every UI reader before committing the selection. No refresh after
    // switching can invalidate the previous usable repository.
    await activatePrepared(async () => {
      const h = await next.history(), ts = await next.list<Template>('template');
      findings(h); for (const basis of ['effective', 'source', 'paper'] as const) query(h, { basis });
      for (const t of ts) { reviewRequired(t, h); for (const p of t.pages) for (const r of p.rows) literalFields(r); }
      return { h, ts };
    }, () => saveSelection(s), ({ h, ts }) => {
      const previous = repo.current; repo.current = next;
      setHistory(h); setTemplates(ts); setTemplateId(ts.at(-1)?.id ?? null); setSelection(s);
      void previous?.db.close().catch(() => {});
    }, () => next.db.close());
  }
  async function activate(s: Selection) { await install(await open(s), s); }
  useEffect(() => {
    let cancelled = false;
    void loadSelections().then(async choices => {
      let failure: unknown;
      for (const [index, s] of choices.entries()) {
        if (cancelled) return;
        try { await activate(s); if (!cancelled) { setBusy(false); setMessage(index ? 'Remembered state loaded. Recovered previous usable selection; newer database preserved for review.' : 'Remembered state loaded. Synthetic lab.'); } return; }
        catch (e) { failure = e; }
      }
      throw failure;
    }).catch(e => { if (!cancelled) { setBusy(false); setMessage(String(e)); } });
    return () => { cancelled = true; void repo.current?.db.close(); };
  }, []);
  const operationLock = useRef(false);
  async function act(work: () => Promise<void | string>) {
    if (operationLock.current || busy) return;
    operationLock.current = true; setBusy(true);
    try { const outcome = await work(); if (repo.current) await refresh(); setMessage(outcome ?? 'Saved on this device.'); }
    catch (e) { setMessage(e instanceof Error ? e.message : String(e)); }
    finally { operationLock.current = false; setBusy(false); }
  }
  const t = templates.find(t => t.id === templateId) ?? null;
  const result = query(history, { ...choices[filterIndex]![1], basis });
  const review = t ? reviewRequired(t, history) : false;
  async function seed() {
    const r = repo.current!;
    await r.importSource(fixture.source as Omit<Source, 'id'>);
    if (!(await r.get('page', 'prepared-page'))) await r.preparePage(fixture.page as Page, fixture.raw_page);
  }
  async function exportBackup() {
    const text = await repo.current!.backup();
    const folder = new Directory(Paths.document, 'moflight-backups', repo.current!.datasetId);
    folder.create({ intermediates: true, idempotent: true });
    const file = new File(folder, `backup-${Crypto.randomUUID()}.json`); file.create(); file.write(text);
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Save synthetic MoFlight backup' });
    // Private file remains available for repeat export; sharing cancellation is not proof of external backup.
    return 'Backup prepared in app storage. Sharing does not confirm external saving.';
  }
  async function saveBackupToFolder() {
    const permission = await StorageAccessFramework.requestDirectoryPermissionsAsync(StorageAccessFramework.getUriForDirectoryInRoot('Documents'));
    if (!permission.granted) return 'Backup save cancelled. No external file created.';
    const text = await repo.current!.backup();
    const uri = await StorageAccessFramework.createFileAsync(permission.directoryUri, `moflight-backup-${Crypto.randomUUID()}`, 'application/json');
    await StorageAccessFramework.writeAsStringAsync(uri, text);
    if (await StorageAccessFramework.readAsStringAsync(uri) !== text) throw new Error('Backup verification failed. Save again before relying on this file.');
    return 'Backup saved and verified in the selected device folder.';
  }
  async function restoreBackup() {
    const picked = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
    if (picked.canceled) return 'Backup restore cancelled. Current data unchanged.';
    const selectedFile = picked.assets[0]!;
    if (selectedFile.size && selectedFile.size > 2_000_000) throw new Error('Backup exceeds synthetic lab limit');
    const input = new File(selectedFile.uri); const text = await input.text();
    if (text.length > 2_000_000) throw new Error('Backup exceeds synthetic lab limit');
    const outer = JSON.parse(text), payload = JSON.parse(outer.payload);
    const nextSelection: Selection = { datasetId: payload.dataset_id, databaseName: `restore-${Crypto.randomUUID()}.sqlite` };
    const restored = await open(nextSelection);
    try { await restored.restore(text); }
    catch (e) { await restored.db.close(); throw e; }
    await install(restored, nextSelection);
    return 'Backup restored into a new local database. Previous database preserved.';
  }
  if (showBooks) return <SafeAreaProvider><SafeAreaView style={styles.screen}><BookLab close={() => setShowBooks(false)} /></SafeAreaView></SafeAreaProvider>;
  if (showAccessProbe) return <SafeAreaProvider><SafeAreaView style={styles.screen}><AccessProbe close={() => setShowAccessProbe(false)} /></SafeAreaView></SafeAreaProvider>;
  return <SafeAreaProvider><SafeAreaView style={styles.screen}><ScrollView contentContainerStyle={styles.container}>
    <Text style={styles.title}>MoFlight Lab</Text>
    <Button title="Open Vereinsflieger access PoC" disabled={busy} onPress={() => setShowAccessProbe(true)} />
    <Button title="Open multiple-logbook lab" disabled={busy} onPress={() => setShowBooks(true)} />
    <Text style={styles.banner}>SYNTHETIC DATA · Prepared observations and CSV. No handwriting recognition or live Vereinsflieger retrieval.</Text>
    <Text accessibilityLiveRegion="polite" style={styles.body}>{message}</Text>{busy && <ActivityIndicator />}
    <Text style={styles.body}>Local dataset: {selection?.datasetId ?? 'opening'} · {selection?.databaseName ?? ''}</Text>
    <View style={styles.actions}>{(['a', 'b'] as const).map(id => <Button key={id} disabled={busy} title={`Open dataset ${id.toUpperCase()}`} onPress={() => void act(() => activate({ datasetId: `synthetic-lab-${id}`, databaseName: `lab-${id}.sqlite` }))} />)}</View>
    <Button disabled={busy || !repo.current} title="Import prepared synthetic CSV and page" onPress={() => void act(seed)} />
    <Text style={styles.heading}>Remembered paper and source</Text>
    <Text style={styles.body}>{history.paper.length} individually confirmed paper entries. Template preparation/viewing never confirms copying.</Text>
    <Text style={styles.body}>Last successful import: {history.source?.retrieved_at ?? 'none'}{history.lastAttempt && !history.lastAttempt.successful ? ' · newer refresh failed; prior history retained' : ''}</Text>
    <Text style={styles.body}>Coverage: {history.source ? `${history.source.coverage.from} – ${history.source.coverage.through}; incomplete` : 'unknown'} · cached local data.</Text>
    {findings(history).map(f => <View style={styles.card} key={f.id}><Text style={styles.heading}>Finding: {f.field}</Text><Text style={styles.body}>Source {f.source_value} / paper {f.paper_value} · {f.status}</Text>
      <Button disabled={busy} title="Ignore this unchanged warning" onPress={() => void act(async () => { const r = repo.current!; await r.respond(f.id, 'ignore', null, 'Explicit lab acknowledgement', await r.revision()); })} />
      <Button disabled={busy} title={`Override effective ${f.field} with paper value`} onPress={() => void act(async () => { const r = repo.current!; await r.respond(f.id, 'override', f.paper_value, 'Explicit lab paper-value override', await r.revision()); })} />
      <Button disabled={busy} title="Reverse decision" onPress={() => void act(async () => { const r = repo.current!; await r.respond(f.id, 'reverse', null, 'Explicit lab reversal', await r.revision()); })} />
    </View>)}
    <Text style={styles.heading}>Exact flight history</Text>
    {choices.map(([label], i) => <Button key={label} disabled={busy} title={(i === filterIndex ? 'Selected: ' : '') + label} onPress={() => setFilterIndex(i)} />)}
    <View style={styles.actions}>{(['effective', 'source', 'paper'] as const).map(b => <Button key={b} disabled={busy} title={(b === basis ? 'Selected: ' : '') + b} onPress={() => setBasis(b)} />)}</View>
    <Text style={styles.body}>{result.count} established flights · latest recorded {result.latest_recorded_date ?? 'none'} · {result.latest_flight_ids.join(', ') || 'no match'}</Text>
    <Text style={styles.body}>{result.limitation} Unknown IDs: {result.unknown_ids.join(', ') || 'none'}</Text>
    {result.supporting_flights.map(f => <Text style={styles.body} key={f.id}>{f.id} · {f.date} {f.start} · {f.registration} · {f.aircraft_model} · evidence {result.source_references[f.id]}</Text>)}
    <Text style={styles.heading}>Writing instructions</Text>
    <Button disabled={busy || !history.source} title="Prepare a new fixed writing snapshot" onPress={() => void act(async () => { setTemplateId((await repo.current!.makeTemplate()).id); })} />
    {templates.map(snapshot => <Button key={snapshot.id} disabled={busy} title={`${snapshot.id === templateId ? 'Selected' : 'Open'} snapshot ${snapshot.id.slice(0, 12)}`} onPress={() => setTemplateId(snapshot.id)} />)}
    {t && <><Text style={styles.body}>Fixed snapshot {t.id}. Changes create another snapshot; these values stay fixed.</Text>{review && <Text style={styles.banner}>REVIEW REQUIRED · Relevant evidence changed; retained instructions are unchanged.</Text>}
      {t.pages.map(p => <View key={p.page}><Text style={styles.heading}>Paper page {p.page}</Text><Totals title="Carryover" values={p.carry} />
        {p.rows.map(r => <View style={styles.card} key={r.row}><Text style={styles.heading}>Row {r.row} · {r.entry_state === 'new-copy' ? 'NEW — COPY THESE VALUES' : 'EXISTING CONTEXT — DO NOT COPY'}</Text>
          {literalFields(r).map(([name, value]) => <View key={name} style={styles.field}><Text style={styles.label}>{name}</Text><Text selectable style={styles.body}>{value || '(leave blank)'}</Text></View>)}
          {r.entry_state === 'new-copy' && <Button disabled={busy || review || history.paper.some(x => x.flight.id === r.flight.id)} title={history.paper.some(x => x.flight.id === r.flight.id) ? 'This entry is confirmed copied' : `I copied only entry ${r.nr} to page ${p.page}, row ${r.row}`} onPress={() => void act(async () => { const db = repo.current!; await db.confirmCopied(t.id, [r.flight.id], await db.revision()); })} />}
        </View>)}<Totals title="Page total" values={p.page_total} /><Totals title="Cumulative total" values={p.cumulative_total} /></View>)}
      <Text style={styles.body}>Audit: rules {t.rules}; presentation {t.presentation}; source {t.source_id}; {t.decisions.length} saved decisions. Findings are explanations, not remarks to copy.</Text>
    </>}
    <Text style={styles.heading}>Backup and restore</Text>
    <Text style={styles.body}>Synthetic lab backup includes original CSV/page bytes, history and snapshots. Unencrypted. Save outside this app for protection against uninstall/device loss. Sharing cancellation does not establish an external backup.</Text>
    <Button disabled={busy || !repo.current} title="Save / share versioned synthetic backup" onPress={() => void act(exportBackup)} />
    {Platform.OS === 'android' && <Button disabled={busy || !repo.current} title="Save synthetic backup to a device folder" onPress={() => void act(saveBackupToFolder)} />}
    <Button disabled={busy} title="Restore a backup into a new local database" onPress={() => void act(restoreBackup)} />
    <Text style={styles.body}>Cloud Auth/RLS, live access, handwriting, SPL retrieval and native acceptance: not tested. No paid calls.</Text>
  </ScrollView></SafeAreaView></SafeAreaProvider>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f5f7fb' }, container: { padding: 18, gap: 12 }, title: { fontSize: 30, fontWeight: '700', color: '#173a57' },
  heading: { fontSize: 20, fontWeight: '700', color: '#173a57' }, body: { fontSize: 17, lineHeight: 25, color: '#1f2937' },
  label: { fontSize: 16, fontWeight: '700', color: '#34465c' }, banner: { fontSize: 16, lineHeight: 24, padding: 14, backgroundColor: '#fff0cd', color: '#583e00' },
  card: { borderWidth: 1, borderColor: '#b9cadb', borderRadius: 10, backgroundColor: '#fff', padding: 16, gap: 12 }, field: { gap: 3 },
  button: { backgroundColor: '#174c72', padding: 14, borderRadius: 8, minHeight: 48 }, buttonText: { color: '#fff', fontSize: 16, lineHeight: 23, fontWeight: '600' },
  disabled: { opacity: .45 }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});

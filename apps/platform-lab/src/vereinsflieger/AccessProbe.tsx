import React from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { LOGIN_URL, providerUrl } from './probe';
import { CaptureRun } from './CaptureRun';
import { WindowCapture } from './WindowCapture';
import { useAccessController } from './use-access-controller';

function Button({ title, press, disabled = false }: { title: string; press: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={press} style={[styles.button, disabled && { opacity: .45 }]}><Text style={styles.buttonText}>{title}</Text></Pressable>;
}
export function AccessProbe({ close }: { close: () => void }) {
  const controller = useAccessController();
  const { showRun, setShowRun, showWindow, setShowWindow, viewReady, recovery, original, editingLogin, loginBusy, username, setUsername, password, setPassword, saveLogin, setEditingLogin, providerExpanded, visible, status, busy, openCaptureLab, pauseEnabled, toggleTestPause, preBackupPause, togglePreBackupPause, from, setFrom, to, setTo, saving, restoring, navigate, setVisible, cancelRetrieval, retrieve, hasLogin, useLogin, forgetLogin, recoverView, paused, continueTestRetrieval, viewStrategy, url, toggleProviderPage, browserActive, snapshot, setProviderExpanded, web, currentUrl, retrieval, loaded, source, generation, epoch } = controller;
  if (showRun && viewReady && !recovery && !original.current) return <CaptureRun close={() => setShowRun(false)} />;
  if (showWindow && viewReady && !recovery && !original.current) return <WindowCapture close={() => setShowWindow(false)} />;
  if (editingLogin) return <View style={styles.screen}><Text style={styles.title}>Save Vereinsflieger login</Text><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.results}><View style={styles.row}><Text style={styles.body}>Optional login saved in protected device storage. Used only for Vereinsflieger sign-in; excluded from logbook backups. Forget it after development.</Text><TextInput accessibilityLabel="Saved login username" placeholder="Username or email" autoCapitalize="none" autoCorrect={false} autoComplete="username" value={username} onChangeText={setUsername} editable={!loginBusy} style={styles.input} /><TextInput accessibilityLabel="Saved login password" placeholder="Password" secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="off" value={password} onChangeText={setPassword} editable={!loginBusy} style={styles.input} /><View style={styles.actions}><Button title="Save login" disabled={loginBusy} press={() => void saveLogin()} /><Button title="Cancel login entry" disabled={loginBusy} press={() => { setUsername(''); setPassword(''); setEditingLogin(false); }} /></View></View></ScrollView></View>;
  return <View style={styles.screen}>
    <View style={[styles.controls, providerExpanded && visible && styles.controlsHidden]}>
    <Text style={styles.title}>Vereinsflieger access PoC</Text>
    <Text style={styles.body}>Configure all data columns, clear restrictions and select Pilot oder Fluglehrer before reading every page. Raw captures stay separate from your logbook.</Text>
    <Text accessibilityLiveRegion="polite" style={[styles.body, styles.status]}>{status}</Text>
    <Button title="Open bounded capture and resume" disabled={busy || loginBusy || !viewReady || recovery} press={() => openCaptureLab('run')} />
    <Button title="Open dated-window capture" disabled={busy || loginBusy || !viewReady || recovery} press={() => openCaptureLab('window')} />
    <Button title={pauseEnabled ? 'Disable interruption test pause' : 'Enable interruption test pause'} disabled={busy || loginBusy || !viewReady || recovery} press={toggleTestPause} />
    <Button title={preBackupPause ? 'Disable pre-backup test pause' : 'Enable pre-backup test pause'} disabled={busy || loginBusy || !viewReady || recovery} press={togglePreBackupPause} />
    <View style={styles.actions}><TextInput accessibilityLabel="Export start date" value={from} onChangeText={setFrom} editable={!busy} placeholder="YYYY-MM-DD" style={styles.input} /><TextInput accessibilityLabel="Export end date" value={to} onChangeText={setTo} editable={!busy} placeholder="YYYY-MM-DD" style={styles.input} /></View>
    <View style={styles.actions}><Button title="Show provider login" disabled={busy || loginBusy} press={() => { setVisible(true); navigate(LOGIN_URL); }} /><Button title={busy ? 'Cancel retrieval' : 'Retrieve flights'} disabled={busy ? saving || restoring.current : loginBusy || !viewReady || recovery} press={busy ? cancelRetrieval : retrieve} /><Button title="Close access PoC" disabled={busy || loginBusy} press={close} /></View>
    <View style={styles.actions}><Button title={hasLogin ? 'Replace saved login' : 'Save login on this device'} disabled={busy || loginBusy} press={() => { setEditingLogin(true); setVisible(false); }} />{hasLogin && <><Button title="Use saved login" disabled={busy || loginBusy} press={useLogin} /><Button title="Forget saved login" disabled={busy || loginBusy} press={() => void forgetLogin()} /></>}</View>
    {recovery && !busy && <Button title="Restore original provider view" disabled={loginBusy || !viewReady || !original.current} press={recoverView} />}
    {paused && <Button title="Continue test retrieval" press={() => continueTestRetrieval(paused)} />}
    {busy && <ActivityIndicator />}
    {viewStrategy && <Text style={styles.body}>{`Original view restoration strategy: ${viewStrategy}`}</Text>}
    {visible && <Text style={styles.origin}>{providerUrl(url) ? new URL(url).origin : 'Navigation blocked'} · verify that the visible provider account is yours</Text>}
    </View>
    <View style={visible ? styles.actions : styles.hidden}>
      {visible && <Button title={providerExpanded ? 'Back to lab' : 'Expand provider page'} disabled={!providerExpanded && saving} press={toggleProviderPage} />}
    </View>
    <View pointerEvents={saving ? 'none' : 'auto'} style={visible ? styles.browser : styles.hidden}>
      {/* Route all navigation through our exact-URL validator; a narrow library
          whitelist otherwise hands rejected URLs to the external OS browser. */}
      {controller.browser}
    </View>
    {!visible && <FlatList contentContainerStyle={styles.results} data={snapshot?.rows ?? []} keyExtractor={(_, i) => String(i)}
      ListHeaderComponent={<><Button title="Show provider page" disabled={busy || loginBusy} press={() => { if (!browserActive) navigate(LOGIN_URL); setVisible(true); }} />{snapshot && <Text style={styles.body}>Last saved capture: {snapshot.retrievedAt}. Coverage: {snapshot.coverage}. {snapshot.exportContext ? `${snapshot.exportContext.from} through ${snapshot.exportContext.to}; ${snapshot.exportContext.preset}; ${snapshot.exportContext.pageCount} pages.` : 'Legacy bounded capture.'} Source identity unverified; time basis unknown.</Text>}</>}
      ListEmptyComponent={<Text style={styles.body}>{snapshot ? 'Verified requested list is empty.' : 'No live capture saved. Login session reuse and real retrieval still require a device test.'}</Text>}
      renderItem={({ item: r }) => <View style={styles.row}>{snapshot?.headers.map((h, n) => h ? <Text selectable key={n} style={styles.body}>{h}: {r.values[n] || '(blank)'}</Text> : null)}<Text style={styles.body}>Candidate source flight ID: {r.sourceFlightId ?? 'not supplied'}</Text></View>} />}

  </View>;
}
const styles = StyleSheet.create({ input: { backgroundColor: 'white', borderWidth: 1, borderColor: '#b9cadb', padding: 10, borderRadius: 6, color: '#1f2937' }, screen: { flex: 1, padding: 12, gap: 8, backgroundColor: '#f5f7fb' }, controls: { gap: 8 }, controlsHidden: { display: 'none' }, title: { fontSize: 23, fontWeight: '700', color: '#173a57' }, body: { fontSize: 15, lineHeight: 21, color: '#1f2937' }, status: { minHeight: 63 }, origin: { fontSize: 14, color: '#174c72' }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, button: { backgroundColor: '#174c72', padding: 10, borderRadius: 6 }, buttonText: { color: '#fff', fontSize: 14 }, browser: { flex: 1, minHeight: 180 }, hidden: { height: 0, overflow: 'hidden' }, results: { gap: 10, paddingBottom: 20 }, row: { backgroundColor: 'white', borderWidth: 1, borderColor: '#b9cadb', padding: 12, gap: 4 } });

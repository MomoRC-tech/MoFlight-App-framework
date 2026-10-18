import React, { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Action, Card, Label, Section, colors, ui } from './theme';
import { retrievalFailureHint } from '../vereinsflieger/connection-state';
import { connectionGuidance } from './connection-guidance';
import type { useAccessController } from '../vereinsflieger/use-access-controller';
import { providerUrl } from '../vereinsflieger/probe';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LegacyRecoveryReview } from './LegacyRecoveryReview';
import { RawCaptureReview } from './RawCaptureReview';

type Controller = ReturnType<typeof useAccessController>;
export function ConnectionIndicator({ controller: c, onPress }: { controller: Controller; onPress: () => void }) {
  const pending = c.clearing || c.binding || c.busy || c.loginBusy || c.disconnecting || c.connection.phase === 'checking';
  const tint = c.connection.phase === 'disconnected' ? colors.muted : '#ffc477';
  return <Pressable accessibilityRole="button" accessibilityLabel={`Vereinsflieger: ${pending ? 'Vorgang läuft' : connectionGuidance(c.connection, c.browserActive).title}. Verbindungen öffnen`} onPress={onPress} style={styles.indicator}>
    {pending ? <ActivityIndicator color={colors.cyan} /> : <View accessible={false} style={{ width: 27, height: 25 }}>
      <View style={[styles.link, { left: 0, top: 2, borderColor: tint }]} /><View style={[styles.link, { right: 0, bottom: 2, borderColor: tint }]} />
      <View style={{ position: 'absolute', left: 12, top: 8, width: 2, height: 10, backgroundColor: tint, transform: [{ rotate: '45deg' }] }} />
    </View>}
  </Pressable>;
}

/** The browser keeps this exact native parent whether login, progress or tabs are visible. */
export function ProviderConnection({ controller: c, open, close }: { controller: Controller; open: boolean; close: () => void }) {
  const insets = useSafeAreaInsets();
  const [barHeight, setBarHeight] = useState(68), [loginHeight, setLoginHeight] = useState(132);
  const [details, setDetails] = useState(false), [lab, setLab] = useState(false);
  useEffect(() => { if (!open) { setDetails(false); setLab(false); } }, [open]);
  const checking = c.connection.phase === 'checking';
  const operationLocked = c.clearing || c.binding || c.busy || checking || c.saving || c.loginBusy || !c.viewReady;
  const locked = operationLocked || c.disconnecting;
  const login = open && c.visible;
  const guidance = connectionGuidance(c.connection, c.browserActive);
  const loginFeedback = c.loginBusy ? 'Gespeicherte Anmeldung wird einmalig versucht…' :
    c.loginNotice === 'response' ? 'Anmeldung noch nicht bestätigt. Schließe eine mögliche Anbieterprüfung ab und tippe auf „Anmeldung prüfen“.' :
    c.loginNotice === 'unavailable' ? 'Gespeicherte Anmeldung nicht verfügbar. Bitte auf der Originalseite anmelden.' :
    c.loginNotice === 'failed' ? 'Anmeldung nicht bestätigt. Bitte auf der Originalseite anmelden. Kein automatischer weiterer Versuch.' :
    c.loginNotice === 'cancelled' ? 'Anmeldeversuch beendet. Bitte die Sitzung erneut prüfen.' : null;
  const dismiss = () => { if (c.visible || checking) c.dismissLogin(); close(); };
  return <View pointerEvents={open ? 'auto' : 'none'} style={[StyleSheet.absoluteFill, { zIndex: open ? 20 : -1, opacity: open ? 1 : 0, paddingTop: insets.top, paddingBottom: insets.bottom, backgroundColor: colors.background }]} accessibilityElementsHidden={!open} importantForAccessibility={open ? 'auto' : 'no-hide-descendants'} accessibilityViewIsModal={open}>
    <View pointerEvents={login ? 'auto' : 'none'} style={[styles.browserFrame, { top: barHeight + loginHeight + insets.top, bottom: insets.bottom }, !login && styles.coveredBrowser]} accessibilityElementsHidden={!login} importantForAccessibility={login ? 'auto' : 'no-hide-descendants'}>
      {c.browser}
    </View>
    <View style={styles.bar} onLayout={event => setBarHeight(event.nativeEvent.layout.height)}>
      <Action secondary onPress={dismiss}>‹ Zurück</Action>
      <Label style={{ flex: 1, fontWeight: '600' }}>{login ? c.disconnecting ? 'Bei Vereinsflieger abmelden' : 'Bei Vereinsflieger anmelden' : 'Verbindungen'}</Label>
    </View>
    {login ? <View style={styles.loginBar} onLayout={event => setLoginHeight(event.nativeEvent.layout.height)}>
      <Label style={{ fontWeight: '600' }}>{providerUrl(c.url) ? new URL(c.url).origin : 'Anbieteradresse nicht bestätigt'}</Label>
      <Label muted>{c.disconnecting ? 'Auf der Originalseite „Abmelden“ wählen, danach hier prüfen. Schließen allein meldet dich nicht ab.' : 'Zugangsdaten nur auf der Originalseite eingeben.'}</Label>
      {loginFeedback && <Label>{loginFeedback}</Label>}
      {c.disconnecting ? <Action disabled={operationLocked || !c.loaded} onPress={c.checkDisconnection}>Abmeldung prüfen</Action> : <Action disabled={locked || !c.loaded} onPress={() => c.checkConnection()}>Anmeldung prüfen</Action>}
    </View> : <KeyboardAvoidingView style={styles.panel} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.canvas} keyboardShouldPersistTaps="handled">
        <View style={styles.group}>
          <Card><Section title="Vereinsflieger" /><Label selectable={false} style={{ fontWeight: '600' }}>{guidance.title}</Label>
            <Label muted>{guidance.hint}</Label>
            <Label muted>Gespeicherter Rohbeleg: {c.snapshot ? `${new Date(c.snapshot.retrievedAt).toLocaleString('de-DE')} · ${c.snapshot.rows.length} Datensätze` : 'noch keiner'}</Label>
            {guidance.action && <Action disabled={locked || guidance.action === 'check' && !c.browserActive} onPress={guidance.action === 'connect' ? c.connect : () => c.checkConnection()}>{guidance.actionLabel}</Action>}
            {checking && <ActivityIndicator color={colors.cyan} />}
            {c.binding && <Label>Kontozuordnung wird gespeichert…</Label>}
            {c.clearing && <Label>Lokale Browserdaten werden gelöscht. Dieser Schritt kann nicht abgebrochen werden.</Label>}
            {loginFeedback && <Label>{loginFeedback}</Label>}
          </Card>
          {c.connection.phase === 'observed' && !c.connection.confirmed && c.connection.observed && <Card>
            <Section title="Ist das dein Konto?" />
            <Label>Benutzernummer: {c.connection.observed.accountNumber}</Label><Label>Verein: {c.connection.observed.clubLabel}</Label>
            <Label muted>Mit der Bestätigung verknüpfst du dieses Konto vorläufig mit deinem lokalen Demoprofil auf diesem Gerät. Die Vereinsbezeichnung ist keine stabile Vereins-ID. Es werden keine Flüge in deine Bibliothek importiert.</Label>
            <Action disabled={locked} onPress={() => { void c.confirmConnection(); }}>Konto für diesen Test bestätigen</Action>
          </Card>}
          {c.busy && <Card><ActivityIndicator color={colors.cyan} /><Label>{c.saving ? 'Belege werden lokal gesichert…' : c.restoring.current ? 'Anbieteransicht wird wiederhergestellt…' : 'Abruf läuft · Anbieteransicht bleibt im Hintergrund.'}</Label>
            <Action secondary disabled={c.saving || c.restoring.current} onPress={c.cancelRetrieval}>Abruf abbrechen</Action>
            <Action secondary onPress={close}>Während des Abrufs zur App</Action>
          </Card>}
          {c.result === 'captured' && <Label>Rohbelege gespeichert. Sie sind noch keine importierten Flüge.</Label>}
          {c.result === 'failed' && <Label>Abruf nicht abgeschlossen. {retrievalFailureHint(c.status)}</Label>}
          {c.result === 'cancelled' && <Label>Abruf abgebrochen. Frühere Daten bleiben erhalten.</Label>}
          {c.result === 'review-required' && <Label>Die Anbieteransicht weicht ab. Bitte die Wiederherstellung unten prüfen. Noch keine Wiederherstellung ausgeführt.</Label>}
          {c.result === 'recovered' && <Label>Geprüfte Ansicht wiederhergestellt. Alte Rohbelege bleiben unverändert und unzugeordnet.</Label>}
          {c.recovery && <Card><Section title="Abruf gesperrt · Wiederherstellung nötig" /><Label>{c.legacyRecovery ? 'Ein älterer Eintrag muss zuerst geprüft werden. Alte Rohbelege werden dabei nicht übernommen.' : 'Vor dem nächsten Abruf muss die ursprüngliche Anbieteransicht im bisherigen Konto wiederhergestellt werden.'}</Label>{c.legacyRecovery && c.viewReady && <LegacyRecoveryReview locked={locked} recover={c.legacyRecoveryAvailable ? c.requestLegacyRecovery : undefined} />}
            {c.legacyChoice && <>
              <Section title="Aktuelle Ansicht weicht ab" />
              <Label>Die aktuelle Ansicht ist lokal gesichert. Noch keine Wiederherstellung ausgeführt. Vergleiche die privaten Einstellungen:</Label>
              <Label>Aktuell: {c.legacyChoice.current.preset} · {c.legacyChoice.current.period} · {c.legacyChoice.current.role}</Label>
              <Label>Ziel: {c.legacyChoice.target.preset} · {c.legacyChoice.target.period} · {c.legacyChoice.target.role}</Label>
              <Label>Spalten aktuell: {c.legacyChoice.current.columns.join(', ')}. Ziel: {c.legacyChoice.target.columns.join(', ')}</Label>
              <Label>Filter aktuell: {JSON.stringify(c.legacyChoice.current.filters)}. Ziel: {JSON.stringify(c.legacyChoice.target.filters)}</Label>
              <Label>Sortierung aktuell: {JSON.stringify(c.legacyChoice.current.sort)}. Ziel: {JSON.stringify(c.legacyChoice.target.sort)}</Label>
              <Action secondary disabled={locked} onPress={() => { const choice = c.legacyChoice; if (choice) c.requestLegacyRecovery(choice.fingerprint, choice.current); }}>Geprüfte Zielansicht jetzt wiederherstellen</Action>
              <Label muted>Ohne diese Auswahl bleibt die aktuelle Anbieteransicht erhalten und der Abruf gesperrt. Jede neue Abweichung erfordert eine erneute Auswahl.</Label>
            </>}
            <Action secondary disabled={locked || c.legacyRecovery || !c.original.current} onPress={() => c.checkConnection('recover')}>Anbieteransicht wiederherstellen</Action></Card>}
          <Label muted>Schließen meldet dich nicht ab. Gespeicherte Rohbelege sind von deiner Flugbibliothek getrennt.</Label>
          <Pressable accessibilityRole="button" accessibilityLabel="Sitzungsdetails und weitere Optionen" accessibilityState={{ expanded: details }} onPress={() => setDetails(!details)} style={styles.disclosure}><Label style={{ color: colors.cyan }}>{details ? '−' : '+'} Sitzungsdetails & weitere Optionen</Label></Pressable>
          {details && <Card><Section title="Sitzungsdetails" />
            <Label muted>Die Anbieteranmeldung ist unabhängig von deinem lokalen Demoprofil und deinen Flugbüchern.</Label>
            <Label muted>Letzte erfolgreiche Sitzungsprüfung: {c.connection.lastCheckedAt ? new Date(c.connection.lastCheckedAt).toLocaleString('de-DE') : 'noch nicht erfolgt'}</Label>
            <Label muted>Eine frühere Prüfung ist keine dauerhafte Login-Garantie. Ein anderes Konto oder ein anderer Verein ersetzt deine bisherige Zuordnung nicht.</Label>
            <Action secondary disabled={locked} onPress={c.connect}>Auf der Originalseite anmelden</Action>
            <Action secondary disabled={locked || !c.browserActive} onPress={() => c.checkConnection()}>Sitzung erneut prüfen</Action>
            <Action secondary disabled={locked} onPress={c.useLogin}>Gespeicherte Anmeldung verwenden</Action>
            <Label muted>Optionale Entwicklungshilfe: versucht die auf diesem Gerät gespeicherte Anmeldung einmalig, nur nach Antippen. Eine Anbieterprüfung kann weiterhin nötig sein.</Label>
            <Section title="Abmelden & lokale Daten" />
            <Label muted>Trennen öffnet die Originalseite zum Abmelden. Erst eine neue Prüfung der geschützten Profilseite bestätigt die Abmeldung in diesem Browser. Andere Geräte und das Löschen aller Cookies sind nicht verifiziert.</Label>
            <Action secondary disabled={locked || c.recovery || !c.browserActive} onPress={c.startDisconnect}>Bei Vereinsflieger abmelden</Action>
            {c.disconnectNotice === 'failed' && <Label>Abmeldung nicht bestätigt. Auf der Originalseite „Abmelden“ wählen und erneut prüfen. Ein Seitenfehler beweist keine Abmeldung.</Label>}
            {c.disconnectNotice === 'cancelled' && <Label>Abmeldeprüfung beendet. Der Sitzungszustand ist ungeprüft; eine Abmeldung wird nicht zugesagt.</Label>}
            {(c.busy || c.recovery) && <Label>Vor dem Trennen: Abruf beenden und die ursprüngliche Anbieteransicht wiederherstellen. Laufendes Speichern kann nicht abgebrochen werden.</Label>}
            {c.disconnectedAt && <Label>Letzte bestätigte Abmeldung: {new Date(c.disconnectedAt).toLocaleString('de-DE')}. Eine spätere Anmeldung erfordert eine neue Sitzungsprüfung.</Label>}
            {c.sessionClearingAvailable ? <Action secondary disabled={locked || c.recovery} onPress={() => { void c.clearLocalSession(); }}>Lokale Anbietersitzung löschen</Action> : <Label muted>Lokales Browserstore-Löschen wird auf diesem Build/Gerät nicht unterstützt.</Label>}
            {c.clearing && <Label>Lokaler Browserstore wird gelöscht. Dieser Schritt kann nicht abgebrochen werden.</Label>}
            {c.clearNotice === 'cleared' && <Label>Cookies und Webspeicher dieses App-Browsers gelöscht; vorheriges Dokument verworfen. Anmeldung erneut prüfen. Keine globale Anbieterabmeldung.</Label>}
            {c.clearNotice === 'failed' && <Label>Lokales Löschen nicht bestätigt. Der Sitzungszustand bleibt ungeprüft.</Label>}
            <Label muted>Lokales Löschen betrifft den Android-WebView-Store dieser App. Lokale Flugdaten, Zuordnung und gespeicherte Zugangsdaten bleiben erhalten. Andere Apps und Geräte werden nicht abgemeldet.</Label>
            <Action secondary disabled={locked} onPress={c.forgetLogin}>Gespeicherte Zugangsdaten vergessen</Action>
            {c.credentialNotice === 'forgotten' && <Label>Von MoFlight gespeicherte Zugangsdaten entfernt. Dies ist keine Anbieterabmeldung.</Label>}
            {c.credentialNotice === 'error' && <Label>Zugangsdaten konnten nicht entfernt werden. Erneut versuchen.</Label>}
            <Label muted>Entfernt nur die von MoFlight gespeicherten Zugangsdaten auf diesem Gerät. Die Anbietersitzung, System-Autofill und gespeicherte Flüge bleiben davon unabhängig.</Label>
          </Card>}
          <Pressable accessibilityRole="button" accessibilityLabel="Entwicklungswerkzeuge für Rohbelege" accessibilityState={{ expanded: lab }} onPress={() => setLab(!lab)} style={styles.disclosure}><Label style={{ color: colors.cyan }}>{lab ? '−' : '+'} Entwicklungswerkzeuge · Rohbelege</Label></Pressable>
          {lab && <Card><Section title="Begrenzter Rohabruf" />
            <Label muted>Entwicklungsnachweis: Der Abruf speichert rohe Anbieterbelege separat. Er ersetzt keine Flüge in der synthetischen Bibliothek und erzeugt keinen kanonischen Live-Import.</Label>
            <Label muted>Letzter lokal zugeordneter Rohbeleg: {c.snapshot ? `${new Date(c.snapshot.retrievedAt).toLocaleString('de-DE')} · ${c.snapshot.rows.length} Datensätze · ${c.snapshot.exportContext?.pageCount ?? '—'} Seite(n)` : 'noch keiner'}</Label>
            <Label>Zeitraum einschließlich (JJJJ-MM-TT)</Label>
            <TextInput accessibilityLabel="Vereinsflieger Abruf von" value={c.from} onChangeText={c.setFrom} editable={!locked} autoCorrect={false} style={styles.input} />
            <TextInput accessibilityLabel="Vereinsflieger Abruf bis" value={c.to} onChangeText={c.setTo} editable={!locked} autoCorrect={false} style={styles.input} />
            <Action disabled={locked || c.recovery || c.connection.phase !== 'observed' || !c.connection.confirmed} onPress={() => c.checkConnection('retrieve')}>Rohdaten abrufen</Action>
            {open && !locked && !c.recovery && c.connection.phase === 'observed' && c.connection.confirmed && <RawCaptureReview key={c.snapshot?.captureId} snapshot={c.snapshot} />}
            {c.sessionProofAvailable && <><Action secondary disabled={locked || c.recovery} onPress={() => { void c.clearLocalSession(true); }}>Synthetischer Browserstore-Test</Action><Label muted>Entwicklungstest nur auf MoFlight_Synthetic_API37; auf anderen Geräten nativ gesperrt.</Label></>}
            {c.proofNotice !== 'none' && <Label>{c.proofNotice === 'passed' ? 'Synthetischer Store-Test bestanden: Cookies, Webspeicher und neues Dokument geprüft; SQLite und SecureStore erhalten.' : 'Synthetischer Store-Test nicht bestanden oder Gerät gesperrt.'}</Label>}
          </Card>}
          {c.busy && <Label muted>Tabwechsel bleibt möglich. Bei App-Wechsel oder gesperrtem Telefon kann der Abruf unterbrochen werden; danach die Sitzung erneut prüfen.</Label>}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>}
  </View>;
}
const styles = StyleSheet.create({
  indicator: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: '#102d47aa' },
  link: { position: 'absolute', width: 18, height: 12, borderWidth: 2, borderRadius: 7, transform: [{ rotate: '-45deg' }] },
  browserFrame: { position: 'absolute', width: '100%', maxWidth: 800, alignSelf: 'center', bottom: 0, backgroundColor: 'white' },
  coveredBrowser: { opacity: 0 },
  bar: { flexDirection: 'row', alignItems: 'center', padding: 10, gap: 12, backgroundColor: colors.background, minHeight: 68 },
  loginBar: { backgroundColor: colors.background, padding: 10, gap: 6 },
  panel: { flex: 1, backgroundColor: colors.background },
  disclosure: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 8, paddingVertical: 10 },
  canvas: { padding: 10, paddingBottom: 24 }, group: { width: '100%', maxWidth: 520, alignSelf: 'center', gap: 10 },
  input: { ...ui.text, minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, backgroundColor: colors.background },
});

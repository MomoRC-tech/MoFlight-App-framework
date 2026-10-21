import React, { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Action, Card, IconLabel, Label, Section, colors, ui } from './theme';
import { SymbolIcon } from './SymbolIcon';
import { retrievalFailureHint } from '../vereinsflieger/connection-state';
import { connectionGuidance, connectionSymbol } from './connection-guidance';
import { dataFreshness } from './data-freshness';
import type { useAccessController } from '../vereinsflieger/use-access-controller';
import { providerUrl } from '../vereinsflieger/probe';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LegacyRecoveryReview } from './LegacyRecoveryReview';
import { RawCaptureReview } from './RawCaptureReview';
import { CapturedFlights } from './CapturedFlights';
import { InformationReview } from './InformationReview';
import { INFORMATION_TYPES } from '../vereinsflieger/information';

type Controller = ReturnType<typeof useAccessController>;
export function ConnectionIndicator({ controller: c, onPress }: { controller: Controller; onPress?: () => void }) {
  const pending = c.clearing || c.binding || c.busy || c.loginBusy || c.disconnecting || c.connection.phase === 'checking';
  const { mark, color: tint } = connectionSymbol(c.connection);
  const operation = c.clearing ? 'Browserdaten werden gelöscht' : c.binding ? 'Kontozuordnung wird gespeichert' : c.saving ? 'Belege werden gespeichert' : c.busy ? c.restoring.current ? 'Anbieteransicht wird wiederhergestellt' : 'Rohabruf läuft' : c.loginBusy ? 'Anmeldung wird versucht' : c.disconnecting ? 'Abmeldung wird geprüft' : 'Sitzung wird geprüft';
  const status = `Vereinsflieger: ${pending ? operation : c.recovery ? 'Abruf gesperrt · Wiederherstellung nötig' : connectionGuidance(c.connection, c.browserActive).title}`;
  const Control = onPress ? Pressable : View;
  return <Control accessible accessibilityRole={onPress ? 'button' : 'text'} accessibilityLabel={`${status}${onPress ? '. Verbindungen öffnen' : ''}`} accessibilityState={{ busy: pending }} onPress={onPress} style={styles.indicator}>
    {pending ? <ActivityIndicator color={colors.cyan} /> : <SymbolIcon name="chain" size={28} tone={mark === '?' ? 'muted' : 'default'} />}
    {!pending && <View accessible={false} style={styles.mark}><Label style={{ color: c.recovery ? '#ffb39e' : tint, fontWeight: '700', fontSize: 12, lineHeight: 15 }}>{c.recovery ? '!' : mark}</Label></View>}
  </Control>;
}

/** The browser keeps this exact native parent whether login, progress or tabs are visible. */
export function ProviderConnection({ controller: c, open, close, development = false, developmentRecoveryCheckpoints = false, guided = false, progress, loginEnabled = true, closeDisabled = false, purpose = 'existing-captures' }: { controller: Controller; open: boolean; close: () => void; development?: boolean; developmentRecoveryCheckpoints?: boolean; guided?: boolean; progress?: React.ReactNode; loginEnabled?: boolean; closeDisabled?: boolean; purpose?: 'existing-captures' | 'own-flight-library' }) {
  const insets = useSafeAreaInsets();
  const [barHeight, setBarHeight] = useState(68), [loginHeight, setLoginHeight] = useState(132);
  const [panelHeight, setPanelHeight] = useState(800);
  const [developmentHeight, setDevelopmentHeight] = useState(0);
  const [details, setDetails] = useState(false), [lab, setLab] = useState(false);
  const [informationTools, setInformationTools] = useState(false);
  useEffect(() => { if (!open) { setDetails(false); setLab(false); setInformationTools(false); } }, [open]);
  const checking = c.connection.phase === 'checking';
  const operationLocked = c.clearing || c.binding || c.busy || checking || c.saving || c.loginBusy || c.informationHistoryBusy || !c.viewReady;
  const locked = operationLocked || c.disconnecting;
  const developmentMarker = c.developmentCheckpoint === 'journal-paused' ? 'Testpause: Originalansicht lokal gesichert. Noch keine Anbietereinstellung geändert.' : c.developmentCheckpoint === 'recovery-paused' ? 'Testpause: Passendes Konto geprüft. Noch kein Wiederherstellungsbefehl gesendet.' : c.developmentCheckpoint === 'journal-armed' ? 'Testpause nach Sicherung vorgemerkt.' : c.developmentCheckpoint === 'recovery-armed' ? 'Testpause vor Wiederherstellung vorgemerkt.' : 'Anbieter-Wiederherstellungstest · nur Entwicklung';
  const login = open && c.visible && loginEnabled;
  const checkpointHeight = developmentRecoveryCheckpoints ? developmentHeight : 0;
  const progressHeight = Math.max(96, Math.min((panelHeight-insets.top-insets.bottom-barHeight-checkpointHeight)*0.5, panelHeight-insets.top-insets.bottom-barHeight-checkpointHeight-240));
  const guidance = connectionGuidance(c.connection, c.browserActive);
  const freshness = dataFreshness(c.snapshot?.retrievedAt ?? null, c.captureLoadState);
  const loginFeedback = c.loginBusy ? 'Gespeicherte Anmeldung wird einmalig versucht…' :
    c.loginNotice === 'response' ? 'Anmeldung noch nicht bestätigt. Schließe eine mögliche Anbieterprüfung ab und tippe auf „Anmeldung prüfen“.' :
    c.loginNotice === 'unavailable' ? 'Gespeicherte Anmeldung nicht verfügbar. Bitte auf der Originalseite anmelden.' :
    c.loginNotice === 'failed' ? 'Anmeldung nicht bestätigt. Bitte auf der Originalseite anmelden. Kein automatischer weiterer Versuch.' :
    c.loginNotice === 'cancelled' ? 'Anmeldeversuch beendet. Bitte die Sitzung erneut prüfen.' : null;
  const dismiss = () => { if(closeDisabled)return; if (c.visible || checking || developmentRecoveryCheckpoints && !!c.developmentCheckpoint) c.dismissLogin(); close(); };
  return <View onLayout={event => setPanelHeight(event.nativeEvent.layout.height)} pointerEvents={open ? 'auto' : 'none'} style={[StyleSheet.absoluteFill, { zIndex: open ? 20 : -1, opacity: open ? 1 : 0, paddingTop: insets.top, paddingBottom: insets.bottom, backgroundColor: colors.background }]} accessibilityElementsHidden={!open} importantForAccessibility={open ? 'auto' : 'no-hide-descendants'} accessibilityViewIsModal={open}>
    <View pointerEvents={login ? 'auto' : 'none'} style={[styles.browserFrame, { top: barHeight + checkpointHeight + (login ? loginHeight : 0) + insets.top, bottom: insets.bottom }, !login && styles.coveredBrowser]} accessibilityElementsHidden={!login} importantForAccessibility={login ? 'auto' : 'no-hide-descendants'}>
      {c.browser}
    </View>
    <View style={styles.bar} onLayout={event => setBarHeight(event.nativeEvent.layout.height)}>
      <Action secondary icon="close" label={progress ? 'Datenabruf schließen oder abbrechen' : 'Verbindungen schließen und zur App zurückkehren'} disabled={closeDisabled || guided && (c.saving || c.restoring.current)} onPress={dismiss}>Schließen</Action>
      <Label style={{ flex: 1, fontWeight: '600' }}>{progress ? 'Daten laden' : login ? c.disconnecting ? 'Bei Vereinsflieger abmelden' : 'Bei Vereinsflieger anmelden' : guided ? 'Daten laden' : 'Verbindungen'}</Label>
      <ConnectionIndicator controller={c} onPress={login && !progress ? c.dismissLogin : undefined} />
    </View>
    {developmentRecoveryCheckpoints && <View onLayout={event => setDevelopmentHeight(event.nativeEvent.layout.height)} style={{paddingHorizontal:12,paddingBottom:8,gap:4}}>
      <View accessible testID="development-provider-checkpoint" accessibilityLabel={developmentMarker} accessibilityLiveRegion="polite"><Label>{developmentMarker}</Label></View>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:4}}>
        <Action secondary testID="development-arm-provider-journal" disabled={locked || c.recovery || !!c.developmentCheckpoint} onPress={c.armDevelopmentJournalCheckpoint}>Testpause nach Sicherung vormerken</Action>
        <Action secondary testID="development-arm-provider-recovery" disabled={locked || !c.recovery || c.legacyRecovery || !c.original.current || !!c.developmentCheckpoint} onPress={c.armDevelopmentRecoveryCheckpoint}>Testpause vor Wiederherstellung vormerken</Action>
      </View>
    </View>}
    {progress ? <ScrollView style={login ? {maxHeight: progressHeight} : {flex:1}} onLayout={event => setLoginHeight(event.nativeEvent.layout.height)} contentContainerStyle={styles.canvas} keyboardShouldPersistTaps="handled"><View style={styles.group}>
      {progress}
      {login && <View style={{gap:6}}>
        <Label muted>{providerUrl(c.url) ? new URL(c.url).origin : 'Anbieteradresse nicht bestätigt'} · Zugangsdaten nur auf der Originalseite eingeben.</Label>
        {loginFeedback && <Label>{loginFeedback}</Label>}
        <Action secondary disabled={locked || !c.loaded} onPress={()=>c.checkConnection()}>Anmeldung prüfen</Action>
      </View>}
    </View></ScrollView> : login ? <View style={styles.loginBar} onLayout={event => setLoginHeight(event.nativeEvent.layout.height)}>
      <Action secondary icon="back" label="Auf der Vereinsflieger-Seite zurück" disabled={locked || !c.canGoBack} onPress={c.backWithinProvider}>Anbieterseite zurück</Action>
      <Label style={{ fontWeight: '600' }}>{providerUrl(c.url) ? new URL(c.url).origin : 'Anbieteradresse nicht bestätigt'}</Label>
      <Label muted>{c.disconnecting ? 'Auf der Originalseite „Abmelden“ wählen, danach hier prüfen. Schließen allein meldet dich nicht ab.' : 'Zugangsdaten nur auf der Originalseite eingeben.'}</Label>
      {loginFeedback && <Label>{loginFeedback}</Label>}
      {c.disconnecting ? <Action disabled={operationLocked || !c.loaded} onPress={c.checkDisconnection}>Abmeldung prüfen</Action> : <View style={{ flexDirection: 'row', gap: 6 }}>
        <View style={{ flex: 1 }}><Action disabled={locked || !c.loaded} onPress={() => c.checkConnection()}>{guided ? 'Anmeldung erneut prüfen' : 'Anmeldung prüfen'}</Action></View>
        {!guided && <View style={{ flex: 1 }}><Action secondary disabled={locked} onPress={() => setInformationTools(!informationTools)}>{informationTools ? 'Import zuklappen' : 'Informationsimport'}</Action></View>}
      </View>}
      {!guided && !c.disconnecting && (informationTools || c.informationBusy) && <>
        <Action secondary disabled={locked} onPress={c.nextInformationCategory}>Quelltyp: {INFORMATION_TYPES[c.informationCategory].title}</Action>
        {c.informationCategory === 'training-summary' && <Label muted>Auf der Originalseite die eigene Ausbildung öffnen, beim gewählten Eintrag das Auge und dann „Übersicht“ wählen. Praktische und theoretische Lernziele sowie Theoriestunden müssen sichtbar sein. Konto, Verein und Ausbildung vor dem Speichern prüfen.</Label>}
        {c.informationBusy ? <Action secondary disabled={c.informationSaving} onPress={() => c.stopInformation()}>Informationsabruf abbrechen</Action> : c.informationNeedsReload ? <Action secondary disabled={locked || c.informationLoading || !c.informationCanReload} onPress={() => { void c.reloadInformation(); }}>Gespeicherte Informationen neu laden</Action> : c.informationRetryReady ? <Action disabled={locked || c.recovery} onPress={c.retryInformation}>Ausgewählte Quelle erneut abrufen</Action> : <Action disabled={locked || c.recovery || !c.loaded} onPress={() => c.startInformation()}>Informationen dieser Seite speichern</Action>}
        {!!c.informationNotice && <View accessibilityLiveRegion="polite"><Label muted>{c.informationNotice}</Label></View>}
      </>}
    </View> : guided && !c.recovery && c.connection.phase !== 'mismatch' ? <ScrollView contentContainerStyle={styles.canvas}><View style={styles.group}><Card><Section title="Deine Flüge werden geladen" /><ActivityIndicator color={colors.cyan} /><View accessibilityLiveRegion="polite"><Label>{c.busy ? c.saving ? 'Flüge werden lokal vorbereitet …' : 'Flüge werden geladen …' : c.binding ? 'Dein Konto wird verbunden …' : 'Anmeldung wird geprüft …'}</Label></View><Label muted>Nach der Anmeldung geht es automatisch weiter. Gespeicherte Flüge bleiben erhalten.</Label><Action secondary disabled={c.saving || c.restoring.current} onPress={dismiss}>Abbrechen</Action></Card></View></ScrollView> : <KeyboardAvoidingView style={styles.panel} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView removeClippedSubviews={false} contentContainerStyle={styles.canvas} keyboardShouldPersistTaps="handled">
        <View style={styles.group}>
          <Card><Section title="Vereinsflieger" /><View accessible accessibilityLabel={guidance.title} accessibilityLiveRegion="polite"><Label selectable={false} style={{ fontWeight: '600' }}>{guidance.title}</Label></View>
            <Label muted>{guidance.hint}</Label>
            <Label muted>{freshness.label}{c.snapshot ? ` · ${c.snapshot.rows.length} erfasste Flüge` : ''}</Label>
            {!!freshness.note && <Label muted>{freshness.note}</Label>}
            {guidance.action && <Action disabled={locked || guidance.action === 'check' && !c.browserActive} onPress={guidance.action === 'connect' ? c.connect : () => c.checkConnection()}>{guidance.actionLabel}</Action>}
            {checking && <ActivityIndicator color={colors.cyan} />}
            {c.binding && <Label>Kontozuordnung wird gespeichert…</Label>}
            {c.clearing && <Label>Lokale Browserdaten werden gelöscht. Dieser Schritt kann nicht abgebrochen werden.</Label>}
            {loginFeedback && <Label>{loginFeedback}</Label>}
          </Card>
          {c.connection.phase === 'observed' && !c.connection.confirmed && c.connection.observed && <Card>
            <Section title="Ist das dein Konto?" />
            <Label>Benutzernummer: {c.connection.observed.accountNumber}</Label><Label>Verein: {c.connection.observed.clubLabel}</Label>
            <Label muted>{purpose === 'own-flight-library' ? 'Mit der Bestätigung wählst du das Anbieter-Konto für diese neue lokale Flugbibliothek. Flüge werden nach dem Abruf geprüft und erst durch ausdrückliches Speichern aufgenommen.' : 'Mit der Bestätigung verknüpfst du dieses Konto vorläufig mit deinem lokalen Demoprofil auf diesem Gerät. Die Vereinsbezeichnung ist keine stabile Vereins-ID. Es werden keine Flüge in deine Bibliothek importiert.'}</Label>
            <Action disabled={locked} onPress={() => { void c.confirmConnection(); }}>{purpose === 'own-flight-library' ? 'Eigenes Anbieter-Konto bestätigen' : 'Konto für diesen Test bestätigen'}</Action>
          </Card>}
          {c.busy && <Card><ActivityIndicator color={colors.cyan} /><Label>{c.saving ? 'Belege werden lokal gesichert…' : c.restoring.current ? 'Anbieteransicht wird wiederhergestellt…' : 'Abruf läuft · Anbieteransicht bleibt im Hintergrund.'}</Label>
            <Action secondary disabled={c.saving || c.restoring.current} onPress={c.cancelRetrieval}>Abruf abbrechen</Action>
            <Action secondary onPress={close}>Während des Abrufs zur App</Action>
          </Card>}
          {c.result === 'captured' && <Label>Rohbelege gespeichert. Sie sind noch keine importierten Flüge.</Label>}
          {c.result === 'failed' && <Label>{retrievalFailureHint(c.status)}</Label>}
          {c.result === 'cancelled' && <Label>Abruf abgebrochen. Frühere Daten bleiben erhalten.</Label>}
          {c.result === 'review-required' && <Label>Die Anbieteransicht weicht ab. Bitte die Wiederherstellung unten prüfen. Noch keine Wiederherstellung ausgeführt.</Label>}
          {c.result === 'recovered' && <Label>Geprüfte Ansicht wiederhergestellt. Alte Rohbelege bleiben unverändert und unzugeordnet.</Label>}
          <Card><Section title="Flugdaten erfassen" icon="refresh" />
            <Label>Zeitraum: {c.from} bis {c.to} einschließlich</Label>
            <Label muted>Beim ersten Öffnen sind die letzten 30 Kalendertage gewählt. Den Zeitraum kannst du unter „Rohbelege & begrenzter Abruf“ ändern. Vor jedem Abruf werden Konto und Anbieteransicht geprüft.</Label>
            <Action disabled={locked || c.recovery || c.connection.phase !== 'observed' || !c.connection.confirmed} onPress={() => c.checkConnection('retrieve')}>Flugdaten jetzt abrufen</Action>
            <Label muted>Frühere Belege bleiben bei Fehler oder Abbruch erhalten. Ein neuer Abruf ergänzt noch keine Flugbuchstatistik.</Label>
          </Card>
          {open && <CapturedFlights key={c.snapshot?.captureId ?? 'no-capture'} snapshot={c.snapshot} loadState={c.captureLoadState} />}
          {open && <InformationReview onReload={() => { void c.reloadInformation(); }} reloading={c.informationLoading} canReload={c.informationCanReload} captures={c.informationCaptures} notice={c.informationNotice} disabled={locked || c.recovery} history={c.informationHistory} historyBusy={c.informationHistoryBusy} historyNotice={c.informationHistoryNotice} onHistory={(category, index) => { void c.loadInformationHistory(category, index); }} onOpen={() => c.browserActive ? c.setVisible(true) : c.connect()} />}
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
          <Pressable accessibilityRole="button" accessibilityLabel="Sitzungsdetails und weitere Optionen" accessibilityState={{ expanded: details }} onPress={() => setDetails(!details)} style={styles.disclosure}><IconLabel name={details ? 'minus' : 'plus'} size={18} style={{ color: colors.cyan }}>Sitzungsdetails & weitere Optionen</IconLabel></Pressable>
          {details && <Card><Section title="Sitzungsdetails" />
            <Label muted>Die Anbieteranmeldung ist unabhängig von deinem lokalen Demoprofil und deinen Flugbüchern.</Label>
            <Label muted>Letzte Profilbeobachtung: {c.connection.lastCheckedAt ? new Date(c.connection.lastCheckedAt).toLocaleString('de-DE') : 'noch nicht erfolgt'}</Label>
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
          <Pressable accessibilityRole="button" accessibilityLabel="Rohbelege und begrenzter Abruf" accessibilityState={{ expanded: lab }} onPress={() => setLab(!lab)} style={styles.disclosure}><IconLabel name={lab ? 'minus' : 'plus'} size={18} style={{ color: colors.cyan }}>Rohbelege & begrenzter Abruf</IconLabel></Pressable>
          {lab && <Card><Section title="Begrenzter Rohabruf" />
            <Label muted>Entwicklungsnachweis: Der Abruf speichert rohe Anbieterbelege separat. Er ersetzt keine Flüge in der synthetischen Bibliothek und erzeugt keinen kanonischen Live-Import.</Label>
            <Label muted>Letzter lokal zugeordneter Rohbeleg: {c.snapshot ? `${new Date(c.snapshot.retrievedAt).toLocaleString('de-DE')} · ${c.snapshot.rows.length} Datensätze · ${c.snapshot.exportContext?.pageCount ?? '—'} Seite(n)` : 'noch keiner'}</Label>
            <Label>Zeitraum einschließlich (JJJJ-MM-TT)</Label>
            <TextInput accessibilityLabel="Vereinsflieger Abruf von" value={c.from} onChangeText={c.setFrom} editable={!locked} autoCorrect={false} style={styles.input} />
            <TextInput accessibilityLabel="Vereinsflieger Abruf bis" value={c.to} onChangeText={c.setTo} editable={!locked} autoCorrect={false} style={styles.input} />
            <Action disabled={locked || c.recovery || c.connection.phase !== 'observed' || !c.connection.confirmed} onPress={() => c.checkConnection('retrieve')}>Rohdaten abrufen</Action>
            {open && <RawCaptureReview key={c.snapshot?.captureId} snapshot={c.snapshot} />}
          </Card>}
          {development && <Card><Section title="Entwicklung · Browserstore-Diagnose" icon="info" />
            <Label muted>Nur über Einstellungen → Entwicklung. Öffnen startet keinen Test. Der gleiche Anbieter-Controller bleibt zuständig; diese Seite ist keine Zugriffssperre.</Label>
            <Label>Store-Test: {c.sessionProofAvailable ? 'auf diesem Testgerät verfügbar' : 'auf diesem Gerät nicht verfügbar'}</Label>
            {c.sessionProofAvailable && <><Action secondary disabled={locked || c.recovery} onPress={() => { void c.clearLocalSession(true); }}>Synthetischer Browserstore-Test</Action><Label muted>Expliziter Entwicklungstest nur auf MoFlight_Synthetic_API37; auf anderen Geräten nativ gesperrt. Verändert dessen synthetischen Browserstore.</Label></>}
            {c.proofNotice !== 'none' && <Label>{c.proofNotice === 'passed' ? 'Synthetischer Store-Test bestanden: Cookies, Webspeicher und neues Dokument geprüft; SQLite und SecureStore erhalten.' : 'Synthetischer Store-Test nicht bestanden oder Gerät gesperrt.'}</Label>}
          </Card>}
          {c.busy && <Label muted>Tabwechsel bleibt möglich. Bei App-Wechsel oder gesperrtem Telefon kann der Abruf unterbrochen werden; danach die Sitzung erneut prüfen.</Label>}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>}
  </View>;
}
const styles = StyleSheet.create({
  indicator: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#102d47aa' },
  mark: { position: 'absolute', right: 0, bottom: 1, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
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

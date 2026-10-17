import React, { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Action, Card, Label, Section, colors, ui } from './theme';
import { connectionLabel } from '../vereinsflieger/connection-state';
import type { useAccessController } from '../vereinsflieger/use-access-controller';
import { providerUrl } from '../vereinsflieger/probe';

type Controller = ReturnType<typeof useAccessController>;
export function ConnectionIndicator({ controller: c, onPress }: { controller: Controller; onPress: () => void }) {
  const pending = c.busy || c.connection.phase === 'checking';
  const tint = c.connection.phase === 'disconnected' ? colors.muted : '#ffc477';
  return <Pressable accessibilityRole="button" accessibilityLabel={`Vereinsflieger: ${pending ? 'Vorgang läuft' : connectionLabel(c.connection)}. Verbindungen öffnen`} onPress={onPress} style={styles.indicator}>
    {pending ? <ActivityIndicator color={colors.cyan} /> : <View accessible={false} style={{ width: 27, height: 25 }}>
      <View style={[styles.link, { left: 0, top: 2, borderColor: tint }]} /><View style={[styles.link, { right: 0, bottom: 2, borderColor: tint }]} />
      <View style={{ position: 'absolute', left: 12, top: 8, width: 2, height: 10, backgroundColor: tint, transform: [{ rotate: '45deg' }] }} />
    </View>}
  </Pressable>;
}

/** The browser keeps this exact native parent whether login, progress or tabs are visible. */
export function ProviderConnection({ controller: c, open, close }: { controller: Controller; open: boolean; close: () => void }) {
  const [barHeight, setBarHeight] = useState(68), [loginHeight, setLoginHeight] = useState(132);
  const checking = c.connection.phase === 'checking';
  const locked = c.busy || checking || c.saving || c.loginBusy || !c.viewReady;
  const login = open && c.visible;
  const label = connectionLabel(c.connection);
  const dismiss = () => { if (c.visible || checking) c.dismissLogin(); close(); };
  return <View pointerEvents={open ? 'auto' : 'none'} style={[StyleSheet.absoluteFill, { zIndex: open ? 20 : -1 }]} accessibilityElementsHidden={!open} importantForAccessibility={open ? 'auto' : 'no-hide-descendants'} accessibilityViewIsModal={open}>
    <View pointerEvents={login ? 'auto' : 'none'} style={[styles.browserFrame, { top: barHeight + loginHeight }, !login && styles.coveredBrowser]} accessibilityElementsHidden={!login} importantForAccessibility={login ? 'auto' : 'no-hide-descendants'}>
      {c.browser}
    </View>
    <View style={styles.bar} onLayout={event => setBarHeight(event.nativeEvent.layout.height)}>
      <Action secondary onPress={dismiss}>‹ Zurück</Action>
      <Label style={{ flex: 1, fontWeight: '600' }}>{login ? 'Mit Vereinsflieger verbinden' : 'Verbindungen'}</Label>
    </View>
    {login ? <View style={styles.loginBar} onLayout={event => setLoginHeight(event.nativeEvent.layout.height)}>
      <Label style={{ fontWeight: '600' }}>{providerUrl(c.url) ? new URL(c.url).origin : 'Anbieteradresse nicht bestätigt'}</Label>
      <Label muted>Originale Anmeldeseite · Zugangsdaten nur dort eingeben.</Label>
      <Action disabled={locked} onPress={() => c.checkConnection()}>Anmeldung prüfen</Action>
    </View> : <KeyboardAvoidingView style={styles.panel} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.canvas} keyboardShouldPersistTaps="handled">
        <View style={styles.group}>
          <Card><Section title="Vereinsflieger" /><Label selectable={false} style={{ fontWeight: '600' }}>{label}</Label>
            <Label muted>Die Anbieteranmeldung ist unabhängig von deinem lokalen Demoprofil und deinen Flugbüchern.</Label>
            <Label muted>Letzte Sitzungsprüfung: {c.connection.lastCheckedAt ? new Date(c.connection.lastCheckedAt).toLocaleString('de-DE') : 'noch nicht erfolgt'}</Label>
            <Label muted>Letzter erfolgreicher Rohabruf in dieser App-Sitzung: {c.lastSuccessfulCaptureAt ? new Date(c.lastSuccessfulCaptureAt).toLocaleString('de-DE') : 'noch keiner'}</Label>
            <Action disabled={locked} onPress={c.connect}>Mit Vereinsflieger verbinden</Action>
            <Action secondary disabled={locked || !c.browserActive} onPress={() => c.checkConnection()}>Sitzung erneut prüfen</Action>
          </Card>
          {c.connection.phase === 'observed' && !c.connection.confirmed && c.connection.observed && <Card>
            <Section title="Vorläufige Zuordnung prüfen" />
            <Label>Benutzernummer: {c.connection.observed.accountNumber}</Label><Label>Verein: {c.connection.observed.clubLabel}</Label>
            <Label muted>Ist dies dein Anbieterkonto? Die Vereinsbezeichnung ist keine stabile Vereins-ID. Diese Zuordnung gilt nur für diesen Entwicklungslauf; Live-Import bleibt gesperrt.</Label>
            <Action onPress={c.confirmConnection}>Konto für diesen Test bestätigen</Action>
          </Card>}
          {(c.connection.phase === 'mismatch' || c.connection.phase === 'error' || c.connection.phase === 'unknown' || c.connection.phase === 'login-required') && <Card>
            <Label>{c.connection.phase === 'mismatch' ? 'Konto oder Verein stimmt nicht mit der bestätigten Zuordnung überein. Kein Import.' : 'Sitzung oder Netzwerk nicht aktuell bestätigt. Gespeicherte Flüge bleiben verfügbar. Bei Bedarf auf der Originalseite erneut anmelden.'}</Label>
          </Card>}
          <Card><Section title="Begrenzter Rohabruf" />
            <Label muted>Entwicklungsnachweis: Der Abruf speichert rohe Anbieterbelege separat. Er ersetzt keine Flüge in der synthetischen Bibliothek und erzeugt keinen kanonischen Live-Import.</Label>
            <Label>Zeitraum einschließlich (JJJJ-MM-TT)</Label>
            <TextInput accessibilityLabel="Vereinsflieger Abruf von" value={c.from} onChangeText={c.setFrom} editable={!locked} autoCorrect={false} style={styles.input} />
            <TextInput accessibilityLabel="Vereinsflieger Abruf bis" value={c.to} onChangeText={c.setTo} editable={!locked} autoCorrect={false} style={styles.input} />
            <Action disabled={locked || c.recovery || c.connection.phase !== 'observed' || !c.connection.confirmed} onPress={() => c.checkConnection('retrieve')}>Rohdaten abrufen</Action>
            {c.busy && <><ActivityIndicator color={colors.cyan} /><Label>{c.saving ? 'Belege werden lokal gesichert…' : c.restoring.current ? 'Anbieteransicht wird wiederhergestellt…' : 'Abruf läuft · Anbieteransicht bleibt im Hintergrund.'}</Label>
              <Action secondary disabled={c.saving || c.restoring.current} onPress={c.cancelRetrieval}>Abruf abbrechen</Action>
              <Action secondary onPress={close}>Während des Abrufs zur App</Action>
            </>}
            {c.result === 'captured' && <Label>Rohbelege gespeichert. Identität und Flugzeitzuordnung bleiben vorläufig.</Label>}
            {c.result === 'failed' && <Label>Abruf oder Seitenaufruf fehlgeschlagen. Frühere Daten bleiben erhalten; Anmeldung, Zeitraum und Verbindung prüfen und erneut versuchen.</Label>}
            {c.result === 'cancelled' && <Label>Abruf abgebrochen. Frühere Daten bleiben erhalten.</Label>}
          </Card>
          {c.recovery && <Card><Section title="Wiederherstellung ausstehend" /><Label>Vor einem weiteren Abruf muss die ursprüngliche Anbieteransicht im ursprünglichen Konto wiederhergestellt werden.</Label><Action secondary disabled={locked || !c.original.current} onPress={() => c.checkConnection('recover')}>Anbieteransicht wiederherstellen</Action></Card>}
          <Label muted>Schließen blendet die Seite aus und meldet dich nicht beim Anbieter ab. Vollständiges Trennen ist noch nicht verifiziert. Gespeicherte Zugangsdaten können separat in den Entwicklungswerkzeugen vergessen werden.</Label>
          <Label muted>Tabwechsel bleibt möglich. Bei App-Wechsel oder gesperrtem Telefon ist kein unterbrechungsfreier Abruf zugesagt; Rückkehr erfordert eine erneute Prüfung.</Label>
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
  canvas: { padding: 10, paddingBottom: 24 }, group: { width: '100%', maxWidth: 520, alignSelf: 'center', gap: 10 },
  input: { ...ui.text, minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, backgroundColor: colors.background },
});

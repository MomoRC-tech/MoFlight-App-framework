import React from 'react';
import {TextInput,View} from 'react-native';
import type {useAccessController} from '../vereinsflieger/use-access-controller';
import {Action,Card,Label,Section,colors,ui} from './theme';

/** Existing credential administration stays outside the manual-provider login. */
export function ConnectionSettings({controller:c,busy,onSignOut}:{controller:ReturnType<typeof useAccessController>;busy:boolean;onSignOut?:()=>void}){
  const locked=busy||c.busy||c.saving||c.loginBusy||c.binding||c.clearing||c.disconnecting||c.restoring.current;
  const sessionLocked=locked||c.recovery||!c.viewReady;
  return <View style={{gap:18}}>
    <Label muted>Sitzung und Zugangsdaten sind getrennt. Gespeicherte Flüge bleiben erhalten.</Label>
    <Card><Section title="Anbietersitzung"/>
    <Label muted>Die Anmeldung erfolgt auf der Originalseite, mit System-Autofill und „Angemeldet bleiben“.</Label>
    <Label muted>Öffnet die Originalseite zum Abmelden. Schließen allein meldet dich nicht ab.</Label>
    {onSignOut&&<Action secondary disabled={sessionLocked} onPress={onSignOut}>Bei Vereinsflieger abmelden</Action>}
    <View style={{borderTopWidth:1,borderColor:colors.border,paddingTop:14,gap:10}}>
    <Label muted>Entfernt Cookies und Webspeicher dieses App-Browsers. Andere Geräte und gespeicherte Zugangsdaten bleiben unverändert.</Label>
    {c.sessionClearingAvailable?<Action secondary disabled={sessionLocked} onPress={()=>{void c.clearLocalSession();}}>Lokale Anbietersitzung löschen</Action>:<Label muted>Lokales Sitzungslöschen ist auf diesem Gerät nicht verfügbar.</Label>}
    </View>
    <View accessibilityLiveRegion="polite" style={{gap:6}}>
    {c.recovery&&<Label>Vor dem Abmelden muss die Anbieteransicht wiederhergestellt werden. Öffne dafür Sync in der Kopfzeile.</Label>}
    {c.clearing&&<Label>Lokale Anbietersitzung wird gelöscht …</Label>}
    {c.clearNotice==='cleared'&&<Label>Lokale Anbietersitzung gelöscht. Andere Geräte bleiben angemeldet.</Label>}
    {c.clearNotice==='failed'&&<Label>Lokales Löschen nicht bestätigt. Bitte erneut versuchen.</Label>}
    {c.disconnectNotice==='verified'&&<Label>Abmeldung in diesem App-Browser bestätigt.</Label>}
    {c.disconnectNotice==='failed'&&<Label>Abmeldung nicht bestätigt. Auf der Originalseite abmelden und erneut prüfen.</Label>}
    {c.disconnectNotice==='cancelled'&&<Label>Abmeldung nicht bestätigt. Schließen allein meldet dich nicht ab.</Label>}
    </View></Card>
    <Card><Section title="Gespeicherte Zugangsdaten"/>
    <Label muted>Lokal in MoFlight gespeicherter Benutzername und Passwort. Unabhängig von Sitzung und System-Autofill.</Label>
    <Action secondary disabled={locked} onPress={()=>c.setEditingLogin(!c.editingLogin)}>{c.editingLogin?'Bearbeitung schließen':'Gespeicherte Zugangsdaten verwalten'}</Action>
    {c.editingLogin&&<>
      <Label muted>Benutzername</Label><TextInput accessibilityLabel="Gespeicherter Vereinsflieger Benutzername" value={c.username} onChangeText={c.setUsername} editable={!locked} autoCapitalize="none" autoCorrect={false} style={[ui.text,{minHeight:48,borderWidth:1,borderColor:'#426783',borderRadius:12,padding:10}]}/>
      <Label muted>Passwort</Label><TextInput accessibilityLabel="Gespeichertes Vereinsflieger Passwort" value={c.password} onChangeText={c.setPassword} editable={!locked} secureTextEntry autoCapitalize="none" autoCorrect={false} style={[ui.text,{minHeight:48,borderWidth:1,borderColor:'#426783',borderRadius:12,padding:10}]}/>
      <Action disabled={locked} onPress={c.saveLogin}>Zugangsdaten auf diesem Gerät speichern</Action>
    </>}
    <View style={{borderTopWidth:1,borderColor:colors.border,paddingTop:14,gap:10}}>
    <Label muted>Vergessen entfernt nur die von MoFlight gespeicherten Zugangsdaten. Es meldet dich nicht bei Vereinsflieger ab.</Label>
    <Action secondary disabled={locked} onPress={c.forgetLogin}>Gespeicherte Zugangsdaten vergessen</Action>
    </View>
    <View accessibilityLiveRegion="polite" style={{gap:6}}>
    {c.credentialNotice==='forgotten'&&<Label>Zugangsdaten entfernt. Die Anbietersitzung bleibt unabhängig.</Label>}
    {c.credentialNotice==='error'&&<Label>Zugangsdaten konnten nicht entfernt werden.</Label>}
    </View></Card>
  </View>;
}

import React from 'react';
import {TextInput} from 'react-native';
import type {useAccessController} from '../vereinsflieger/use-access-controller';
import {Action,Card,Label,Section,ui} from './theme';

/** Existing credential administration stays outside the manual-provider login. */
export function ConnectionSettings({controller:c,busy}:{controller:ReturnType<typeof useAccessController>;busy:boolean}){
  const locked=busy||c.busy||c.saving||c.loginBusy||c.binding||c.clearing;
  return <Card><Section title="Vereinsflieger · Einstellungen"/>
    <Label muted>Die Anmeldung erfolgt bei Bedarf auf der Originalseite. System-Autofill und „Angemeldet bleiben“ werden dort verwaltet.</Label>
    <Action secondary disabled={locked} onPress={()=>c.setEditingLogin(!c.editingLogin)}>{c.editingLogin?'Bearbeitung schließen':'Gespeicherte Zugangsdaten verwalten'}</Action>
    {c.editingLogin&&<>
      <TextInput accessibilityLabel="Gespeicherter Vereinsflieger Benutzername" value={c.username} onChangeText={c.setUsername} editable={!locked} autoCapitalize="none" autoCorrect={false} style={ui.text}/>
      <TextInput accessibilityLabel="Gespeichertes Vereinsflieger Passwort" value={c.password} onChangeText={c.setPassword} editable={!locked} secureTextEntry autoCapitalize="none" autoCorrect={false} style={ui.text}/>
      <Action disabled={locked} onPress={c.saveLogin}>Zugangsdaten auf diesem Gerät speichern</Action>
    </>}
    <Action secondary disabled={locked} onPress={c.forgetLogin}>Gespeicherte Zugangsdaten vergessen</Action>
    {c.credentialNotice==='forgotten'&&<Label>Zugangsdaten entfernt. Die Anbietersitzung bleibt unabhängig.</Label>}
    {c.credentialNotice==='error'&&<Label>Zugangsdaten konnten nicht entfernt werden.</Label>}
    <Label muted>Das Vergessen betrifft nur von MoFlight gespeicherte Zugangsdaten, keine Flüge und kein System-Autofill.</Label>
  </Card>;
}

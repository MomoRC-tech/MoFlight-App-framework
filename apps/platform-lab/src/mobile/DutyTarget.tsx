import React, { useEffect, useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import { Action, Label, colors } from './theme';
import { File, Paths } from 'expo-file-system';
import { hash } from '../storage';
import { parseDutyTarget, PROVISIONAL_DUTY_HOURS } from './cockpit-season';

/** UI preference only, per selected account/store/year. No provider or flight mutation. */
export function useDutyTarget(scope: string | null, year: number) {
  const key = scope ? JSON.stringify([scope, year]) : null;
  const [saved, setSaved] = useState<{key: string; hours: number} | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const current = useRef(key); current.current = key;
  const saving = useRef(false), revision = useRef(0);
  useEffect(() => {
    let alive = true; const started=revision.current; setError(null);
    if (key) void (async () => {
      try {
        const file = new File(Paths.document, `cockpit-duty-${await hash(key)}.json`);
        if (!file.exists) return;
        const value = JSON.parse(await file.text());
        if (value.version !== 1 || value.key !== key || typeof value.hours !== 'number' || parseDutyTarget(String(value.hours)) === null) throw new Error('Invalid target');
        if (alive && current.current === key && revision.current===started) setSaved({key, hours:value.hours});
      } catch { if (alive && current.current === key && revision.current===started) setError('Lokales Soll konnte nicht gelesen werden. 25 h bleiben vorläufig.'); }
    })();
    return () => { alive = false; };
  }, [key]);
  const hours = saved?.key === key ? saved.hours : PROVISIONAL_DUTY_HOURS;
  const save = async (draft: string) => {
    const value = parseDutyTarget(draft);
    if (!key || saving.current) return false;
    if (value === null) { setError('Bitte 0 bis 999 Stunden mit höchstens zwei Nachkommastellen eingeben.'); return false; }
    saving.current=true; revision.current++; setBusy(true); setError(null);
    try {
      const file = new File(Paths.document, `cockpit-duty-${await hash(key)}.json`);
      if (current.current !== key) return false;
      const payload = JSON.stringify({version:1,key,hours:value});
      file.write(payload);
      if (await file.text() !== payload) throw new Error('Readback failed');
      if (current.current === key) setSaved({key,hours:value});
      return true;
    } catch { if (current.current === key) setError('Soll nicht gespeichert. Bitte erneut versuchen.'); return false; }
    finally { saving.current=false; setBusy(false); }
  };
  return {hours,save,error,busy,configured:saved?.key === key};
}
export function DutyTargetEditor({target, onClose}: {target: ReturnType<typeof useDutyTarget>; onClose: () => void}) {
  const [draft,setDraft] = useState(String(target.hours).replace('.',','));
  return <View style={{gap:8}}><Label>Vorläufiges Jahres-Soll · Stunden</Label>
    <Label muted>Keine bestätigte Vereinsvorgabe. Gilt lokal für dieses Konto und die gewählte Saison; nicht Teil der Datensicherung.</Label>
    <TextInput accessibilityLabel="Vorläufiges Jahres-Soll in Stunden" keyboardType="decimal-pad" value={draft} onChangeText={setDraft} editable={!target.busy} style={{minHeight:48,borderWidth:1,borderColor:colors.border,borderRadius:12,padding:10,color:colors.text,fontSize:16}} />
    {target.error && <View accessibilityLiveRegion="polite"><Label>{target.error}</Label></View>}
    <Action disabled={target.busy} onPress={()=>void target.save(draft).then(ok=>{if(ok)onClose();})}>Soll lokal speichern</Action>
    <Action secondary disabled={target.busy} onPress={onClose}>Schließen</Action>
  </View>;
}

import React, { useEffect, useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import { Action, Label, colors, startTileSurfaces } from './theme';
import { readDutyTargetNative, saveDutyTargetNative, subscribeDutyTargets } from '../duty-target-native';
import { parseDutyTarget, PROVISIONAL_DUTY_HOURS } from './cockpit-season';

interface TargetContext { key: string | null; persistent: boolean; active: boolean }

/** UI preference only, per account/store/year. Development previews opt out of all file access. */
export function useDutyTarget(scope: string | null, year: number, persistent = true) {
  const key = scope ? JSON.stringify([scope, year]) : null;
  const current = useRef<TargetContext>({key, persistent, active:true});
  // A new identity also invalidates A → B → A completions, even if the key matches again.
  if (current.current.key !== key || current.current.persistent !== persistent) current.current = {key,persistent,active:true};
  const context = current.current;
  const [saved, setSaved] = useState<{context: TargetContext; hours: number} | null>(null);
  const [failure, setFailure] = useState<{context: TargetContext; message: string} | null>(null);
  const [busy, setBusy] = useState(false);
  const [storageVersion,setStorageVersion] = useState(0);
  useEffect(() => persistent ? subscribeDutyTargets(() => setStorageVersion(value => value + 1)) : undefined, [persistent]);
  const memory = useRef(new Map<string,number>());
  const saving = useRef(false), revision = useRef(0);
  const isCurrent = () => current.current === context && context.active;
  useEffect(() => {
    let alive = true; const started=revision.current; context.active=true;
    if (key && !persistent) {
      const hours=memory.current.get(key);
      if (hours !== undefined) setSaved({context,hours});
    } else if (key) void (async () => {
      try {
        const hours = await readDutyTargetNative(key);
        if (alive && isCurrent() && revision.current===started) {
          setSaved(hours === null ? null : {context, hours});
          setFailure(null);
        }
      } catch { if (alive && isCurrent() && revision.current===started) setFailure({context,message:'Lokales Soll konnte nicht gelesen werden. 25 h bleiben vorläufig.'}); }
    })();
    return () => { alive = false; context.active=false; };
  }, [context,storageVersion]);
  const hours = saved?.context === context ? saved.hours : PROVISIONAL_DUTY_HOURS;
  const save = async (draft: string) => {
    const value = parseDutyTarget(draft);
    if (!key || saving.current || !isCurrent()) return false;
    if (value === null) { setFailure({context,message:'Bitte 0 bis 999 Stunden mit höchstens zwei Nachkommastellen eingeben.'}); return false; }
    saving.current=true; revision.current++; setBusy(true); setFailure(null);
    try {
      if (persistent) {
        if (!await saveDutyTargetNative(key,value,isCurrent)) return false;
      } else memory.current.set(key,value);
      setSaved({context,hours:value});
      return true;
    } catch { if (isCurrent()) setFailure({context,message:'Soll nicht gespeichert. Bitte erneut versuchen.'}); return false; }
    finally { saving.current=false; if (current.current.active) setBusy(false); }
  };
  return {hours,save,error:failure?.context===context?failure.message:null,busy,configured:saved?.context === context,persistent};
}
export function DutyTargetEditor({target, onClose}: {target: ReturnType<typeof useDutyTarget>; onClose: () => void}) {
  const [draft,setDraft] = useState(String(target.hours).replace('.',','));
  const live=useRef(true);
  useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
  return <View style={{gap:8}}><Label>Vorläufiges Jahres-Soll · Stunden</Label>
    <Label muted>{target.persistent?'Keine bestätigte Vereinsvorgabe. Gilt lokal für dieses Konto und die gewählte Saison; in neuen Datensicherungen enthalten. Ältere Sicherungen ändern das lokale Soll nicht.':'Synthetische Vorschau. Änderungen werden nur in dieser Ansicht angezeigt und nicht gespeichert.'}</Label>
    <TextInput accessibilityLabel="Vorläufiges Jahres-Soll in Stunden" keyboardType="decimal-pad" value={draft} onChangeText={setDraft} editable={!target.busy} style={{minHeight:48,borderWidth:1,borderColor:startTileSurfaces.border,borderRadius:12,padding:10,color:colors.text,fontSize:16}} />
    {target.error && <View accessibilityLiveRegion="polite"><Label>{target.error}</Label></View>}
    <Action disabled={target.busy} onPress={()=>void target.save(draft).then(ok=>{if(ok&&live.current)onClose();})}>{target.persistent?'Soll lokal speichern':'Soll für Vorschau übernehmen'}</Action>
    <Action secondary surface="start" disabled={target.busy} onPress={onClose}>Schließen</Action>
  </View>;
}

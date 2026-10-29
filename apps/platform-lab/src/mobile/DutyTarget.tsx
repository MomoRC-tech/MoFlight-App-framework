import React, { useEffect, useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import { Action, Label, colors, startTileSurfaces } from './theme';
import { clearDutyTargetNative, readDutyCalculationNative, readDutyTargetNative, saveDutyCalculationNative, saveDutyTargetNative, subscribeDutyTargets } from '../duty-target-native';
import { parseDutyTarget, PROVISIONAL_DUTY_HOURS } from './cockpit-season';
import { annualDutyCalculation } from './annual-duty-calculation';
import type { DutyCalculation } from '../duty-target';
import type { FeatureSource, WorkSummaryItem } from './feature-information';

interface TargetContext { key: string | null; persistent: boolean; active: boolean }

/** UI preference only, per account/store/year. Development previews opt out of all file access. */
export function useDutyTarget(scope: string | null, year: number, persistent = true, source?: FeatureSource<WorkSummaryItem>) {
  const key = scope ? JSON.stringify([scope, year]) : null;
  const current = useRef<TargetContext>({key, persistent, active:true});
  // A new identity also invalidates A → B → A completions, even if the key matches again.
  if (current.current.key !== key || current.current.persistent !== persistent) current.current = {key,persistent,active:true};
  const context = current.current;
  const [saved, setSaved] = useState<{context: TargetContext; hours: number} | null>(null);
  const [calculated, setCalculated] = useState<{context: TargetContext; value: DutyCalculation} | null>(null);
  const [loaded, setLoaded] = useState<{context: TargetContext; version: number} | null>(null);
  const [failure, setFailure] = useState<{context: TargetContext; message: string} | null>(null);
  const [busy, setBusy] = useState(false);
  const [storageVersion,setStorageVersion] = useState(0);
  useEffect(() => persistent ? subscribeDutyTargets(() => setStorageVersion(value => value + 1)) : undefined, [persistent]);
  const memory = useRef(new Map<string,number>());
  const calculatedMemory = useRef(new Map<string,DutyCalculation>());
  const attempted = useRef<{context:TargetContext;token:string}|null>(null);
  const saving = useRef(false), revision = useRef(0);
  const isCurrent = () => current.current === context && context.active;
  useEffect(() => {
    let alive = true; const started=revision.current; context.active=true;
    if (key && !persistent) {
      const hours=memory.current.get(key);
      setSaved(hours === undefined ? null : {context,hours});
      const value=calculatedMemory.current.get(key);
      setCalculated(value ? {context,value} : null);setLoaded({context,version:storageVersion});
    } else if (key) void (async () => {
      try {
        const [manual,memo] = await Promise.allSettled([readDutyTargetNative(key),readDutyCalculationNative(key)]);
        if(manual.status==='rejected')throw manual.reason;
        const hours=manual.value,value=memo.status==='fulfilled'?memo.value:null;
        if (alive && isCurrent() && revision.current===started) {
          setSaved(hours === null ? null : {context, hours});
          setCalculated(value === null ? null : {context,value});setLoaded({context,version:storageVersion});
          setFailure(memo.status==='rejected'?{context,message:'Letzte Berechnung nicht lesbar. Ein gespeichertes manuelles Soll bleibt erhalten.'}:null);
        }
      } catch { if (alive && isCurrent() && revision.current===started) setFailure({context,message:`Lokales Soll konnte nicht gelesen werden. ${PROVISIONAL_DUTY_HOURS} h bleiben vorläufig.`}); }
    })();
    return () => { alive = false; context.active=false; };
  }, [context,storageVersion]);
  const last = calculated?.context === context ? calculated.value : null;
  const candidate = annualDutyCalculation(source,year);
  useEffect(()=>{
    if (!key || loaded?.context!==context || loaded.version!==storageVersion || !candidate || saving.current ||
      last && last.retrievedAt>=candidate.retrievedAt) return;
    const token=JSON.stringify([storageVersion,candidate.retrievedAt,candidate.hours]);
    if(attempted.current?.context===context&&attempted.current.token===token)return;
    attempted.current={context,token};
    saving.current=true;const started=++revision.current;setBusy(true);
    const active=()=>isCurrent()&&revision.current===started;
    void (async()=>{
      try {
        const value=persistent ? await saveDutyCalculationNative(key,candidate,active) : candidate;
        if (value && active()) {
          if(!persistent)calculatedMemory.current.set(key,value);
          setCalculated({context,value});setFailure(null);
        }
      } catch {if(active())setFailure({context,message:'Berechnetes Soll konnte nicht gespeichert werden. Bitte erneut prüfen.'});}
      finally {saving.current=false;if(current.current.active)setBusy(false);}
    })();
  },[context,loaded,storageVersion,candidate?.hours,candidate?.retrievedAt,last?.hours,last?.retrievedAt,busy]);
  const hours = saved?.context === context ? saved.hours : last?.hours ?? PROVISIONAL_DUTY_HOURS;
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
  const reset = async () => {
    if(!key || !last || saving.current || !isCurrent())return false;
    saving.current=true;revision.current++;setBusy(true);setFailure(null);
    try {
      if(persistent){if(!await clearDutyTargetNative(key,isCurrent))return false;}
      else memory.current.delete(key);
      if(!isCurrent())return false;
      setSaved(null);return true;
    } catch {if(isCurrent())setFailure({context,message:'Soll nicht zurückgesetzt. Bitte erneut versuchen.'});return false;}
    finally {saving.current=false;if(current.current.active)setBusy(false);}
  };
  return {hours,save,reset,lastCalculated:last?.hours??null,error:failure?.context===context?failure.message:null,busy,
    retry:()=>setStorageVersion(value=>value+1),configured:saved?.context === context,persistent};
}
export function DutyTargetEditor({target, onClose}: {target: ReturnType<typeof useDutyTarget>; onClose: () => void}) {
  const [draft,setDraft] = useState(String(target.hours).replace('.',','));
  const live=useRef(true);
  useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
  return <View style={{gap:8}}><Label>Vorläufiges Jahres-Soll · Stunden</Label>
    <Label muted>{target.persistent?'Berechnete Schätzung für dieses Konto und Jahr, keine bestätigte Vereinsvorgabe. Berechnung nur bei unterschiedlichem Pflicht-/Geleistet-EUR und positiven geleisteten EUR/Stunden. Manuelle Werte bleiben erhalten; bei Gleichstand bleibt die letzte Berechnung. Manuelles Soll ist in neuen Datensicherungen enthalten; die Berechnungshistorie ist nicht in der manuellen Datensicherung.':'Synthetische Vorschau. Änderungen werden nur in dieser Ansicht angezeigt und nicht gespeichert.'}</Label>
    <Label>{target.lastCalculated!=null?`Zuletzt berechnet: ${String(target.lastCalculated).replace('.',',')} h`:'Zuletzt berechnet: noch kein gültiger Wert'}</Label>
    <Label muted>{target.configured?'Manuelles Soll aktiv':`Automatisches Soll aktiv · ohne Berechnung ${PROVISIONAL_DUTY_HOURS} h`}</Label>
    <TextInput accessibilityLabel="Vorläufiges Jahres-Soll in Stunden" keyboardType="decimal-pad" value={draft} onChangeText={setDraft} editable={!target.busy} style={{minHeight:48,borderWidth:1,borderColor:startTileSurfaces.border,borderRadius:12,padding:10,color:colors.text,fontSize:16}} />
    {target.error && <View accessibilityLiveRegion="polite"><Label>{target.error}</Label></View>}
    <Action disabled={target.busy} onPress={()=>void target.save(draft).then(ok=>{if(ok&&live.current)onClose();})}>{target.persistent?'Soll lokal speichern':'Soll für Vorschau übernehmen'}</Action>
    <Action secondary surface="start" disabled={target.busy||target.lastCalculated==null} onPress={()=>void target.reset().then(ok=>{if(ok&&live.current)onClose();})}>Auf berechnetes Soll zurücksetzen</Action>
    {target.error&&<Action secondary surface="start" disabled={target.busy} onPress={target.retry}>Lokales Soll erneut prüfen</Action>}
    <Action secondary surface="start" disabled={target.busy} onPress={onClose}>Schließen</Action>
  </View>;
}

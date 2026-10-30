import React, { useEffect, useRef, useState } from 'react';
import { AppState, TextInput } from 'react-native';
import { Action, Label, colors, ui } from './theme';
import { SettingsContentDisclosure } from './settings-secondary-content';
import type { FinancialCaptureState } from '../vereinsflieger/expense-capture-request';
import type { FinancialObservationReceipt } from '../vereinsflieger/expense-observation-store';
import type { FinancialSourceReadback } from '../development/financial-source-readback';

/** Explicit development harness, separate from ordinary Sync and expense UI. */
export function FinancialSourceProof({ capture, retrySave, read, cancel, state, saveUncertain, blocked, onBusyChange }: {
  capture(list: string, detail: string): Promise<FinancialObservationReceipt>;
  retrySave(): Promise<FinancialObservationReceipt>;
  read(expected?: FinancialObservationReceipt): Promise<FinancialSourceReadback>;
  cancel(): boolean; state: FinancialCaptureState; saveUncertain: boolean; blocked: boolean;
  onBusyChange(busy: boolean): void;
}) {
  const [list, setList] = useState(''), [detail, setDetail] = useState(''), [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), active = useRef(true), running = useRef(false), generation = useRef(0);
  const latest = useRef({ cancel, onBusyChange }); latest.current = { cancel, onBusyChange };
  useEffect(() => {
    active.current = true;
    const sub = AppState.addEventListener('change', value => {
      if (value !== 'active') { generation.current++; setMessage(null); latest.current.cancel(); }
    });
    return () => { active.current = false; generation.current++; latest.current.cancel(); sub.remove(); };
  }, []);
  async function run(mode: 'capture' | 'retry' | 'read') {
    if (running.current || blocked || AppState.currentState !== 'active') return;
    running.current = true; setBusy(true); onBusyChange(true); setMessage(null);
    const held = generation.current;
    let acknowledged = false;
    try {
      const receipt = mode === 'read' ? undefined : await (mode === 'retry' ? retrySave() : capture(list, detail));
      acknowledged = !!receipt;
      if (!active.current || held !== generation.current) return;
      const result = await read(receipt);
      if (active.current && held === generation.current) setMessage(result.state === 'absent'
        ? 'Keine Finanzdatei vorhanden. Es wurde keine Datei angelegt.'
        : `${receipt ? 'Einzelbeleg gespeichert und exakt zurückgelesen.' : 'Lokale Finanzbelege geprüft.'} ${result.receiptCount} Belege, davon ${result.billedFlightCount} abgerechnete Flugbelege. Letzte Flugbeleg-Prüfsumme: ${result.latestBilledChecksum ?? 'keine'}.`);
    } catch {
      if (active.current && held === generation.current) setMessage(acknowledged
        ? 'Speichern bestätigt; lokales Zurücklesen nicht bestätigt. Vor erneutem Anbieterabruf lokale Belege prüfen.'
        : 'Nachweis nicht bestätigt. Gespeicherte Belege bleiben erhalten. Bei unklarer Speicherbestätigung nur den ursprünglichen Auftrag abgleichen.');
    } finally {
      running.current = false; if (active.current) setBusy(false); latest.current.onBusyChange(false);
    }
  }
  const locked = blocked || busy;
  return <SettingsContentDisclosure title="Echten Finanzbeleg prüfen" summary="Ein eigener abgerechneter Flug; kein automatischer Sync" testID="development-financial-source-details">
    <Label muted>Nur tatsächlich beobachtete Links aus Eigene Flüge eintragen. Profil, eigener Listenlink und abgerechnete HTML-Detailseite werden erneut geprüft. Der rohe Finanzbeleg wird für das aktuelle Konto lokal gespeichert; keine PDF-Dateien.</Label>
    <Label muted>Kontobewegungen, Pauschale und vollständige Ausgabensummen sind damit nicht erfasst. Lokale Prüfung benötigt keinen Anbieterabruf und legt keine Finanzdatei an.</Label>
    <Label>Beobachtete Eigene-Flüge-Liste</Label>
    <TextInput accessibilityLabel="Beobachtete Eigene-Flüge-Liste" value={list} onChangeText={setList} editable={!locked && !saveUncertain} autoCorrect={false} autoCapitalize="none" keyboardType="url" maxLength={2048} style={{ ...ui.text, minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, backgroundColor: colors.background }} />
    <Label>Beobachteter Flugdetail-Link</Label>
    <TextInput accessibilityLabel="Beobachteter Flugdetail-Link" value={detail} onChangeText={setDetail} editable={!locked && !saveUncertain} autoCorrect={false} autoCapitalize="none" keyboardType="url" maxLength={2048} style={{ ...ui.text, minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, backgroundColor: colors.background }} />
    <Action disabled={locked || saveUncertain || !list || !detail} onPress={() => void run('capture')}>Diesen abgerechneten Flugbeleg erfassen</Action>
    {saveUncertain && <Action disabled={locked} onPress={() => void run('retry')}>Ursprüngliche Finanzspeicherung abgleichen</Action>}
    <Action secondary disabled={locked || saveUncertain} onPress={() => void run('read')}>Lokale Finanzbelege prüfen</Action>
    {state.phase === 'reading' && <Action secondary onPress={cancel}>Finanzabruf abbrechen</Action>}
    {state.phase !== 'idle' && <Label>{state.phase === 'reading' ? 'Einzelbeleg wird geprüft …' : state.phase === 'saving' ? 'Einzelbeleg wird gespeichert …' : 'Speicherbestätigung ist unklar. Ursprünglichen Auftrag abgleichen.'}</Label>}
    {message && <Label selectable>{message}</Label>}
  </SettingsContentDisclosure>;
}

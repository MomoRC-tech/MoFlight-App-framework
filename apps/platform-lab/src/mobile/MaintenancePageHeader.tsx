import React, { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, Text } from 'react-native';
import { AppHeader } from './AppHeader';
import { SyncConfirmationDialog } from './SyncConfirmationDialog';
import { Label, colors } from './theme';

/** Keep the established, confirmed Sync entry while maintenance retains its own Back path. */
export function MaintenancePageHeader({ title, open, requestKey, busy, syncDisabled = busy, onBack, onRequestSync, verifySync }: {
  title: string; open: boolean; requestKey: string; busy: boolean; syncDisabled?: boolean; onBack: () => void;
  onRequestSync?: () => void; verifySync: () => Promise<void>;
}) {
  const [prompt, setPrompt] = useState(false), [error, setError] = useState(false);
  const ticket = useRef<object | null>(null);
  const admission = useRef<object | null>(null);
  const current = useRef({ open, requestKey, busy, syncDisabled, onRequestSync, verifySync });
  current.current = { open, requestKey, busy, syncDisabled, onRequestSync, verifySync };
  const cancel = () => { ticket.current = null; admission.current = null; setPrompt(false); };
  useEffect(() => { cancel(); setError(false); }, [open, requestKey]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => { if (state !== 'active') cancel(); });
    return () => { ticket.current = null; admission.current = null; subscription.remove(); };
  }, []);
  const confirm = async (selected: object | null) => {
    const admitted = current.current;
    if (!selected || ticket.current !== selected || !admitted.open || admitted.busy || admitted.syncDisabled || AppState.currentState !== 'active') return;
    ticket.current = null; admission.current = selected; setPrompt(false);
    try {
      await admitted.verifySync();
      const latest = current.current;
      if (admission.current === selected && latest.open && latest.requestKey === admitted.requestKey && !latest.busy && !latest.syncDisabled && AppState.currentState === 'active') { admission.current = null; latest.onRequestSync?.(); }
    } catch { if (admission.current === selected && current.current.open && current.current.requestKey === admitted.requestKey) setError(true); }
    finally { if (admission.current === selected) admission.current = null; }
  };
  const promptTicket = ticket.current;
  return <>
    <AppHeader variant="page" title={title} back={onBack} backDisabled={busy}>
      {onRequestSync && <Pressable accessibilityRole="button" accessibilityLabel="Daten synchronisieren" accessibilityState={{ disabled: syncDisabled }} disabled={syncDisabled} onPress={() => { if (!current.current.open || current.current.syncDisabled) return; ticket.current = {}; setError(false); setPrompt(true); }} style={{ minWidth: 48, minHeight: 48, paddingHorizontal: 8, justifyContent: 'center', alignItems: 'center', opacity: syncDisabled ? .5 : 1 }}><Text style={{ color: colors.cyan, fontSize: 14, fontWeight: '600' }}>Sync</Text></Pressable>}
    </AppHeader>
    {error && <Label style={{ paddingHorizontal: 18, color: '#ffb39e' }}>Die lokale Auswahl konnte nicht bestätigt werden. Öffne diese Seite erneut.</Label>}
    {open && prompt && <SyncConfirmationDialog onCancel={cancel} onConfirm={() => void confirm(promptTicket)} />}
  </>;
}

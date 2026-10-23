import {SyncShine} from './SyncProgress';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Label, colors } from './theme';
import { SymbolIcon } from './SymbolIcon';
import { dataFreshness, dataUpdateStatus, type CaptureReadState } from './data-freshness';
import type { ConnectionState } from '../vereinsflieger/connection-state';
import { createSessionPresentation } from './data-update-presentation';

/** One action; saved age, session evidence and sync advice have separate cues. */
export function DataUpdateIndicator({ connection, scopeKey = null, receivedAt, readState, now, disabled = false, activityChanged = false, syncing=false, onPress }: {
  connection?: ConnectionState;
  scopeKey?: string | null;
  receivedAt: string | null; readState: CaptureReadState; now: number; disabled?: boolean; activityChanged?: boolean; syncing?:boolean; onPress: () => void;
}) {
  const status = dataUpdateStatus(receivedAt, readState, now);
  const sessionPresentation = useMemo(createSessionPresentation, []);
  const session = sessionPresentation(scopeKey, connection, now);
  const recommended = dataFreshness(receivedAt, readState, now).reminder;
  const amber = recommended || activityChanged;
  const tint = session.state === 'connected' ? '#74dfba' : session.state === 'login-required' ? '#ffc477' : colors.muted;
  const action='Daten synchronisieren';
  return <Pressable accessibilityRole="button" accessibilityLabel={`${action}. ${session.description} ${status.description}${activityChanged ? ' Änderungen möglich.' : ''}${recommended ? ' Synchronisieren empfohlen: Flugdaten älter als drei Tage.' : ''}`}
    accessibilityHint="Synchronisiert alle unterstützten Daten. Falls nötig, öffnet sich die Anmeldung."
    accessibilityState={{ disabled:disabled||syncing,busy:syncing }} disabled={disabled||syncing} onPress={onPress}
    style={[styles.button, disabled && { opacity: .5 }]}>
    <View style={[styles.face, amber && styles.amber]}><SyncShine active={syncing}/><SymbolIcon name="refresh" size={24} />
    <View accessible={false} style={styles.copy}><View style={styles.titleRow}><Label style={styles.title}>{syncing?'Synchronisiert …':'Daten'}</Label>
      <Label style={[styles.session, { color: tint }]}>{session.mark}</Label></View>
      <Label style={[styles.age, recommended && { color: '#ffc477' }]}>{status.caption}{recommended ? ' !' : ''}</Label>
      {activityChanged && <Label style={styles.activity}>Änderungen möglich</Label>}</View></View>
  </Pressable>;
}

const styles = StyleSheet.create({
  button: { minWidth: 94, maxWidth: 150, minHeight: 48, justifyContent: 'center', flexShrink: 1 },
  face: { overflow:'hidden', minHeight: 40, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, flexDirection: 'row', gap: 5, alignItems: 'center', justifyContent: 'center' },
  amber: { borderColor: '#ffc477', backgroundColor: '#ffc47712' },
  copy: { flexShrink: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  session: { fontSize: 11, lineHeight: 16, fontWeight: '700' },
  title: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  age: { fontSize: 11, lineHeight: 15, color: colors.muted },
  activity: { fontSize: 10, lineHeight: 14, color: '#ffc477' },
});

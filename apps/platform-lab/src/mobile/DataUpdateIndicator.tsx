import {SyncShine} from './SyncProgress';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ui } from './theme';
import { SymbolIcon } from './SymbolIcon';
import { dataFreshness, dataUpdateStatus, type CaptureReadState } from './data-freshness';
import type { ConnectionState } from '../vereinsflieger/connection-state';
import { createSessionPresentation } from './data-update-presentation';

/** One action; saved age, session evidence and sync advice have separate cues. */
export function DataUpdateIndicator({ connection, scopeKey = null, receivedAt, readState, now, disabled = false, activityChanged = false, syncing=false, incomplete=false, onPress }: {
  connection?: ConnectionState;
  scopeKey?: string | null;
  receivedAt: string | null; readState: CaptureReadState; now: number; disabled?: boolean; activityChanged?: boolean; syncing?:boolean; incomplete?:boolean; onPress: () => void;
}) {
  const status = dataUpdateStatus(receivedAt, readState, now);
  const sessionPresentation = useMemo(createSessionPresentation, []);
  const session = sessionPresentation(scopeKey, connection, now);
  const recommended = dataFreshness(receivedAt, readState, now).reminder;
  const attention = recommended || activityChanged || incomplete || readState==='failed' || (readState==='ready'&&status.state==='unknown');
  const action='Daten synchronisieren';
  return <Pressable accessibilityRole="button" accessibilityLabel={`${action}. ${syncing?'Synchronisierung läuft. ':''}${session.description} ${status.description}${incomplete?' Letzte Synchronisierung unvollständig.':''}${activityChanged ? ' Änderungen möglich.' : ''}${recommended ? ' Synchronisieren empfohlen: Flugdaten älter als drei Tage.' : ''}`}
    accessibilityHint="Synchronisiert alle unterstützten Daten. Falls nötig, öffnet sich die Anmeldung."
    accessibilityState={{ disabled:disabled||syncing,busy:syncing }} disabled={disabled||syncing} onPress={onPress}
    style={[ui.headerAction, disabled && { opacity: .5 }]}>
    <View accessible={false} importantForAccessibility="no-hide-descendants" style={styles.face}><SyncShine active={syncing}/><SymbolIcon name="refresh" size={28} /></View>
    {attention&&!syncing&&<Text testID="sync-advice" accessible={false} importantForAccessibility="no" style={styles.advice}>!</Text>}
  </Pressable>;
}

const styles = StyleSheet.create({
  face: { overflow:'hidden', width:32, height:32, alignItems:'center', justifyContent:'center' },
  advice: { position:'absolute',right:0,top:0,fontSize:16,lineHeight:22,fontWeight:'700',color:'#ffc477' },
});

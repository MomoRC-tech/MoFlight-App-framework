import {SyncShine} from './SyncProgress';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, ui } from './theme';
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
  const amber = recommended || activityChanged || incomplete;
  const tint = session.state === 'connected' ? '#74dfba' : session.state === 'login-required' ? '#ffc477' : colors.muted;
  const action='Daten synchronisieren';
  return <Pressable accessibilityRole="button" accessibilityLabel={`${action}. ${syncing?'Synchronisierung läuft. ':''}${session.description} ${status.description}${incomplete?' Letzte Synchronisierung unvollständig.':''}${activityChanged ? ' Änderungen möglich.' : ''}${recommended ? ' Synchronisieren empfohlen: Flugdaten älter als drei Tage.' : ''}`}
    accessibilityHint="Synchronisiert alle unterstützten Daten. Falls nötig, öffnet sich die Anmeldung."
    accessibilityState={{ disabled:disabled||syncing,busy:syncing }} disabled={disabled||syncing} onPress={onPress}
    style={[ui.headerAction, disabled && { opacity: .5 }]}>
    <View accessible={false} importantForAccessibility="no-hide-descendants" style={styles.face}><SyncShine active={syncing}/><SymbolIcon name="refresh" size={28} /></View>
    <View accessible={false} importantForAccessibility="no-hide-descendants" style={styles.session}><Text allowFontScaling={false} style={{fontSize:11,lineHeight:16,fontWeight:'700',color:tint}}>{session.mark}</Text></View>
    {(amber||readState==='failed')&&<View testID="sync-advice" accessible={false} style={styles.advice}/>}
  </Pressable>;
}

const styles = StyleSheet.create({
  face: { overflow:'hidden', width:32, height:32, alignItems:'center', justifyContent:'center' },
  session: { position:'absolute',right:0,bottom:0 },
  advice: { position:'absolute',right:3,top:3,width:7,height:7,borderRadius:4,backgroundColor:'#ffc477' },
});

import {SyncActivityIndicator} from './SyncProgress';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ui } from './theme';
import { SymbolIcon } from './SymbolIcon';
import { dataUpdateStatus, type CaptureReadState } from './data-freshness';
import type { ConnectionState } from '../vereinsflieger/connection-state';
import { createSessionPresentation } from './data-update-presentation';
import { syncStatus } from './sync-status';
import { StatusBadge } from './StatusBadge';
import { idleSyncProgress, type SyncProgress } from './sync-progress';

/** One action; saved age, session evidence and sync advice have separate cues. */
export function DataUpdateIndicator({ connection, scopeKey = null, receivedAt, readState, now, disabled = false, activityChanged = false, syncing=false, incomplete=false, progress, completed=false, onPress }: {
  connection?: ConnectionState;
  scopeKey?: string | null;
  receivedAt: string | null; readState: CaptureReadState; now: number; disabled?: boolean; activityChanged?: boolean; syncing?:boolean; incomplete?:boolean; onPress: () => void;
  progress?: SyncProgress; completed?: boolean;
}) {
  const status = dataUpdateStatus(receivedAt, readState, now);
  const sessionPresentation = useMemo(createSessionPresentation, []);
  const session = sessionPresentation(scopeKey, connection, now);
  const effectiveProgress=progress??{...idleSyncProgress,state:syncing?'active':incomplete?'partial':'idle'};
  const presentation=syncStatus({receivedAt,readState,now,activityChanged,completed,progress:effectiveProgress});
  const busy=effectiveProgress.state==='active'||effectiveProgress.state==='waiting';
  const action='Daten synchronisieren';
  return <Pressable accessibilityRole="button" accessibilityLabel={`${action}. ${presentation.description} ${session.description} ${status.description}`}
    accessibilityHint="Fragt vor dem Start nach. Falls nötig, öffnet sich danach die Anmeldung."
    accessibilityState={{ disabled:disabled||busy,busy }} disabled={disabled||busy} onPress={onPress}
    style={[ui.headerAction, disabled && { opacity: .5 }]}>
    <View accessible={false} importantForAccessibility="no-hide-descendants" style={styles.face}>{presentation.reason==='active'?<SyncActivityIndicator/>:<SymbolIcon name="refresh" size={28} />}</View>
    <StatusBadge testID="sync-status-badge" mark={presentation.mark} tone={presentation.tone}/>
  </Pressable>;
}

const styles = StyleSheet.create({
  face: { overflow:'hidden', width:32, height:32, alignItems:'center', justifyContent:'center' },
});

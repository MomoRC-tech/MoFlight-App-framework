import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Label, colors } from './theme';
import { SymbolIcon } from './SymbolIcon';
import { dataUpdateStatus, type CaptureReadState } from './data-freshness';
import type { ConnectionState } from '../vereinsflieger/connection-state';

/** One action; green means recent matching session proof, never saved-data age. */
export function DataUpdateIndicator({ connection, receivedAt, readState, now, disabled = false, onPress }: {
  connection?: ConnectionState;
  receivedAt: string | null; readState: CaptureReadState; now: number; disabled?: boolean; onPress: () => void;
}) {
  const status = dataUpdateStatus(receivedAt, readState, now);
  const age=now-Date.parse(connection?.lastCheckedAt??'');
  const connected=connection?.phase==='observed'&&connection.confirmed&&!!connection.observed&&age>=0&&age<90_000;
  const checking=connection?.phase==='checking';
  const tint=connected?'#74dfba':colors.muted;
  const action=connected?'Daten synchronisieren':'Bei Vereinsflieger anmelden';
  return <Pressable accessibilityRole="button" accessibilityLabel={`${action}. ${connected?'Verbunden.':checking?'Verbindung wird geprüft.':'Verbindung nicht bestätigt.'} ${status.description}`}
    accessibilityHint="Lädt neue Daten. Falls nötig, öffnet sich die Anmeldung."
    accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={[styles.button, disabled && { opacity: .5 }]}>
    <View style={styles.face}><View><SymbolIcon name={connected?'refresh':'chain'} size={24} tone={connected?'default':'muted'} />
      {connected&&<View testID="verified-connection" style={{position:'absolute',right:-2,bottom:-2,width:8,height:8,borderRadius:4,backgroundColor:tint}}/>}</View>
    <View accessible={false} style={styles.copy}><Label style={styles.title}>{connected?'Daten':'Vereinsflieger'}</Label>
      <Label style={[styles.age, { color: tint }]}>{connected?'synchronisieren':checking?'Verbinden …':'Anmelden'}</Label></View></View>
  </Pressable>;
}

const styles = StyleSheet.create({
  button: { minWidth: 94, minHeight: 48, justifyContent: 'center', flexShrink: 1 },
  face: { minHeight: 40, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, backgroundColor: colors.card, flexDirection: 'row', gap: 5, alignItems: 'center', justifyContent: 'center' },
  copy: { flexShrink: 1 },
  title: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  age: { fontSize: 11, lineHeight: 15 },
});

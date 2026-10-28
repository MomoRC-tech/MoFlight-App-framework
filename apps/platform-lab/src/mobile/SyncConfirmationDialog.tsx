import React, { useEffect } from 'react';
import { Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { colors, ui } from './theme';

/** One short, dark confirmation above the current page. The parent owns the scope ticket. */
export function SyncConfirmationDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  // A short decision has no editable field; retain the caller's draft while freeing its actions.
  useEffect(() => { Keyboard.dismiss(); }, []);
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 360 || fontScale > 1.3;
  const cancelAction = <Pressable accessibilityRole="button" accessibilityLabel="Abbrechen" onPress={onCancel} style={({ pressed }) => [styles.button, pressed && ui.pressed]}><View style={styles.face}><Text style={styles.cancelText}>Abbrechen</Text></View></Pressable>;
  const confirmAction = <Pressable accessibilityRole="button" accessibilityLabel="Abruf starten" onPress={onConfirm} style={({ pressed }) => [styles.button, pressed && ui.pressed]}><View style={[styles.face, styles.confirm]}><Text style={styles.confirmText}>Abruf starten</Text></View></Pressable>;
  return <Modal transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
    <View style={styles.scrim}>
      <Pressable accessible={false} importantForAccessibility="no" onPress={onCancel} style={StyleSheet.absoluteFill} />
      <View accessibilityViewIsModal style={styles.frame}>
        <Text accessibilityRole="header" style={styles.title}>Daten von Vereinsflieger abrufen?</Text>
        <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          <Text style={styles.body}>MoFlight versucht, deine Flüge und unterstützte Zusatzdaten zu aktualisieren. Falls nötig, meldest du dich auf der Originalseite an. Gespeicherte Flüge bleiben verfügbar.</Text>
        </ScrollView>
        <View style={[styles.actions, stacked && styles.stackedActions]}>
          {stacked ? <>{confirmAction}{cancelAction}</> : <>{cancelAction}{confirmAction}</>}
        </View>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16, backgroundColor: '#000712bd' },
  frame: { width: '100%', maxWidth: 480, maxHeight: '85%', borderRadius: 28, backgroundColor: colors.raised, elevation: 18, overflow: 'hidden' },
  scroll: { flexGrow: 0, flexShrink: 1, minHeight: 0 },
  content: { paddingHorizontal: 24, paddingBottom: 16, gap: 16 },
  title: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 16, color: colors.text, fontSize: 24, lineHeight: 32, fontWeight: '600' },
  body: { color: colors.muted, fontSize: 16, lineHeight: 24 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingTop: 8, paddingBottom: 24 },
  stackedActions: { flexDirection: 'column', alignItems: 'stretch' },
  button: { minHeight: 48, minWidth: 48, justifyContent: 'center', maxWidth: '100%' },
  face: { minHeight: 40, minWidth: 48, paddingHorizontal: 12, paddingVertical: 8, justifyContent: 'center', alignItems: 'center', borderRadius: 12 },
  confirm: { backgroundColor: colors.cyan },
  cancelText: { color: colors.cyan, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  confirmText: { color: '#031326', fontSize: 14, lineHeight: 20, fontWeight: '700' },
});

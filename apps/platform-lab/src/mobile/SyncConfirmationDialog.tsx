import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { colors, ui } from './theme';

/** One short, dark confirmation above the current page. The parent owns the scope ticket. */
export function SyncConfirmationDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 360 || fontScale > 1.3;
  return <Modal transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
    <View style={styles.scrim}>
      <Pressable accessible={false} importantForAccessibility="no" onPress={onCancel} style={StyleSheet.absoluteFill} />
      <View accessibilityViewIsModal style={styles.frame}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          <Text accessibilityRole="header" style={styles.title}>Daten von Vereinsflieger abrufen?</Text>
          <Text style={styles.body}>MoFlight versucht, deine Flüge und unterstützte Zusatzdaten zu aktualisieren. Falls nötig, meldest du dich auf der Originalseite an. Gespeicherte Flüge bleiben verfügbar.</Text>
          <View style={[styles.actions, stacked && styles.stackedActions]}>
            <Pressable accessibilityRole="button" accessibilityLabel="Abbrechen" onPress={onCancel} style={({ pressed }) => [styles.button, pressed && ui.pressed]}><Text style={styles.cancelText}>Abbrechen</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Abruf starten" onPress={onConfirm} style={({ pressed }) => [styles.button, styles.confirm, pressed && ui.pressed]}><Text style={styles.confirmText}>Abruf starten</Text></Pressable>
          </View>
        </ScrollView>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16, backgroundColor: '#000712bd' },
  frame: { width: '100%', maxWidth: 480, maxHeight: '85%', borderRadius: 28, backgroundColor: colors.raised, elevation: 18, overflow: 'hidden' },
  content: { padding: 24, gap: 16 },
  title: { color: colors.text, fontSize: 24, lineHeight: 32, fontWeight: '600' },
  body: { color: colors.muted, fontSize: 16, lineHeight: 24 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center', gap: 8, paddingTop: 8 },
  stackedActions: { flexDirection: 'column-reverse', alignItems: 'stretch' },
  button: { minHeight: 48, minWidth: 48, paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center', borderRadius: 12 },
  confirm: { backgroundColor: colors.cyan },
  cancelText: { color: colors.cyan, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  confirmText: { color: '#031326', fontSize: 14, lineHeight: 20, fontWeight: '700' },
});

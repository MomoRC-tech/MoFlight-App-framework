import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { colors, ui } from './theme';

/** One local deletion decision; the route retains the exact workspace and conversation. */
export function AiDeleteConfirmationDialog({ title, onCancel, onConfirm }: { title: string; onCancel: () => void; onConfirm: () => void }) {
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 360 || fontScale > 1.3;
  const cancelAction = <Pressable accessibilityRole="button" accessibilityLabel="Abbrechen" onPress={onCancel} style={({ pressed }) => [styles.button, pressed && ui.pressed]}><Text style={styles.cancelText}>Abbrechen</Text></Pressable>;
  const confirmAction = <Pressable accessibilityRole="button" accessibilityLabel="Gespräch löschen" onPress={onConfirm} style={({ pressed }) => [styles.button, styles.confirm, pressed && ui.pressed]}><Text style={styles.confirmText}>Löschen</Text></Pressable>;
  return <Modal transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
    <View style={styles.scrim}>
      <Pressable accessible={false} importantForAccessibility="no" onPress={onCancel} style={StyleSheet.absoluteFill} />
      <View accessibilityViewIsModal style={styles.frame}>
        <Text accessibilityRole="header" style={styles.title}>Gespräch löschen?</Text>
        <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          <Text style={styles.body}>{title}</Text>
          <Text style={styles.note}>Der lokale Verlauf und Entwurf werden gelöscht. Bereits exportierte Sicherungen bleiben bestehen.</Text>
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
  scroll: { flexShrink: 1, minHeight: 0 },
  content: { paddingHorizontal: 24, paddingBottom: 16, gap: 16 },
  title: { padding: 24, color: colors.text, fontSize: 24, lineHeight: 32, fontWeight: '600' },
  body: { color: colors.text, fontSize: 16, lineHeight: 24 },
  note: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingTop: 8, paddingBottom: 24 },
  stackedActions: { flexDirection: 'column', alignItems: 'stretch' },
  button: { minHeight: 48, minWidth: 48, paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center', borderRadius: 12 },
  confirm: { backgroundColor: colors.cyan },
  cancelText: { color: colors.cyan, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  confirmText: { color: '#031326', fontSize: 14, lineHeight: 20, fontWeight: '700' },
});

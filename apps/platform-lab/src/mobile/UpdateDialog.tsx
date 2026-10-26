import React from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from './theme';

/** Keep the same frame/native child tree while closed or during credential activities. */
export function UpdateDialog({ open, expanded = false, fullPage = false, children }: { open: boolean; expanded?: boolean; fullPage?: boolean; children: (windowTop?: number) => React.ReactNode }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const margin = width >= 600 ? 24 : 12;
  const availableWidth = Math.max(1, width - insets.left - insets.right - margin * 2);
  const availableHeight = Math.max(1, height - insets.top - insets.bottom - margin * 2);
  const frameWidth = Math.min(720, availableWidth), frameHeight = Math.min(expanded ? 900 : 420, availableHeight);
  const left = insets.left + margin + (availableWidth - frameWidth) / 2;
  const top = insets.top + margin + (availableHeight - frameHeight) / 2;
  return <View pointerEvents={open ? 'auto' : 'none'} accessibilityElementsHidden={!open} aria-hidden={!open}
    importantForAccessibility={open ? 'auto' : 'no-hide-descendants'} accessibilityViewIsModal={open}
    style={[StyleSheet.absoluteFill, { opacity: open ? 1 : 0, zIndex: open ? 20 : -1 }]}>
    {!fullPage && <Pressable accessible={false} importantForAccessibility="no" onPress={() => {}} style={[StyleSheet.absoluteFill, styles.scrim]} />}
    <View testID={fullPage ? 'maintenance-page-host' : 'data-update-dialog'} style={fullPage ? styles.page : [styles.frame, { left, top, width: frameWidth, height: frameHeight }]}>
      {children(fullPage ? undefined : top)}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: '#000712bd' },
  frame: { position: 'absolute', overflow: 'hidden', borderRadius: 22, borderWidth: 1, borderColor: '#426783',
    backgroundColor: colors.background, elevation: 18, shadowColor: '#000000', shadowOpacity: .5, shadowRadius: 20 },
  page: { flex: 1, backgroundColor: colors.background },
});

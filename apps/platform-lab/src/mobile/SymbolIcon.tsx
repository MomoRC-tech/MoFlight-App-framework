import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { duotoneAssets, type SymbolName, type SymbolTone } from './duotone-assets';

export type { SymbolName, SymbolTone } from './duotone-assets';

/** Decorative artwork only. Its labelled parent owns action/status semantics. */
export function SymbolIcon({ name, size = 24, tone = 'default', tile = false }: {
  name: SymbolName; size?: number; tone?: SymbolTone; tile?: boolean;
}) {
  const artwork = <Image accessible={false} accessibilityElementsHidden importantForAccessibility="no"
    source={duotoneAssets[name][tone]} resizeMode="contain" fadeDuration={0}
    style={{ width: size, height: size }} />;
  return tile ? <View accessible={false} style={[styles.tile, { width: size + 8, height: size + 8 }]}>{artwork}</View> : artwork;
}

export function legacyIconTone(color?: string): SymbolTone {
  return !color || ['#f5f7ff', '#00c8ff', '#46ccff', '#f4f7f8', '#8be8d2', '#27d3d2', '#f4f8fc'].includes(color) ? 'default' : 'muted';
}

const styles = StyleSheet.create({
  tile: { borderRadius: 12, borderWidth: 1, borderColor: '#9ab8d333', backgroundColor: '#8ba9c01a',
    experimental_backgroundImage: 'linear-gradient(140deg, #b9dcf52b, #7497bf12)', alignItems: 'center', justifyContent: 'center' },
});

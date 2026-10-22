import React, { memo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Label, colors } from './theme';
import type { RingSlice, SeasonDifference } from './season-model';

const thickness = 5;

interface SeasonRingLayer {
  year: number; slices: readonly RingSlice[]; value: string; description: string;
}

/** Two aircraft-share distributions share a centre; outer is current, inner is prior year. */
export const SeasonRing = memo(function SeasonRing({ layers, label, difference }: {
  layers: readonly SeasonRingLayer[]; label: string; difference: SeasonDifference;
}) {
  const { fontScale } = useWindowDimensions();
  const scale = Math.max(1, fontScale), size = 88 * scale;
  const symbol = { up: '↑', down: '↓', equal: '↔', unknown: 'Δ' }[difference.direction];
  return <View accessible accessibilityLabel={`${label}. ${layers.map((layer, index) => `${index === 0 ? 'Außen, Wert in der Mitte' : 'Innen'} ${layer.description}`).join('; ')}. Differenz gespeicherter Jahreswerte: ${difference.value === null ? 'unbekannt' : difference.text}. Zeiträume können unterschiedlich oder unvollständig sein.`} style={styles.group}>
    <Label muted style={styles.label}>{label}</Label>
    <View style={styles.body}>
      <View style={[styles.ring, { width: size, height: size }]}>
        {layers.map((layer, layerIndex) => {
          const diameter = size - layerIndex * 18 * scale;
          const radius = (diameter - thickness) / 2;
          const inset = (size - diameter) / 2;
          // Fade the composed prior-year ring, preserving aircraft hues and
          // avoiding visible overlap seams between its small arc strips.
          return <View key={layer.year} needsOffscreenAlphaCompositing={layerIndex > 0} style={[StyleSheet.absoluteFill, layerIndex > 0 && styles.priorYear]}>
            <View style={[styles.track, { left: inset, top: inset, width: diameter, height: diameter, borderRadius: diameter / 2 }]} />
            {layer.slices.flatMap((slice, sliceIndex) => {
              const gap = layer.slices.length > 1 ? Math.min(2, slice.sweep / 5) : 0;
              const sweep = slice.sweep - gap;
              const strips = Math.max(1, Math.ceil(sweep / 3));
              const step = sweep / strips;
              const chord = 2 * radius * Math.sin(step * Math.PI / 360);
              return Array.from({ length: strips }, (_, index) => {
                const atBoundary = layer.slices.length > 1 && (index === 0 || index === strips - 1);
                const length = chord + (atBoundary ? .25 : 1.75);
                const angle = slice.start + gap / 2 + step * (index + .5);
                const radians = angle * Math.PI / 180;
                return <View key={`${sliceIndex}-${index}`} style={{
                  position: 'absolute', width: length, height: thickness,
                  left: size / 2 + radius * Math.cos(radians) - length / 2,
                  top: size / 2 + radius * Math.sin(radians) - thickness / 2,
                  backgroundColor: slice.color, transform: [{ rotate: `${angle + 90}deg` }],
                }} />;
              });
            })}
          </View>;
        })}
        <View style={[styles.center, { left: 18 * scale, right: 18 * scale, top: 18 * scale, bottom: 18 * scale }]}>
          <Label muted style={styles.year}>{layers[0]?.year}</Label>
          <Label style={styles.currentValue}>{layers[0]?.value ?? '—'}</Label>
        </View>
      </View>
      <View style={[styles.values, { minWidth: 40 * scale }]}>
        <Label muted style={styles.year}>{layers[1]?.year ?? 'Vorjahr'}</Label>
        <Label style={styles.value}>{layers[1]?.value ?? '—'}</Label>
        <Label style={styles.difference}>{symbol} {difference.text}</Label>
      </View>
    </View>
  </View>;
});

const styles = StyleSheet.create({
  group: { flex: 1, minWidth: 0, gap: 4 },
  body: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 7 },
  ring: { flexShrink: 0 },
  track: { position: 'absolute', borderWidth: thickness, borderColor: colors.border },
  priorYear: { opacity: .5 },
  center: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  currentValue: { fontSize: 14, lineHeight: 19, fontWeight: '700', textAlign: 'center' },
  values: { flex: 1, gap: 2 },
  value: { fontSize: 14, lineHeight: 19, fontWeight: '600' },
  difference: { fontSize: 12, lineHeight: 17, fontWeight: '600' },
  year: { fontSize: 10, lineHeight: 14 },
  label: { fontSize: 12, lineHeight: 18, fontWeight: '600' },
});

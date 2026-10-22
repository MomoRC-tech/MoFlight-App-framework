import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Label, colors } from './theme';
import type { RingSlice } from './season-model';

const size = 64;
const thickness = 5;

interface SeasonRingLayer {
  year: number; slices: readonly RingSlice[]; value: string; description: string;
}

/** Two aircraft-share distributions share a centre; outer is current, inner is prior year. */
export const SeasonRing = memo(function SeasonRing({ layers, label }: {
  layers: readonly SeasonRingLayer[]; label: string;
}) {
  return <View accessible accessibilityLabel={`${label}. ${layers.map((layer, index) => `${index === 0 ? 'Außen' : 'Innen'} ${layer.description}`).join('; ')}`} style={styles.group}>
    <Label muted style={styles.label}>{label}</Label>
    <View style={styles.body}>
      <View style={styles.ring}>
        {layers.map((layer, layerIndex) => {
          const diameter = size - layerIndex * 18;
          const radius = (diameter - thickness) / 2;
          const inset = (size - diameter) / 2;
          return <View key={layer.year} style={StyleSheet.absoluteFill}>
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
      </View>
      <View style={styles.values}>{layers.map((layer, index) => <View key={layer.year}>
        <Label muted style={styles.year}>{layer.year} · {index === 0 ? 'außen' : 'innen'}</Label>
        <Label style={styles.value}>{layer.value}</Label>
      </View>)}</View>
    </View>
  </View>;
});

const styles = StyleSheet.create({
  group: { flex: 1, minWidth: 0, gap: 4 },
  body: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  ring: { width: size, height: size, flexShrink: 0 },
  track: { position: 'absolute', borderWidth: thickness, borderColor: colors.border },
  values: { flex: 1, minWidth: 0, gap: 3 },
  value: { fontSize: 16, lineHeight: 21, fontWeight: '700' },
  year: { fontSize: 10, lineHeight: 14 },
  label: { fontSize: 12, lineHeight: 18, fontWeight: '600' },
});

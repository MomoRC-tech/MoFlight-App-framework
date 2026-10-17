import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Label } from './theme';
import type { RingSlice } from './season-model';

const size = 62;
const thickness = 6;
const radius = (size - thickness) / 2;

/** Two tiny charts only: native tangent strips approximate arcs without a map/SVG dependency. */
export function SeasonRing({ slices, value, label, description }: {
  slices: readonly RingSlice[]; value: string; label: string; description: string;
}) {
  return <View accessible accessibilityLabel={description} style={styles.ring}>
    <View style={styles.track} />
    {slices.flatMap((slice, sliceIndex) => {
      // Narrow boundaries distinguish aircraft without changing their calculated angular shares.
      const gap = slices.length > 1 ? Math.min(2, slice.sweep / 5) : 0;
      const sweep = slice.sweep - gap;
      const strips = Math.max(1, Math.ceil(sweep / 3));
      const step = sweep / strips;
      const length = 2 * radius * Math.sin(step * Math.PI / 360) + .45;
      return Array.from({ length: strips }, (_, index) => {
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
    <Label style={styles.value}>{value}</Label><Label style={styles.label}>{label}</Label>
  </View>;
}

const styles = StyleSheet.create({
  ring: { width: size, height: size, alignItems: 'center', justifyContent: 'center', backgroundColor: '#061626', borderRadius: size / 2 },
  track: { position: 'absolute', width: size, height: size, borderWidth: thickness, borderRadius: size / 2, borderColor: '#234357' },
  value: { fontSize: 15, lineHeight: 19, fontWeight: '700' }, label: { fontSize: 9, lineHeight: 12 },
});

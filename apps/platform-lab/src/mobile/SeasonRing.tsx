import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Label, colors } from './theme';
import type { RingSlice } from './season-model';

const size = 44;
const thickness = 5;
const radius = (size - thickness) / 2;

/** Compact aircraft-share charts: native tangent strips approximate arcs without a map/SVG dependency. */
export const SeasonRing = memo(function SeasonRing({ slices, value, label, description }: {
  slices: readonly RingSlice[]; value: string; label: string; description: string;
}) {
  return <View accessible accessibilityLabel={description} style={styles.group}><View style={styles.ring}>
    <View style={styles.track} />
    {slices.flatMap((slice, sliceIndex) => {
      // Narrow boundaries distinguish aircraft without changing their calculated angular shares.
      const gap = slices.length > 1 ? Math.min(2, slice.sweep / 5) : 0;
      const sweep = slice.sweep - gap;
      const strips = Math.max(1, Math.ceil(sweep / 3));
      const step = sweep / strips;
      const chord = 2 * radius * Math.sin(step * Math.PI / 360);
      return Array.from({ length: strips }, (_, index) => {
        // Overlap interior rasterized edges: subpixel antialiasing otherwise exposes tick seams.
        // Keep the two aircraft-boundary ends narrow so the intentional gap remains visible.
        const atBoundary = slices.length > 1 && (index === 0 || index === strips - 1);
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
    <View style={styles.center} />
    </View><View style={{flex:1,minWidth:0}}><Label style={styles.value}>{value}</Label><Label muted style={styles.label}>{label}</Label></View>
  </View>;
});

const styles = StyleSheet.create({
  group: {flex:1,flexDirection:'row',alignItems:'center',gap:7},
  ring: { width: size, height: size, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderRadius: size / 2, overflow: 'hidden' },
  track: { position: 'absolute', width: size, height: size, borderWidth: thickness, borderRadius: size / 2, borderColor: colors.border },
  center: { position: 'absolute', width: size - thickness * 2, height: size - thickness * 2, borderRadius: size / 2 - thickness, backgroundColor: colors.card },
  value: { fontSize: 18, lineHeight: 24, fontWeight: '700' }, label: { fontSize: 11, lineHeight: 16 },
});

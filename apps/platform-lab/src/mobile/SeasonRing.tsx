import React, { memo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { Label, colors } from './theme';
import type { RingSlice, SeasonDifference } from './season-model';

const thickness = 5;

function pointAt(cx: number, cy: number, radius: number, angle: number) {
  const radians = angle * Math.PI / 180;
  return { x: cx + radius * Math.cos(radians), y: cy + radius * Math.sin(radians) };
}

function arcPath(cx: number, cy: number, radius: number, start: number, sweep: number) {
  const from = pointAt(cx, cy, radius, start);
  const to = pointAt(cx, cy, radius, start + sweep);
  return `M ${from.x} ${from.y} A ${radius} ${radius} 0 ${sweep > 180 ? 1 : 0} 1 ${to.x} ${to.y}`;
}

function arcGap(sweep: number, count: number) {
  return count > 1 ? Math.min(10, sweep / 3) : 0;
}

/** A distribution, never a progress/qualification score. Missing classifications remain neutral. */
export function MetricOrbit({ size = 136, total, parts, children }: {
  size?: number; total: number | null; parts: readonly { value: number; color: string }[]; children: React.ReactNode;
}) {
  let angle = -90;
  let remaining = 360;
  const slices = total !== null && total > 0
    ? parts.flatMap((part) => {
      const fraction = Number.isFinite(part.value) ? Math.max(0, part.value) / total : 0;
      const sweep = Math.min(remaining, fraction * 360);
      remaining -= sweep;
      if (sweep <= 0) return [];
      const slice = { start: angle, sweep, color: part.color };
      angle += sweep;
      return [slice];
    })
    : [];
  return <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: size, height: size }}>
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} accessible={false}>
      <Circle cx={size / 2} cy={size / 2} r={size / 2 - 9} fill="none" stroke={colors.raised} strokeWidth={8} />
      {slices.map((slice, index) => {
        const gap = arcGap(slice.sweep, slices.length), radius = size / 2 - 9;
        if (slice.sweep >= 359.999) return <Circle key={index} cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={slice.color} strokeWidth={8} />;
        const sweep = slice.sweep - gap;
        return sweep > 0 ? <Path key={index} d={arcPath(size / 2, size / 2, radius, slice.start + gap / 2, sweep)} fill="none"
          stroke={slice.color} strokeWidth={8} strokeLinecap="round" /> : null;
      })}
    </Svg>
    <View style={{ position: 'absolute', inset: 20, alignItems: 'center', justifyContent: 'center' }}>{children}</View>
  </View>;
}

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
    <Label muted style={[styles.label, { minHeight: 36 * scale }]}>{label}</Label>
    <View style={styles.body}>
      <View style={[styles.ring, { width: size, height: size }]}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} accessible={false}>
          {layers.map((layer, layerIndex) => {
            const diameter = size - layerIndex * 18 * scale;
            const radius = (diameter - thickness) / 2;
            return <G key={layer.year} opacity={layerIndex > 0 ? .5 : 1}>
              <Circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={colors.border} strokeWidth={thickness} />
              {layer.slices.map((slice, sliceIndex) => {
                const gap = arcGap(slice.sweep, layer.slices.length);
                const sweep = slice.sweep - gap;
                if (!(sweep > 0) || !Number.isFinite(sweep)) return null;
                if (slice.sweep >= 359.999 && layer.slices.length === 1) {
                  return <Circle key={sliceIndex} cx={size / 2} cy={size / 2} r={radius} fill="none"
                    stroke={slice.color} strokeWidth={thickness} />;
                }
                return <Path key={sliceIndex} d={arcPath(size / 2, size / 2, radius, slice.start + gap / 2, sweep)}
                  fill="none" stroke={slice.color} strokeWidth={thickness} strokeLinecap="round" />;
              })}
            </G>;
          })}
        </Svg>
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
  center: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  currentValue: { fontSize: 14, lineHeight: 19, fontWeight: '700', textAlign: 'center' },
  values: { flex: 1, gap: 2 },
  value: { fontSize: 14, lineHeight: 19, fontWeight: '600' },
  difference: { fontSize: 12, lineHeight: 17, fontWeight: '600' },
  year: { fontSize: 10, lineHeight: 14 },
  label: { fontSize: 12, lineHeight: 18, fontWeight: '600' },
});

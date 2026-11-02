import React, { memo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Label, colors } from './theme';
import type { RingSlice, SeasonDifference } from './season-model';

const thickness = 5;

/** Bounded native arc for the compact metric dial; decoration has no hit targets. */
function DialArc({size,start,sweep,color}:{size:number;start:number;sweep:number;color:string}) {
  const radius=size/2-9, pieces=Math.ceil(sweep/6), step=pieces?sweep/pieces:0;
  return <>{Array.from({length:pieces},(_,i)=>{
    const angle=start+step*(i+.5), radians=angle*Math.PI/180;
    const length=2*radius*Math.sin(step*Math.PI/360)+.8;
    return <View key={i} style={{position:'absolute',left:size/2+radius*Math.cos(radians)-length/2,top:size/2+radius*Math.sin(radians)-4,width:length,height:8,borderRadius:2,backgroundColor:color,transform:[{rotate:`${angle+90}deg`}]}}/>;
  })}</>;
}

/** A distribution, never a progress/qualification score. Missing classifications remain neutral. */
export function MetricOrbit({size=136,total,parts,children}:{size?:number;total:number|null;parts:readonly {value:number;color:string}[];children:React.ReactNode}) {
  let angle=-90;
  return <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{width:size,height:size}}>
    <View style={{position:'absolute',inset:5,borderRadius:size/2,borderWidth:8,borderColor:colors.raised}}/>
    {total!==null&&total>0&&parts.map((part,i)=>{
      const sweep=Math.min(360-Math.max(0,angle+90),Math.max(0,part.value)/total*360),start=angle;angle+=sweep;
      return sweep>0?<DialArc key={i} size={size} start={start+1} sweep={Math.max(0,sweep-2)} color={part.color}/>:null;
    })}
    <View style={{position:'absolute',inset:20,alignItems:'center',justifyContent:'center'}}>{children}</View>
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
    <Label muted style={[styles.label,{minHeight:36*scale}]}>{label}</Label>
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

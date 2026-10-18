import React from 'react';
import { Image, StyleSheet, View } from 'react-native';

type IconProps = { color?: string };

// Selected authored side-view B; the adjacent SVG is the editable source.
// Its 4x local alpha bitmap avoids adding a vector runtime dependency.
export function PlaneIcon({ color = '#adbed5' }: IconProps) {
  return <Image accessible={false} source={require('../../assets/icons/aircraft-side.png')} style={{ width: 28, height: 28, tintColor: color }} />;
}

export function ProfileIcon({ color = '#f5f7ff' }: IconProps) {
  return <View accessible={false} style={styles.canvas}>
    <View style={[styles.head, { borderColor: color }]} />
    <View style={[styles.shoulders, { borderColor: color }]} />
  </View>;
}

export function MedicalIcon({ color = '#adbed5' }: IconProps) {
  return <View accessible={false} style={styles.medicalCanvas}>
    <View style={[styles.stethoscope, { borderColor: color }]} />
    <View style={[styles.medicalTube, { borderColor: color }]} />
    <View style={[styles.medicalChest, { borderColor: color }]} />
    {[1, 9].map(left => <View key={left} style={{ position: 'absolute', left, top: 0, width: 3, height: 2, borderRadius: 1, backgroundColor: color }} />)}
  </View>;
}

export function BookIcon({ color = '#adbed5' }: IconProps) {
  return <View accessible={false} style={styles.canvas}>
    <View style={[styles.page, styles.leftPage, { borderColor: color }]} />
    <View style={[styles.page, styles.rightPage, { borderColor: color }]} />
    {[10, 14, 18].map(top => <React.Fragment key={top}>
      <View style={[styles.rule, { top, left: 6, backgroundColor: color }]} />
      <View style={[styles.rule, { top, right: 6, backgroundColor: color }]} />
    </React.Fragment>)}
  </View>;
}

const styles = StyleSheet.create({
  canvas: { width: 28, height: 28 },
  medicalCanvas: { width: 18, height: 18 },
  stethoscope: { position: 'absolute', left: 2, top: 1, width: 10, height: 9, borderLeftWidth: 1.5, borderRightWidth: 1.5, borderBottomWidth: 1.5, borderBottomLeftRadius: 5, borderBottomRightRadius: 5 },
  medicalTube: { position: 'absolute', left: 6, top: 9, width: 9, height: 8, borderLeftWidth: 1.5, borderRightWidth: 1.5, borderBottomWidth: 1.5, borderBottomLeftRadius: 4, borderBottomRightRadius: 4 },
  medicalChest: { position: 'absolute', left: 12, top: 6, width: 5, height: 5, borderWidth: 1.5, borderRadius: 3 },
  head: { position: 'absolute', width: 9, height: 9, left: 9.5, top: 2, borderWidth: 1.8, borderRadius: 5 },
  shoulders: { position: 'absolute', width: 22, height: 12, left: 3, top: 14, borderWidth: 1.8, borderTopLeftRadius: 11, borderTopRightRadius: 11, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 },
  page: { position: 'absolute', top: 5, width: 12, height: 20, borderWidth: 1.6, borderRadius: 2 },
  leftPage: { left: 2, transform: [{ skewY: '8deg' }] },
  rightPage: { right: 2, transform: [{ skewY: '-8deg' }] },
  rule: { position: 'absolute', width: 5, height: 1.2, borderRadius: 1 },
});

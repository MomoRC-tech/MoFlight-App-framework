import React from 'react';
import { Image, StyleSheet, View, useWindowDimensions } from 'react-native';

const scene = require('../../assets/aviation/ask21-flight-header-v2.png');
const detail = require('../../assets/aviation/flight-scene-detail.png');

/** Decorative flight illustration, never a measured track or weather view. */
export function FlightScene({ compact = false }: { compact?: boolean }) {
  const { width, fontScale } = useWindowDimensions();
  const wide = width >= 600 && fontScale <= 1.3;
  return <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={compact ? styles.compact : styles.full}>
    {compact ? <Image source={detail} resizeMode="contain" style={styles.image} accessible={false}/> :
      <View style={[styles.headerImage, wide && styles.wideImage, fontScale > 1.3 && styles.largeTextImage]}>
        <Image source={scene} resizeMode="contain" style={styles.image} accessible={false}/>
        <View style={[StyleSheet.absoluteFill, styles.fadeLeft]}/>
        <View style={[StyleSheet.absoluteFill, styles.fadeBottom]}/>
      </View>}
  </View>;
}
const styles = StyleSheet.create({
  full: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, overflow: 'hidden' },
  // Art stays within the existing header. Contain preserves the complete wings
  // and T-tail even in the shallow one-row tablet header.
  headerImage: { position: 'absolute', right: 0, top: 0, width: 330, height: 110 },
  wideImage: { right: 280, width: 192, height: 64 },
  largeTextImage: { opacity: .42 },
  fadeLeft: { experimental_backgroundImage: 'linear-gradient(90deg, #0b141c 0%, #0b141c00 45%)' },
  fadeBottom: { experimental_backgroundImage: 'linear-gradient(0deg, #0b141c 0%, #0b141c00 35%)' },
  compact: { width: 88, height: 44 },
  image: { width: '100%', height: '100%' },
});

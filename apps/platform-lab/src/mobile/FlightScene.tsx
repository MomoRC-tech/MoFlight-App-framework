import React from 'react';
import { Image, StyleSheet, View, useWindowDimensions } from 'react-native';

const scene = require('../../assets/aviation/ask21-flight-header-v2.png');

/** Decorative flight illustration, never a measured track or weather view. */
export function FlightScene({ compact = false }: { compact?: boolean }) {
  const { width, fontScale } = useWindowDimensions();
  const wide = width >= 600 && fontScale <= 1.3;
  return <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={compact ? styles.compact : styles.full}>
    {compact ? <>
      <Image source={scene} resizeMode="cover" style={styles.image} accessible={false}/>
      <View style={[StyleSheet.absoluteFill, styles.seasonTint]}/>
      <View style={[StyleSheet.absoluteFill, styles.seasonShade]}/>
    </> :
      <View style={[styles.headerImage, wide && styles.wideImage, fontScale > 1.3 && styles.largeTextImage]}>
        <Image source={scene} resizeMode="contain" style={styles.image} accessible={false}/>
        <View style={[StyleSheet.absoluteFill, styles.fadeLeft]}/>
        <View style={[StyleSheet.absoluteFill, styles.fadeBottom]}/>
        {wide && <View style={[StyleSheet.absoluteFill, styles.fadeRight]}/>}
      </View>}
  </View>;
}
const styles = StyleSheet.create({
  full: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, overflow: 'hidden' },
  // Art stays within the existing header. Contain preserves the complete wings
  // and T-tail even in the shallow one-row tablet header.
  headerImage: { position: 'absolute', right: 0, top: 0, width: 330, height: 110 },
  wideImage: { right: 0, width: 420, height: 140 },
  largeTextImage: { opacity: .42 },
  fadeLeft: { experimental_backgroundImage: 'linear-gradient(90deg, #0b141c 0%, #0b141c00 45%)' },
  fadeBottom: { experimental_backgroundImage: 'linear-gradient(0deg, #0b141c 0%, #0b141c00 35%)' },
  fadeRight: { experimental_backgroundImage: 'linear-gradient(270deg, #0b141c 0%, #0b141c00 18%)' },
  compact: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, overflow: 'hidden' },
  seasonTint: { backgroundColor: '#ba7a352f' },
  seasonShade: { experimental_backgroundImage: 'linear-gradient(90deg, #342c26bb 0%, #342c2622 65%, #342c2600 100%)' },
  image: { width: '100%', height: '100%' },
});

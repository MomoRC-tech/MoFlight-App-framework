import React from 'react';
import { Image, StyleSheet, View } from 'react-native';

const scene = require('../../assets/aviation/flight-scene.png');
const detail = require('../../assets/aviation/flight-scene-detail.png');

/** Decorative flight illustration, never a measured track or weather view. */
export function FlightScene({ compact = false }: { compact?: boolean }) {
  return <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={compact ? styles.compact : styles.full}>
    <Image source={compact ? detail : scene} resizeMode={compact ? 'contain' : 'cover'} style={styles.image} accessible={false}/>
  </View>;
}
const styles = StyleSheet.create({
  full: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, overflow: 'hidden', opacity: .85 },
  compact: { width: 88, height: 44 },
  image: { width: '100%', height: '100%' },
});

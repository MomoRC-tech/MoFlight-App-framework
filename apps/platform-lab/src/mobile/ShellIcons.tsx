import React from 'react';
import { SymbolIcon, legacyIconTone } from './SymbolIcon';

type IconProps = { color?: string };

// Manuel selected the supplied folded paper-plane and Medical card M2.
export function PlaneIcon({ color }: IconProps) {
  return <SymbolIcon name="flight-paper-plane" size={28} tone={legacyIconTone(color)} />;
}
export function ProfileIcon({ color }: IconProps) {
  return <SymbolIcon name="profile" size={28} tone={legacyIconTone(color)} />;
}
export function MedicalIcon() {
  return <SymbolIcon name="medical-card" size={20} />;
}
export function BookIcon({ color }: IconProps) {
  return <SymbolIcon name="book" size={28} tone={legacyIconTone(color)} />;
}

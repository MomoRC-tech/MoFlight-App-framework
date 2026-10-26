import React from 'react';
import { useKeepAwake } from 'expo-keep-awake';
import { useForeground } from './SyncProgress';

function KeepAwakeLock() {
  useKeepAwake('moflight-sync');
  return null;
}

/** Keep the display awake only for visible, foreground Sync work. */
export function SyncKeepAwake({ active }: { active: boolean }) {
  const foreground = useForeground();
  return active && foreground ? <KeepAwakeLock /> : null;
}

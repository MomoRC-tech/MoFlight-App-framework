import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { colors } from '../mobile/theme';
import { runNativeFlightReviewProof } from './native-flight-review-proof';

/** Build-entry override only. Run exclusively on the designated Synthetic AVD. */
export default function AndroidFlightReviewPoc() {
  const [status, setStatus] = useState('FLIGHT_REVIEW_RUNNING');
  useEffect(() => {
    let active = true;
    void runNativeFlightReviewProof().then(result => {
      const sourceCommit = process.env.EXPO_PUBLIC_MOFLIGHT_SOURCE ?? 'unknown';
      console.info(`MOFLIGHT_FLIGHT_REVIEW_RESULT ${JSON.stringify({ ...result, sourceCommit })}`);
      if (active) setStatus(result.phase === 'seeded' ? 'FLIGHT_REVIEW_SEEDED' : 'FLIGHT_REVIEW_PASSED');
    }).catch(() => {
      console.error('MOFLIGHT_FLIGHT_REVIEW_FAILED');
      if (active) setStatus('FLIGHT_REVIEW_FAILED');
    });
    return () => { active = false; };
  }, []);
  return <View style={{ flex: 1, gap: 12, padding: 16, backgroundColor: colors.background }}>
    <Text style={{ color: colors.text }}>Flight review native persistence proof</Text>
    <Text style={{ color: colors.text }}>Synthetic AVD only. No normal-account or provider acceptance.</Text>
    <Text style={{ color: colors.text }}>{status}</Text>
  </View>;
}

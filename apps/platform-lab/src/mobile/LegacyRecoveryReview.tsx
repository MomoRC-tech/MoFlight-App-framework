import React, { useState } from 'react';
import { Action, Label } from './theme';
import { legacyReviewAvailable, reviewLegacyRecovery } from '../vereinsflieger/session-store';
import type { LegacyReview } from '../vereinsflieger/legacy-review';

/** Explicit lab review only. No adopt/restore/delete action exists here. */
export function LegacyRecoveryReview({ locked }: { locked: boolean }) {
  const [review, setReview] = useState<LegacyReview | null>(null);
  const [reading, setReading] = useState(false), [failed, setFailed] = useState(false);
  if (!legacyReviewAvailable) return <Label muted>Metadatenprüfung auf diesem Build/Gerät nicht verfügbar.</Label>;
  async function read() {
    if (locked || reading) return;
    setReading(true); setFailed(false); setReview(null);
    try { setReview(await reviewLegacyRecovery()); } catch { setFailed(true); }
    finally { setReading(false); }
  }
  return <>
    <Action secondary disabled={locked || reading} onPress={() => { void read(); }}>Alte Wiederherstellung prüfen</Action>
    {reading && <Label>Gespeicherte Metadaten werden schreibgeschützt gelesen…</Label>}
    {failed && <Label>Metadatenprüfung nicht verfügbar. Zuordnung bleibt ungeklärt.</Label>}
    {review?.status === 'absent' && <Label>Kein alter Wiederherstellungseintrag gefunden. Dies bestätigt keine Zuordnung oder Wiederherstellung.</Label>}
    {review?.status === 'present' && <>
      <Label>Gespeicherte Kontobezeichnung: {review.accountLabel}</Label>
      <Label>Gespeicherte Ansicht: {review.preset}</Label>
      <Label>Gespeicherter Zeitraum: {review.period}</Label>
      <Label>Gespeicherte Rolle: {review.role}</Label>
      <Label>Wiederherstellungsart: {review.reset ? 'Standardansicht' : 'Reservierte Sicherungsansicht'}</Label>
      <Label>Journal-Prüfsumme: {review.journalFingerprint}</Label>
      <Label muted>Alte Metadaten zur persönlichen Prüfung. Kontobezeichnungen beweisen keine Eigentümerschaft. Keine Übernahme oder Wiederherstellung erfolgt.</Label>
    </>}
  </>;
}

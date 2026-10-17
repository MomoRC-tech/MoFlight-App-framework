import React, { useState } from 'react';
import { View } from 'react-native';
import type { ProbeSnapshot } from '../vereinsflieger/probe';
import { Action, Label } from './theme';

/** Explicit lab-only presentation of the current scoped snapshot; no storage or bridge access. */
export function RawCaptureReview({ snapshot }: { snapshot: ProbeSnapshot | null }) {
  const [selected, setSelected] = useState<{ snapshot: ProbeSnapshot; row: number; page: number } | null>(null);
  const active = snapshot && selected?.snapshot === snapshot ? selected : null;
  const columns = 8, fieldLimit = 160;
  if (!snapshot) return null;
  if (!active) return <Action secondary onPress={() => setSelected({ snapshot, row: 0, page: 0 })}>Gespeicherten Rohbeleg prüfen</Action>;
  const row = snapshot.rows[active.row];
  const offset = active.page * columns;
  const fields = snapshot.headers.slice(offset, offset + columns).map((header, i) => {
    const value = row?.values[offset + i] ?? '';
    return { column: offset + i, header, value: value.slice(0, fieldLimit), truncated: value.length > fieldLimit };
  });
  return <View style={{ gap: 8 }}>
    <Label muted>Private Entwicklungsprüfung · gespeicherter Rohbeleg, kein Flugbuchimport. Werte bleiben unverändert; lange Felder sind ausdrücklich gekürzt.</Label>
    <Label selectable>Prüfbeleg: {JSON.stringify({ captureId: snapshot.captureId, retrievedAt: snapshot.retrievedAt, rows: snapshot.rows.length, columns: snapshot.headers.length, coverage: snapshot.coverage, from: snapshot.exportContext?.from, to: snapshot.exportContext?.to })}</Label>
    <Label selectable>Prüfwerte: {JSON.stringify({ row: active.row, sourceFlightId: row?.sourceFlightId ?? null, page: active.page, fields })}</Label>
    <Action secondary disabled={active.page === 0} onPress={() => setSelected({ ...active, page: active.page - 1 })}>Vorherige Prüffelder</Action>
    <Action secondary disabled={offset + columns >= snapshot.headers.length} onPress={() => setSelected({ ...active, page: active.page + 1 })}>Weitere Prüffelder</Action>
    <Action secondary disabled={active.row === 0} onPress={() => setSelected({ ...active, row: active.row - 1, page: 0 })}>Vorherige Prüfzeile</Action>
    <Action secondary disabled={active.row + 1 >= snapshot.rows.length} onPress={() => setSelected({ ...active, row: active.row + 1, page: 0 })}>Nächste Prüfzeile</Action>
    <Action secondary onPress={() => setSelected(null)}>Rohbelegprüfung schließen</Action>
  </View>;
}

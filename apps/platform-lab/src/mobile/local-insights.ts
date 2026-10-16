import type { Flight } from '../../../../packages/flight-logbook/src/index';
import { formatDuration, selectFlights, summarizeFlights } from './flight-model';

export const localQuestions = [
  'Wie viele Flugstunden habe ich dieses Jahr?',
  'Was waren meine längsten Flüge?',
  'Mit welchem Flugzeug bin ich am häufigsten geflogen?',
  'Welche Schulungsflüge sind gespeichert?',
];

const dateText = (date: string | null) => date
  ? new Date(date + 'T12:00:00Z').toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
  : 'Datum unbekannt';

/** Bounded deterministic answers over the supplied selected-book snapshot; no AI or network. */
export function localInsight(flights: readonly Flight[], index: number, year: number): string {
  const all = selectFlights(flights, { year: null, search: '', category: 'all' });
  if (!all.length) return 'Im ausgewählten Flugbuch sind noch keine Flüge gespeichert.';
  if (index === 0) {
    const season = summarizeFlights(selectFlights(all, { year, search: '', category: 'all' }));
    return `${year}: ${season.count} gespeicherte Flüge, ${formatDuration(season.knownMinutes)} bekannte Stunden. ${season.unknownDurationCount} Flugzeiten unbekannt. Die Abdeckung des Jahres ist nicht belegt.`;
  }
  if (index === 1) {
    const known = all.filter(f => f.minutes !== null).sort((a, b) => b.minutes! - a.minutes!).slice(0, 3);
    return known.length
      ? known.map(f => `${dateText(f.date)} · ${f.registration ?? 'Flugzeug unbekannt'} · ${formatDuration(f.minutes)} h`).join('\n')
        + `\n${all.filter(f => f.minutes === null).length} unbekannte Flugzeiten nicht eingeordnet.`
      : 'Keine bekannten Flugzeiten gespeichert.';
  }
  if (index === 2) {
    const counts = new Map<string, number>();
    for (const flight of all) if (flight.registration !== null) counts.set(flight.registration, (counts.get(flight.registration) ?? 0) + 1);
    const max = Math.max(0, ...counts.values());
    return counts.size
      ? [...counts].filter(([, count]) => count === max).map(([registration, count]) => `${registration}: ${count} Flüge`).join('\n')
        + `\n${all.filter(f => f.registration === null).length} unbekannte Kennzeichen nicht zugeordnet.`
      : 'Keine bekannten Kennzeichen gespeichert.';
  }
  if (index === 3) {
    const count = selectFlights(all, { year: null, search: '', category: 'training' }).length;
    return `${count} gespeicherte Flüge mit dokumentierter Rolle Dual oder FI. Unbekannte Rollen werden nicht als Schulung gewertet.`;
  }
  return 'Diese lokale Auswertung ist nicht verfügbar.';
}

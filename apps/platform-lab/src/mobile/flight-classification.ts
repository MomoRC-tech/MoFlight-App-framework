import type { SourceFlightAssessment } from '../vereinsflieger/source-assessment';

/** Display/query projection only. Never change persisted vf-history-facts-v1. */
export const FLIGHT_CLASSIFICATION_VERSION = 1;
export const aircraftCategoryLabels = {
  glider: 'Segelflugzeug', motorGlider: 'Motorsegler', tmg: 'TMG',
  powered: 'Motorflugzeug', ultralight: 'Ultraleicht', helicopter: 'Hubschrauber',
  unknown: 'Kategorie unbekannt',
} as const;
export const launchMethodLabels = {
  winch: 'Winde', aerotow: 'F-Schlepp', self: 'Selbststart',
  autoTow: 'Fahrzeugschlepp', bungee: 'Gummiseil', unknown: 'Startart unbekannt',
} as const;
export type AircraftCategory = keyof typeof aircraftCategoryLabels;
export type LaunchMethod = keyof typeof launchMethodLabels;
export interface Classification<K extends string> {
  key: K | 'unknown';
  state: 'explicit' | 'not-captured' | 'blank' | 'unrecognized' | 'conflict';
  evidence: { label: string; raw: string }[];
}
const normalize = (text: string) => text.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('de-DE');
const categoryNames: Record<string, Exclude<AircraftCategory, 'unknown'>> = {
  segelflugzeug: 'glider', motorsegler: 'motorGlider',
  tmg: 'tmg', reisemotorsegler: 'tmg', 'touring motor glider': 'tmg',
  motorflugzeug: 'powered', ultraleicht: 'ultralight', ultraleichtflugzeug: 'ultralight', hubschrauber: 'helicopter',
};
// REST specification 12 May 2026, pp. 8–11: E/W/F. Numeric API read
// enums belong to a different source contract and are not browser cell aliases.
const launchNames: Record<string, Exclude<LaunchMethod, 'unknown'>> = {
  winde: 'winch', windenstart: 'winch', 'f-schlepp': 'aerotow', flugzeugschlepp: 'aerotow',
  eigenstart: 'self', selbststart: 'self', autoschlepp: 'autoTow', fahrzeug: 'autoTow', fahrzeugschlepp: 'autoTow',
  gummiseil: 'bungee', w: 'winch', f: 'aerotow', e: 'self',
};

function classify<K extends string>(assessment: SourceFlightAssessment, labels: readonly string[], names: Record<string, K>): Classification<K> {
  const { headers, row } = assessment.observation;
  const evidence = headers.flatMap((label, index) => labels.includes(label) ? [{ label, raw: row.values[index] ?? '' }] : []);
  if (!evidence.length) return { key: 'unknown', state: 'not-captured', evidence };
  const values = evidence.map(item => normalize(item.raw));
  if (values.every(value => !value)) return { key: 'unknown', state: 'blank', evidence };
  const keys = values.map(value => Object.hasOwn(names, value) ? names[value]! : null);
  // Duplicate aliases must agree. Blank versus value is unresolved too.
  if (keys.every(key => key !== null && key === keys[0])) return { key: keys[0]!, state: 'explicit', evidence };
  if (new Set(values).size > 1) return { key: 'unknown', state: 'conflict', evidence };
  return { key: 'unknown', state: 'unrecognized', evidence };
}

export function classifyAircraft(assessment: SourceFlightAssessment): Classification<Exclude<AircraftCategory, 'unknown'>> {
  return classify(assessment, ['Luftfahrzeugart'], categoryNames);
}
export function classifyLaunch(assessment: SourceFlightAssessment): Classification<Exclude<LaunchMethod, 'unknown'>> {
  return classify(assessment, ['S.-Art', 'S-Art', 'Startart'], launchNames);
}

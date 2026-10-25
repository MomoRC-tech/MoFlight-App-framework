/** Bundled German help. No account data, network call or generated answer is used here. */
export const HELP_CONTENT_VERSION = 1;

export const HELP_CATEGORIES = [
  'Erste Schritte', 'Flüge & Daten', 'Flugbuch', 'Begriffe', 'Sicherung & Datenschutz',
] as const;
export type HelpCategory = typeof HELP_CATEGORIES[number];
export type HelpEntryId = 'pic' | 'empty-flights' | 'partial-update' | 'backup' | 'flight-details' | 'paper-book';

export interface HelpEntry {
  id: HelpEntryId;
  category: HelpCategory;
  title: string;
  keywords: readonly string[];
  short: string;
  answer: string;
  boundary?: string;
  source: string;
  sourceUrl?: string;
  updatedAt: string;
}

export const HELP_ENTRIES: readonly HelpEntry[] = [
  {
    id: 'pic', category: 'Begriffe', title: 'Was bedeutet PIC?',
    keywords: ['pilot-in-command', 'verantwortlicher pilot', 'rolle', 'crew'],
    short: 'PIC bezeichnet die für den Flug verantwortliche Pilotin oder den verantwortlichen Piloten.',
    answer: 'PIC steht für Pilot-in-command: die Person, die als verantwortlich für die sichere Durchführung des Fluges bestimmt ist.',
    boundary: 'MoFlight zeigt in den Flugdetails zunächst die gespeicherte Quellenangabe. Daraus folgt keine automatische Anrechnung im Flugbuch.',
    source: 'EASA, Easy Access Rules for Sailplanes · Definition „pilot-in-command“',
    sourceUrl: 'https://www.easa.europa.eu/sites/default/files/dfu/Sailplane%20Rule%20Book.pdf',
    updatedAt: '2026-10-25',
  },
  {
    id: 'empty-flights', category: 'Flüge & Daten', title: 'Warum sehe ich keine Flüge?',
    keywords: ['leer', 'offline', 'synchronisieren', 'sync', 'abruf', 'konto'],
    short: 'Prüfe den lokalen Datenstand und den zuletzt erfassten Zeitraum.',
    answer: 'Die Flüge-Ansicht zeigt nur Flüge, die für das ausgewählte Konto auf diesem Gerät gespeichert und lesbar sind. Ohne bestätigten Abruf oder bei einem leeren erfassten Zeitraum kann die Liste leer sein. Gespeicherte Flüge bleiben offline lesbar.',
    boundary: 'Eine leere Liste beweist nicht, dass bei Vereinsflieger keine weiteren Flüge existieren. Datenstatus zeigt den bekannten Abruf; neue Daten startest du ausdrücklich über Sync in der Kopfzeile.',
    source: 'MoFlight · lokale Flüge und Datenstatus', updatedAt: '2026-10-25',
  },
  {
    id: 'partial-update', category: 'Flüge & Daten', title: 'Was bedeutet „teilweise aktualisiert“?',
    keywords: ['teilweise', 'fehler', 'retry', 'erneut', 'medical', 'sync'],
    short: 'Ein Teil der angeforderten Daten wurde verarbeitet; andere Quellen brauchen Aufmerksamkeit.',
    answer: 'Flüge und zusätzliche Quellen werden in getrennten Schritten verarbeitet. „Teilweise aktualisiert“ bedeutet, dass mindestens ein Schritt abgeschlossen wurde und mindestens ein anderer fehlgeschlagen oder ausgelassen ist. Die Ergebnisdetails nennen die betroffenen Schritte.',
    boundary: 'Eine erfolgreiche Flug-Speicherung wird durch einen späteren Fehler einer anderen Quelle nicht rückgängig gemacht. Der genaue Datenstand steht in den Ergebnisdetails.',
    source: 'MoFlight · Synchronisierung und Ergebnisdetails', updatedAt: '2026-10-25',
  },
  {
    id: 'backup', category: 'Sicherung & Datenschutz', title: 'Was wird gesichert?',
    keywords: ['backup', 'wiederherstellen', 'datei', 'anhang', 'foto', 'text'],
    short: 'Die manuelle Datei enthält unterstützte Textdaten, aber keine Foto- oder Anhangdateien.',
    answer: 'Die manuelle Sicherung umfasst unterstützte eigene Flüge und Belege, die lokale Flugbuchbibliothek sowie weitere ausdrücklich genannte lokale Textdaten. Ihr aktueller Umfang und die Ausschlüsse stehen vor dem Export in „Daten sichern & wiederherstellen“. Die Datei ist unverschlüsselt.',
    boundary: 'Foto- und Anhangdateien werden nicht mitgesichert; Textverweise auf solche Dateien können enthalten sein. Bewahre die exportierte Datei geschützt auf und prüfe sie vor einer Wiederherstellung.',
    source: 'MoFlight · Daten sichern & wiederherstellen', updatedAt: '2026-10-25',
  },
  {
    id: 'flight-details', category: 'Erste Schritte', title: 'Wo finde ich meine Flugdetails?',
    keywords: ['flugdetails', 'quelle', 'rollen', 'flug öffnen', 'filter'],
    short: 'Öffne einen gespeicherten Flug in der Flüge-Liste.',
    answer: 'Unter „Flüge“ öffnet ein Flug-Eintrag die gespeicherten Details mit Quellenangaben, Rollen und ursprünglichen Anbieterfeldern. Die Zurück-Aktion führt zur gefilterten Liste und ihrer bisherigen Position.',
    boundary: 'Details zeigen gespeicherte Quellenwerte; unbekannte oder widersprüchliche Angaben bleiben ungeklärt.',
    source: 'MoFlight · Flüge und Flugdetails', updatedAt: '2026-10-25',
  },
  {
    id: 'paper-book', category: 'Flugbuch', title: 'Was kann ich im Flugbuch schon tun?',
    keywords: ['papierflugbuch', 'schreiben', 'einrichten', 'zuordnen'],
    short: 'Eigene Flüge sind schon lesbar; das Einrichten des Papierflugbuchs ist in Vorbereitung.',
    answer: 'Du kannst deine gespeicherten eigenen Flüge bereits unter „Flüge“ ansehen und auswerten, ohne zuerst ein Flugbuch einzurichten. Die Zuordnung zum Papierflugbuch und das Schreiben werden noch vorbereitet.',
    boundary: 'Das Anzeigen eines Fluges ist keine bestätigte Eintragung in ein Papierflugbuch.',
    source: 'MoFlight · Flugbuch', updatedAt: '2026-10-25',
  },
];

export function helpEntry(id: string | null | undefined): HelpEntry | null {
  return HELP_ENTRIES.find(entry => entry.id === id) ?? null;
}

const normalized = (value: string) => value.toLocaleLowerCase('de-DE').normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function searchHelpEntries(query: string, category: HelpCategory | null = null): HelpEntry[] {
  const terms = normalized(query).split(/\s+/).filter(Boolean);
  return HELP_ENTRIES.filter(entry => {
    if (category && entry.category !== category) return false;
    const haystack = normalized([entry.title, entry.short, entry.answer, ...entry.keywords].join(' '));
    return terms.every(term => haystack.includes(term));
  });
}

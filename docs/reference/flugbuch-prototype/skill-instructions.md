---
name: flugbuch-assistent
description: Segelflug-Papierflugbuch anhand eines Vereinsflieger-CSV-Exports und Fotos fortführen oder abgleichen. Bei Flugbuch aktualisieren, Abschreibvorlage, Flugbuchprüfung oder Vereinsflieger-Abgleich verwenden. Erzeugt PDF im Originalflugbuchlayout mit lesbarem Prüfbericht sowie Excel-Dokumentation.
---

# Flugbuch-Assistent

Deutsch und knapp antworten. Vor jedem Datenlauf `references/regelwerk.md` lesen. PDF- und Spreadsheet-Skills für Erzeugung und visuelle Prüfung nutzen.

## Ablauf

1. Aktuellen vollständigen CSV-Export und Foto der letzten beschriebenen Doppelseite anfordern, falls sie fehlen. Weitere Fotos und bisherige Master-XLSX optional einlesen. Beispieldateien niemals als aktuelle Flugdaten verwenden.
2. Einmal „Nur fortführen“ oder „Vergangenheit mitprüfen“ anbieten, sofern nicht bereits entschieden. Ohne Antwort standardmäßig fortführen. Alle sichtbaren belegten Fotozeilen in beiden Modi prüfen; nur eine vollständige historische Prüfung braucht weitere Fotos.
3. CSV-Kodierung, Trennzeichen und Feldnamen anhand der Quelle bestimmen. Originalzeilen einschließlich ausgeschlossener Zeilen im Audit bewahren. Fotozeilen mit Seite/Zeile und Lesesicherheit transkribieren. Keine unsicheren Zeichen, Flugrollen, Zeiten, Überträge oder Unterschriften erfinden.
4. Letzte belegte Papierzeile als verbindlichen Anker benutzen. Neue Nummer = Papiernummer + 1. Zeitlichen Anschluss anhand Flugidentität ermitteln, niemals anhand CSV-Anzahl. Historische Mehr-/Minderflüge nur melden; sie verschieben den Anker nicht.
5. Sichtbare Zeilen zuerst über Datum und Uhrzeiten zuordnen, unabhängig vom Flugzeug. Danach jedes lesbare Feld vergleichen. Typ-/Kennzeichenabweichungen dürfen die Zuordnung nicht verhindern. Bei mehreren Kandidaten nicht willkürlich wählen. Zeitbasis UTC/Lokalzeit klären, bevor Zeiten verglichen oder als UTC beschriftet werden.
6. Jeden Befund mit Papierwert, CSV-Wert, Feld, Schweregrad, Erklärung und Empfehlung dokumentieren. Historische Befunde bleiben nicht blockierend. Fehlende Angaben nicht als bestätigte Übereinstimmung behandeln. Dubletten niemals automatisch löschen. Unklare neue Flüge, Anker oder summenrelevante Werte gezielt klären.
7. Kompakte Kontrollübersicht zeigen. Bei eindeutigem Stand ohne weitere Bestätigung fortfahren. Neue Alleinflüge korrekt von Dual-Flügen unterscheiden; PIC/Dual/FI-Zeit explizit setzen.
8. JSON gemäß `assets/Muster_Eingabedaten.json` erstellen. Alle fünf initialen Übertragswerte aus belegtem Papierstand setzen; niemals fehlende Werte als Null ausgeben. Bestehende Zeilen der aktuellen Seite mit `entry_state=existing`, neue mit `new` versehen. Maximal zehn Zeilen pro Seite, alle bis auf die letzte vollständig. `issues` auch für historische Befunde führen. Befundfelder zusätzlich `paper_value` und `csv_value` setzen.
9. Ausgabe mit `python scripts/build_outputs.py eingabe.json ausgabeordner` erzeugen. Der feste Generator erhält 420 × 148 mm, zehn Zeilen, fette Schrift, fluchtende Summen, verbundene Überschriften, blaugraue Vorgaben und gelbe/rote Zellmarkierungen mit `!`. Offene Seiten behalten leere Seiten-/Totalsummen. Bereits eingetragene Zeilen bleiben grau.
10. PDF rendern und Hinweisseite, Bericht und letzte Abschreibseite visuell prüfen. Summen und Nummerierung unabhängig kontrollieren. XLSX auf vollständige Befunde und Quellzeilen prüfen. Ergebnisse dauerhaft gemäß Dateiablage-Skill speichern und PDF/XLSX verlinken. Keine separate Prüfbericht-CSV ausgeben.

## Ressourcen und Grenzen

- `scripts/generate_original_layout.py`: kanonischer Layoutgenerator; keine freie Neugestaltung.
- `scripts/build_outputs.py`: vollständiger mehrseitiger Bericht plus Excel-Ausgabe.
- `scripts/test_regression.py`: synthetische Regression für Flug 21, offene/volle Seiten und Berichtüberlauf. Vor Änderungen an Generator oder Schema ausführen.
- `assets/Flugbuch_Layoutreferenz_69_Fluege.pdf`: ausschließlich optische Referenz aus dem früheren Paket; enthält historische Beispieldaten und alten Berichtshinweis, der keine Ausgabevorgabe ist.
- Das Foto wird durch den Assistenten gelesen; der Generator allein betreibt keine OCR und keinen automatischen CSV-Abgleich. Aus erfolgreichem Rendering keine erfolgreiche Erkennung ableiten.
- Nie einen unsichtbaren historischen Papierbestand als geprüft bezeichnen. Das Ergebnis ist eine Abschreibhilfe, keine unterschriebene Flugbuchbestätigung.

Für konkrete Befunde auf zusätzlich fotografierten früheren Seiten diese als `historical_appendices` aufnehmen: Liste eigenständiger Generator-Datenobjekte mit jeweils belegten initialen Überträgen, `start_page` und `pages`; alle enthaltenen Flüge `existing`. Sie erscheinen am Ende als historischer Prüfkontext, ändern niemals Fortführungsnummern oder Überträge. Bei fehlenden historischen Summen keine Werte erfinden; den Befund vollständig im Bericht zeigen und die nicht erzeugte historische Zellenansicht benennen.

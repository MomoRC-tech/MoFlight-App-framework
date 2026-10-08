# Flugbuch-Assistent: verbindliches Regelwerk und PDF-Layout

## Zweck

Dieses Dokument ist die fachliche Wissensquelle für den Custom GPT „Flugbuch-Assistent“. Es beschreibt den Import eines Vereinsflieger-Exports, den Abgleich mit Fotos des Papierflugbuchs und die verbindlichen Ausgaben.

## Quellen und Rangfolge

1. Die zuletzt fotografierte Papierflugbuch-Doppelseite bestimmt im Normalfall den Fortführungsanker: letzte belegte laufende Nummer und nächste freie Zeile.
2. Der aktuell hochgeladene Vereinsflieger-CSV-Export liefert die neuen, noch einzutragenden Flugdaten.
3. Eine mitgelieferte Master-CSV aus einem früheren Lauf dient nur zur Kontinuität und Dokumentation.
4. Unsichere oder widersprüchliche Angaben werden niemals stillschweigend korrigiert oder gelöscht.

Das Papierflugbuch und vorgeschriebene Bestätigungen beziehungsweise Unterschriften bleiben rechtlich maßgeblich. Der Assistent ist eine Prüf- und Abschreibhilfe.

## Betriebsmodi und Pflichtfrage

Vor jedem neuen Lauf wird gefragt: „Möchtest du nur ab dem aktuellen Stand im Papierflugbuch fortführen (empfohlen), oder soll ich zusätzlich alle vergangenen Flüge auf Abweichungen prüfen?“ Wenn der Benutzer den Modus bereits eindeutig genannt hat, entfällt die Wiederholung.

### Standardmodus: Nur fortführen

- Erforderlich sind der vollständige aktuelle Vereinsflieger-Export und ein Foto der zuletzt beschriebenen Doppelseite.
- Die letzte belegte Papierzeile ist der verbindliche Anker. Die erste neue laufende Nummer ist Papiernummer plus eins.
- Der Anschluss in der CSV wird anhand Flugidentität sowie Datum/Uhrzeit ermittelt, niemals durch Vergleich der bloßen Gesamtanzahl oder Zeilenposition.
- Zusätzliche oder fehlende ältere Vereinsflieger-Flüge ändern weder Papiernummer noch Startzeile der Abschreibvorlage.
- Historische Abweichungen werden als nicht blockierender Hinweis (`severity=info`) dokumentiert: „Historie weicht ab; Fortführung folgt dem fotografierten Papierstand.“
- Ist der Anschluss am selben Datum nicht eindeutig oder der Papieranker nicht sicher lesbar, wird gezielt nachgefragt.
- Die erste PDF-Seite bildet die zuletzt fotografierte Doppelseite ab: bereits eingetragene Zeilen als hellgrauer Kontext, neue Zeilen ab dem ersten freien Feld. Danach folgen nur neue Seiten.

Beispiel: Das Foto endet mit Nr. 69 in Zeile 9. Vereinsflieger enthält in der Vergangenheit zwei zusätzliche Flüge. Die Ausgabe beginnt trotzdem mit Nr. 70 in Zeile 10 derselben Doppelseite. Die zwei zusätzlichen alten CSV-Flüge erscheinen nur im Prüfbericht und werden nicht vor Nr. 70 eingeschoben.

### Optionaler Modus: Vergangenheit mitprüfen

- Zusätzlich werden Fotos aller gewünschten früheren Seiten benötigt.
- Der Assistent prüft den historischen Verlauf vollständig und meldet fehlende, zusätzliche oder abweichende Flüge.
- Auch dann bleibt die letzte fotografierte Papierzeile der Fortführungsanker. Rückwirkende Nachträge oder Umnummerierungen werden nur separat vorgeschlagen und nie automatisch in die Fortschreibung eingerechnet.

## CSV-Import

Vereinsflieger-Exporte sind typischerweise UTF-8/UTF-8-BOM und semikolongetrennt. Spaltennamen können leicht variieren. Erwartete Felder:

| Normalisiertes Feld | Typische Vereinsflieger-Spalte |
|---|---|
| Datum | Datum |
| Kennzeichen | Lfz. |
| Fluglehrer/Begleiter | Begleiter/FI |
| Startart | S.-Art |
| Startort | Startort |
| Landeort | Landeort |
| Startzeit | Start |
| Landezeit | Landung |
| Flugzeit in Minuten | Flugzeit |
| Landungen | Landungen |
| Bemerkung | Bemerkung |
| Verein | Verein |

Zeilen ohne Datum, Summenzeilen sowie Nullflüge ohne Start-/Landezeit und ohne Landung werden nicht als Flug übernommen, aber im Audit dokumentiert.

Bekannte Zuordnungen:

| Kennzeichen | Muster |
|---|---|
| D-EX01 | ASK 21 |
| D-EX02 | DG-1000 S |

Unbekannte Kennzeichen werden nicht geraten. Vor der finalen Ausgabe ist nach dem Muster zu fragen.

Startarten: `W` = Windenstart, `F` = Flugzeugschlepp. Andere Kürzel bleiben unverändert und werden zur Prüfung markiert.

## Dubletten und Plausibilität

Ein Datensatz darf nie automatisch gelöscht werden. Markiere als mögliche Dublette, wenn mindestens eine Regel zutrifft:

- identisches Datum, Kennzeichen, Start- und Landezeit;
- gleiches Datum und Kennzeichen mit stark überlappenden Zeitintervallen;
- nahezu gleiche Zeit mit Abweichung höchstens zwei Minuten und gleicher Dauer.

Prüfe außerdem:

- Landezeit vor Startzeit;
- Flugzeit ungleich Differenz aus Start/Landung (Toleranz eine Minute);
- zwei gleichzeitige Flüge desselben Flugzeugs;
- fehlendes Muster, Kennzeichen, Datum, Startart oder Start-/Landeort;
- Landungen ungleich 1 bei üblichen Schulungsflügen;
- laufende Reihenfolge und Seitensummen.

Bei möglichen Dubletten oder physisch unmöglichen Überschneidungen unter den **neu einzutragenden** Flügen: Kontrolltabelle zeigen und Benutzerentscheidung abwarten. Liegt der Befund vollständig vor oder einschließlich des Papierankers, wird er im Standardmodus nur als historischer Hinweis protokolliert und blockiert die Fortführung nicht.

## Fotoauswertung und Matching

Eine Papierzeile wird in dieser Reihenfolge zugeordnet:

1. exakte Übereinstimmung von Datum, Kennzeichen und Uhrzeiten;
2. Datum und Kennzeichen, Uhrzeiten mit Toleranz von höchstens zwei Minuten;
3. Datum, Flugzeug und chronologische Nachbarschaft;
4. bei mehreren Kandidaten Status `ambiguous` und Rückfrage.

Statuswerte:

| Status | Bedeutung | Farbe im Prüfbericht |
|---|---|---|
| `ok` | vollständig identisch | keine zusätzliche Flächenfarbe |
| `warning` | wahrscheinlich derselbe Flug, aber Abweichung | Gelb |
| `missing_paper` | fehlt im Papierflugbuch | Rot |
| `paper_only` | nur im Papierbuch vorhanden | Blau |
| `ambiguous` | nicht eindeutig zuordenbar | Grau |

Handschrift darf nicht geraten werden. Unsichere Zeichen werden als `?` transkribiert und mit Feld, Seite, Zeile und möglichen Lesarten dokumentiert.

## Fachliche Eintragungslogik

- Bei den bisherigen Ausbildungsflügen wird die gesamte Flugzeit als Dual-Zeit geführt, solange CSV und Papierfoto nichts anderes belegen.
- PIC-Zeit bleibt bei Dual-Flügen leer.
- Der in `Begleiter/FI` genannte Fluglehrer wird in der Abschreibvorlage als PIC/Fluglehrer gezeigt; die Spalte Begleiter bleibt leer. Wenn der Verein eine andere Eintragungspraxis bestätigt, hat diese Vorrang.
- Zeiten werden intern ausschließlich als ganze Minuten gerechnet und erst für die Ausgabe in Stunden/Minuten zerlegt.
- Jeder Flug zählt mit der in der CSV angegebenen Anzahl Landungen.
- Die laufende Nummerierung wird nicht rückwirkend verschoben. Ein fehlender Flug in einer bereits ausgefüllten Papierseite wird als „Nachtrag erforderlich“ markiert.
- Im Standardmodus ist eine abweichende historische Fluganzahl ausdrücklich kein Grund, die Papiernummerierung neu zu berechnen.

## Verbindliche Ausgaben jedes finalen Laufs

1. `Flugbuch_Abschreibvorlage.pdf` – letzte fotografierte Seite als Kontext und ab der nächsten freien Zeile nur noch einzutragende Flüge; auf Wunsch auch der Gesamtbestand, im Originalstil.
2. `Flugbuch_Master.csv` – alle normalisierten Flüge mit Quellzeile, Match-Status und Auditinformationen.
3. `Flugbuch_Pruefbericht.csv` – alle Abweichungen, Unsicherheiten, Dubletten und ausgeschlossenen Zeilen.
4. Optional `Flugbuch_Dokumentation.xlsx` – benutzerfreundliche Excel-Fassung mit Übersicht, Abschreibvorlage und Audit.

Vor dem Erzeugen der finalen Dateien wird eine kurze Kontrollübersicht angezeigt: Zahl Flüge, Landungen, Gesamt-/PIC-/Dual-/FI-Zeit, Startarten, Zeitraum, mögliche Dubletten und offene Rückfragen.

## Originalgetreues PDF-Layout

Verwende immer `generate_original_layout.py` als kanonischen Generator. Das PDF hat pro Seite das Sonderformat 420 × 148 mm. Das entspricht einer geöffneten Doppelseite aus zwei A5-Querformatseiten.

Jede PDF beginnt mit einer vorgeschalteten Hinweisseite im selben Format. Sie ist ausdrücklich nicht abzuschreiben und enthält:

- die Farblegende für Weiß, Hellgrau, Gelb, Rot, Blau, Grau und Blaugrau;
- eine kurze Schrittfolge zum Abschreiben;
- eine Ausfüllhilfe für PIC, Begleiter, Startart, Gesamt-, PIC-, Dual- und FI/FE-Zeit, Landungen und offene Seiten;
- eine kompakte Liste der aktuellen Unstimmigkeiten mit laufender Nummer, Feld, Klartext und Empfehlung;
- bei mehr Befunden einen Verweis auf `Flugbuch_Pruefbericht.csv`.

Jede Doppelseite enthält genau zehn Flugzeilen.

Linke Hälfte:

- Lfd. Nr.
- Jahr/Tag
- Flugzeug: Muster, Kennzeichen
- Besatzung: verantwortlicher Luftfahrzeugführer (PIC), Begleiter
- Startart
- Ort: Start, Landung
- Unterschriftszeile unten

Rechte Hälfte:

- Überträge oben
- Uhrzeit UTC: Start, Landung
- Flugzeit: Gesamtzeit, PIC-Zeit, Dual-Zeit, FI/FE-Zeit, jeweils h/min
- Strecke in km
- Anzahl Landungen
- Bemerkungen/Bestätigungen
- unten: Gesamtzeit dieser Seite und Total

Eine Seite gilt erst als abgeschlossen, wenn alle zehn Flugzeilen belegt sind. Ist die letzte Seite noch nicht vollständig, bleiben die vorgedruckten Summenzeilen zwar sichtbar, aber **alle Werte** in „Gesamtzeit dieser Seite“ und „Total“ bleiben leer - einschließlich PIC-, Dual-, FI/FE-Zeit und Landungen. Der Übertrag oben wird weiterhin ausgefüllt, da er nur die bereits abgeschlossenen vorherigen Seiten umfasst. Sobald die zehnte Flugzeile belegt ist, werden Seitensumme und Total normal ausgegeben.

Normale neue Abschreibzeilen bleiben weiß. Bereits im Papierflugbuch vorhandene Kontextzeilen erhalten `entry_state=existing` und eine sehr helle graue Fläche; sie sind nicht erneut abzuschreiben. Bei einer Unstimmigkeit wird möglichst nur die tatsächlich betroffene logische Zelle gelb (`warning`) oder rot (`error`) hinterlegt. Zeitfelder wie Gesamt-, PIC-, Dual- oder FI/FE-Zeit umfassen dabei jeweils beide h/min-Zellen. Zusätzlich steht ein `!` in der betroffenen Zelle und `[!] Feldname` in der Bemerkungsspalte, damit die Markierung im Schwarz-Weiß-Druck erkennbar bleibt. Der Klartext muss auf der Hinweisseite und vollständig im Prüfbericht stehen. Keine moderne farbige Tabellenoptik, keine Titelseite zwischen den Abschreibseiten und keine umsortierten Spalten.

Alle Überschriften und fest vorgegebenen Textzellen (zum Beispiel „PIC“, „Überträge“, „Gesamtzeit dieser Seite“ und „Total“) erhalten eine dezente blaugraue Hintergrundfarbe. Die weißen Zellen sind dadurch eindeutig als einzutragende Datenfelder erkennbar. Zusammengefasste Überschriften sind echte verbundene Zellen: Keine senkrechte Trennlinie darf durch Texte wie „Flugzeug“, „Besatzung“, „Gesamtzeit“, „PIC-Zeit“, „Dual-Zeit“ oder „FI/FE-Zeit“ laufen. Übertrags- und Summenwerte verwenden exakt dieselben horizontalen Spaltengrenzen wie die jeweils zugehörigen h/min- beziehungsweise Landungsspalten der Flugzeilen.

Das Beispiel `Flugbuch_Layoutreferenz_69_Fluege.pdf` zeigt die gewünschte Anmutung. Es ist eine visuelle Referenz, keine neue Datenquelle.

## JSON-Schnittstelle für den Generator

Der Generator akzeptiert entweder `flights` oder vorberechnete `pages`. Für eine Fortschreibung ab einer laufenden Seite werden `pages`, `start_page` und die Überträge `initial_carry_minutes`, `initial_carry_pic_minutes`, `initial_carry_dual_minutes`, `initial_carry_fi_minutes`, `initial_carry_landings` verwendet. `include_intro` ist standardmäßig `true`; es darf für die finale Ausgabe nicht deaktiviert werden. Die erste Flugbuchseite enthält die bereits eingetragenen Fotozeilen mit `entry_state: "existing"` und danach die neuen Zeilen mit `entry_state: "new"`. Maßgebliche Felder pro Flug:

`nr`, `date`, `date_display`, `aircraft_type`, `registration`, `pic`, `companion`, `launch`, `start_place`, `landing_place`, `start`, `landing`, `minutes`, `pic_minutes`, `dual_minutes`, `fi_minutes`, `distance`, `landings`, `remarks`, `status`, `entry_state`.

Unstimmigkeiten werden entweder global unter `issues` oder direkt am Flug unter `field_issues` angegeben. Pflichtfelder eines Befunds sind `nr`, `field`, `severity`, `message` und `recommendation`. Unterstützte Feldnamen sind `nr`, `date`, `aircraft_type`, `registration`, `pic`, `companion`, `launch`, `start_place`, `landing_place`, `start`, `landing`, `minutes`, `pic_minutes`, `dual_minutes`, `fi_minutes`, `distance`, `landings` und `remarks`. Globale Befunde ohne `nr` oder `field` erscheinen nur auf der Hinweisseite und im Prüfbericht.

Aufruf in der Datenanalyse-Umgebung:

```bash
python generate_original_layout.py normalisierte_daten.json Flugbuch_Abschreibvorlage.pdf
```

Nach der Erzeugung PDF rendern und visuell kontrollieren: vollständige Hinweisseite ohne Überlappung, richtige Farblegende, Übereinstimmung von Befundliste und Zellmarkierungen, keine abgeschnittenen Texte, zehn sichtbare Zeilen, korrekte Überträge und auf abgeschlossenen Seiten korrekte Totale. Auf einer unvollständigen letzten Seite müssen sämtliche Werte der beiden Summenzeilen leer sein.

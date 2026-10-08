# Gemeinsame Segelflug-App-Plattform

Architekturbewertung und Arbeitsplan für Phase 1 · 08.10.2026 · Entwurf 0.2 · Frühe Machbarkeitstests priorisiert

## Ergebnis und Bearbeitungsstand

React Native, Expo, TypeScript, Supabase und OpenAI sind eine geeignete Basis für zwei eigenständige Android-/iOS-Anwendungen mit gemeinsamen technischen Modulen. Empfohlen werden ein Monorepo, ein gemeinsames Backend je Umgebung und separate App-Identitäten, Builds und Releases. Offline-Daten bleiben in einer lokalen SQLite-Datenbank je App und Benutzer.

Die entscheidende Ergänzung ist eine dedizierte Synchronisierungsschicht. PowerSync ist der bevorzugte Kandidat; ein kurzer technischer Versuch prüft ihn vor der verbindlichen Übernahme. Die Fachlogik für Konflikte, Flugdaten, Lernereignisse und Berechtigungen bleibt in unserer Kontrolle. Ein eigener vollständiger Synchronisierungsdienst wäre ein gesondertes Arbeitspaket mit deutlich größerem Aufwand.

Dieses Dokument liefert die erste Architekturbewertung, vorgeschlagene Verträge, Abnahmekriterien, Kostenannahmen und den Implementierungsplan. Benutzerverwaltung und persönliche Daten, der Zugriff auf eigene Vereinsflieger-Daten und RAG werden vor dem breiten Framework-Ausbau praktisch geprüft. Es ist noch kein implementierter oder auf Geräten getesteter Prototyp. Konten, Cloud-Projekte und GitHub-Repositories wurden nicht angelegt; das vorhandene Plugin wurde nicht verändert.

## 1. Anforderungen und Grenzen

| ID | Anforderung | Nachweis in Phase 1 |
|---|---|---|
| R01 | Android und iOS aus gemeinsamer Codebasis | Installierbare Entwicklungsbuilds der Test-App für beide Plattformen |
| R02 | Zwei separat veröffentlichbare Anwendungen | Zwei App-Konfigurationen mit getrennten Paket-/Bundle-IDs; Build-Smoke-Test beider App-Hüllen |
| R03 | Gemeinsame Benutzerkonten | Gleiche Supabase-Identität in beiden Apps; separate sichere Sitzungen |
| R04 | Offline-Lesen und -Schreiben | Flugmodus, Neustart und anschließender Sync ohne Datenverlust |
| R05 | Geräteübergreifende Daten | Zwei Geräte/Sitzungen desselben Kontos gleichen Testdaten ab |
| R06 | Sichere Benutzertrennung | Negativtests für Datenbank, Sync, Dateien, KI-Jobs und lokalen Kontowechsel |
| R07 | Wiederverwendbare Plattformmodule | Fachmodule nutzen dokumentierte Paketgrenzen; keine direkten Abhängigkeiten voneinander |
| R08 | Serverbasierte KI | Authentifizierter API-Aufruf, validierte Antwort, Usage-Erfassung und serverseitiges Budget |
| R09 | Dateiverarbeitung | Offline-Dateiauswahl, wiederholbarer Upload, privater Download, Exportstatus |
| R10 | Agentengestützte Entwicklung | AGENTS.md, reproduzierbares Setup, kleine Arbeitspakete, CI und überprüfbare Abnahme |
| R11 | Kommerzielle Erweiterbarkeit | Export-/Löschkonzept, Lizenzmetadaten, Entitlement-Schnittstelle und Release-Konzept |
| R12 | Eigene Vereinsflieger-Daten abrufen | Früher Live-Versuch mit autorisiertem Konto; eigener Datenumfang, Sitzungsablauf und Wiederholungen geprüft |
| R13 | Belastbares RAG | Früher Test von Ingestion, Retrieval und Antwortbelegen; Wissenslücken, Antwortqualität, Zeit und Kosten gemessen |

Offline bedeutet: bereits heruntergeladene Fragen/Wissensinhalte, Lernereignisse, Flugdaten und Einstellungen funktionieren ohne Netz. Erstanmeldung, Passwortwiederherstellung, KI-Tutor, Fotoanalyse und Cloud-Verarbeitung benötigen eine Verbindung. Offline eingegebene KI-Anfragen können als Entwurf gespeichert werden; eine spätere kostenpflichtige Ausführung wird sichtbar ausgelöst. Die App verspricht keine kontinuierliche Hintergrundsynchronisierung, da das Betriebssystem deren Ausführung bestimmt.

Phase 1 enthält keinen vollständigen Prüfungsmodus, keinen vollständigen Fragenkatalog, keinen Shop und keine vollständige historische Flugbuchprüfung. Ein begrenzter Machbarkeitstest für den Zugriff auf eigene Vereinsflieger-Daten gehört ausdrücklich an den Anfang. Ein offiziell dokumentierter bzw. vom Anbieter unterstützter Zugang wird zuerst untersucht. Ob ein anderer automatisierter Zugriff tragfähig und zulässig ist, bleibt bis zur Prüfung offen. CSV bleibt eine unabhängige Importmöglichkeit; ein funktionierender CSV-Import erfüllt den Nachweis für den direkten Zugriff nicht. Die Akzeptanz eines digitalen Flugbuchs sowie etwaige Bestätigungs-/Signaturprozesse sind später separat zu klären.

## 2. Architekturentscheidungen

| ADR | Vorschlag | Begründung und Grenze |
|---|---|---|
| 001 | React Native + Expo + TypeScript strict | Gemeinsame mobile Entwicklung und gute automatisierte Toolchain; native Funktionen früh in echten Entwicklungsbuilds prüfen |
| 002 | pnpm-Workspace als Monorepo | App und gemeinsame Pakete können zusammen geändert und getestet werden; zunächst kein zusätzlicher Build-Orchestrator nötig |
| 003 | Zwei eigenständige Apps | Eigene Navigation, Produktgestaltung, Berechtigungen, Store-Einträge und Release-Zyklen |
| 004 | Supabase je Umgebung gemeinsam nutzen | Eine Benutzeridentität, Auth, Postgres, Storage und Edge Functions; Entwicklung/Staging/Produktion strikt trennen |
| 005 | SQLite als lokale Datenquelle | UI liest und schreibt lokal; Netzwerkfehler verhindern keinen normalen Fachvorgang |
| 006 | PowerSync über einen schmalen Plattformadapter prüfen | Bestehende SQLite-/Postgres-Synchronisierung reduziert Eigenentwicklung; zusätzliche Kosten, SDK-, Filter- und Betriebsanforderungen prüfen |
| 007 | Backend besitzt fachliche Regeln und Autorisierung | Offline-Änderungen sind zunächst lokal vorläufig; Server validiert Besitz, Inhalt und Version |
| 008 | OpenAI ausschließlich über Backend | Schlüssel, Modelle, Quoten, Retrieval und Kostenkontrolle bleiben serverseitig |
| 009 | Supabase pgvector als RAG-Kandidat | Gemeinsames Backend für Wissensmetadaten und Suche; keine zusätzliche Vektordatenbank zu Beginn |
| 010 | Vorhandenen Python-PDF-Generator erhalten | Layoutwissen wiederverwenden; Python benötigt einen separaten Worker und läuft nicht direkt in Deno Edge Functions |
| 011 | Fachliche Berechnungen deterministisch | KI transkribiert und erklärt; Minuten, Rollenprüfung, Seitenlogik und Summen berechnet geprüfter Code |
| 012 | Keine universelle Plugin-Laufzeit | Wiederverwendung durch klar abgegrenzte Pakete; zunächst auf diese beiden Apps zuschneiden |

PowerSync kann einen eigenen nativen SQLite-Treiber verwenden. Das Projekt verlangt SQLite, nicht zwingend `expo-sqlite` für alle Daten. Ein zusätzlicher paralleler Schreibpfad über zwei Treiber wird vermieden. Der Versuch entscheidet auch über Treiber, Verschlüsselung und Migrationsverfahren.

Gemeinsames Konto bedeutet nicht automatisch eine einzige Anmeldung für beide Apps: mobile Apps haben getrennte sichere Speicher und Sitzungen. Dasselbe Konto kann in beiden genutzt werden; nahtloses appübergreifendes SSO ist eine spätere Erweiterung.

## 3. Repository und Modulgrenzen

Vorgeschlagener privater Repository-Name: `soaring-platform`. Das Repository ist zunächst ein Vorschlag; es existiert noch nicht auf GitHub.

| Pfad | Verantwortung |
|---|---|
| `apps/platform-lab` | Kleine technische Test-App für Phase 1, keine spätere Store-App |
| `apps/spl-learning` | Eigenständige Lern-App, in Phase 1 zunächst eine startfähige Hülle |
| `apps/glider-logbook` | Eigenständige Flugbuch-App, in Phase 1 zunächst eine startfähige Hülle |
| `packages/contracts` | Versionierte Zod-Schemas, API-Typen, Fehlercodes und Datentransferobjekte |
| `packages/auth` | Login, sichere Sitzungen, Recovery, Logout und Kontowechsel |
| `packages/data` | Datenzugriff, lokale Schemata und Migrationen hinter Repository-Schnittstellen |
| `packages/sync` | Sync-Adapter, Verbindungs-/Fehlerstatus und Upload-Verträge |
| `packages/ai-client` | Backend-Aufrufe, Streaming-/Jobstatus und nutzbare Antworten |
| `packages/files` | Auswahl, Import, Upload, Download, Hashes und Export |
| `packages/vereinsflieger-adapter` | Getrennte Drittanbieter-Verbindung, Abruf eigener Flüge, Normalisierung und nachvollziehbarer Verbindungsstatus; konkreter Transport nach frühem Versuch |
| `packages/settings` | Kontoweite, appspezifische und gerätelokale Einstellungen |
| `packages/permissions` | Kamera-/Dateizugriff sowie fachliche Berechtigungsschnittstellen |
| `packages/ui` | Gemeinsame Formulare, Fehleranzeigen, Sync-Status, barrierearme Grundbausteine |
| `packages/learning-domain` | Fragenversionen, Antwortauswertung, Lernereignisse, spätere Wiederholung |
| `packages/logbook-domain` | Import, Normalisierung, Matching, Anker, Befunde und Exportdaten |
| `supabase/migrations` | SQL-Schema, Grants, RLS, Constraints und Backend-RPCs |
| `supabase/functions` | KI-Gateway, Upload-/Jobsteuerung und Kontovorgänge |
| `services/document-worker` | Begrenzter Python-Worker für vorhandene PDF-/XLSX-Erzeugung |
| `tests/fixtures` | Synthetische oder ausdrücklich freigegebene Beispielquellen |
| `tests/e2e` | Mobile Szenarien einschließlich Offline- und Kontowechseltests |
| `docs/adr`, `docs/api`, `docs/runbooks` | Entscheidungen, Verträge und Betrieb |
| `.github/workflows`, `AGENTS.md` | CI und Arbeitsregeln für Entwicklungsagenten |

Fachpakete importieren nur gemeinsame Verträge und notwendige reine Hilfsfunktionen. Sie kennen weder Expo noch Supabase noch OpenAI. Die Apps verdrahten Fachlogik, Plattformdienste und UI. Lern- und Flugbuch-Fachpaket importieren einander nicht. Gemeinsame technische Pakete enthalten keine Flugbuch-Seitenregeln oder SPL-Auswertung.

Nicht jedes vorgesehene Paket muss sofort eine umfangreiche Implementierung erhalten. Kleine Pakete sind nur dann getrennt sinnvoll, wenn sie einen klaren Vertrag oder eine tatsächliche gemeinsame Verantwortung haben.

## 4. Datenmodelle – erster Vertrag

UUIDs werden bereits offline erzeugt. Persönliche Zeilen enthalten `owner_id`, serverseitige Zeitstempel und, falls veränderlich, `version`. Gerätezeit wird als zusätzliche Information bewahrt, aber nicht als alleinige Konfliktentscheidung benutzt. Unbekannt, leer und null werden fachlich unterschieden.

| Bereich / Entität | Wesentliche Felder | Verhalten |
|---|---|---|
| `core.profiles` | `owner_id`, Anzeigename, Sprache | Kontoübergreifend für beide Apps; keine Passwörter |
| `core.settings` | `owner_id`, `app_id`, Schlüssel, typisierter Wert, `version` | Konflikte je Einstellung; gerätespezifische Werte bleiben lokal |
| `core.attachments` | `id`, Besitzer, Fachbezug, MIME, Größe, SHA-256, privater Objektpfad, Status | Binärdaten separat im Storage; Metadaten allein reichen nicht für Uploadabschluss |
| `core.jobs` | Besitzer, Aufgabe, Eingabe-Referenz, Status, Versuche, Ergebnis-Referenz | Backend verarbeitet wiederholbare Jobs |
| `core.ai_usage` | Besitzer, App, Modell, Tokens, reserviertes/erfasstes Budget, Status | Nur Backend darf Verbrauch und Quoten verändern |
| `core.mutation_receipts` | Besitzer, `operation_id`, Request-Hash, Ergebnis | Wiederholungen liefern dasselbe Ergebnis; abweichender Payload wird abgelehnt |
| `learning.content_sources` | Quelle, Herausgeber, Version, Lizenz/Rechtebeleg, Nutzungsumfang, Gültigkeit | Nur administrativ gepflegte, zugelassene Inhalte |
| `learning.questions` | ID, Version, Thema, Text, Optionen, richtige Antwort, Quelle | Unveränderliche Versionen; alte Antworten behalten ihre Referenz |
| `learning.attempts` | ID, Besitzer, Fragenversion, gewählte Option, Gerätezeit, Serverzeit | Unveränderliches Ereignis; Bewertung wird deterministisch validiert |
| `learning.progress` | Besitzer, Thema/Frage, Projektion und Projektionsversion | Aus Ereignissen abgeleitet; keine konkurrierenden inkrementierten Zähler |
| `learning.knowledge_chunks` | Quellenversion, Fundstelle, Text, Vektor, Rechte-/Sichtbarkeit | Server-Retrieval; nur freigegebene Offline-Inhalte herunterladen |
| `logbook.flights` | ID, Besitzer, Datum, Start/Landung, Zeitbasis, Muster, Kennzeichen, Rollen, Minuten, Landungen, Version | Konfliktbehandlung und Revisionen statt blindem Überschreiben |
| `logbook.import_batches` | ID, Besitzer, Datei-Hash, Parser-Version, Status | Identischer Dateiimport nachvollziehbar wiederholbar |
| `logbook.source_rows` | Batch, Originalzeile, Index, normalisierte Felder, Ausschlussgrund | Audit bewahrt auch ausgeschlossene Quellenzeilen |
| `logbook.paper_observations` | Foto, Seite/Zeile, Feld, erkannter Wert, Unsicherheit, bestätigter Wert | Beobachtung und bestätigte Flugdaten getrennt |
| `logbook.continuation_anchors` | Papiernummer, Seite/Zeile, fünf Überträge, Belege, Version | Bekannter Papierstand bestimmt Fortführung |
| `logbook.issues` | Papier-/CSV-Wert, Feld, Schwere, Erklärung, Empfehlung, Auflösung | Historischer Befund und blockierende neue Unsicherheit unterscheiden |
| `logbook.export_runs` | Daten-/Regel-/Generatorversion, bestätigter Snapshot, Artefakte | Reproduzierbare PDF-/XLSX-Ausgabe |

Schema-Namen sind fachliche Vorschläge. Welche Schemas Supabase direkt exponiert, wird ausdrücklich konfiguriert; nicht benötigte Tabellen und administrative Daten werden nicht öffentlich zugänglich gemacht. Besitzbeziehungen werden durch Constraints und Autorisierung geprüft, insbesondere Referenzen auf Dateien, Importbatches und Jobs anderer Konten.

Flugzeiten werden in ganzen Minuten gerechnet. Quelldatum, Quelluhrzeit, UTC/Lokalzeit und gegebenenfalls Zeitzone/Offset werden bewahrt. UTC wird nur bei belegter Zeitbasis abgeleitet. Unbekannte Überträge werden nicht zu null. Rohquellen werden im MVP nicht als bearbeitbare Stammdaten verwendet.

## 5. Backend-Schnittstellen

Auth verwendet den Supabase-Auth-Vertrag. Normale Datenabfragen erfolgen über autorisierte Supabase-Zugriffe bzw. den Sync-Lesepfad. Fachlich relevante Schreibbefehle werden durch typisierte RPCs/Functions validiert. Die folgende Oberfläche ist ein Entwurf, noch keine deployed API.

| Operation | Eingabe | Ergebnis und Regeln |
|---|---|---|
| `apply_mutations_v1` | Batch aus `operation_id`, Entität, `entity_id`, `base_version`, Payload | Pro Operation `accepted`, `conflict` oder `rejected`; Besitz aus JWT, erlaubte Entitäten fest begrenzt |
| `create_upload_v1` | MIME, Größe, Hash, Fachbezug | Serverbestimmter privater Zielpfad; Eigentümer und Limits geprüft |
| `complete_upload_v1` | Attachment-ID | Existenz und Metadaten prüfen; erst danach für Jobs freigeben |
| `tutor_answer_v1` | Anfrage-ID, Frage, Thema/Fragenversion | Validierte Antwort mit echten Quellen-IDs, Usage und nachvollziehbarem Fehler |
| `create_photo_analysis_v1` | Anfrage-ID, eigenes Attachment | Job-ID; Feldbeobachtungen und Unsicherheiten als Ergebnis |
| `create_export_v1` | Eigener bestätigter Snapshot, Exporttyp | Job-ID; private PDF-/XLSX-Dateien |
| `fetch_own_flights_v1` (Adaptervertrag, kein behaupteter Anbieter-Endpunkt) | Autorisierte Verbindungsreferenz, Zeitraum, Cursor | Eigene normalisierte Flüge, stabile Quellreferenzen und Abrufstatus; konkrete Authentifizierung und Ausführungsort nach Versuch |
| `request_account_export_v1` | Bestätigte Sitzung | Export eigener Daten und relevanter Dateien |
| `request_account_deletion_v1` | Erneut bestätigte Sitzung | Löschauftrag über Auth, Daten, Dateien, Jobs und relevante Anbieterartefakte |

Einheitlicher Fehlervertrag: `{code, message, retryable, request_id, details?}`. Keine SQL-Interna, Tokens oder fremden Daten in Fehlermeldungen. Schema-Version und Payload-Grenzen werden geprüft. UUIDs und Besitzangaben aus dem Client sind keine Autorisierungsnachweise.

Servertransaktionen gewährleisten atomare fachliche Änderungen und Idempotenz. Netzwerk-Wiederholungen bedeuten keine Garantie einer exakt einmaligen externen KI-Abrechnung: nach unklarem Provider-Timeout wird der Status sichtbar behandelt und nicht unbegrenzt erneut ausgeführt.

## 6. Offline-Synchronisierung und Konflikte

UI → lokale SQLite-Transaktion → persistente Änderungswarteschlange → autorisierter Backend-Befehl → synchronisierte Serverdaten → lokale Sicht. PowerSync soll Persistenz und Transport übernehmen; die fachlichen Uploadbefehle und Konfliktregeln ergänzen wir. Es wird keine zweite unabhängige allgemeine Outbox neben der SDK-Warteschlange eingeführt.

| Datenart | Konfliktregel |
|---|---|
| Lernversuch | Ereignisse mit eindeutiger ID vereinigen; Retry erzeugt keinen weiteren Versuch |
| Lernfortschritt | Aus Ereignissen neu berechnen; Algorithmus-/Fragenversion dokumentieren |
| Einzelne Einstellung | Validierte Serverreihenfolge je Schlüssel ausreichend; Version für Nachvollziehbarkeit |
| Flugeintrag / Papieranker | Vergleich mit `base_version`; beide Varianten bewahren, Nutzer löst fachlichen Konflikt |
| Quelldateiimport | Gleiches Batch und dieselbe Originalzeile bei Retry wiederverwenden; mögliche Quelldubletten als Befund erhalten |
| Datei | Uploadstatus und Metadaten getrennt; Objekt erst nach erfolgreichem Abschluss verwenden |
| Löschung | Sync-Tombstone bzw. äquivalente bestätigte Löschinformation; veraltetes Update darf keine Zeile wiederherstellen |

Wichtig für den Versuch: Ein fachlicher Konflikt muss lokal separat gesichert werden, bevor eine zurückgewiesene Operation die Upload-Warteschlange verlassen darf. Ein defekter Datensatz darf nicht dauerhaft alle folgenden Änderungen blockieren. Wiederholungen verwenden exponentielle Verzögerung mit Zufallsanteil; dauerhafte Fehler werden sichtbar.

Bei Kontowechsel wird der laufende Sync gestoppt, das Konto im lokalen Repository gewechselt und die vorherige Datenbank geschlossen. Datenbanken, Anhänge und Warteschlangen bleiben strikt einem Konto zugeordnet. Nicht synchronisierte Änderungen werden vor einem Lösch-/Logoutvorgang sichtbar gemacht; sie werden weder verworfen noch dem nächsten Konto zugeordnet.

Reinitialisierung und ältere Geräte werden explizit getestet. Eine Kontolöschung sperrt weitere Synchronisierung; eine neu angelegte Identität erhält keinen Zugang zum alten Datenbestand. Remote-Löschung kann auf einem dauerhaft offline gebliebenen Gerät erst bei der nächsten Verbindung durchgesetzt werden.

## 7. Authentifizierung und Sicherheit

Phase 1: E-Mail/Passwort, bestätigte E-Mail, sichere Sitzung und Passwortwiederherstellung über appbezogenen Deep Link. Später können weitere Login-Anbieter ergänzt werden. Identitäten mit derselben E-Mail werden nicht unkontrolliert zusammengeführt. Recovery setzt ein Passwort zurück und bewahrt die Konto-ID; ein neu angelegtes Konto ersetzt nicht das bestehende.

Tokens werden über einen geprüften SecureStore-Adapter gespeichert; Token-Größen, Plattformverhalten, Wiederherstellung und Logout werden getestet. Große Fachdaten und Fotos gehören nicht in den Schlüsselspeicher. Datenbankverschlüsselung wird mit dem tatsächlichen Sync-Treiber geprüft; Schlüssel liegen im Betriebssystem-Schlüsselspeicher. Ohne diesen Nachweis wird keine pauschale Verschlüsselungszusage gemacht.

Sicherheitsnachweise:

- RLS samt `USING` und `WITH CHECK` für persönliche Tabellen, explizite Grants und serverseitige Eigentümerprüfung.
- Separat geprüfte Sync-Filter: Datenbank-RLS allein schützt den über einen Replikationsdienst ausgelieferten Datenstrom nicht ausreichend.
- Private Storage-Buckets, eigener Pfadraum und serverseitige Besitzprüfung; signierte URLs kurzlebig.
- OpenAI-Key, Datenbankpasswort und Service-Role-Key ausschließlich im Backend/CI-Secrets. Nur öffentlicher Supabase-Projekt-/Publishable-Key in der App.
- Authentifizierte Functions überprüfen JWT und fachlichen Besitz auch dann, wenn intern privilegierte Workerzugriffe nötig sind.
- Keine persönlichen Fotos, CSVs oder Secrets in Git, Testlogs oder Agentenprompts. Fixtures synthetisieren/anonymisieren.
- KI-Quota atomar reservieren und abrechnen; Limit nicht durch mehrere parallele Anfragen umgehen.
- Region, Auftragsverarbeitung, Löschung, Aufbewahrung und Datenweitergabe an KI-/Sync-Anbieter vor Produktivbetrieb prüfen. Eine EU-Datenbank allein legt die Verarbeitung aller weiteren Dienste nicht fest.

## 8. KI-Tutor, RAG und Fotoanalyse

Gemeinsam ist das technische KI-Gateway: Authentifizierung, erlaubte Aufgaben, Inputvalidierung, Modellkonfiguration, Budget, Timeout, strukturierte Antwort und Usage. Fachliche Prompts, Retrieval und Auswertung bleiben getrennt.

Tutor: zugelassene Quellen → versionierte Abschnitte → Retrieval nach Thema und Sichtbarkeit → begrenzter Kontext → Antwort mit überprüfbaren Quellenreferenzen. Zitierte Quellen-IDs müssen aus dem tatsächlich gelieferten Kontext stammen. Fehlt belastbarer Kontext, weist die Antwort die Wissenslücke aus. Imported Texte werden als Inhalte behandelt und erhalten keine Berechtigungen für Werkzeuge. Der Tutor erhält keine automatischen Schreibrechte auf den Lernfortschritt.

Phase 1 verwendet fünf selbst erstellte Wissensabschnitte und zehn synthetische Fragen. Sie werden als Demo gekennzeichnet und nicht als offizieller Prüfungsstoff dargestellt. Offizieller Lehrplan, veröffentlichte Prüfungsfragen und Lehrbuchmaterial erhalten vor Übernahme eigene Herkunfts-, Versions- und Rechteprüfungen; öffentlich lesbar ist nicht automatisch kommerziell wiederverwendbar. Ein flugfachlicher Review bleibt für die späteren Lerninhalte nötig.

Fotoanalyse: Bild → validiertes Schema mit Beobachtungen pro Seite/Zeile/Feld → sichtbare Korrektur/Bestätigung → deterministisches Matching und Rechnen → bestätigter Export-Snapshot. Selbstberichtete KI-Sicherheit ist kein verlässliches Qualitätsmaß; Fehlerquote und kritische Felder werden anhand bestätigter Beispieldaten ausgewertet. Unleserliche Werte bleiben unbekannt.

Kosten werden je Aufgabe gemessen. Kontextumfang, Bildgröße, Wiederholungen, Ausgabetokens und Reasoning beeinflussen den Verbrauch. Modelle werden konfiguriert und anhand derselben Aufgaben verglichen; ein günstiger Modellname wird nicht ungeprüft zur Qualitätsgarantie.

## 9. Vorhandene Flugbuch-Referenz

Geprüft wurden die Plugin-Instructions, das Plugin-Regelwerk und der vorhandene neuere Flugbuch-Skill einschließlich Muster-JSON und der Generator-/Teststruktur. Die Regelstände sind nicht vollständig deckungsgleich:

| Punkt | Plugin-Stand | Neuerer Skill-Stand / Empfehlung für App |
|---|---|---|
| Matching | Kennzeichen/Muster teilweise Teil der Voraussetzung | Zuerst Datum/Uhrzeit unabhängig vom Flugzeug; anschließend feldweise vergleichen |
| Sichtbare Historie | Teilweise allgemeiner Hinweis | Alle sichtbaren belegten Zeilen prüfen; konkrete Befunde markieren, Fortführung nicht verschieben |
| Ausbildungsrolle | Dual als Ausgangsannahme | Rolle pro Flug aus Belegen bestimmen, Alleinflug separat |
| Bericht | Prüfbericht-CSV verbindlich, XLSX optional | Lesbarer PDF-Prüfbericht und XLSX-Dokumentation; CSV als gewünschter Export |
| PDF-Schrift | Älterer Regeltext ohne durchgängige Fettvorgabe | Lesbare fette Texte gemäß späteren Anforderungen |

Für die neue App wird der neuere Regelstand als Ausgangspunkt vorgeschlagen und als eigene versionierte Fachspezifikation vereinheitlicht. Das bestehende Plugin bleibt unverändert. Die vorhandene PDF-Logik wird nicht als vollständige Import-/Analyse-Engine missverstanden.

Pflichtfälle für Regressionen: Flug 21 mit ASK-21-/DG-1000-Abweichung; Papieranker trotz zusätzlicher historischer CSV-Flüge; offene Seite ohne Seitentotal; zehnte Zeile schließt Seite; unbekannte Überträge; Alleinflug statt Dual; mehrdeutiger Anschluss; Sommer-/Winterzeit; Dubletten ohne stilles Löschen.

## 10. Konkreter Plan für Phase 1

Aufwand ist eine erste technische Schätzung, keine bereits erreichte Arbeitsleistung. Ein Personentag entspricht etwa acht Stunden Implementierung, Prüfung und Dokumentation; Agenteneinsatz reduziert manuelles Tippen, aber nicht automatisch alle Integrations- und Reviewarbeiten.

Die ersten Versuche erhalten nur das nötige Grundgerüst. Vollständige App-Hüllen und allgemeine Plattformabstraktionen werden erst ausgebaut, nachdem die wesentlichen Integrationen nachgewiesen oder ihre Grenzen dokumentiert sind.

| Schritt | Arbeit und Ergebnis | Abnahme | Aufwand |
|---|---|---|---|
| P1 | Architektur, Fachregeln und konkrete Versuchsverträge | Versionierter Entwurf; offene Annahmen und Zugangsbedarf festhalten | 1–2 PT |
| P2 | Minimaler Workspace, Test-App, TypeScript und schnelle CI | Reproduzierbarer Start; native Android-/iOS-Testbuilds vorbereiten | 2–3 PT |
| P3 | Früher Auth-/Benutzerdaten-/Sync-Versuch | Zwei Konten und zwei Geräte/Sitzungen; Recovery, Benutzertrennung, Persistenz, Logout und Konfliktqueue geprüft | 3–4 PT |
| P4 | Früher Vereinsflieger-Versuch | Autorisierter Abruf eigener Flüge; Wiederholung, abgelaufene Sitzung und nachvollziehbare Quellzuordnung; Zugang und Nutzungsbedingungen geklärt | 3–5 PT |
| P5 | Früher RAG-Versuch mit KI-Gateway | Kleine Wissensbasis vollständig ingestiert; Retrieval und quellenbezogene Antworten separat evaluiert, Verbrauch gemessen | 2–3 PT |
| P6 | Gemeinsame Module, zwei App-Hüllen und Offline-Fachstrecke | Neustart, Retry, Konflikte, Löschung und kontobezogene Datenhaltung nachgewiesen | 4–6 PT |
| P7 | Dateien, begrenzte Fotoanalyse und Python-Export | Privater Upload und Fixture-Export mit Jobstatus | 1–2 PT |
| P8 | E2E-Abnahme, Builds und Betriebsanleitung | Kernabläufe Android/iOS; dokumentierte Testergebnisse und verbleibende Grenzen | 2–3 PT |

Neue Planungsschätzung: 18–28 PT netto; mit etwa 30 % Integrationsreserve rund 24–37 PT. Die vorherige Schätzung von 15–22 PT enthielt keinen direkten Vereinsflieger-Versuch. Der zusätzliche Aufwand ist vorläufig und wird nach P3–P5 neu geschätzt; eine komplexe Anbieterintegration oder ein eigener allgemeiner Sync-Dienst sind nicht eingeschlossen. Fehlende Zugänge und notwendige Anbieterklärung verursachen gegebenenfalls zusätzliche Wartezeit.

### Drei frühe Machbarkeitstests

| Test | Praktischer Ablauf | Erfolgskriterium | Benötigt |
|---|---|---|---|
| Benutzerverwaltung und persönliche Daten | Registrierung, E-Mail-Bestätigung, Login, Passwort-Recovery; Konto A speichert Einstellung, Lernantwort und Testflug offline; Neustart und zweites Gerät; Kontowechsel zu B | Recovery bewahrt die Konto-ID; keine verlorenen oder doppelt gezählten Änderungen; B erhält über API, Sync, Dateien oder lokale Datenhaltung keine A-Daten; abgelaufene Sitzung wird sauber behandelt | Supabase-Testumgebung, Testkonten und Recovery-Deep-Links; Geräte-/Sitzungsprüfungen |
| Vereinsflieger-Zugriff | Unterstützte Schnittstellen und Zugangsvoraussetzungen prüfen; Plattformkonto und Vereinsflieger-Verbindung getrennt halten; eigene Flüge eines autorisierten Testkontos für einen kleinen Zeitraum abrufen; erneuten Abruf und Sitzungsablauf testen | Abruf stimmt mit bestätigter Referenz überein; IDs bzw. stabile Quellreferenzen vorhanden; kein fremder Datenumfang; wiederholter Abruf erzeugt keine Dubletten; Wiederanmeldung funktioniert | Dokumentierter/unterstützter Zugang oder geklärter alternativer Weg; eigenes Testkonto, dessen Zugang nicht im Chat oder Repository gespeichert wird |
| RAG | Kleine versionierte Demo-Wissensbasis, Embeddings, gefilterte Suche, begrenzter Kontext und Antwort mit Quellen; 20 vorher festgelegte Fragen einschließlich Mehrabschnittsfragen und fehlender Information | Zielwerte: relevante Quelle in mindestens 90 % der beantwortbaren Fragen unter den ersten fünf Treffern; 100 % der ausgegebenen Quellen-IDs stammen aus dem gelieferten Kontext; alle vorgesehenen Wissenslückenfälle werden erkannt; fachliche Belege zusätzlich manuell prüfen | OpenAI-API-Zugang und Testbudget, Vektorsuche, eigene oder freigegebene Texte; Erwartungsantworten |

RAG-Metriken sind Abnahmeziele, keine schon erzielten Messwerte. Für jede Anfrage werden Retrieval-Treffer, Quellenbezug, Antwortqualität, Gesamtlatenz und tatsächlicher Verbrauch erfasst; reine Modellantworten ohne Retrieval erfüllen den Test nicht. Der kleine Evaluationssatz ist ein früher Integrationsnachweis und ersetzt keine spätere fachliche Qualitätsprüfung.

Beim Vereinsflieger-Versuch wird nicht vorausgesetzt, dass eine frei nutzbare API existiert oder dass Website-Zugangsdaten automatisch zur Drittanbieter-Nutzung berechtigen. Es werden keine Zugriffsschranken umgangen. Persönliche Rohdaten und Zugangsdaten bleiben außerhalb von Git und Logs. Kann der Live-Abruf nicht ausgeführt werden, lautet das Ergebnis ausdrücklich „offen/blockiert“ mit Grund und nächstem Klärungsschritt. CSV und Mocks bleiben nützlich, gelten jedoch nicht als bestandener Live-Test. Der Test umfasst zuerst Flugdaten; weitere personenbezogene Vereinsflieger-Felder werden nur bei fachlichem Bedarf erhoben.

Recherchebefund vom 08.10.2026: Eine inoffizielle OpenAPI-Spezifikation verweist auf ein offizielles REST-PDF im Vereinsflieger-Mitgliederbereich. Die öffentlich sichtbare Spezifikation nennt AppKey, Benutzername, Passwort und optional 2FA, enthält in ihrem sichtbaren Umfang aber keinen nachgewiesenen Endpunkt zum Abruf eigener Flüge. Drittanbieter nennen einen AppKey vom Vereinsflieger-Support. Damit ist ein REST-Zugang plausibel, der konkrete Flugdatenumfang und die Nutzbarkeit für eine kommerzielle App sind noch offen. Der erste praktische Schritt ist die offizielle Dokumentation und Freigabe beim Anbieter zu klären; ein AppKey wird nicht in die ausgelieferte App eingebaut. Die eigene Supabase-Identität bleibt von einem möglichen Vereinsflieger-Zugang getrennt.

Die Test-App zeigt für die drei Bereiche jeweils „nicht getestet“, „blockiert“, „bestanden“ oder „fehlgeschlagen“ mit dem tatsächlich geprüften Ablauf. Zugänge werden erst beim konkreten Test sicher eingerichtet. Vorbereitungen ohne Zugang dürfen fortgesetzt werden; sie werden nicht als Nachweis einer funktionierenden Cloud-Integration dargestellt.

Entscheidung nach P3–P5: PowerSync übernehmen, wenn native Builds, sichere Filter, Konflikte, Migrationen und Kosten funktionieren; Vereinsflieger-Transport nach nachgewiesenem Zugang festlegen; RAG anhand Retrieval und belegter Antworten auswählen. Ein fehlgeschlagener Versuch führt zu einem dokumentierten Anpassungsvorschlag. Die frühe Bewertung darf einen betroffenen Teil blockieren, ohne die unabhängige Arbeit am anderen Fachmodul anzuhalten.

### End-to-End-Abnahme

1. Konto A meldet sich an, lädt die Demo-Fragen und schreibt einen Testflug.
2. Im Flugmodus beantwortet es Fragen, ändert den Flug und wählt eine Bilddatei.
3. Nach App-Neustart sind Antworten, Änderungen und Uploadwarteschlange vorhanden.
4. Nach Wiederverbindung werden Änderungen übernommen; wiederholte Requests erzeugen keine zusätzlichen Versuche oder Flüge.
5. Zweites Gerät desselben Kontos sieht den Stand. Konkurrierende Flugänderungen erzeugen einen sichtbaren Konflikt ohne Verlust einer Variante.
6. Konto B kann A-Daten weder über UI, direkte API, Sync noch Storage/Job-URLs erhalten.
7. Eine KI-Anfrage liefert eine quellenbezogene Demo-Antwort; bei fehlendem Kontext, Tokenablauf, Budgetgrenze und Providerfehler bleibt der Zustand nachvollziehbar.
8. Ein Fixture-Export durchläuft Job, Python-Generator und privaten Download. Ein falscher Besitzer wird abgelehnt.
9. Ein alter Client nach Löschung und eine alte Datenbank nach Migration verlieren keine noch zulässigen Änderungen und stellen keine gelöschten Daten wieder her.
10. Ein autorisierter Live-Abruf eigener Vereinsflieger-Flüge wird mit einer bestätigten Referenz verglichen; Wiederholung und erneute Anmeldung funktionieren. Ein blockierter Abruf bleibt als offener Nachweis sichtbar.
11. Registrierung, E-Mail-Bestätigung, Recovery und lokaler Kontowechsel sind getestet.
12. Der RAG-Evaluationssatz hat dokumentierte Retrieval-, Beleg-, Wissenslücken-, Latenz- und Kostenwerte.
13. Android und iOS bestehen den Kernablauf; nicht ausgeführte Geräte-/Cloud-Prüfungen werden ausdrücklich als ausstehend ausgewiesen.

## 11. Tests, Builds und KI-Entwicklungsworkflow

TypeScript-Typecheck und Lint auf jedem Pull Request; Vitest für reine Fachlogik und Protokollfälle; mobile Komponententests mit React Native Testing Library; SQL-/RLS-Tests gegen lokale Supabase-Testinstanz, einschließlich fremder IDs und Besitzwechsel. SQLite-/Sync-Integrationstests prüfen reale Persistenz, nicht nur Mocks. Maestro deckt die kritischen mobilen Abläufe ab. Der vorhandene Python-Generator erhält strukturelle und visuelle Regressionen mit synthetischen Fixtures.

CI verwendet gepinnte kompatible Toolversionen und einen Lockfile. PRs führen schnelle Checks aus; teure native Builds und E2E laufen bei relevanten Änderungen bzw. auf explizitem Build-Trigger. EAS-Profile: development, preview und production mit getrennten Umgebungen. Runtime-/Update-Kompatibilität, Datenmigration und Rückwärtskompatibilität müssen zusammen betrachtet werden: ein App-Rollback hebt eine bereits ausgeführte Datenmigration nicht auf.

AGENTS.md enthält Setupbefehle, Modulgrenzen, geltende ADRs, Verbote für Secrets in Git, Testpflichten bei Daten-/Securityänderungen und die Definition of Done. Jedes Arbeitspaket liefert Problem, Akzeptanzkriterien, kleine Änderung, ausgeführte Prüfungen und bekannte Grenzen. Bestehende Tests werden bei Fehlern analysiert, nicht zur Beruhigung gelöscht. Ein zentraler Review prüft Datenverlust, Berechtigungen und fachliche Invarianten.

Manuelle Aufgaben des Projektinhabers: Accountbesitz/Verifizierung, eventuell Vertrags- und Kostenfreigaben, Installation von Testbuilds, notwendige inhaltliche Entscheidungen sowie ein kurzer Test auf realen Geräten. Programmierung, Migrationen, Tests, Build-Konfiguration und Dokumentation übernimmt der Entwicklungsagent soweit Werkzeuge und Zugänge dies erlauben. Es ist keine Delegation an weitere Agenten erforderlich.

## 12. Kostenrahmen

Tarifstand aus offiziellen Seiten am 08.10.2026; USD, ohne Steuern und Wechselkurse. Grundgebühren sind keine garantierte Gesamtrechnung. Produktive Backups, Monitoring, E-Mail und Worker benötigen eigene Nutzungsplanung.

| Posten | Entwicklung | Kleiner produktiver Betrieb |
|---|---|---|
| Supabase | Free oder lokale Instanz | Pro ab 25 USD/Monat; zusätzliche Projekte ab 10 USD/Monat |
| PowerSync, falls übernommen | Free innerhalb Limits | Pro ab 49 USD/Monat, zusätzlicher Verbrauch möglich |
| Expo EAS | Free innerhalb Build-/Update-Limits | Starter 19 USD/Monat plus gegebenenfalls Verbrauch; Free kann bei geringer Nutzung weiter genügen |
| OpenAI | Eigene Planung: 5–20 USD für begrenzte Tests | Nutzung pro Aufgabe; Szenarien unten |
| SMTP, Worker, Monitoring | Lokal bzw. geeignete kostenlose Entwicklungstarife | Eigene Reserve: 10–30 USD/Monat, konkreter Anbieter noch offen |
| Zweite bezahlte Backend-Umgebung | Für ersten Versuch nicht notwendig | Optional zusätzlich ab 10 USD/Monat für Supabase-Compute; weitere Anbieterlimits prüfen |
| Apple Developer Program | Für passende iOS-Verteilung einplanen | 99 USD/Jahr bzw. lokaler Preis |
| Google Play Console | Für Store-Verteilung einplanen | 25 USD einmalig |

Beispiel für reine Tutor-Tokens, ausdrücklich keine Modellfestlegung: GPT-5.4 mini mit 0,75 USD pro Million Eingabetokens und 4,50 USD pro Million Ausgabetokens. Bei 4.000 Inputtokens und insgesamt 800 abrechenbaren Outputtokens kostet eine Antwort etwa 0,0066 USD. Zusätzliche Reasoning-Tokens, Bilder, Embeddings, Werkzeugaufrufe und Retries sind gesondert zu berücksichtigen.

| Beispielnutzung | Antworten/Monat | Reine Textkosten nach obiger Annahme |
|---|---:|---:|
| 100 aktive Nutzer × 20 Antworten | 2.000 | 13,20 USD |
| 1.000 aktive Nutzer × 40 Antworten | 40.000 | 264 USD |

Kleiner Produktivbetrieb mit Supabase Pro, PowerSync Pro, EAS Starter und der Reserve: etwa 103–123 USD/Monat vor KI, zusätzlichen Umgebungen, Storekonto und Mehrverbrauch. Beim ersten Tutor-Szenario etwa 116–136 USD/Monat. Fotos/PDF-Jobs sind in der Tokenrechnung nicht enthalten. Eigene Kostenmessungen des Prototyps ersetzen diese Modellrechnung.

Serverseitige Quoten, Budgetreservierung, maximale Eingabe-/Ausgabelängen und begrenzte Wiederholungen gehören zur Implementierung. Ein Anbieter-Budgethinweis wird nicht als garantiertes hartes Ausgabenlimit vorausgesetzt. Inhaltslizenzen, rechtliche Prüfung, Testgeräte, Entwicklungszeit und spätere Store-/Zahlungsgebühren sind hier nicht beziffert.

## 13. Risiken und nächste Fachphasen

| Risiko | Gegenmaßnahme / Entscheidungspunkt |
|---|---|
| Sync verliert oder überschreibt Daten | Frühzeitige Persistenz-, Retry-, Konflikt- und Reinitialisierungstests |
| Sync-Filter oder Backend lassen Fremddaten durch | Eigene Negativtests für jeden Datenpfad; kein Produktionsstart bei kritischem Fehler |
| Handschrift wird falsch erkannt | Beobachtung/Bestätigung trennen; kritische Felder sichtbar korrigieren; Referenzdatensatz aufbauen |
| Flugbuch-Regeln widersprechen sich | Ein versioniertes App-Regelwerk und die bekannten Fehlerfälle vor Migration |
| Python-Export erhöht Betrieb | Worker nur für begrenzte Aufgaben; private Artefakte und Jobvertrag |
| Prüfungs-/Lehrbuchrechte fehlen | Quellenregister und Rechtebeleg vor Import; Phase 1 nutzt eigene Demo-Inhalte |
| KI beantwortet fachlich falsch | Quellenprüfung, kleiner Evaluationssatz, Wissenslücken ausdrücken und fachlicher Review |
| Vereinsflieger-Zugang fehlt oder ändert sich | Unterstützten/zulässigen Zugriff und Live-Abruf früh in P4 prüfen; CSV bleibt unabhängiger Fallback, kein Ersatznachweis |
| Native SDKs und Betriebssysteme verhalten sich unterschiedlich | Android/iOS früh bauen und auf Geräten prüfen |
| Kosten steigen durch Fotos, Abrufvolumen oder Retries | Usage-Messung, Limits, Cache nur für passende freigegebene Inhalte, Lasttests |
| Kommerzielle Veröffentlichung braucht mehr als Code | Storeanforderungen, Konto-/Datenschutzprozesse und Zahlungsmodell vor Launch konkret prüfen |

Empfohlene Reihenfolge nach Phase 1:

1. Lern-App-MVP: Rechte und Lehrplan zuordnen, Fragenversionen, Offline-Fragenpaket, Fortschritt, Wiederholung und begrenzter RAG-Tutor. Erste Größenordnung 10–20 PT ohne ungeklärte Lizenzbeschaffung oder großen Redaktionsaufwand.
2. Flugbuch-App-MVP: CSV-Import, geführte Papierfotoanalyse, Korrektur, Anker, feldweiser Abgleich, nachvollziehbarer Prüfbericht und Original-PDF/XLSX. Erste Größenordnung 15–25 PT; OCR-Referenzdaten und Fachregeln beeinflussen die Schätzung stark.
3. Veröffentlichungsvorbereitung: reale Beta, Support, Backup-/Restore-Nachweis, Datenschutz-/Löschabläufe, Store-Material und gegebenenfalls In-App-Käufe mit serverseitigen Entitlements. Zusätzliche Größenordnung 6–12 PT ohne externe Prüfung/Wartezeiten.
4. Erweiterungen nach Nutzerfeedback: den in Phase 1 geprüften Vereinsflieger-Adapter produktiv härten, weitere Loginanbieter, Instructor-Freigaben, Signaturen und weitergehende Ausbildungsfunktionen.

Unmittelbar nächstes Arbeitspaket ist P2: ein minimales reproduzierbares Monorepo-Grundgerüst mit Test-App und CI als Grundlage für die frühen Versuche P3–P5. Die vollständigen App-Hüllen folgen beim Ausbau in P6. Für lokale Vorbereitung sind keine neuen Produktentscheidungen erforderlich. GitHub-/Supabase-/Expo-Zugänge werden erst beim jeweiligen konkreten Integrationsschritt benötigt; Secrets werden nicht als Chattext abgefragt.

## Quellen

Geprüfte Primärquellen für die technische Eignung und Tarifannahmen:

- Expo Local-first: https://docs.expo.dev/guides/local-first/
- Expo SQLite: https://docs.expo.dev/versions/latest/sdk/sqlite/
- PowerSync React Native/Expo: https://docs.powersync.com/client-sdks/reference/react-native-and-expo
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Auth mit React Native: https://supabase.com/docs/guides/auth/quickstarts/react-native
- Supabase RAG mit Berechtigungen: https://supabase.com/docs/guides/ai/rag-with-permissions
- Inoffizielle Vereinsflieger-OpenAPI mit Verweis auf das offizielle PDF: https://github.com/diginize/vereinsflieger-api/blob/master/openapi.yaml
- Vereinsflieger-Anbieter: https://vereinsflieger.de/
- Supabase Storage Access Control: https://supabase.com/docs/guides/storage/security/access-control
- Supabase-Tarife: https://supabase.com/pricing
- PowerSync-Tarife: https://powersync.com/pricing
- Expo-Tarife: https://expo.dev/pricing
- OpenAI-Beispielmodell und Tarife: https://developers.openai.com/api/docs/models/gpt-5.4-mini
- Apple-Mitgliedschaft: https://developer.apple.com/help/account/membership/program-enrollment
- Google-Play-Registrierung: https://support.google.com/googleplay/android-developer/answer/6112435?hl=en

Architekturentscheidungen, Aufwand, Folgekostenreserven und Roadmap sind eigene begründete Vorschläge. Die Flugbuch-Referenzen stammen aus dem vorhandenen Plugin und dem vorliegenden Flugbuch-Skill; sie wurden hier gelesen, nicht geändert und noch nicht gegen aktuelle echte Flugdaten getestet.
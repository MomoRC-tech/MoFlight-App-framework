# Arbeitsregeln für MoFlight

## Projekt und Dokumentation
- README.md ist die zentrale Projektdokumentation; relevante Ziele, Architektur, Status und Testergebnisse dort aktualisieren.
- Vor Änderungen aktuellen Repository-Stand, README und betroffene ADRs lesen.
- Kleine ausführbare PoCs vor umfangreicher Implementierung.
- Android und iOS sowie lokale Speicherung und Offline-Betrieb berücksichtigen.
- Module erst bei Bedarf anlegen; unnötige Infrastruktur vermeiden.
- Manuel entscheidet über Produkt und verbindliche Technologieauswahl. Vorschläge mit Begründung als ADR dokumentieren; Status nicht ohne Freigabe auf angenommen ändern.

## GitHub
- Direkt auf main arbeiten und nachvollziehbare Commits erstellen. Keine PRs erforderlich oder erwünscht (Manuel, 2026-10-08).
- Issues für Aufgaben und offene Entscheidungen verwenden; vorhandene Issues vor Neuerstellung prüfen.
- Dokumentation gemeinsam mit Code ändern.
- Bei fehlendem Schreibzugriff klar benennen, was nicht gespeichert wurde.
- Keine anderen Änderungen überschreiben; Ref bei direktem API-Commit mit erwarteter Head-SHA aktualisieren.

## Daten und Secrets
- Keine Zugangsdaten, API-Schlüssel, Passwörter, Tokens oder personenbezogenen Flugbuchdaten committen.
- Synthetische Testdaten verwenden; echte Exporte, Fotos und lokale Datenbanken außerhalb des Repository halten.
- KI-Schlüssel ausschließlich serverseitig; Beispielkonfiguration enthält nur Platzhalter.
- Benutzerzugriff serverseitig durchsetzen und mit mindestens zwei Benutzern negativ testen.
- Vereinsflieger-Anmeldung und MoFlight-Identität separat behandeln.

## Verifikation
- Für Codeänderungen passende aussagekräftige Tests und erforderliche Checks ausführen.
- Reine Dokumentationsänderungen auf Links, Konsistenz und unbelegte Erfolgsaussagen prüfen.
- Testergebnisse mit Umgebung, Commit und Grenzen dokumentieren; ungetestete Plattformen explizit benennen.
- Bei Auth: fremde Benutzer-ID, abgelaufene Sitzung und Wiederherstellung prüfen.
- Bei Sync: Offline-Neustart, Konflikt, Retry und Benutzerwechsel prüfen.
- Bei RAG: Quellenbelege, unbeantwortbare Fragen, Zugriffstrennung und gemessene Kosten prüfen.

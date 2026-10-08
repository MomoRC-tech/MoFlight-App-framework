# MoFlight-App-framework

Gemeinsame Plattform für Android und iOS als Basis einer SPL-Lern-App und einer digitalen Segelflugbuch-App.

## Ziele und Stand

- SPL-Lernen: Prüfungsfragen, KI-Tutor mit RAG und persönlicher Lernfortschritt.
- Flugbuch: eigene Vereinsflieger.de-Flüge, Handschrifterkennung und Flugbuchführung.
- Gemeinsame Basis: Benutzeridentität, Einstellungen, persistente Daten, Offline-Betrieb und serverseitige KI-Schnittstellen.

Stand 2026-10-08: Projektgrundlage und PoC-Aufgaben angelegt. Es gibt noch keine implementierte App, keine getestete Integration und keine verbindlich ausgewählte Technologie. Die nachstehenden Komponenten sind Zielbild und Kandidaten, keine nachgewiesenen Funktionen.

Diese README ist die zentrale Projektdokumentation. Code, ADRs und reproduzierbare Testnachweise werden von hier verlinkt. GitHub ist die verbindliche versionierte Quelle; Chats unterstützen Diskussion und Planung.

## Arbeitsweise

Änderungen direkt auf `main` mit nachvollziehbaren Commits; keine Pull Requests (Vorgabe von Manuel, 2026-10-08). Aufgaben und offene Entscheidungen werden über Issues verfolgt. Produktentscheidungen und verbindliche Architekturfreigaben übernimmt Manuel.

Kleine ausführbare Machbarkeitstests gehen der vollständigen Produktentwicklung voraus. Dokumentation wird gemeinsam mit Code aktualisiert. Tests werden nur als bestanden bezeichnet, wenn sie ausgeführt wurden; nicht verfügbare Geräte und externe Zugänge bleiben explizit offen.

## Zielstruktur

| Pfad | Zweck |
| --- | --- |
| `apps/spl-learning/` | Eigenständige Lern-App |
| `apps/flight-logbook/` | Eigenständige Flugbuch-App |
| `packages/` | Gemeinsame Module, erst bei tatsächlicher Nutzung anlegen |
| `backend/` | Serverfunktionen und Datenbankschema |
| `pocs/` | Kleine ausführbare Machbarkeitstests |
| `docs/adr/` | Architekturentscheidungen |
| `tests/` | Übergreifende Integrations- und E2E-Tests |
| `.github/workflows/` | Automatisierte Prüfungen |

Leere Verzeichnisse werden nicht vorsorglich angelegt. Monorepo und modularer Aufbau sind organisatorisches Ziel; einzelne Packages entstehen bei konkretem Bedarf.

## Vorläufiges Architekturziel

Die mobilen Apps speichern für Offline-Funktionen ausgewählte benutzerspezifische Daten lokal. Ein gemeinsames Backend authentifiziert Benutzer und autorisiert jeden Zugriff auf deren persistente Daten. Vereinsflieger ist eine separate externe Identität; eine MoFlight-Anmeldung gewährt keinen Vereinsflieger-Zugriff.

KI-Anfragen laufen über das Backend. API-Schlüssel liegen niemals in der App. RAG sucht zunächst passende freigegebene Quellstellen und erzeugt daraus eine belegte Antwort. Öffentliche Lerninhalte und private Benutzer-/Flugdaten erhalten getrennte Zugriffsregeln.

Kandidaten zur Bewertung: Expo/React Native oder Flutter für mobile Apps; Supabase für Auth/Datenbank und serverseitige Funktionen; ein kleiner RAG-Ansatz im gemeinsamen Backend. Noch keine Auswahl, Anbieterzusage oder Aussage über aktuelle Preise.

## Erste Machbarkeitstests

| Aufgabe | Zu prüfendes Ergebnis | Status |
| --- | --- | --- |
| [Architekturvergleich #5](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/5) | Begründete Kandidatenwahl und Freigabe | Offen |
| [Auth und Benutzerdaten #1](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/1) | Login, Wiederherstellung, Persistenz und Trennung zweier Benutzer | Offen |
| [Vereinsflieger #2](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/2) | Verifizierter eigener Datenzugriff; CSV als Fallback | Offen |
| [RAG und KI-API #3](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/3) | Nachvollziehbare Quellen, Antwortqualität, Latenz und Kosten | Offen |
| [Offline und Sync #4](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/4) | Neustart, Retry, Konflikte und Benutzerwechsel | Offen |

Die Issue-Links oben beziehen sich auf das Repository; direkte Übersicht: https://github.com/MomoRC-tech/MoFlight-App-framework/issues

Reihenfolge:
1. Technologievergleich und Architekturfreigabe.
2. Auth/Benutzerdaten als erster vollständiger Durchstich: Anmeldung → eigener Datensatz → Neustart → erneutes Lesen → verweigerter Fremdzugriff.
3. Vereinsflieger-Zugriffsweg und RAG in kleinen getrennten Tests prüfen.
4. Lokale Persistenz und Synchronisierung mit dem erprobten Benutzer-/Datenmodell ergänzen.

Vereinsflieger-Recherche kann vor der Technologieauswahl beginnen. Ein echter Login benötigt einen geeigneten Zugang. Externe Testdurchläufe benötigen eigene Dienstkonfiguration; API-Kosten werden vor Ausführung begrenzt. Es wurden keine kostenpflichtigen Ressourcen eingerichtet.

## Prüfnachweise und offene Risiken

Je PoC dokumentieren: getesteten Commit, Datum, Umgebung/Gerät, Testdaten, Aufruf, Erwartung, Ergebnis, Fehler, Latenz, Kosten und Go/No-Go. Nur synthetische Daten versionieren. Android und iOS getrennt kennzeichnen.

Offen:
- Vereinsflieger-Schnittstelle, Berechtigungen und zulässiger Zugriffsweg.
- Lizenzierte bzw. freigegebene Lernquellen für RAG.
- Mobile-Technologie und Backend-Auswahl.
- Konfliktregel bei Synchronisierung.
- Testgeräte/-umgebungen für beide Plattformen.
- Handschrifterkennung als späterer eigenständiger PoC; bereits bei der Architektur serverseitige KI-Anbindung berücksichtigen.

Bisherige Prüfung: Repository-Stand gelesen, bestehende Issues geprüft. Noch keine Laufzeit-, Geräte- oder Integrationstests ausgeführt.

## Architekturentscheidungen

- [ADR 0001: Projektablage und direkter GitHub-Workflow](docs/adr/0001-project-workflow.md)
- [ADR-Vorlage](docs/adr/template.md)
- [Arbeitsregeln für Coding-Agenten](AGENTS.md)

# ADR 0001: Projektablage und direkter GitHub-Workflow

- Datum: 2026-10-08
- Status: Angenommen – explizite Projektanweisungen und Benutzerentscheidung
- Entscheider: Manuel Singer

## Kontext
Zwei Apps sollen eine gemeinsame Plattform verwenden. Diskussionen in Chats allein bilden keine dauerhafte technische Projektbasis.

## Entscheidung
GitHub-Repository MomoRC-tech/MoFlight-App-framework ist die verbindliche versionierte Quelle. README.md enthält die zentrale Projektdokumentation und verweist auf technische Nachweise und ADRs. Issues beschreiben Aufgaben und offene Entscheidungen.

Änderungen werden direkt auf main mit nachvollziehbaren Commits gespeichert. Manuel hat ausdrücklich auf Pull Requests verzichtet. Diese Vorgabe ersetzt die frühere Empfehlung von Feature-Branches und PRs.

Die geplante Ablage verwendet ein Monorepo; Verzeichnisse werden erst bei konkretem Inhalt angelegt. Diese Entscheidung legt keine App-/Backend-Technologie fest.

## Konsequenzen
Dokumentation und Code müssen gemeinsam gepflegt werden. Direkte Änderungen benötigen passende Prüfungen und dürfen fremde Änderungen nicht überschreiben. Zugangsdaten und personenbezogene Flugbuchdaten bleiben außerhalb der Versionsverwaltung. Produkt- und Architekturfreigaben verbleiben bei Manuel.

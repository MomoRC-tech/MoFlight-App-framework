# MoFlight feature scope

Date: 2026-10-10. Source: Manuel's explicit project notes in the chat "Access project chats on Android". Status: confirmed product direction; future feature details and implementation choices remain open.

## Multiple flight-related features

MoFlight will support multiple flight-related features or sub-apps. The logbook helper is the current starting feature. An SPL learning/tutor feature and gliding weather forecasts are possible additions, not commitments to implement now. The platform must remain extensible beyond these examples.

Whether these features ship within one app, as separate apps, or in a combination remains a product decision for Manuel. Earlier documentation describing exactly two independently released apps is a planning baseline superseded by this broader direction; it does not settle packaging. Existing modularity, Android/iOS, offline and cost constraints remain applicable. This clarification does not authorize additional infrastructure or an immediate weather integration.

## Logbooks for additional aircraft classes

Initial support focuses on gliding pilots. Later support must include ultralight aircraft and powered airplanes. These have different logbook formats/designs, so the gliding presentation must not be treated as universal.

Future design should distinguish shared flight/source information from class-specific logbook fields, layouts and rules. This is a design consideration for the later architecture decision, not an approved schema change. Preserve source information needed for later mapping; do not guess unknown aircraft classes or silently apply gliding rules to other classes.

Before enabling each new format, obtain representative non-personal examples, confirm required fields and meaning with Manuel, and verify class-specific mapping, calculations, paper placement and offline persistence using synthetic fixtures. Detailed layouts and rules have not yet been provided or validated.

## Multiple logbooks per pilot — confirmed 2026-10-10

One signed-in pilot may own several independent logbooks at the same time: for example a gliding book, an ultralight book and a powered-airplane book. One account must not imply one book or one format. Aircraft class and format must not serve as the identity of a book: allow more than one book using the same format, including a successor paper volume.

The pilot selects a clearly named book before photographing pages, reconciling entries, preparing instructions or confirming copying. Each book retains its own pages, numbering, carryovers/totals, confirmed paper position, photos, writing snapshots, book-specific decisions and pending work. Switching books, including offline, must restore that book's state without transferring another book's progress. Paper confirmation in one book must never mark another book as written.

Shared source-flight evidence can be reused within the authorized pilot account, while book membership and paper-entry state remain separate. Unknown aircraft classification or ambiguous book assignment requires review; retrieval must not silently send all flights into the active book. Queries state the selected book or an explicit combined scope; combined queries count distinct flight identities rather than duplicate book links.

Extensibility is a requirement from the first production data model: adding a format should add its fields, validation/calculation rules and presentation mapping behind a stable contract, rather than rewriting account access, provider retrieval or paper-state persistence. Do not encode a single gliding layout in those shared services. Specific format rules still require evidence and acceptance before activation.

[ADR 0007](../adr/0007-multiple-logbooks-and-formats.md) proposes the technical boundaries and required proof. The current synthetic lab is not yet a production implementation of multiple pilot-owned logbooks.

Research follow-up, 2026-10-11: [German/EASA requirements and printed-format comparison](logbook-requirements-and-routing.md) supports remembered class-to-book assignments after initial setup, separate or combined books, distinct TMG evidence and explicit successor-volume routing. Published layouts are inspected candidates, not activated profiles. The pilot's actual format/edition and any ambiguous licence/book assignment must be resolved before automatic paper placement.

## Common Vereinsflieger source: intent and assumption

Vereinsflieger.de is intended as the common data source for gliding, ultralight and powered-aircraft logbooks. Manuel believes the provider stores flight data similarly and may not differentiate aircraft classes in its storage. Record this as an unverified assumption, not an established provider contract.

Verify actual permitted source/export fields, aircraft classification, field semantics and completeness across the relevant aircraft classes before implementing a common mapping. A shared provider does not prove identical fields, uniform rules, or absence of classification. Retain the existing separation of MoFlight identity and provider authorization.

## Traceability and verification

The central [README](../../README.md) records R02 (multi-feature scope and open packaging), R03 (shared identity) and R14 (later aircraft-class logbooks) and R15 (multiple independent books per pilot). [Existing logbook stories](flight-logbook-user-stories.md) remain the initial gliding workflow. Follow-up packaging decisions, additional logbook formats and provider-schema validation are tracked in [Issue #11](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/11).

Documentation-only capture: repository status, existing Issues, README, agent rules, current product stories and Phase 1 reconciliation were reviewed. Relative links and diff consistency are checked before commit. No live provider-schema verification, class-specific acceptance, runtime test or architecture approval is claimed.

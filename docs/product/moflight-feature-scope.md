# MoFlight feature scope

Date: 2026-10-10. Source: Manuel's explicit project notes in the chat "Access project chats on Android". Status: confirmed product direction; future feature details and implementation choices remain open.

## Multiple flight-related features

MoFlight will support multiple flight-related features or sub-apps. The logbook helper is the current starting feature. An SPL learning/tutor feature and gliding weather forecasts are possible additions, not commitments to implement now. The platform must remain extensible beyond these examples.

Whether these features ship within one app, as separate apps, or in a combination remains a product decision for Manuel. Earlier documentation describing exactly two independently released apps is a planning baseline superseded by this broader direction; it does not settle packaging. Existing modularity, Android/iOS, offline and cost constraints remain applicable. This clarification does not authorize additional infrastructure or an immediate weather integration.

## Logbooks for additional aircraft classes

Initial support focuses on gliding pilots. Later support must include ultralight aircraft and powered airplanes. These have different logbook formats/designs, so the gliding presentation must not be treated as universal.

Future design should distinguish shared flight/source information from class-specific logbook fields, layouts and rules. This is a design consideration for the later architecture decision, not an approved schema change. Preserve source information needed for later mapping; do not guess unknown aircraft classes or silently apply gliding rules to other classes.

Before enabling each new format, obtain representative non-personal examples, confirm required fields and meaning with Manuel, and verify class-specific mapping, calculations, paper placement and offline persistence using synthetic fixtures. Detailed layouts and rules have not yet been provided or validated.

## Common Vereinsflieger source: intent and assumption

Vereinsflieger.de is intended as the common data source for gliding, ultralight and powered-aircraft logbooks. Manuel believes the provider stores flight data similarly and may not differentiate aircraft classes in its storage. Record this as an unverified assumption, not an established provider contract.

Verify actual permitted source/export fields, aircraft classification, field semantics and completeness across the relevant aircraft classes before implementing a common mapping. A shared provider does not prove identical fields, uniform rules, or absence of classification. Retain the existing separation of MoFlight identity and provider authorization.

## Traceability and verification

The central [README](../../README.md) records R02 (multi-feature scope and open packaging), R03 (shared identity) and R14 (later aircraft-class logbooks). [Existing logbook stories](flight-logbook-user-stories.md) remain the initial gliding workflow. Follow-up packaging decisions, additional logbook formats and provider-schema validation are tracked in [Issue #11](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/11).

Documentation-only capture: repository status, existing Issues, README, agent rules, current product stories and Phase 1 reconciliation were reviewed. Relative links and diff consistency are checked before commit. No live provider-schema verification, class-specific acceptance, runtime test or architecture approval is claimed.

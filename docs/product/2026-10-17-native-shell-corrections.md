# Native shell corrections — 17 October 2026

Manuel reported testing the phone demo and authorized implementation of the previously listed UI corrections. Phone model was subsequently reported as Google Pixel 6a (quick test); Android version and individual checklist outcomes were not supplied; this is a user-reported test, not a recorded all-pass physical acceptance.

This is an M1 UI/application-contract correction under existing Issues #5, #1, #8 and documentation reconciliation #12. It supersedes the earlier four-tab shell requirement for current native navigation while preserving the approved composite as the card/color reference. No alternate design selection or new service is required.

## Deliverable and dependencies

- Compact, shared, fixed photographic header using the approved dark Thermik logo unchanged. Profile/user button at the far right; content scrolls below it.
- Profile & settings entry with real local display-name persistence, existing book/data/tools/credits actions and accurate unavailable account state. This restores the product entry point; cloud identity, goals/medical integration and localization remain separately gated.
- Five persistent destinations: Übersicht, Flüge, Flugbuch, Verein, AI. Flüge is searchable saved history; Flugbuch exposes selected book, paper status and the existing reconciliation/writing tool. Preserve book isolation and remembered selection.
- A recognizable aircraft silhouette replaces the navigation line mark. No icon or UI dependency is introduced.
- Two small segmented rings show aircraft shares for flight count and known flight time. Counts/minutes remain deterministic; unknown/empty states do not imply zero, invented progress or prior-year coverage. Preserve whole-card seasonal navigation and accessibility descriptions.

Dependencies are the existing selected-book SQLite contracts, approved logo assets, current paper workflow and native tooling. The only additive SQLite table is explicitly lab-local UI profile metadata, owner-checked and library-scoped, outside flight/book backups; no production account/schema approval is implied.

## Acceptance

TypeScript/mobile and relevant persistence/calculation tests; Android/iOS exports; committed-source Android Release build; native five-tab/header/profile/book/filter/offline checks; screenshots at 360, 390 and 412 dp, plus bounded/tablet layouts at 600 and 840 dp and enlarged text/keyboard checks. Record actual source/build/device and failures. A fresh ARM64 demo may be handed off after checks, with physical retest pending. No iOS runtime or live-service claim.

Documentation must reconcile current navigation and header/settings decisions with preserved historical snapshots. Existing Issues are reused; no duplicates or milestone/service closure is implied.

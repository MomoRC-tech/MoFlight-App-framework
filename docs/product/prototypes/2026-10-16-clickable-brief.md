# Clickable layout checkpoint — task brief

Milestone: M1 discovery; no application implementation. Authorized by Manuel on 2026-10-16 after design v0.19. Existing Issues #5, #9 and #11 checked open on this date; no duplicate Issue created.

Deliverable: a local, German, clickable phone-layout draft based on [app-design.md](../app-design.md), with synthetic data. Include Start, Flüge/list/details, Papierbuch/book selection and a bounded Verein overview so all four destinations work. Use the selected navy/cyan Stitch styling, paired comparison bars, compact Start indicator rows and account-independent fictional fixtures.

Dependencies: v0.19 decisions, confirmed journey map, existing approved branding and navigation decisions. Keep Expo/native application source unchanged; no new providers, services, schemas, auth, real retrieval, handwriting or printing. A guided paper entry can demonstrate its first confirmation view only, clearly bounded. Exact unfinished design choices remain proposals.

Review acceptance: usable taps between destinations, list/detail/back, Start missing-data drill-down and book switching; a representative filter sheet; book state stays distinct in the displayed fixtures; Start has no book selector/details. Inspect the default and narrow phone layout for clipping and navigation clearance. Record actual browser observations and limits. Do not run the app test suite or create tests for this reversible design-only draft, per Manuel's request for no unnecessary tests.

Detailed evidence: [layout-checkpoint report](../../verification/2026-10-16-clickable-layout.md). The preview does not complete M1, establish native acceptance or select every proposed field/state.

## Start revision v0.21

Same M1 discovery scope. Manuel requested three presentation changes: replace the separate freshness banner with status icon plus last-success date/time in the header sync button; lighten the scroll canvas relative to cards; remove the redundant Start comparison-period sentence. Deliver revised source and standalone phone export while retaining v0.19. Dependencies: these explicit review corrections and prior navigation/data rules. Acceptance check: inspect narrow Start/detail header and the two sync example appearances; ensure a failed sample attempt preserves last-success time. No automatic freshness threshold, provider operation, app suite or new automated tests.

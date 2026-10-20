# Real saved-flight statistics — 20 October 2026

The home dashboard now reads the selected account's committed own-flight library through the existing serialized, short-lived, read-only reader. It does not use synthetic book flights for flight counts, reported minutes, date-year groups, aircraft-registration groups, latest dated flight, coverage or freshness. The selected owner/store and account references are rechecked by the shared reader before publication. No provider retrieval, write, book assignment, paper adjustment, aircraft class, role credit, clock-derived duration, cost, AI or new persistence was added.

The deterministic projection counts each current flight ID once. It groups only parsed source dates by their recorded calendar year and preserves the exact recorded registration string; missing/blank aircraft is grouped as “Kennzeichen unbekannt.” Reported provider duration is summed only when its source parser state is `known`; unknown, invalid and conflicting durations do not become zero-duration flights. Unknown dates are counted outside year groups. Saved coverage windows/gaps and last retrieval use only committed `savedRetrievals`; list rows and latest flight dates do not establish coverage or freshness.

## Verification

- `pnpm typecheck` — passed.
- Focused Node tests: `real-flight-statistics`, `own-flight-reader`, and `own-flight-lifecycle` — **13 passed**. They cover distinct counts, exact year/registration grouping, unknown/malformed/conflicting facts, selected-owner read boundaries, offline local read path, late-result/lifecycle handling, and serialization/cleanup.
- `pnpm lint` — passed.
- `git diff --check` — passed.

These are host checks against synthetic facts and reader ports. No live provider read, device/emulator visual review, native rebuild, second-account/device test, or broader release acceptance was run for this UI integration. Offline support reuses the existing stored-library reader and lifecycle boundary; actual native acceptance remains separate. Private provider stores/sessions and previously recorded native evidence were not opened or modified in this package.

## Bounded season rings and drill-down follow-up

Authorized under #9/#20 on 20 October after the completed #38/#39 checkpoint. The package restores the two existing aircraft-share rings using saved selected-account flights. A single first-flight-ID projection supplies season counts, known reported minutes, unknown/conflicting counts and exact-registration aircraft shares. It rejects negative, fractional, nonfinite or unsafe known minutes and unsafe totals. Empty/unknown-only time reads —; recorded zero remains 0:00. Existing font-scale/long-value fallbacks retain readable metrics. No duration is derived from clocks, no book assignment is needed, and no provider/storage behavior changes.

The shell passes a fresh year-filter request on each dashboard activation. Ordinary Flüge consumes it after its account snapshot is available, clears unrelated filters/detail/position, and retains subsequent user edits on normal tab/detail return. A consumed request is not replayed after an owner/store switch. The latest-flight card explicitly requests all years; a native press event cannot be mistaken for a year.

Regression assessment: extend the projection, shell and existing component harnesses; add a Dashboard component contract for real-data ring inputs and unknown/empty/enlarged-text states. Reuse existing reader/lifecycle and season-angle tests. These synthetic checks protect observable values/navigation, without claiming native geometry or actual provider acceptance. Native follow-up and final check results are recorded below when available.

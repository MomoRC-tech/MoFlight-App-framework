# Capture field proof and default-view compatibility

Date: 2026-10-11, Europe/Berlin. Tracking: [#2](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/2), discovery [#10](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/10), multiple books [#11](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/11). Follows the [capture-first requirements](../product/vereinsflieger-capture-requirements.md).

## Browser observations

Read-only Chrome inspection reused Manuel's signed-in personal flightbook. No flight, training, duty, booking or saved column configuration was edited. Period filters were temporarily inspected and returned to the original recent-20/Pilot view. Personal rows, references, names, registrations, billing information and signed navigation URLs are not included here or in fixtures.

- The current default view has an unlabeled action column and `Datum`, `Lfz.`, `Pilot`, `Begleiter/FI`, `Start`, `Landung`, `Flugzeit`, `Startort`, `Landeort`, `Landungen`, `S.-Art`, `Flugart`, `Abr.`, `Verein`, `Bemerkung`. Optional `PIC`, model and aircraft class are absent. Existing native reader requirements would reject this configuration.
- Two reads, separated by detail navigation and a reload, returned identical headers, 20 row-value arrays and their candidate flight-link references. This demonstrates repeat stability for this account/view at this time, not globally stable flight IDs, canonical idempotency or lifetime coverage.
- One own flight detail showed the matching list reference, date, places, start/landing values and reported minutes. It expanded launch method, flight type and operational mode. The inspected detail did not provide explicit PIC or complete role-time information. Its billing section is irrelevant to capture and must not be ingested by a future detail adapter.
- Configuration again offered PIC/dual/FI durations, additional companions/SIC, off/on-block, block durations, motor readings/duration, explicit aircraft type, duplicate status and training association. These were not enabled; offered fields do not prove populated values or verified semantics. Dedicated day/night landing or IFR duration fields were not offered in this inspected configuration; this does not prove they are absent everywhere.
- The `Die letzten 7 Tage`/Pilot view returned three rows, matching its displayed record count. The precise inclusive date interpretation and provider caps are still unverified.
- `Heute, (11.10.2026)`/Pilot returned a zero-flight summary and an explicit no-matching-data message in the authenticated page. This is observed scoped UI emptiness; the native decoder still refuses empty captures and must not promote an empty payload to verified history coverage.

## Lab implementation

[probe.ts](../../apps/platform-lab/src/vereinsflieger/probe.ts) now uses five table anchors: `Datum`, `Lfz.`, `Start`, `Landung`, `Flugzeit`. These identify the supported bounded view; they do not assert complete logbook data. Optional crew/model/class fields no longer prevent default-view raw capture. All returned columns remain aligned and preserved. The origin/document/nonce checks, row/value bounds, unique nonempty headers, 20-row limit and refusal of empty/error/malformed captures remain in force.

[fields.ts](../../apps/platform-lab/src/vereinsflieger/fields.ts) adds a pure experimental inspection function for the observed personal-list labels. It distinguishes a column not captured from a present blank and a present source value, preserving raw bytes and labels. A source value can still be unresolved or invalid; this function does not validate numeric meaning, infer roles/class, allocate credit or calculate totals. Unknown extra columns remain in the original snapshot. Engine meter units are not guessed from Motorzeit. Duplicate flags remain text until their representation is verified.

The inspection function is exercised by synthetic tests; it is not wired into canonical persistence or a new app presentation. Existing snapshots/database payloads are unchanged, so this slice adds no migration, account/book schema or output profile. Source context remains unverified; captures still live in the isolated lab database and cannot be imported into the canonical logbook.

## Checks and limits

Windows local checks on the working tree containing this change:

- Strict TypeScript: passed.
- All 32 mobile/contract tests: passed. Four new cases cover the observed default labels through the standalone injected reader; reordered optional columns with separate time/crew/duplicate values; absent versus blank versus zero/unresolved text; and ambiguous headers/lost positions. Existing source-origin, nonce, size and failure checks remain passing.
- Android/iOS Hermes JavaScript bundle export: passed (674 Android / 673 iOS modules). This checks bundling, not native runtime.
- Documentation destinations and whitespace: checked before publication.

No new APK compilation, Android/iOS execution or native storage/restart test is claimed. Desktop repeated reads do not exercise the native bridge. Complete history/paging, stable account/club binding, export bytes, aircraft joins and actual UL/powered-flight mappings remain open. Corrected-duration, overnight and multi-landing behavior above uses synthetic evidence where covered; it is not a newly observed live cross-class test.

Next slice: establish a bounded explicit period/participation contract, page completion and scoped identity; then verify optional-field/detail/catalogue enrichment without changing saved user preferences. Show the concrete mapping and multi-book identity/migration proof before canonical live import. Output formats and final visual polish remain later work.

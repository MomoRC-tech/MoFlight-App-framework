# Clickable layout checkpoint — 2026-10-16

Scope: M1 design discovery, authorized by Manuel after design v0.19. [Task brief](../product/prototypes/2026-10-16-clickable-brief.md); [preview source](../product/prototypes/2026-10-16-clickable-v019.html); [current design description](../product/app-design.md). Base commit: `025e36d`; the resulting commit is identified by this report's Git history. Windows/PowerShell, Python 3.12 visualization wrapper, Codex in-app Chromium browser. Existing Issues #5/#9/#11 checked open; no new Issue or external message.

## Deliverable and source boundaries

One isolated interactive phone mockup, not Expo/application code. Start uses the selected navy/cyan outlined style, paired comparison bars, overall available-history totals, a shallow paper indicator row and compact club content. Flüge has day-grouped rows, local search/filtering and one-page details. Papierbuch offers two gliding volumes and one TMG example with distinct status; only it contains the selector/last-entry information. Verein and profile are bounded examples. Guided paper checking stops at the remembered-entry question; no photo recognition, review/template, data writes or provider calls occur. Refresh displays a clearly labeled scripted failure example and retains fixtures.

Approved logo reused as a 96-pixel embedded thumbnail; original branding assets unchanged. Inter is requested with system fallback, not fetched or asserted as the actual rendered font. The fragment is about 56 KB, below the visualization size limit. All names, flights, book data and club content are fictional.

Fixtures: 2026 contains 6 flights, 272 known minutes (4 h 32 min), 2 unknown durations; same-period 2025 contains 5 flights, 240 minutes. Available saved totals: 11 flights, 512 known minutes (8 h 32 min), explicitly an example history excerpt. Count comparison: +1 / +20%; time comparison is labeled +32 known minutes rather than implying complete totals. Each metric uses its own shared two-year scale. Book fixtures are distinct: Segelflug Band 2 (#142, 3 pending, 2 review cases), completed Segelflug Band 1 (#500, 0 pending), and TMG Band 1 (confirmed #18, separately assumed #19, 0 pending).

## Actual browser observations

- Inspected default Start, then tightened the initially over-tall flying summary into two adjacent comparison groups. The overview remains scrollable; fitting every section without scrolling was not promised.
- Clicked Start count comparison → Auswertung → a contributing flight → Flugdetails. Aircraft, times/route, people/roles and source sections appeared; header Back remained.
- Start “2 Flüge prüfen” opened the two unknown-duration flights with visible row markers. Found and fixed an initial zero-time aggregate when all selected durations were unknown; rechecked the corrected view showing an em dash / “Flugzeit unbekannt.” Unknown individual durations remain an em dash with an explicit missing-time marker.
- Opened the filter sheet. Initial form-submit Apply did not close it in the wrapper; changed to an explicit local Apply action. Rechecked D-0412 filtering: sheet closed and returned 3 flights, 138 known minutes, 1 unknown duration. Search with an unmatched term showed the empty state. No provider query is implied.
- Final revision: typed `LS4` sequentially; all characters remained in the focused field and produced 3 flights / 2 h 18 min known. Fixed echoed host-state updates so they do not unnecessarily rebuild the focused search. Opened a result and used Back: search/result scope remained. Clicked refresh: scripted failure appeared and those 3 rows remained.
- Papierbuch opened Segelflug Band 2; switched to Segelflug Band 1 and observed #500 / zero pending, then TMG and observed independent confirmed/assumed progress. “Buchstand prüfen” hid bottom navigation and displayed assumed #19 clearly labeled, with confirmed #18 separately visible. Guided buttons only show the preview boundary and do not modify book state.
- Verein destination displayed both sample own duties, the Putzdienst partner and work-hour progress, plus a bounded flight-operation-duty excerpt. Club symbols retain stable positions with explicit labels. Start's next-duty sample indicates 2 duties through 25 October rather than implying it is the only assignment.
- Inspected narrow 320-pixel browser viewport: phone frame measured 288 pixels, scrollWidth 286 inside its border; content clientWidth and scrollWidth both 276. Navigation width 286 and its bottom stayed inside the frame. Inspected the narrow Start, missing-data list and guided-book view; no horizontal overflow was observed in the measured Start. Larger text, all detail combinations and native touch behavior are not accepted by this check. Temporary viewport override reset afterward.

## Review and limits

Independent GPT-6 Luna source review checked v0.19 alignment and fixture consistency. Clarified cross-book sample badge scope in accessible text, multiple upcoming duties, and confirmed-versus-assumed anchors. The remembered-entry check intentionally offers the assumed latest entry for confirmation, consistent with the revised journey; it does not call it confirmed evidence.

Documentation/source checks: 14 local file/image destinations in the design description, task brief and this report exist. Scoped whitespace checks passed. Final browser error-log snapshot was empty. The phone-width override was reset and the inspected draft returned to Start.

Only relevant browser interaction/layout inspection and documentation/source review were performed. No app test suite, new automated tests, native build/emulator reset, hosted CI, paid service or live provider access. This does not establish production book/account isolation, persistence/restart, actual retrieval/recovery, accessibility conformance or Android/iOS acceptance. Filter/search fields, exact state semantics, some spacing and the bounded Verein/profile arrangements remain proposals. M1 and detailed application contracts remain open. Existing unrelated product-index and ecosystem-research edits remain outside this work.

## Standalone export for remote phone review

At Manuel's request, generated [one standalone HTML file](../product/prototypes/exports/moflight-design-v0.19.html) using the skill renderer and embedded its three pinned runtime scripts; original fragment unchanged. Size 965,720 bytes; zero external script tags remain. Logo is a data URL. Export has the renderer's local state fallback and no required backend/development server. Readme/helper record the asset provenance and regeneration steps.

Opened the generated export through a temporary loopback server, observed Start and successfully clicked Papierbuch. No actual phone download, local file viewer, offline-device trial or app test suite was performed. File delivery through the remote chat client is separate from the verified export contents.

## Start review revision v0.21

Base commit `781f7dd`; user corrections and acceptance scope recorded in the task brief. Created new fragment/export so v0.19 remains unchanged. Removed the separate data-status band and its grid row; the sync control now contains the short last-success date/time and distinct amber refresh / cyan circle-check appearances. Current mode is a deliberate click-demo transition (18:00 → 18:05), with an explicit example toast and no live request. The profile's failed-refresh demo returns to update-suggested appearance and preserves the last successful 18:05 timestamp. No age threshold, coverage-completeness rule or cross-device sync behavior was inferred.

Changed the scrolling canvas to proposed lighter navy `#1c3249` around dark cards; fixed header/navigation remain dark. Removed “01.01.–16.10. · Saisonvergleich” from Start. Existing same-period year legend remains; precise interval stays in analytics details.

Focused browser inspection of the regenerated standalone file at 320-pixel viewport: inspected Start and both sync appearances. Header clientWidth/scrollWidth both 286 pixels. Initial detail screenshot exposed the final letter of Flugdetails wrapping; reduced the narrow sync width/title type slightly and rechecked: title stayed on one line (20.69 pixels high), title right 142.84 versus control left 163, no horizontal overflow. Observed failed-demo accessible label and timestamp preserving 18:05. Returned to Start and reset viewport. Export 968,093 bytes; zero external script tags after embedding.

Independent GPT-6 Luna design review advised keeping status scope/last-success semantics explicit, no invented age policy, and preserving comparison semantics. Exact colors/icon styling remain reviewable. No app test suite, new tests, native builds or real phone/provider trial; unchanged journeys were not broadly retested. Existing unrelated product-index/research changes preserved.

## Micro Bento preference v0.22

Base commit `83e72fe`. Manuel supplied a standalone Micro Bento HTML reference and said “I like that more.” Read the attachment and decoded its embedded frame for source inspection, then opened the unchanged attachment through a temporary loopback server and inspected the rendered Start screenshot/accessibility tree. Only the Micro Bento layout is rendered; unused alternate functions are source residue, not separate selected designs.

Archived the original unchanged at [source.html](../product/design-sources/2026-10-16-micro-bento/source.html), with provenance notes. Observed compact two-column season tiles, softer indigo palette, prominent paper CTA and compact club section. Recorded preferred direction in the design description, README and roadmap, keeping content/behavior mismatches open. Independent GPT-6 Luna read-only review identified omitted totals, replacement of bars with numeric comparisons, changed paper-card density and popup-only sync timestamp as points to clarify.

No source redesign, app tests, native/device/provider operations or blanket layout/feature approval. The remote attachment directory and unrelated product-index/research changes remain outside the commit; only the named archival copy is included. Source hash comparison verifies the archive matches the supplied file.

## Full Micro Bento Start adoption v0.23

Base commit `fcb9aa8`. Manuel selected option 1: whole Start arrangement, including numeric comparisons and the larger paper card. The task brief records M1 scope/dependencies/review criteria. Created a new fragment/export, preserving original sources and snapshots. Start now has the reference's 2×2 season tiles, numeric count delta, known duration/missing-time notice, LS4 share/review tiles, prominent paper overview action, compact duty/date/work-ring/club shortcuts and softer indigo filled surfaces. The earlier Start total strip and comparison bars are removed; all-year saved totals remain available via the existing flight period filter. Detailed comparisons are still reachable. Palette carries to existing pages; no adaptive light-mode implementation is claimed.

Multi-book overview route is preserved. “Für deine Papierbücher” and “Papierbücher öffnen” clarify that the card sums sample book entries (3+0+0) and book review cases (2+0+0), then opens the last-used book with selector. No per-book selector/status appears on Start. Visible sync date/time remains beside its state icon per the prior explicit requirement. The supplied reference's placeholder-only sheets were not copied over the existing journeys.

Focused local browser review: inspected default and 320-pixel Start screenshots; no horizontal clipping observed. Clicked new paper CTA → overview; selected the first gliding volume and observed its independent #500 / zero pending status. Clicked Start review tile → two unknown-duration flights (unknown, not zero); clicked count tile → six current-year flights plus prior-year comparison/detail. Existing fixtures unchanged. Reset viewport and returned to Start. No app test suite/new automated tests/native builds/provider calls; earlier unchanged journeys were not broadly retested.

Independent GPT-6 Luna source review confirmed arrangement and cross-book fixture sums, while noting comparison-baseline placement and guided-anchor semantics. The selected reference intentionally places detailed baseline/time comparisons behind tiles; same-period calculations remain. Guided TMG confirmation still offers the clearly labeled assumed latest entry with last confirmed paper entry separately shown, consistent with the accepted journey; no evidence mutation occurs. Set the preview root language to German and corrected the profile's palette label. Exact production aggregation/state contracts remain open. Unrelated index/research/remote-attachment edits preserved.

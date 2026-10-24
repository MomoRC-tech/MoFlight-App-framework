# Compact flight cards and fixed filters — proposal, 24 October 2026

Requested by Manuel; tracked in [#70](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/70). **Selected for implementation:** Manuel preferred C, requested the denser refinement, then explicitly authorized all screen changes including that layout. This document preserves the proposal sequence; the [current implementation contract](../compact-cockpit.md#compact-flights-screen--approved-24-october-2026) and [verification report](../../../verification/2026-10-24-flight-list.md) own current behavior and acceptance. M1 presentation over the existing M3 saved-flight list.

## Card choice

The [inline comparison source](2026-10-24-flight-cards.html) contains three layouts using identical fictional paired/confirmed-solo examples. All three are visible together in a vertical comparison labelled A/B/C, following Manuel's report that only one proposal was visible in the original carousel. It is a conversation visualization fragment, not a standalone application screen. Manuel's explicit choice remains necessary. Optional design controls show longer names and larger text without changing source data.

| Variant | Layout | Tradeoff |
| --- | --- | --- |
| Inline crew | Date/start and duration; aircraft; compact labelled pilot/Begleiter line; route. | Lowest text overhead with clear crew roles. Long crew names wrap. |
| Crew columns | Same facts, with separate Pilot/Begleiter columns and labels above names. | Clearest crew distinction, slightly taller. Columns stack at larger text. |
| Duration rail | Date/aircraft/route on the left, larger duration on the right, crew across the bottom. | Strong duration scanning and a distinct layout; less horizontal room for route text. |

Proposed common geometry: 10–12 logical-unit padding, radius 12, 6–8 between cards, readable system text, whole-card detail target. These are proposed values, not selected native measurements. Keep all supplied given names plus family-name initial; full source names remain in details. Extra companions wrap without silently disappearing. Unknown/conflicting crew stays explicit. A missing Begleiter field alone does not establish Solo: implementation must first verify that the saved source establishes a single-pilot flight. The paired and solo records in the comparison are synthetic known states.

## C density refinement

Manuel preferred C's duration emphasis but considered its remaining whitespace excessive. The subsequently approved [refined C preview](2026-10-24-flight-cards-dense-c.html) uses three lines beside the duration: date/registration/model; labelled pilot/Begleiter or Solo; departure time/route. Short dates use `dd.mm.yy`; full dates remain in accessible labels/details. Padding becomes 7 vertical / 10 horizontal, line gaps 2, inter-card gap 5, radius 10. Both internal separators and the repeated chevron are removed. The entire card remains the detail target. Existing text sizes are retained; long content and larger text wrap rather than clipping or enforcing a fixed card height. The later explicit implementation instruction selects this refinement and the screen recommendation below.

## Screen recommendation

- Default to all flights saved for the selected account, newest first under the existing ordering rules. Do not imply complete provider history.
- Pin a compact filter area below the existing toolbar; only the flight list scrolls. Use content-sized period/aircraft selectors, search and an additional-filter action. Reuse current year/date/registration/text semantics; do not introduce person-role aggregation.
- Show actual active values as removable teal chips, with text/check or close marks and a filter-count badge. Always show active values even when the filter chooser is closed. Put a small Reset action alongside them; omit it when no filter is active. Allow wrapping rather than hiding active filters offscreen.
- Replace the current summary paragraphs with one compact result line: filtered count / saved count and known reported duration. When needed, show the unknown-duration count concisely. Put coverage, retrieval age and explanation of reported time behind the existing information disclosure; keep real recovery/error states visible and actionable.
- Size selection fields/buttons to their contents. Expand only the specific date/search editor when requested; avoid permanent full-width action blocks. Back from details preserves filters and list position. Keep account changes, offline access, zero/unknown duration and source evidence unchanged.

## Verification and remaining work

This package changes proposal documentation only. Node 24.18.0 script syntax and the bundled visualization renderer passed. A headless local Microsoft Edge preview checked all three carousel choices at 320/360/390/736 CSS-pixel frame widths, with no card/surface horizontal overflow or browser script errors; a 320-width longer-name/larger-text stress check also passed. The Inline crew preview was visually inspected. Detailed reproducible local diagnostics are ignored in `local-data/flight-card-proposal/verification.json` and `verify.cjs`; they contain only synthetic examples. Git whitespace and local proposal links were checked.

No application tests, builds, APK or device trials were run or needed for this proposal. Browser dimensions are CSS pixels and do not establish native logical dp, font-scale behavior, accessibility or source-data acceptance. After selection and implementation approval, extend relevant list/filter regressions and inspect the affected native screen under the repository workflow.

**Visibility correction:** repeated the same browser width/name/text checks with all three layouts visible at once; no horizontal overflow or script errors. Visually inspected the complete A/B/C comparison. This changes preview presentation only; card choice remains pending.

**C density refinement verification:** Node syntax, renderer and local headless Edge checks passed at 320/360/390/736 CSS-pixel frame widths, with no horizontal overflow or script errors. Both synthetic cards measured 72.9 CSS px high, compared with 112 px for the original C examples (about 35% shorter); text sizes were preserved. Longer names plus larger text at 320 also passed. The refined preview was visually inspected. Local diagnostics: `local-data/flight-card-proposal/dense-c-verification.json` and `verify-dense-c.cjs` (ignored). These are browser measurements, not native acceptance; no application tests/builds/devices were run.

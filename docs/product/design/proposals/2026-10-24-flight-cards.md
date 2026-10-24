# Compact flight cards and fixed filters — proposal, 24 October 2026

Requested by Manuel; tracked in [#70](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/70). **Proposal only: card choice and application implementation are pending.** M1 presentation over the existing M3 saved-flight list. The [Compact Cockpit contract](../compact-cockpit.md) supplies the visual foundation.

## Card choice

The [inline comparison source](2026-10-24-flight-cards.html) contains three layouts using identical fictional paired/confirmed-solo examples. It is a conversation visualization fragment, not a standalone application screen. The carousel selects a preview only; Manuel's explicit choice remains necessary. Optional design controls show longer names and larger text without changing source data.

| Variant | Layout | Tradeoff |
| --- | --- | --- |
| Inline crew — recommended | Date/start and duration; aircraft; compact labelled pilot/Begleiter line; route. | Lowest text overhead with clear crew roles. Long crew names wrap. |
| Crew columns | Same facts, with separate Pilot/Begleiter columns and labels above names. | Clearest crew distinction, slightly taller. Columns stack at larger text. |
| Duration rail | Date/aircraft/route on the left, larger duration on the right, crew across the bottom. | Strong duration scanning and a distinct layout; less horizontal room for route text. |

Proposed common geometry: 10–12 logical-unit padding, radius 12, 6–8 between cards, readable system text, whole-card detail target. These are proposed values, not selected native measurements. Keep all supplied given names plus family-name initial; full source names remain in details. Extra companions wrap without silently disappearing. Unknown/conflicting crew stays explicit. A missing Begleiter field alone does not establish Solo: implementation must first verify that the saved source establishes a single-pilot flight. The paired and solo records in the comparison are synthetic known states.

## Screen recommendation

- Default to all flights saved for the selected account, newest first under the existing ordering rules. Do not imply complete provider history.
- Pin a compact filter area below the existing toolbar; only the flight list scrolls. Use content-sized period/aircraft selectors, search and an additional-filter action. Reuse current year/date/registration/text semantics; do not introduce person-role aggregation.
- Show actual active values as removable teal chips, with text/check or close marks and a filter-count badge. Always show active values even when the filter chooser is closed. Put a small Reset action alongside them; omit it when no filter is active. Allow wrapping rather than hiding active filters offscreen.
- Replace the current summary paragraphs with one compact result line: filtered count / saved count and known reported duration. When needed, show the unknown-duration count concisely. Put coverage, retrieval age and explanation of reported time behind the existing information disclosure; keep real recovery/error states visible and actionable.
- Size selection fields/buttons to their contents. Expand only the specific date/search editor when requested; avoid permanent full-width action blocks. Back from details preserves filters and list position. Keep account changes, offline access, zero/unknown duration and source evidence unchanged.

## Verification and remaining work

This package changes proposal documentation only. Node 24.18.0 script syntax and the bundled visualization renderer passed. A headless local Microsoft Edge preview checked all three carousel choices at 320/360/390/736 CSS-pixel frame widths, with no card/surface horizontal overflow or browser script errors; a 320-width longer-name/larger-text stress check also passed. The Inline crew preview was visually inspected. Detailed reproducible local diagnostics are ignored in `local-data/flight-card-proposal/verification.json` and `verify.cjs`; they contain only synthetic examples. Git whitespace and local proposal links were checked.

No application tests, builds, APK or device trials were run or needed for this proposal. Browser dimensions are CSS pixels and do not establish native logical dp, font-scale behavior, accessibility or source-data acceptance. After selection and implementation approval, extend relevant list/filter regressions and inspect the affected native screen under the repository workflow.

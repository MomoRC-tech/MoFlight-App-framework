# Versioned design description — 2026-10-16

Scope: M1 documentation and unchanged source archive, following Manuel's request for a versioned design description and one-question-at-a-time review. Base commit: `2cfff5a`; the resulting documentation commit is discoverable through this file's Git history. Environment: Windows, PowerShell, local repository on main.

Deliverable: [app-design.md](../product/app-design.md), with version/status labels, earlier confirmed decisions, observed Stitch content and an ordered review queue. README and roadmap now point to that review record. This does not approve the entire design, change milestone order or authorize application implementation.

Checks performed:

- Read README, roadmap, latest design decision record and applicable ADR baseline during this review session.
- Checked GitHub Issues #5, #9 and #11: all open; reused references without creating or changing Issues.
- Inspected the supplied ZIP contents, PNG, HTML and generated design text. The ZIP has one Start screen; links in the HTML do not provide connected destination screens.
- Copied the three original source files unchanged; SHA-256 hashes matched each extracted original.
- Checked all six local file/image links in the two new design/source documents: targets exist.
- Ran `git diff --check`: passed for the tracked documentation changes. The subsequent staged check reported four pre-existing trailing spaces in the archived Stitch DESIGN.md; those were retained to preserve the original source. Authored documentation passed the scoped whitespace check.
- Preserved the existing product-index change and untracked ecosystem-research document outside this task.
- Independent GPT-6 Luna read-only review checked local destinations and consistency with prior decisions; clarified that club-summary placement remains open.

Limits: no application source changes, native build/device trials, provider calls, prototype interaction tests or accessibility acceptance. The inspected PNG is supplied design evidence, not a native rendering. Open choices remain unconfirmed until Manuel answers.

## Version 0.2 decision follow-up

Manuel answered “1. keep” to the first question, selecting close retention of the Stitch look. Updated the active description and added a supersession notice to the earlier design review: navy/cyan, glowing accents and outlined/nested cards replace the earlier filled-card/default-outline restriction. Screen content, detailed tokens and behavior remain under review. Reviewed the diff for that scope and ran the staged whitespace check; no application tests are needed for this documentation-only decision. Unrelated product-index/research changes remain excluded.

## Version 0.3 decision follow-up

Manuel answered “2.” to Start density: compact flying, paper-book and club summaries with details available by tapping. Recorded the selection without assuming exact fields, fixed heights or a no-scroll requirement; preserved flying-first/paper-second order and access to full information. Reviewed the documentation diff against the offered option and ran the staged whitespace check. No new links or application changes; no native tests required. Unrelated product-index/research edits remain excluded.

## Version 0.4 decision follow-up

Manuel answered “1.” to header actions: Refresh retrieves Vereinsflieger data and Profile opens account/settings, replacing the starter's new-flight header action. Preserved current page title and contextual Back; detailed retrieval scope and guided-step behavior remain open. Reviewed this documentation-only decision against the offered option and ran the staged whitespace check. No new links, application changes or native tests. Unrelated product-index/research edits remain excluded.

## Version 0.5 decision follow-up

Manuel answered “2.” to overall totals: keep the flight-count/known-time totals strip on Start above the yearly summary. Recorded the selection while preserving the stated available-history coverage requirement; exact labels and the separate circular-ring question remain open. Reviewed this documentation-only diff against the offered option and ran the staged whitespace check. No new links, application changes or native tests. Unrelated product-index/research edits remain excluded.

## Version 0.6 comparison design

Manuel clarified the diagram's meaning: actual current-year values prominent, prior-year values less prominent. Recorded this as confirmed while keeping ring/bar geometry proposed. Created an isolated two-variant preview in the selected navy/cyan style with synthetic 2026/2025 same-period counts and known durations. Preserved earlier navigation, compact Start and overall-totals choices.

Independent GPT-6 Luna design review recommended bars for comparison accuracy and cautioned against interpreting rings as goals. Both variants label periods/values; rings also show scale ceilings. Preview arithmetic: 34 versus 28 flights gives +6 / +21% rounded; 42h18m versus 33h33m gives +8h45m / +26% rounded. Within each metric the two years share the same scale.

Local browser preview: visually inspected both variants and used Next variant to verify switching. Initial inspection exposed carousel controls overlapping the taller bars footer; increased shared stage height and rechecked. Read back the fragment and checked its local documentation link and staged whitespace. Native gestures, real data, narrow viewport, larger text and screen readers are not accepted by this trial. No application code or provider calls; unrelated product-index/research edits remain excluded.

## Version 0.7 decision follow-up

Manuel answered “bars” after reviewing the two proposals. Recorded paired comparison bars as selected and rings as the historical unselected alternative. Preserved current-year emphasis, quieter prior-year values, separate count/time scales and same-period comparison. Preview source remains unchanged as a record of the reviewed alternatives. Reviewed the documentation diff for contradictory selection claims and ran the staged whitespace check. No new links, application changes or native tests. Unrelated product-index/research edits remain excluded.

## Version 0.8 decision follow-up

Manuel answered “1.” to Papierbuch summary content: book name, last entry, pending count and Buchstand prüfen. Recorded only that content selection; exact fields/count semantics, book switching and unknown/empty states remain open. Preserved the existing account/book scope and confirmed-versus-assumed progress boundary. Reviewed the documentation diff against the offered option and ran the staged whitespace check. No new links, application changes or native tests. Unrelated product-index/research edits remain excluded.

## Version 0.9 decision follow-up

Manuel requested a symbol summary row indicating changes or upcoming items, in response to the additional-club-content presentation question. Recorded one compact row instead of separate preview rows without mandating numeric counts or removing previously selected duties/work-hour content. Kept exact icon grouping, inactive appearance, change/read semantics and horizon open. Preserved the distinction between checked-empty and unknown/stale information. Reviewed the documentation diff for scope and unsupported approval claims; staged whitespace check passed. No new links, application changes or native tests. Unrelated product-index/research edits remain excluded.

## Version 0.10 decision follow-up

Manuel answered “1.” to inactive symbols: retain all symbols in stable positions, subdued when inactive and highlighted for relevant changes/upcoming items. Updated the current description and review queue; retained open grouping/state semantics and distinguished unknown/stale information from a checked inactive result. Reviewed the diff against the offered option and ran the staged whitespace check. No new links, application changes or native tests. Unrelated product-index/research edits remain excluded.

## Version 0.11 decision follow-up

Manuel answered “1.” to Flüge tab default: flight list first, compact statistics above searchable/filterable flights. Recorded this presentation choice and preserved the offered direct metric-detail route from Start charts. Kept list layout, period/order and search/query semantics open; no search implementation or provider access is claimed. Reviewed the diff against the offered option and ran the staged whitespace check. No new links, application changes or native tests. Unrelated product-index/research edits remain excluded.

## Version 0.12 decision follow-up

Manuel answered “1.” to flight-list layout: compact rows within boxed day groups, tap a row for flight details, retaining Stitch styling. Recorded the selection without fixing row fields, sorting or source date/time interpretation. Reviewed the diff against the offered option and ran the staged whitespace check. No new links, application changes or native tests. Unrelated product-index/research edits remain excluded.

## Version 0.13 decision follow-up

Manuel answered “ok for now” to proposed row fields. Recorded aircraft registration/model and duration as the main line, departure time/airfield/own role as secondary, and other-pilot information in details. Explicitly retained the provisional/revisitable character and open formatting/source semantics. Reviewed the diff against the proposal and ran the staged whitespace check. No new links, application changes or native tests. Unrelated product-index/research edits remain excluded.

## Version 0.14 decision follow-up

Manuel answered “1.” to missing-data warnings: compact Start notice plus affected-row markers, with the notice opening those flights. Recorded the selection while keeping unknown durations unknown and issue/count/resolution semantics open. No provider-evidence editing or inferred missing values were approved. Reviewed the diff against the offered option and ran the staged whitespace check. No new links, application changes or native tests. Unrelated product-index/research edits remain excluded.

## Version 0.15 decision follow-up

Manuel answered “1.” to flight-detail arrangement: a single scrollable page with boxed aircraft, times/route, people/roles and source sections, retaining header Back. Recorded the layout selection without fixing exact fields, evidence states or editing behavior. Reviewed the diff against the offered option and ran the staged whitespace check. No new links, application changes or native tests. Unrelated product-index/research edits remain excluded.

## Version 0.16 decision follow-up

Manuel selected the last-used book overview with a top book selector and reiterated multiple paper books per pilot/user. Recorded the navigation selection and existing independent-book boundary, including successive same-format volumes. Reviewed ADR 0007's proposed status; this product selection does not approve its production schema. Exact selector/fallback and switching during unfinished guided work remain open. Reviewed the diff against the user's clarification and ran the staged whitespace check. No new links, application changes or isolation/native tests. Unrelated product-index/research edits remain excluded.

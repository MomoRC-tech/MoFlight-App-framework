# Remembered logbook state, decisions and flight-history queries

Scope clarification (Manuel, 2026-10-10): a pilot may own multiple independent logbooks. All paper state, photos, decisions, carryovers and writing snapshots identify the target book; queries display their book/combined scope. Shared provider evidence does not imply shared paper progress. See [multi-book requirements](moflight-feature-scope.md#multiple-logbooks-per-pilot--confirmed-2026-10-10) and [proposed ADR 0007](../adr/0007-multiple-logbooks-and-formats.md).

Current implementation/acceptance status is maintained in the [roadmap feature register](../project-plan.md#2-feature-register) and [selected requirement/scenario acceptance map](../project-plan.md#21-acceptance-traceability). Historical baseline: the [8 October synthetic host slice](../verification/2026-10-08-host-local-slice.md) passed 20 host checks. That dated result does not describe today's full implementation or prove native/cloud/live/handwriting acceptance; prepared observations and CSV remain synthetic.

Date: 2026-10-08, with subsequent user revisions recorded below. Source: Manuel's feature addition in this conversation. Status: requested behavior with bounded synthetic implementations; the conceptual contract below does not claim production integration or completed acceptance. Extends [FL-13–FL-16](flight-logbook-user-stories.md). Tracking: #1/#2/#4/#7/#8 and [#9](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/9).

## Opening the app and continuing work

Product revision (Manuel, 2026-10-13): the [consolidated catch-up journey](2026-10-13-journey-information-map.md#catch-up-on-the-paper-logbook) replaces mandatory completion confirmation with assumed progress after preparing a reviewed template, followed by the next-session last-entry check. Existing synthetic lab confirmation behavior predates this revision; no implementation is claimed.

The pilot opens the app and sees the remembered state without uploading a new photo or retrieving flights first:

- Last confirmed paper entries, page/row/number, carryovers and date/evidence; separately identified assumed entries/position linked to a reviewed writing-snapshot revision.
- Last successful Vereinsflieger export/retrieval, its coverage and source-data revision. Show a more recent failed attempt separately; it does not replace the usable snapshot.
- Flights awaiting paper entry, prepared writing templates, incomplete comparisons and pending questions.
- Decisions previously made, including ignored findings and field overrides, with a way to review/reverse them.

Persist across sessions/devices, with an account-scoped local copy for offline use. Show freshness, evidence and pending sync. Preserve **last known confirmed state** separately from **assumed written progress**; neither proves unobserved later changes to the physical book.

A new photo is not mandatory on every launch. Trigger selected by Manuel, 18 October 2026: opening the final writing instructions or successfully saving/sharing the printable sheet records the selected entries/revision as assumed written, without a completion prompt. Previewing and adjusting the batch leaves progress unchanged. Preserve the previous confirmed anchor/evidence. Reopening/downloading/printing a snapshot must not repeatedly advance assumptions. Cancellation/retry and partial/no-writing recovery remain open under [#7](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/7). Almost always start catch-up by showing the remembered last entry with number/details for confirmation; if it differs, let the user enter the actual last written flight number for the named book (Manuel, 18 October 2026). Resolve it within that book's entries/snapshots; request targeted details or a photo for an unknown/ambiguous number or missing required continuation values. Retain the user-reported stopping point, its author/date and scope separately from assumed progress and photo observations. A number alone does not confirm every field or all earlier entries. A later conflicting photo preserves previous assumptions and confirmed evidence for review.

Continuation uses a checked anchor; assumed position is a proposal for that check, not confirmed evidence. Request new evidence when it changed or is ambiguous. Preserve holes/missing entries individually: confirming the last entry does not automatically prove every earlier source flight was written. Unsupported historical coverage remains unknown.

## Persistent information

Conceptual records extend the session model; exact physical schema is not selected:

| Information | Required semantics |
| --- | --- |
| Source history and snapshots | Original imported rows/IDs, normalized versions, successful coverage/time basis/retrieval time, excluded rows; unchanged import does not add duplicate flights. |
| Flight identity | Stable account-scoped domain ID with namespaced external references and paper-row links; import row position is not a durable identity. |
| Paper entries/status | Versioned page/row/number, actual confirmed values/evidence, carryovers, known-flight links and gaps; separate revision-linked assumed entries/position and pending candidates. |
| Reusable decisions | Finding/flight/field identity, action, chosen value, reason, scope, relevant evidence fingerprint, author/time, applicability, revocation/supersession. |
| Accepted paper totals adjustment | Account/book/anchor and affected time-total category; confirmed paper carryover, provider comparison/coverage/revision and signed minute difference when known; evidence/author/date and adjustment revision/status. Reuse across future templates/offline/backup without changing provider facts/statistics; reference the applied adjustment revision from each writing snapshot. |
| Effective flight history | Latest verified Vereinsflieger facts for provider-backed flights; separately evidenced paper-only flights/decisions where applicable. Local overrides cannot replace authoritative provider facts (Manuel, 18 October 2026); retain provenance and prior revisions. |
| Aircraft and people references | Aircraft instance and model separately; namespaced person references/crew roles and explicit alias mappings; no global public directory of other users. |
| Query result | Validated filter, selected data view, contributing flight IDs/revision, coverage/freshness, unresolved counts and deterministic aggregate. Caching is optional and must follow data revisions. |

Source data, effective resolved facts and confirmed paper entries are separate views. Manuel selected Vereinsflieger as authoritative for provider-backed flight facts on 18 October 2026, including its recorded duration rather than clock subtraction. This supersedes local/paper overrides of those facts; retained legacy decisions are not deleted. Actual paper evidence/continuation and paper-only flights remain separate. Later verified source corrections update the app flight and affected aggregates, with an orange change indication on the flight ([#30](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/30)); unchanged retrieval does not create a new indication. Clear the marker only after explicit acknowledgement of the change; opening details/restart alone does not clear it (Manuel, 18 October 2026). This means seen, not corrected. Flight details show each changed field's previous → current value from retained source revisions (Manuel, 18 October 2026); opening the comparison does not acknowledge it. Manuel selected all changes since the last acknowledgement on 18 October 2026: compare last acknowledged → current, so 40 → 42 → 45 displays 40 → 45 while intermediate source revisions are preserved. Exact revision/concurrent-update and cross-device acknowledgement details remain open. Preserve old source revisions and frozen writing snapshots; source updates do not silently correct physical paper. User-confirmed paper-only flights may join the effective history, but require identity/deduplication and enough known fields for the requested query. Their original paper provenance remains visible.

## Remembering and reusing decisions

UI discovery clarification (Manuel, 2026-10-13): the photo-based catch-up journey should provide both discrepancies in existing written entries and instructions for pending entries. Users may choose to leave past discrepancies unchanged; provide a browsable list of open and acknowledged exceptions with their decisions. Acknowledgment does not mean correction. Recognition of book type from the last written page is desired behavior, with uncertainty surfaced; it is not proven photo-analysis capability. See the [journey and exception-register concept](user-journey-ui-discovery.md#two-results-and-a-persistent-exception-register).

Use narrow flight/field/finding-specific scope by default. Broad rules require an explicit scope/preview; “ignore this mismatch” never becomes “ignore all future mismatches.”

| Decision | Effect |
| --- | --- |
| Acknowledge/ignore a finding | Avoid repeating the same unchanged question. Retain finding/reason and an ignored badge; source/effective flight values do not change merely because a warning was ignored. |
| Accept source or paper value | Preserve both original values and the decision. Verified Vereinsflieger facts remain authoritative for provider-backed flights; a paper choice records paper state/interpretation, not a replacement provider fact. |
| Override a field | Permit scoped corrections of paper observations or other non-provider evidence without rewriting originals or claiming the paper changed. Do not override authoritative provider facts; prefer correction in Vereinsflieger by contacting the club administrator or responsible personnel (Manuel, 18 October 2026). Preserve existing decisions and recompute only applicable views. |
| Accept a paper-total discrepancy | Persist the accepted carryover and book/category-scoped adjustment; future paper totals add new provider flight durations to that carryover. Apply the adjustment once; a later carryover already containing it must not receive it again. Preserve provider statistics, evidence and adjustment history; unknown comparisons remain unknown. See [accepted rule](2026-10-13-journey-information-map.md#paper-total-adjustments). |
| Resolve a duplicate | Link variants or explicitly exclude a candidate from the effective count/export. Keep source rows; acknowledgment alone is not deduplication. |
| Confirm entries were copied | Advance paper status only for specified entries/revision and record user confirmation. No inferred completion of other entries. |
| Open final writing instructions or successfully save/share the printable sheet | Record selected entries/revision as assumed written; preview/adjustment alone leaves progress unchanged. Retain confirmed anchor and historical gaps. Later last-entry check/photo reconciles the assumption without requiring a post-writing completion prompt. |
| Reverse a decision | Append revocation/supersession, restore the applicable view and reopen affected findings. Previous exports retain their original data/decision versions. |

Reuse decisions across runs only when their flight/finding identity, scope and relevant evidence still match. A new retrieval timestamp alone does not invalidate an unchanged decision. Changed source values, changed photo evidence relevant to the decision, identity ambiguity or changed rule meaning require targeted review. Preserve the old decision, mark it stale, and never silently apply it to a changed flight. Unrelated findings need no repeated approval.

Concurrent device changes compare versions. Keep both conflicting decisions/status edits until resolved. Offline decisions are durable pending edits; reconnection does not move them to another account. Deletion/export policies include decision history and paper/source links.

## Flight-history questions

The pilot can ask in ordinary language or use equivalent filters. Initial supported intents are bounded to counts and latest-flight queries, with aircraft, person, role and date filters. Unsupported wording asks a clarification or opens filters; do not invent an answer. Natural-language input does not require a paid LLM: deterministic interpretation/filter selection can establish the first trial, while richer AI interpretation remains optional and separately budgeted.

| Example | Resolved query and evidence |
| --- | --- |
| “How many flights have I made in D-EX01?” | Count distinct own-flight IDs for that aircraft instance; show dates/rows supporting the count. |
| “How many flights on an ASK 21 this year?” | Filter model across all matching aircraft and an explicit displayed calendar range/timezone; do not confuse model with one registration. |
| “When did I last fly with Person A?” | Resolve the person identity, filter their crew participation, then select the latest known flight date/time. Show that flight and recorded role. |
| “How often have I flown with Person A as instructor?” | Count distinct flights with the selected person/role; join multiplicity must not inflate counts. |
| “Which of those flights are already in my paper book?” | Use recorded links/evidence; distinguish confirmed, assumed written and unresolved entries. An assumption never enters the confirmed-paper view as verified. |

Use stable external person/aircraft IDs where supplied; otherwise use scoped references and user-resolved aliases. Names are display labels, not sufficient identity keys. Two people with the same name or two possible aircraft matches require selection. Do not infer that a named crew member was an instructor unless the role is established. Missing person/role/aircraft data stays unknown.

Proposed default query view: **effective reconciled own-flight history**, with optional original-source and confirmed-paper views. Show the basis visibly. A date range can be adjusted; “ever” is only answered within available coverage unless lifetime completeness is established. Results must report last successful import/time coverage and whether local edits or unresolved decisions affect the answer. Offline results are labeled cached; a later import/correction invalidates affected cached aggregates.

Count distinct sufficiently established flight identities, not import rows, pages, landings or crew records. Unresolved duplicate identity or fields that affect membership are reported as pending/unknown rather than included in a falsely exact count. Ignoring an aircraft warning leaves the data unchanged; a paper-observation correction cannot change the authoritative provider aircraft or its flight count. Latest means the maximum established flight date/time, not the last imported row. With incomplete dates/coverage, describe “latest recorded matching flight in available data.” Zero matches does not imply the person/aircraft was never flown.

The query response includes the resolved entity/filter, dataset revision/basis, count or latest recorded flight, contributing records, data-through/coverage, unresolved/excluded counts and freshness. The pilot can inspect the supporting list and change filters or data basis.

## Technical boundary

Use deterministic parameterized queries/aggregations against the shared flight model. Cloud reads must derive account identity from the session and preserve RLS/ownership; local SQLite queries use the selected account database and equivalent semantics. Test cross-user aggregate results as well as individual-row access. Allowlisted query intents produce typed parameters; an optional LLM may interpret wording but cannot execute arbitrary SQL, modify records or estimate counts. No new vector service or RAG pipeline is required for exact flight statistics.

Store original evidence plus revisioned decisions and materialize/read an effective view as needed. This is a product data contract, not a requirement to implement a general event-sourcing platform. Recompute/version aggregates after imports, overrides, duplicate resolution, paper confirmations and reversals. Preserve source/photo/export revisions needed to explain a previous result. Implement these queries against actual local SQLite first; test cloud authorization independently very early, then integrate remote data/sync after gates ([revised plan](../architecture/local-first-implementation-plan.md)). Supabase Cloud Free remains the first cloud mode; AI usage stays separately gated.

## Required acceptance evidence

- Restore last paper/source state, decisions and pending entries after restart, offline launch and second-device sync.
- Reimport identical evidence: no repeated ignored question and no changed count. Change a relevant field: old decision becomes stale and prompts review.
- Preview/adjust a reviewed template without changing progress. Open final instructions or successfully save/share the printable sheet: create a revision-linked assumption for selected entries while confirmed evidence remains unchanged. Reopening/printing does not duplicate advancement. Next-session last-entry confirmation, entry of the actual last written book number or a needed photo corrects partial/unwritten batches while retaining prior versions and historical gaps. Test account/book isolation; cancellation/retry acceptance still needs its exact contract.
- Apply a verified provider correction: current provider-backed queries use the authoritative updated fact and recorded duration; local/paper overrides cannot replace it. Identical refreshes add no new change indication. Preserve old revisions/exports and paper evidence; verify each changed field's previous/current values against retained source revisions, without treating unknown as zero or silently omitting cleared values. Test explicit acknowledgement, opening/restart without clearing, and correction guidance referring to club administrators/personnel. Acknowledgement must not alter provider facts or paper status; exact revision/concurrent-update and cross-device details remain contract work.
- Accept paper 100:00 against provider 99:40 at the same anchor/category; persist +0:20. A new 0:30 gives paper 100:30 and provider 100:10. Repeat preparation, page rollover, export/reopen, later confirmed carryover and offline backup/restore must not double-apply it. Cover negative differences, unknown comparison, independent categories/books/accounts, reversal/supersession and changed-evidence review; frozen snapshots retain their original adjustment revision. These are required future checks, not executed tests.
- With repeated import rows/crew links, two aircraft of the same model and two same-name people, counts and latest dates match explicit synthetic expected lists.
- Query limited or stale/offline history and unknown/ambiguous fields: visible coverage and uncertainty, no unsupported lifetime or zero-match claims.
- Another account cannot obtain counts, last-flight dates, people references or supporting rows; account switch cannot reuse the prior account's query cache.

These are required checks, not executed tests. No schema, app, query parser, AI requests or live imports have been implemented for this feature addition.

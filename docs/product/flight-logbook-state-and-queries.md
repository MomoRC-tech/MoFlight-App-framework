# Remembered logbook state, decisions and flight-history queries

Current implementation note: the [bounded synthetic host slice](../../apps/platform-lab/README.md) has [20 passing host checks](../verification/2026-10-08-host-local-slice.md). This does not pass native/cloud/live/handwriting acceptance; the requirements below remain the full target. Prepared observations and CSV are explicitly synthetic.

Date: 2026-10-08. Source: Manuel's feature addition in this conversation. Status: requested product behavior; data model, query contract and acceptance below are proposed and unimplemented. Extends [FL-13–FL-16](flight-logbook-user-stories.md). Tracking: #1/#2/#4/#7/#8 and [#9](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/9).

## Opening the app and continuing work

The pilot opens the app and sees the remembered state without uploading a new photo or retrieving flights first:

- Last confirmed paper entries, page/row/number, carryovers and confirmation date/evidence.
- Last successful Vereinsflieger export/retrieval, its coverage and source-data revision. Show a more recent failed attempt separately; it does not replace the usable snapshot.
- Flights awaiting paper entry, prepared writing templates, incomplete comparisons and pending questions.
- Decisions previously made, including ignored findings and field overrides, with a way to review/reverse them.

Persist across sessions/devices, with an account-scoped local copy for offline use. Show freshness, evidence and pending sync. The stored state is the **last known confirmed state**, not proof that the physical book has not changed since.

A new photo can update that state but is not mandatory on every launch. The pilot may explicitly confirm that identified rows from a particular writing-snapshot revision were copied, or confirm/correct the remembered book state manually. Retain which entries/page rows were confirmed, by whom/when and whether the evidence is a photo or a user assertion. Template display/generation/download alone never updates paper status. A later conflicting photo creates a finding rather than silently overwriting prior confirmation.

Continuation uses the remembered confirmed anchor if the pilot confirms it still represents the paper book. Request new evidence when it changed or is ambiguous. Preserve holes/missing entries individually: “last written number” does not automatically prove every earlier source flight was written. Unsupported historical coverage remains unknown.

## Persistent information

Conceptual records extend the session model; exact physical schema is not selected:

| Information | Required semantics |
| --- | --- |
| Source history and snapshots | Original imported rows/IDs, normalized versions, successful coverage/time basis/retrieval time, excluded rows; unchanged import does not add duplicate flights. |
| Flight identity | Stable account-scoped domain ID with namespaced external references and paper-row links; import row position is not a durable identity. |
| Paper entries/status | Versioned page/row/number, actual written values, evidence/confirmation, carryovers, association to known flights and gaps; separate pending writing candidates. |
| Reusable decisions | Finding/flight/field identity, action, chosen value, reason, scope, relevant evidence fingerprint, author/time, applicability, revocation/supersession. |
| Effective flight history | Derived user-resolved view over preserved source versions and explicit overrides; provenance points to the source and applicable decisions. |
| Aircraft and people references | Aircraft instance and model separately; namespaced person references/crew roles and explicit alias mappings; no global public directory of other users. |
| Query result | Validated filter, selected data view, contributing flight IDs/revision, coverage/freshness, unresolved counts and deterministic aggregate. Caching is optional and must follow data revisions. |

Source data, effective resolved facts and confirmed paper entries are separate views. The app cannot globally declare one authoritative for all purposes. User-confirmed paper-only flights may join the effective history, but require identity/deduplication and enough known fields for the requested query. Their original paper provenance remains visible.

## Remembering and reusing decisions

Use narrow flight/field/finding-specific scope by default. Broad rules require an explicit scope/preview; “ignore this mismatch” never becomes “ignore all future mismatches.”

| Decision | Effect |
| --- | --- |
| Acknowledge/ignore a finding | Avoid repeating the same unchanged question. Retain finding/reason and an ignored badge; source/effective flight values do not change merely because a warning was ignored. |
| Accept source or paper value | Record the chosen field value and its origin, and apply it in the effective reconciliation where allowed. Preserve both original values. |
| Override a field | Store a user correction without rewriting the original source or pretending the paper was already corrected. Recompute affected totals, candidates and query results. |
| Resolve a duplicate | Link variants or explicitly exclude a candidate from the effective count/export. Keep source rows; acknowledgment alone is not deduplication. |
| Confirm entries were copied | Advance paper status only for specified entries/revision and record user confirmation. No inferred completion of other entries. |
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
| “Which of those flights are already in my paper book?” | Use recorded paper-entry links/confirmations, identifying unresolved or unverified entries separately. |

Use stable external person/aircraft IDs where supplied; otherwise use scoped references and user-resolved aliases. Names are display labels, not sufficient identity keys. Two people with the same name or two possible aircraft matches require selection. Do not infer that a named crew member was an instructor unless the role is established. Missing person/role/aircraft data stays unknown.

Proposed default query view: **effective reconciled own-flight history**, with optional original-source and confirmed-paper views. Show the basis visibly. A date range can be adjusted; “ever” is only answered within available coverage unless lifetime completeness is established. Results must report last successful import/time coverage and whether local edits or unresolved decisions affect the answer. Offline results are labeled cached; a later import/correction invalidates affected cached aggregates.

Count distinct sufficiently established flight identities, not import rows, pages, landings or crew records. Unresolved duplicate identity or fields that affect membership are reported as pending/unknown rather than included in a falsely exact count. Ignoring an aircraft warning leaves the data unchanged; overriding the aircraft changes the effective-aircraft query, not the original-source query. Latest means the maximum established flight date/time, not the last imported row. With incomplete dates/coverage, describe “latest recorded matching flight in available data.” Zero matches does not imply the person/aircraft was never flown.

The query response includes the resolved entity/filter, dataset revision/basis, count or latest recorded flight, contributing records, data-through/coverage, unresolved/excluded counts and freshness. The pilot can inspect the supporting list and change filters or data basis.

## Technical boundary

Use deterministic parameterized queries/aggregations against the shared flight model. Cloud reads must derive account identity from the session and preserve RLS/ownership; local SQLite queries use the selected account database and equivalent semantics. Test cross-user aggregate results as well as individual-row access. Allowlisted query intents produce typed parameters; an optional LLM may interpret wording but cannot execute arbitrary SQL, modify records or estimate counts. No new vector service or RAG pipeline is required for exact flight statistics.

Store original evidence plus revisioned decisions and materialize/read an effective view as needed. This is a product data contract, not a requirement to implement a general event-sourcing platform. Recompute/version aggregates after imports, overrides, duplicate resolution, paper confirmations and reversals. Preserve source/photo/export revisions needed to explain a previous result. Implement these queries against actual local SQLite first; test cloud authorization independently very early, then integrate remote data/sync after gates ([revised plan](../architecture/local-first-implementation-plan.md)). Supabase Cloud Free remains the first cloud mode; AI usage stays separately gated.

## Required acceptance evidence

- Restore last paper/source state, decisions and pending entries after restart, offline launch and second-device sync.
- Reimport identical evidence: no repeated ignored question and no changed count. Change a relevant field: old decision becomes stale and prompts review.
- Prepare or display a writing template: paper status unchanged. Confirm only selected entries copied: exactly those entries advance; conflicting photo/manual edit retains both versions for review.
- Revoke a field override: new queries/exports reflect the current view, while an old export remains reproducible.
- With repeated import rows/crew links, two aircraft of the same model and two same-name people, counts and latest dates match explicit synthetic expected lists.
- Query limited or stale/offline history and unknown/ambiguous fields: visible coverage and uncertainty, no unsupported lifetime or zero-match claims.
- Another account cannot obtain counts, last-flight dates, people references or supporting rows; account switch cannot reuse the prior account's query cache.

These are required checks, not executed tests. No schema, app, query parser, AI requests or live imports have been implemented for this feature addition.

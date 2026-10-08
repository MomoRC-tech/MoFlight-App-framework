# Flight logbook: user stories and continuation workflow

Date: 2026-10-08. Product owner: Manuel Singer. Status: core workflow requested by Manuel; detailed acceptance and technical mapping are proposed, not implemented.

## Purpose and sources

As a gliding pilot, I want to photograph my latest written paper-logbook page, retrieve my own Vereinsflieger flights, resolve relevant inconsistencies and receive a writing-template PDF, so that I can update my paper logbook without manually comparing and calculating everything.

This is the canonical product specification for this workflow. [README](../../README.md) is the project entry point; Issues track implementation, and ADRs record technical decisions. Current user decisions take precedence over prototype behavior. Requirements must remain traceable to a story and an acceptance scenario.

Sources captured on 2026-10-08:

- Manuel's request: start with Supabase Cloud Free; local Supabase is a possible later migration. Upload the latest paper-page photo, retrieve Vereinsflieger data, compare, persist the overall result, request feedback where needed, and compile a PDF for manual transfer.
- [Prototype source snapshots and provenance](../reference/flugbuch-prototype/README.md): current plugin instructions/rulebook and separate Flugbuch-Assistent skill instructions/rulebook. These explain domain rules; they are not an already working mobile/backend implementation.
- [Earlier Phase 1 source](../reference/Segelflug_Plattform_Architektur_Phase1.md) and [requirements reconciliation](../architecture/phase1-reconciliation.md).

## Primary journey

1. The signed-in pilot starts or resumes a logbook-update session, using continuation mode by default; optional historical review is separate.
2. They photograph/upload the latest written double-page spread. If the whole spread requires multiple images, images belong to the same session. Capture paper page/row references and all visible written rows, carryovers and landing counts.
3. The app retrieves authorized own-flight data from Vereinsflieger. It preserves a dated input snapshot with source identifiers and coverage. CSV import is a labeled fallback, not evidence that live access works.
4. Photo analysis proposes structured observations. The app identifies the last written paper row and compares every readable visible row with the corresponding flight. New flights are determined by identity and chronology after the anchor.
5. The app saves the draft result and findings. It displays a concise overview and asks specific questions only for decisions that affect the continuation, new flights or required totals. Historical warnings remain visible without blocking routine continuation.
6. User responses are saved, then the affected matching/totals are recomputed. The final export uses an immutable, resolved snapshot of that revision.
7. The app produces and stores the private PDF, shows what is new and lets the pilot download/share it. The pilot transfers the entries manually into the paper book.
8. Downloading or generating the PDF does not prove that the paper book was updated. The next session uses a fresh photo as evidence of actual paper state; a prior result is continuity context only.

## Stories and acceptance criteria

| ID | User story | Acceptance criteria | Tracking |
| --- | --- | --- | --- |
| FL-01 | As a pilot, I can start/resume an update with my own account. | Session is account-scoped; persisted inputs/results survive restart and second-device retrieval. Another account cannot access them. Switching accounts preserves each account's pending work separately. | #1, #4, #8 |
| FL-02 | I can supply the latest written paper page. | Photo can be selected offline; transfer is retryable. Incomplete/blurred decisive fields request another image or explicit correction. Analysis retains raw observations, page/row/field references and uncertainty; it never invents unreadable values or signatures. | #7 |
| FL-03 | I can retrieve my own current Vereinsflieger flights. | Authorization is separate from MoFlight login. Record source IDs, retrieval date, coverage/time basis and excluded rows. Expiry or unavailable access is actionable; an incomplete retrieval is never called complete. CSV fallback is clearly labeled. | #2 |
| FL-04 | I can continue from the actual paper-book state. | Last written paper number/page/row determines next number/free row. Match its flight by identity and established time basis, not source row count. Extra/missing older source flights never shift numbering. An ambiguous anchor needs a targeted decision. | #4, #7 |
| FL-05 | I can see differences between paper and source data. | Compare every readable field on all visible rows. Match date/times before treating aircraft identity as corroboration, so an aircraft mismatch is still detected. Each finding retains both values, severity, explanation and proposed action. Missing evidence is not a confirmed match. | #7 |
| FL-06 | I can resolve relevant uncertainties efficiently. | Show field-specific questions with source/photo evidence. Anchor ambiguity, new-flight duplicates/overlaps, unclear role/type and necessary unknown sums block final writing output until resolved or explicitly deferred under an agreed policy. Historical findings alone do not block continuation. No redundant approval dialog for an already resolved run. | #7, #8 |
| FL-07 | I can trust time, role and page calculations. | Use integer minutes; retain source time basis and handle DST explicitly. Determine PIC/Dual/FI-FE per flight, including solo; do not infer every flight is dual. Unknown carryovers remain unknown. Existing and new rows jointly close a page; an open page has no page/total values, including landings. | #7 |
| FL-08 | I can return to the overall result and understand its provenance. | Store input snapshots, observations, matching, anchor, findings, responses, confirmed entries, totals and export references/versions. Save waiting-for-feedback drafts as well as final results. Reprocessing creates a revision and never overwrites source evidence or silently loses previous decisions. | #1, #4, #7 |
| FL-09 | I can download a faithful PDF to copy into my paper book. | PDF is generated from one fixed resolved snapshot. Introduction/report precede 420 x 148 mm spreads with ten flight rows. Existing entries are gray context, new writing fields white; discrepancies have cell marks plus text/symbols. First spread continues the photographed page. Numbering/carryovers/totals are independently verified; text is legible and unclipped. | #7, #8 |
| FL-10 | I can retry without creating duplicate flights or contradictory exports. | Retry identity binds to input/revision and preserves the previous outcome. Regenerating an identical result does not create additional confirmed flights. A changed source or response creates a new revision; old PDF remains tied to its original snapshot. Multi-device edits use version checks and preserve conflicts. | #2, #4, #7 |
| FL-11 | I can continue safely through interruptions. | Resume upload, retrieval and feedback after restart. Network failure, paused backend or quota refusal preserves pending local work and shows status. Failed partial retrieval never silently replaces a complete snapshot; failed export is retryable without restarting paid analysis. | #4, #7, #8 |
| FL-12 | I can optionally check earlier paper pages. | Historical review requests the pages being checked, reports coverage and proposes corrections separately. It never automatically renumbers past entries or changes the current continuation anchor. Unseen pages are not called verified. | Later product scope; regression boundary in #7 |

## What “store the overall result” means

Store a versioned reconciliation session, not just the final PDF or an editable flights table. The following are conceptual records, not an approved physical schema:

| Record | Information retained |
| --- | --- |
| Update session | Owner, mode, current revision, progress/failure status, creation/update timestamps |
| Input snapshot | Private photo objects and hashes; source flight data, source references, coverage, time basis and retrieval timestamp |
| Analysis observations | Raw readable/unknown fields with image/page/row references, model/prompt/schema version where applicable |
| Reconciliation revision | Paper anchor, matches/new-flight candidates, findings, derived minutes/roles/page layout, rules version |
| User decision | Finding/field, evidence revision, response, author/time, chosen value/action and effect; stale decisions require revalidation |
| Resolved export snapshot | Fixed confirmed data, allowed unresolved historical warnings, source/decision versions and calculation results |
| Export artifact | Private PDF object/hash, snapshot ID, generator version, status and retry/error information; optional audit exports |

Proposed session states: inputs pending, processing, needs feedback, ready to export, exporting, complete; failed/interrupted work resumes at the last successful step. Generating an export never marks flights as physically written in the paper book. Retention/deletion policy must cover input photos, source snapshots, revisions, files and backups; duration remains open.

## Business rules and prototype differences

The current skill's stronger visible-row comparison is the proposed baseline. Source precedence and field resolution are explicit: paper controls continuation position; Vereinsflieger supplies proposed new flight facts; uncertain conflicts need user decisions. Neither source silently overrides the other everywhere.

| Difference in prototypes | App treatment |
| --- | --- |
| Plugin matching includes aircraft/registration in early keys; skill matches time first and checks aircraft afterward. | Match time/identity first to reveal wrong-aircraft entries; preserve ambiguity. |
| Older plugin summarizes historical discrepancies; skill individually checks all visible rows even in continuation mode. | Check every visible row; historical warnings remain nonblocking unless they affect anchor/required sums. |
| Older rulebook assumes dual training unless contradicted; skill explicitly determines roles including solo. | Use flight-specific evidence; unclear role is a question. |
| Plugin always exports Master CSV and report CSV; skill exports report-bearing PDF and XLSX with no separate report CSV. | PDF plus persistent complete audit are required by this user story. Whether CSV and/or XLSX are default downloads remains an open product choice; no silent selection. |
| Prototype generators do not perform photo recognition or automatic reconciliation. | Separate analysis, deterministic reconciliation and export; successful PDF rendering proves only rendering. |
| Prototype requires CSV input; user wants automatic retrieval. | Live retrieval is the target; CSV is a fallback while #2 is unresolved. |

Reuse of the Python generator remains subject to code/schema inspection and synthetic regression tests; snapshots do not imply source-code reuse has been verified. The existing plugin/skill is not changed.

## End-to-end acceptance scenarios

All tests use synthetic inputs; these are required results, not passed tests.

- E01 Happy path: photo ends at number 69 in row 9; two new flights generate number 70 in row 10 and number 71 on the next spread. First spread totals include existing rows; next open spread totals remain empty. Save session, download and reopen same PDF.
- E02 Historical extra records: insert two older source flights; new numbering stays 70. Warnings are retained; no mandatory historical correction question.
- E03 Wrong aircraft: a visible row has ASK 21 while its time-matched source flight says DG-1000 S. Match survives; each differing readable field is marked and appears in report/context without shifting continuation.
- E04 Unreadable anchor/carryover: preserve unknown values and obtain a targeted correction; no guessed number, zero carryover or fabricated final sum.
- E05 New-flight duplicate/overlap: ask user to distinguish/reject/defer candidates; originals and decision remain audited. No automatic deletion.
- E06 Interrupted feedback: answer one question, restart, complete remaining questions; previous response persists. Changing its input revision makes stale responses visible.
- E07 Privacy/retry: another user cannot download inputs/results or submit decisions; retry after a lost response does not duplicate flights or exports.
- E08 Updated paper photo: prior PDF was generated but entries were not copied; a fresh photo still has number 69. Do not assume the paper advanced to 71. Source changes create a new comparison revision.
- E09 Backend/source outage: offline inputs remain available; source expiry or Supabase pause is shown; a partial fetch cannot produce a falsely complete final result.
- E10 Time/roles: DST and solo/dual fixtures produce correct minute/role totals without guessed UTC labels.

## Framework implications and first trial

Supabase Cloud Free is the selected initial backend (ADR 0003). Auth, private Storage, RLS-protected session records, server jobs and a narrow sync API support this journey. The framework must persist job status/feedback, source references, immutable export snapshots and retry identity; a generic flights CRUD demo alone does not prove this workflow. Use migrations/configuration that can later be recreated on self-hosted Supabase; migration is separately tested.

First evidence: two synthetic users, one synthetic page observation and flight-data snapshot, one inconsistency/response, persisted session and a PDF from the resolved snapshot. This can prove orchestration without paid AI or live Vereinsflieger access; mark both substitutions explicitly. Separately prove actual handwriting analysis under an approved budget and supported live retrieval in #2/#7 before claiming the full journey works. Worker hosting is unresolved; do not assume a Python renderer runs in an Edge Function.

Open product decisions: default CSV/XLSX exports, retention duration, multiple paper books/layouts beyond the prototype, treatment of paper-only new flights, and export behavior when a user deliberately defers a blocking finding. None blocks documentation or the initial synthetic trial.

Verification: current repository/Issues and four prototype source documents read; source snapshots captured with provenance, personal example identifiers replaced; stories mapped to existing Issues. No app, live retrieval, photo analysis or PDF/device test executed in this documentation change.

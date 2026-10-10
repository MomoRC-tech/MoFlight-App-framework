# Flight logbook: user stories and continuation workflow

Current implementation note: the [bounded synthetic host slice](../../apps/platform-lab/README.md) has [20 passing host checks](../verification/2026-10-08-host-local-slice.md). This does not pass native/cloud/live/handwriting acceptance; the requirements below remain the full target. Prepared observations and CSV are explicitly synthetic.

Date: 2026-10-08. Product owner: Manuel Singer. Status: core workflow requested by Manuel; detailed acceptance and technical mapping are proposed, not implemented.

## Purpose and sources

As a gliding pilot, I want to photograph my latest written paper-logbook page, retrieve my own Vereinsflieger flights, resolve relevant inconsistencies and receive a clear writing template showing exactly what to write, so that I can update my paper logbook without manually comparing and calculating everything.

This is the canonical product specification for this workflow. [README](../../README.md) is the project entry point; Issues track implementation, and ADRs record technical decisions. Current user decisions take precedence over prototype behavior. Requirements must remain traceable to a story and an acceptance scenario.

Sources captured on 2026-10-08:

- Manuel's earlier cloud-provider request: use Supabase Cloud Free as the first cloud mode; local Supabase is a possible later migration. The later sequencing request places phone-local storage first, with independent early cloud feasibility. Upload the latest paper-page photo, retrieve Vereinsflieger data, compare, persist the overall result, request feedback where needed, and compile a writing template for manual transfer. The subsequent format clarification below supersedes PDF as a mandatory output.
- [Prototype source snapshots and provenance](../reference/flugbuch-prototype/README.md): current plugin instructions/rulebook and separate Flugbuch-Assistent skill instructions/rulebook. These explain domain rules; they are not an already working mobile/backend implementation.
- [Earlier Phase 1 source](../reference/Segelflug_Plattform_Architektur_Phase1.md) and [requirements reconciliation](../architecture/phase1-reconciliation.md).

## Remembered state and additional user journey

Manuel additionally requested on 2026-10-08 that the app remember confirmed paper entries, the last Vereinsflieger export and earlier ignored/overridden inconsistencies. On opening the app, the pilot can ask for counts in a specific glider or when/how often they flew with a person. [State, reusable decisions and flight-query semantics](flight-logbook-state-and-queries.md) define this extension. No new photo/import is required to open the app or query remembered history.

Manuel clarified on 2026-10-08 that the writing template need not be a PDF: any user-friendly presentation is acceptable if it represents exactly what to enter in the paper logbook. [Writing-template presentation](writing-template-presentation.md) defines this contract. Initial delivery is an in-app row/field view; file exports are optional. Historical prototype PDF rules remain evidence, not a mandatory app output format.

## In-app Vereinsflieger connection — 2026-10-10

Manuel selected browser-based access; the official API remains only “might work in the future.” [Connection, repeat retrieval and local-login options](vereinsflieger-connection-and-retrieval.md) expand FL-03. Target: first connection uses the original provider login inside MoFlight; later foreground retrieval reuses the valid session and asks for reauthentication only when needed. Device-local password saving is technically feasible but remains a separate opt-in design proposal. No native connector is implemented or verified by this story.

## Primary journey

1. The signed-in pilot sees the last known confirmed paper/source status and can query history immediately, or start/resume an update session. Continuation mode is default; historical review is separate.
2. For an update, they confirm the remembered paper status is still current or supply a new photo when changed/uncertain. Capture all visible written rows, page/row references and carryovers when a photo is provided; multiple images can represent one spread.
3. The app can use the last successful Vereinsflieger snapshot or retrieve a new authorized own-flight snapshot. Display freshness/coverage and preserve versions. CSV import is a labeled fallback, not evidence that live access works; a failed/partial refresh does not replace usable history.
4. Photo analysis proposes structured observations. The app identifies the last written paper row and compares every readable visible row with the corresponding flight. New flights are determined by identity and chronology after the anchor.
5. The app saves the draft result and findings. It displays a concise overview and asks specific questions only for decisions that affect the continuation, new flights or required totals. Historical warnings remain visible without blocking routine continuation.
6. Save responses and reapply past decisions whose scoped identity/relevant evidence remain unchanged; changed evidence requires targeted review. Recompute affected matching/totals and prepare one immutable resolved revision.
7. The app saves the resolved writing instructions and presents exactly what to copy, grouped by paper page, row and field. Existing context and new entries are visibly distinct. Optional downloads/shareable formats use the same snapshot. The pilot transfers the entries manually into the paper book.
8. Displaying, downloading or generating the template does not prove that the paper book was updated. The pilot may explicitly confirm which entries were copied, or provide a later photo. Store evidence and date; reuse last confirmed state without claiming it reflects unobserved changes. A new conflicting photo creates a review finding.

## Stories and acceptance criteria

| ID | User story | Acceptance criteria | Tracking |
| --- | --- | --- | --- |
| FL-01 | As a pilot, I can start/resume an update with my own account. | Session is account-scoped; persisted inputs/results survive restart and second-device retrieval. Another account cannot access them. Switching accounts preserves each account's pending work separately. | #1, #4, #8 |
| FL-02 | I can supply the latest written paper page. | Photo can be selected offline; transfer is retryable. Incomplete/blurred decisive fields request another image or explicit correction. Analysis retains raw observations, page/row/field references and uncertainty; it never invents unreadable values or signatures. | #7 |
| FL-03 | I can retrieve my own current Vereinsflieger flights. | Use the [in-app browser connection journey](vereinsflieger-connection-and-retrieval.md); authorization is separate from MoFlight login. Reuse a valid session; request login/verification only when required. Record source IDs, retrieval date, coverage/time basis and excluded rows. Expiry or unavailable access is actionable; an incomplete retrieval is never called complete. CSV fallback is clearly labeled. API access is future-only. | #2 |
| FL-04 | I can continue from the actual paper-book state. | Last written paper number/page/row determines next number/free row. Match its flight by identity and established time basis, not source row count. Extra/missing older source flights never shift numbering. An ambiguous anchor needs a targeted decision. | #4, #7 |
| FL-05 | I can see differences between paper and source data. | Compare every readable field on all visible rows. Match date/times before treating aircraft identity as corroboration, so an aircraft mismatch is still detected. Each finding retains both values, severity, explanation and proposed action. Missing evidence is not a confirmed match. | #7 |
| FL-06 | I can resolve relevant uncertainties efficiently. | Show field-specific questions with source/photo evidence. Anchor ambiguity, new-flight duplicates/overlaps, unclear role/type and necessary unknown sums block final writing output until resolved or explicitly deferred under an agreed policy. Historical findings alone do not block continuation. No redundant approval dialog for an already resolved run. | #7, #8 |
| FL-07 | I can trust time, role and page calculations. | Use integer minutes; retain source time basis and handle DST explicitly. Determine PIC/Dual/FI-FE per flight, including solo; do not infer every flight is dual. Unknown carryovers remain unknown. Existing and new rows jointly close a page; an open page has no page/total values, including landings. | #7 |
| FL-08 | I can return to the overall result and understand its provenance. | Store input snapshots, observations, matching, anchor, findings, responses, confirmed entries, totals and export references/versions. Save waiting-for-feedback drafts as well as final results. Reprocessing creates a revision and never overwrites source evidence or silently loses previous decisions. | #1, #4, #7 |
| FL-09 | I can see exactly what to copy into my paper book in a readable writing template. | A user-friendly in-app view presents one fixed resolved snapshot, mapping exact values to paper page/row/field. Continue the current page; distinguish existing context from new writing without relying only on color. Numbering, roles, time basis, carryovers and page totals are independently verified; unknown required values trigger feedback. Ten-row page rules remain for the supported prototype book, while physical PDF dimensions are optional-format rules. Resume the same view offline; PDF or other exports are optional and must match the same snapshot. See the presentation contract. | #7, #8 |
| FL-10 | I can retry without creating duplicate flights or contradictory exports. | Retry identity binds to input/revision and preserves the previous outcome. Regenerating an identical result does not create additional confirmed flights. A changed source or response creates a new revision; old template remains tied to its original snapshot. Multi-device edits use version checks and preserve conflicts. | #2, #4, #7 |
| FL-11 | I can continue safely through interruptions. | Resume upload, retrieval and feedback after restart. Network failure, paused backend or quota refusal preserves pending local work and shows status. Failed partial retrieval never silently replaces a complete snapshot; failed export is retryable without restarting paid analysis. | #4, #7, #8 |
| FL-12 | I can optionally check earlier paper pages. | Historical review requests the pages being checked, reports coverage and proposes corrections separately. It never automatically renumbers past entries or changes the current continuation anchor. Unseen pages are not called verified. | Later product scope; regression boundary in #7 |
| FL-13 | I can resume from remembered paper and Vereinsflieger status. | Show last confirmed paper entries/anchor and evidence, last successful source snapshot/coverage, pending writing and decisions. Persist across launch/offline/devices. Explicit copied-entry confirmation or new photo updates paper state; generation alone does not. No compulsory new upload/import just to start or query. | #1, #2, #4, #7, #8 |
| FL-14 | I can retain and review decisions from previous runs. | Ignore/accept/override/duplicate resolutions are scoped and auditable; reuse unchanged evidence without reasking. Relevant changed evidence marks a decision stale. Ignore does not alter flight facts; override changes only the effective view. Reverse decisions, preserve old exports and resolve concurrent edits. | #1, #4, #7, #8 |
| FL-15 | I can ask how many flights I made in a glider. | Count distinct established own-flight IDs by selected aircraft instance or model/date range; disambiguate. Show basis, coverage/freshness, unknowns and contributing flights. Offline queries use account cache; repeated imports do not inflate counts. | #9 with #1, #2, #4 |
| FL-16 | I can ask when/how often I flew with a person. | Resolve person identity and role, distinguish same-name people, and deterministically return latest recorded flight/count with supporting records. Available coverage and uncertain crew/date fields are visible. No unrestricted LLM SQL, guessed counts or cross-user aggregate access. | #9 with #1, #2, #4 |
| FL-17 | Later, I can ask which instructor is scheduled next weekend. | First discover supported Vereinsflieger information/access and permitted use cases. Resolve club/exact dates/duty; provide source/freshness and missing-access/no-assignment outcomes. Never infer roster from prior flights or claim unsupported APIs. | Later discovery #10 |

## What “store the overall result” means

Store a versioned reconciliation session, not just a rendered template or an editable flights table. The following are conceptual records, not an approved physical schema:

| Record | Information retained |
| --- | --- |
| Update session | Owner, mode, current revision, progress/failure status, creation/update timestamps |
| Input snapshot | Private photo objects and hashes; source flight data, source references, coverage, time basis and retrieval timestamp |
| Analysis observations | Raw readable/unknown fields with image/page/row references, model/prompt/schema version where applicable |
| Reconciliation revision | Paper anchor, matches/new-flight candidates, findings, derived minutes/roles/page layout, rules version |
| User decision | Scoped flight/finding/field, relevant evidence fingerprint, reusable action/value/reason, author/time, applicability and reversal; changed relevant evidence requires revalidation |
| Remembered logbook state | Last known confirmed paper entries/anchor/carryovers with evidence/date; latest successful source snapshot/coverage, pending entries and effective history |
| Resolved writing snapshot | Fixed confirmed data, allowed unresolved historical warnings, source/decision versions and calculation results |
| Writing-template presentation | Snapshot ID, presentation/rules version, page/row/field instructions and status; persisted locally for reopening/offline use |
| Optional export artifact | Private file/type/hash, snapshot ID, renderer version, status and retry/error information; no file is required for in-app presentation |

Proposed session states: inputs pending, processing, needs feedback, ready to present, complete; optional exports have their own pending/running/ready/failed status; failed/interrupted work resumes at the last successful step. Displaying a template or generating an export never marks flights as physically written in the paper book; explicit entry-level confirmation/photo evidence does. Retention/deletion policy must cover input photos, source snapshots, revisions, files and backups; duration remains open.

## Business rules and prototype differences

The current skill's stronger visible-row comparison is the proposed baseline. Source precedence and field resolution are explicit: paper controls continuation position; Vereinsflieger supplies proposed new flight facts; uncertain conflicts need user decisions. Neither source silently overrides the other everywhere.

| Difference in prototypes | App treatment |
| --- | --- |
| Plugin matching includes aircraft/registration in early keys; skill matches time first and checks aircraft afterward. | Match time/identity first to reveal wrong-aircraft entries; preserve ambiguity. |
| Older plugin summarizes historical discrepancies; skill individually checks all visible rows even in continuation mode. | Check every visible row; historical warnings remain nonblocking unless they affect anchor/required sums. |
| Older rulebook assumes dual training unless contradicted; skill explicitly determines roles including solo. | Use flight-specific evidence; unclear role is a question. |
| Plugin always exports Master CSV and report CSV; skill exports report-bearing PDF and XLSX with no separate report CSV. | A faithful readable writing template plus persistent complete audit are required. PDF, CSV and XLSX are optional export choices; the captured prototypes retain their historical output requirements. |
| Prototype generators do not perform photo recognition or automatic reconciliation. | Separate analysis, deterministic reconciliation and presentation/export; successful rendering proves only rendering. |
| Prototype requires CSV input; user wants automatic retrieval. | Live retrieval is the target; CSV is a fallback while #2 is unresolved. |

Reuse of the Python generator remains subject to code/schema inspection and synthetic regression tests; snapshots do not imply source-code reuse has been verified. The existing plugin/skill is not changed.

## End-to-end acceptance scenarios

All tests use synthetic inputs; these are required results, not passed tests.

- E01 Happy path: photo ends at number 69 in row 9; two new flights generate number 70 in row 10 and number 71 on the next spread. First spread totals include existing rows; next open spread totals remain empty. Save session and reopen the same in-app template offline with exact page/row/field values. Any optional export must agree with that snapshot.
- E02 Historical extra records: insert two older source flights; new numbering stays 70. Warnings are retained; no mandatory historical correction question.
- E03 Wrong aircraft: a visible row has ASK 21 while its time-matched source flight says DG-1000 S. Match survives; each differing readable field is marked and appears in report/context without shifting continuation.
- E04 Unreadable anchor/carryover: preserve unknown values and obtain a targeted correction; no guessed number, zero carryover or fabricated final sum.
- E05 New-flight duplicate/overlap: ask user to distinguish/reject/defer candidates; originals and decision remain audited. No automatic deletion.
- E06 Interrupted feedback: answer one question, restart, complete remaining questions; previous response persists. Changing its input revision makes stale responses visible.
- E07 Privacy/retry: another user cannot download inputs/results or submit decisions; retry after a lost response does not duplicate flights or exports.
- E08 Updated paper photo: prior template was prepared/displayed but entries were not copied; a fresh photo still has number 69. Do not assume the paper advanced to 71. Source changes create a new comparison revision.
- E09 Backend/source outage: offline inputs remain available; source expiry or Supabase pause is shown; a partial fetch cannot produce a falsely complete final result.
- E10 Time/roles: DST and solo/dual fixtures produce correct minute/role totals without guessed UTC labels.

- E11 Remembered state: restart/open offline with saved paper anchor, import and pending flights; answer a supported history question without new photo/import. Failed refresh retains the prior successful snapshot and shows stale coverage.
- E12 Reusable decisions: ignore a mismatch, repeat unchanged import and get no repeated question; change the affected field and mark the old decision stale. An unrelated source change does not invalidate it.
- E13 Paper confirmation: displaying/generating a template does not advance the book; explicitly confirm only selected copied entries. A conflicting later photo creates a finding; do not assume all older flights were written.
- E14 Overrides/reversal: ignore a warning without changing aircraft counts; explicit aircraft override changes effective counts, preserves source-view counts and the old template snapshot. Reverse it and recompute.
- E15 Aircraft queries: synthetic flights across two ASK 21 instances and repeated import rows produce exact distinct counts by instance/model/date; show uncertain duplicates separately.
- E16 Person queries: two same-name people, multiple crew links, incomplete dates and stale cached data yield the expected selected-person count/latest record with visible coverage; another account receives no aggregate or supporting rows.

- E17 Later roster query: only after supported access is established, an authorized member requests explicit weekend dates/club and receives source-backed assignments. Changed/stale/no assignments and unauthorized club/role scope are handled without inferred answers. Discovery is tracked in #10; this is not an initial-trial prerequisite.

See [later Vereinsflieger information discovery](vereinsflieger-information-discovery.md) for FL-17/E17 and the evidence inventory required before broader club-information queries.

## Framework implications and first trial

The first product persistence path is phone-local SQLite/files under [ADR 0004](../adr/0004-local-first-sequencing.md); [revised priorities](../architecture/local-first-implementation-plan.md) govern execution. Supabase Cloud Free remains the first cloud mode (ADR 0003), tested independently very early. Auth, private Storage, RLS-protected session records, server jobs and sync are integrated after the initial local and cloud gates. The framework must persist remembered paper/source state, reusable decisions, normalized queryable history, job status/feedback, source references, immutable writing snapshots and retry identity; a generic flights CRUD demo alone does not prove this workflow. Use migrations/configuration that can later be recreated on self-hosted Supabase; migration is separately tested.

First local evidence: one stable local profile/dataset, a synthetic page observation and flight-data snapshot, one inconsistency/response, persisted paper/decision state, offline restart and deterministic aircraft/person results (#4/#7/#9). Add the readable in-app writing view from a fixed snapshot and backup/export/restore. Verify exact field mapping and offline reopening on the device; optional file rendering is a later separate proof. During the same early cycle, independently exercise two synthetic Supabase accounts and private DB/file/recovery paths (#1). This can prove orchestration without paid AI or live Vereinsflieger access; mark both substitutions explicitly. Separately prove actual handwriting analysis under an approved budget and supported live retrieval in #2/#7 before claiming the full journey works. No export worker is required for the initial view. If Python renderer reuse is later selected, inspect its code and test its actual execution/hosting; do not assume it runs on the phone or in an Edge Function.

Open product decisions: optional export formats/defaults, retention duration, multiple paper books/layouts beyond the prototype, treatment of paper-only new flights, and export behavior when a user deliberately defers a blocking finding. None blocks documentation or the initial synthetic trial.

Verification: current repository/Issues and four prototype source documents read; source snapshots captured with provenance, personal example identifiers replaced; stories mapped to existing Issues. No app, live retrieval, photo analysis or PDF/device test executed in this documentation change. The later state/query addition is sourced to Manuel’s feature request; see its separate documentation verification record.

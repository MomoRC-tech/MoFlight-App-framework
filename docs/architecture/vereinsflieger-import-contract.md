# Vereinsflieger verified retrieval and local import contract

Date: 2026-10-10. Tracking: [FL-03](../product/flight-logbook-user-stories.md), [#2](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/2). Status: concrete proposal with an executable pure reconciliation prototype; final transport/mapping and canonical database integration are not approved or implemented. Extends [ADR 0006](../adr/0006-vereinsflieger-connector-proposal.md).

## Current boundary

The existing native probe captures at most 20 visible raw rows in its separate SQLite database. It does not establish identity, time basis or full-history coverage. The existing canonical `LocalLogbook.importSource` deliberately accepts only `synthetic-prepared-csv`; that restriction remains intact. The new [reconciliation planner](../../apps/platform-lab/src/vereinsflieger/reconciliation.ts) is pure, experimental and not called by either database or the running app. No real capture is promoted by this work.

Manuel authorized proceeding with export/history investigation and preparation of import checks after reviewing the requirements. Existing approvals cover original-page browser login, own flights, automatically selected periods, phone-local data and the current Expo stack. Architecture details remain proposed until the verified method and mapping can be presented concretely. No app-owned password storage or backend is introduced.

## Adapter evidence required before import

| Contract | Evidence required | Current result |
| --- | --- | --- |
| Transport | Inspect actual Excel export first, then an observed structured response, then strict table/details if necessary | Excel/PDF named by help; bytes/structured response not yet inspected |
| Source account and club | Obtain a stable scoped reference, verify signed-in context and confirm the selected dataset association once | Display labels observed privately; stable identity/binding open |
| Own-flight scope | Establish pilot/companion participation and all relevant role-filter semantics | Native UI offers Pilot, Pilot or instructor, Instructor, Companion, Pilot or companion; inclusive semantics still need validation |
| Flight identity | Independently validate the candidate source reference through details/export and a repeat retrieval | Numeric `flid` remains a candidate, not a verified durable contract |
| Time basis | Establish the actual flight-column time zone/meaning; never infer it from the dashboard clock | Unknown |
| Coverage | Verify selected inclusive dates, every page/window and any provider cap; distinguish a verified empty period from login/error | Native UI has relative/month/year/custom-period controls; coverage not established |
| Field mapping | Preserve source values and distinct Pilot/PIC/companion fields; verify date, duration units, aircraft and crew roles | Displayed fields privately user-confirmed in Q4; export/canonical mapping open |

The adapter must retain raw bounded evidence separately from normalized flights. Verification flags in the prototype are adapter attestations, not proof supplied by a website message or user-entered arbitrary JSON. They are not a security boundary. Do not enable canonical import merely because a response contains `true` flags.

## Proposed reconciliation behavior

1. Bind the local dataset to verified source account/club references. A mismatch stops import and preserves existing data. Display names are not identity keys.
2. Stage and validate one complete bounded window before proposing any writes. Interrupted results may retain raw observations, but cannot advance verified coverage. Complete individual windows may later accumulate while other history gaps remain visible; one window never proves complete lifetime history.
3. Namespace flight identity by dataset/account/club and the validated source flight reference. The executable proposal uses an unambiguous tuple, independent of date, registration, crew and list position. Numeric IDs reflect the current probe candidate only; revise the adapter/contract if actual evidence differs.
4. An identical source record is unchanged. Repeated identical rows within a batch are counted once. Conflicting variants of the same ID require review; different source IDs are not merged merely because fields match.
5. Changed fields retain previous and next revisions. Persist the new source observation separately from paper entries and user decisions. Existing scoped decisions must be rechecked against changed relevant evidence, using the established domain rules.
6. Omissions generate no deletion operation. Neither limited coverage nor a verified empty window proves source deletion. Deleted-flight handling requires independently established provider semantics and a review policy.
7. Apply an approved plan, source evidence and coverage atomically through the single SQLite writer. This persistence step, schema/backup changes, coverage scheduling and the real adapter remain to be implemented after verification and architecture review.
8. Report added/changed/unchanged/conflicting counts, last successful retrieval, verified periods and remaining gaps. Query imported history offline after force-stop/restart. A failed refresh is reported separately from usable saved history.

Unknown crew/person IDs and roles remain unknown. Companion does not automatically mean instructor; a Pilot label does not establish PIC. The current canonical crew model cannot faithfully represent every raw provider distinction yet. Resolve this mapping before enabling imports, rather than dropping Pilot or forcing a role. Actual flight times must have an established basis before canonical promotion in this first proposal.

## Acceptance and current implementation

| Requirement | Prototype result | Remaining acceptance |
| --- | --- | --- |
| Repeat retrieval without duplicates | Synthetic identity/idempotency test passed | Repeat actual mapped retrieval and transactional import |
| Detect edits without losing originals | Pure plan retains both variants; synthetic test passed | Revision persistence and relevant-decision review |
| Preserve history on partial/error/account mismatch | Planner rejects unverified/partial/mismatched batches without mutating input | Real session/network interruption and database atomicity |
| Do not infer deletions | Planner emits no deletions; verified empty-window test passed | Provider deletion semantics and user review |
| All accessible history | No implementation claim | Actual export/page controls, verified scheduling and gaps |
| Correct time/roles/account mapping | Import gated; no guesses | Native reference comparison and dataset confirmation |
| Offline imported history | Existing synthetic logbook and raw capture already tested separately | Canonical live import plus offline restart/query |

Five new meaningful planner tests and all 20 existing mobile tests pass locally (25 total); strict TypeScript passes. These are synthetic contract checks, not live export/import acceptance. [Investigation evidence](../verification/2026-10-10-vereinsflieger-retrieval-investigation.md) records the actual provider observations and pending sign-in handoff.

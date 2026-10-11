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
| Own-flight scope | Establish pilot/companion participation and all relevant role-filter semantics | Native UI offers Pilot, Pilot or instructor, Instructor, Companion, Pilot or companion; inclusive selection and a 90-day request retained authentication after renewed login, but exact semantics still need validation |
| Flight identity | Independently validate the candidate source reference through details/export and a repeat retrieval | List-link `flid` matched detail `Eintrag` in desktop discovery; repeat/export/cross-account durability remains unverified |
| Time basis | Establish the actual flight-column time zone/meaning; never infer it from the dashboard clock | Manual 5001 explicitly specifies UTC start/landing input; selected export/adapter representation still needs comparison |
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

[Authenticated discovery](../verification/2026-10-10-vereinsflieger-discovery.md) explains the observed record-count/flight-total discrepancy: marked-row count matches the explicit duplicate count, and total records equal counted flights plus duplicates. Alternating backgrounds are independent striping in this sample. Preserve the explicit `Duplikat` field rather than rely on CSS or silently count every table row. No production duplicate policy or cross-configuration adapter is yet validated. Unknown crew/person IDs and roles remain unknown. Companion does not automatically mean instructor; a Pilot label does not establish PIC. The current canonical crew model cannot faithfully represent every raw provider distinction yet. Resolve this mapping before enabling imports, rather than dropping Pilot or forcing a role. Actual flight times must have an established basis before canonical promotion in this first proposal.

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

## Multiple-book boundary — subsequent requirement clarification

[ADR 0007](../adr/0007-multiple-logbooks-and-formats.md) records the newly confirmed multiple-books/extensible-formats requirement. The executable planner’s dataset-scoped identity is a bounded lab contract, not the approved production source-flight identity or proof of book isolation. The proposed production direction shares provider/account/club source evidence across explicit book links and separates flight identity from book-entry identity; it requires a reviewed identity migration before enabling canonical live imports. Do not copy retrieval per aircraft class or treat dataset selection as complete account/book/format separation. Neither ADR 0007 nor the final import schema is accepted by this continuation.

## Discovery-driven mapping review — 2026-10-10

The manual distinguishes flight minutes, off/on-block times and per-aircraft engine meter units; corrected flight minutes need not equal clock subtraction. The provider's `Pilot` may be a student and its companion field may represent an instructor or guest. Additional companion, SIC and FI-time fields are configurable. Aircraft category is explicit, including a TMG/glider distinction; catalogue entries across classes are observed, but actual UL/powered flight mappings remain untested. Preserve these separate facts before adapting the existing gliding-only contracts. See the [field dictionary](../verification/2026-10-10-vereinsflieger-discovery.md#flight-field-dictionary-and-import-implications) and [multi-book proof/migration plan](multiple-logbooks-proof-plan.md).

The [2026-10-11 capture inventory and Gemini review](../product/vereinsflieger-capture-requirements.md) prioritizes source fields and verification before output formats. Preserve raw evidence, missing states and distinct time/crew measures; do not adopt the supplied universal schema or infer licensing class from registration. This clarifies preparation for the adapter without enabling canonical imports.

[Bounded capture follow-up](../verification/2026-10-11-vereinsflieger-capture-fields.md) verifies repeated desktop rows/references, current default columns and a date-specific empty UI. The reader now accepts missing optional model/PIC columns and a pure field inspection distinguishes not captured, blank and source text. No optional enrichment, native rerun, verified identity/complete coverage or canonical persistence is established by this change.

## List discovery plus per-flight detail enrichment — 2026-10-11 proposal

The [capture/storage data model](vereinsflieger-capture-data-model.md) presents the concrete logical records, field inventory, aircraft association and optional costs for this approach. It is a reviewable proposal, not the implemented raw-capture payload or a production schema migration.

Manuel suggested using each flight's richer detail page, including costs, rather than depending on configured list columns. A bounded desktop comparison supports using both views: the list discovers permitted flight references and coverage; details supply additional fields independently of visible list columns. Neither view is a verified complete superset. See the [detail comparison evidence](../verification/2026-10-11-vereinsflieger-capture-fields.md#flight-detail-comparison--subsequent-investigation).

Proposed browser adapter sequence:

1. Verify source account/club and request explicit bounded dates plus inclusive own-flight participation. Traverse every list page and retain discovered references/counts. Column visibility must not determine which flights exist.
2. Follow each observed read-only detail link through the authenticated provider session. Do not enumerate guessed numeric IDs or inspect flights outside the authorized own-flight scope. Details must match the expected reference and source context.
3. Extract allowlisted flight/provenance labels and values from their sections. Preserve list and detail observations separately, including missing fields and conflicting values. Do not treat absent conditional rows as zero or overwrite an explicit list PIC with a Pilot label.
4. Join aircraft catalogue evidence separately where the detail lacks model/class. Validate the join; conflicts remain for review. Costs cannot establish pilot roles or aircraft classification.
5. Retrieve sequentially in a bounded trial, record per-flight success/error and resume from outstanding references after interruption or renewed login. Cache detail revisions locally; verify how to detect changes before skipping previously retrieved details. A changed-list marker is not yet a proven complete detail-change signal.
6. Track list coverage separately from detail completion and field completeness. A complete list with failed detail pages is a partially enriched dataset. Session expiry/error must not look like an empty flight or delete saved history. Normal opening/querying uses saved local evidence, not repeated page navigation.

The initial next detail-reader proof should compare a few own flights with different conditional rows, repeat retrieval, interruption/resume and expiry detection using synthetic failure fixtures. Validate actual label/section boundaries and native browser behavior before scaling to history. The observed detail navigator displays position within the current 20-flight selection; it is not an independent all-history discovery mechanism. Export/structured-response alternatives remain open if their actual contracts become available.

Costs are a separate optional enrichment proposal following Manuel's explicit interest. Capture verified line items, charge descriptions, currency, charged-party association, total and billing status only if needed for a defined cost feature. `Abgerechnet` must not be relabeled as payment status without evidence. A displayed total need not equal the requesting pilot's personal expense; account-credit and other-party lines require verified attribution. The mandatory flight import must work when cost access fails or is absent. Never include actual amounts, parties or private observations in Git. No cost scraper/storage, full-history adapter or production mapping is implemented by this proposal.

The browser manual describes exports; no export action was exposed in the inspected list/configuration view even after Manuel's requested reset, and bytes remain unverified. The reset removed important optional fields; the default view cannot be assumed to contain a complete import schema. This evidence narrows the proposal but does not authorize canonical promotion or mark ADR 0007 accepted.

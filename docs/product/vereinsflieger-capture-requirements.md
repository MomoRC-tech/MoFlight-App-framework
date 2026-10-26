# Vereinsflieger capture requirements and Gemini schema review

Date: 2026-10-11, Europe/Berlin. Tracking: discovery [#10](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/10), retrieval/import [#2](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/2), multiple books [#11](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/11).

Manuel's direction: concentrate on which data fields must be captured from Vereinsflieger; define output formats later. This document reviews the supplied Gemini `UniversalFlightLogEntry` proposal against the [authenticated field dictionary](../verification/2026-10-10-vereinsflieger-discovery.md#flight-field-dictionary-and-import-implications), provider manual and primary regulatory sources. It is a capture checklist and verification plan, not an approved production schema or claim of complete live retrieval.

## Verdict

Use Gemini's groups as a starting checklist: aircraft, places, clocks/durations, operations, crew and remarks are useful. Preserve its distinction between original model text and any later standardized model, and between flight, block and engine measures. Do not adopt the schema unchanged: it combines source observations, inferred legal credit and eventual output requirements, and would reject incomplete observations or encourage invented values.

Capture relevant available evidence once, independently of the destination book. Normalize only after the field's meaning, unit and source context are established. Output profiles consume reviewed facts later. Multiple books remain a confirmed requirement; printed editions, column placement and PDF generation are deferred. [ADR 0007](../adr/0007-multiple-logbooks-and-formats.md) remains proposed.

## Corrections to the supplied analysis

| Gemini assumption | Review and capture consequence |
| --- | --- |
| SFCL flight time is wheels-off to wheels-on | Incorrect. Part-DEF distinguishes self-launch sailplanes/TMGs (movement for takeoff to final rest) from other sailplanes (takeoff ground run to final rest). Preserve provider `Start`, `Landung` and reported `Flugzeit`; do not rename them wheels-off/on without evidence. Manual 5001 allows corrected minutes, so retain reported duration independently of calculated clock difference. |
| German registration prefix determines the category legally and completely | Valid German registration marks establish the registration category under LuftVZO Anlage 1: D plus digits denotes gliders; D-K motor gliders; D-E single-engine aeroplanes up to 2,000 kg; D-M motorized air-sports equipment; D-H rotorcraft. Preserve this as registration-category evidence. D-K does not establish TMG and D-E does not establish piston SEP. Catalogue/model evidence is needed for finer classification; pilot licensing context and flight credit remain separate. |
| `Pilot` and `Begleiter` determine PIC/dual | Unsupported. Provider manual 5001 says Pilot can be the student and companion can be instructor or guest. Capture the distinct PIC field, all relevant crew and provider role-time values. Person identities and credit rules require verification. |
| One exclusive `PIC`/`DUAL`/`FI` role is enough | Too narrow. SFCL recording includes examiner function and permits instructor/examiner PIC credit; supervised solo has endorsement requirements. Preserve functions and durations separately rather than force one role or sum overlapping role columns as total time. |
| Every observation must have cleaned model/class, takeoff/landing, launch method and day/night landing split | Those are not universal capture prerequisites. An unavailable column, blank value, invalid value and confirmed zero are different states. Keep incomplete source evidence; completeness for a particular use is evaluated separately. Do not manufacture zero night landings, a launch code or a cleaned model to pass validation. |
| `departure_icao` / `arrival_icao` can contain arbitrary names | Keep raw departure/arrival places. A verified name/code may be added separately; an outlanding need not have an ICAO code. |
| Engine readings can always become minutes | Manual 4001 defines the meter unit per aircraft. Preserve readings, reported motor duration and unit separately; engine, block and credited flight time are not interchangeable. |
| A flight ID alone prevents duplicates | Scope identity to verified provider/account/club context and validate repeat retrieval. Different IDs can still carry the provider's `Duplikat` flag. Preserve both record identity and that status; matching values do not justify merging different records. |
| Remarks can represent instructor signatures | Preserve text as text. A mention/name in remarks does not prove a verified endorsement or signature. |

Sources: [EASA Sailplane Rule Book, Part-DEF point 16 and AMC1 SFCL.050](https://www.easa.europa.eu/sites/default/files/dfu/Sailplane%20Rule%20Book.pdf), [LuftVZO Anlage 1, registration classes](https://www.gesetze-im-internet.de/luftvzo/anlage_1.html), provider [flight entry manual 5001](https://vereinsflieger.de/member/help/index.php?hid=5001) and [aircraft manual 4001](https://vereinsflieger.de/member/help/index.php?hid=4001). The [requirements research](logbook-requirements-and-routing.md) records authority guidance and regulatory scope; this review does not certify a universal EASA/NfL schema or establish national UL credit rules by analogy.

### Instructor presence and recorded PIC — 26 October 2026

The [read-only saved-source review](../verification/2026-10-26-instructor-pic-source-review.md) found both accompanied and unaccompanied flights under the same raw `Flugart` code `S`. Use the unambiguous explicit `PIC` field for **Vereinsflieger's recorded PIC**, while preserving `Pilot`, `Begleiter/FI` and role-time cells independently. The provider-recorded PIC is not independent proof of the legally designated commander or of logbook credit.

| Source evidence | Safe interpretation |
| --- | --- |
| Explicit `PIC` matches a separately identified, confirmed FI on this flight | The source records that instructor as PIC; retain the FI function and any role-time evidence separately. |
| Explicit `PIC` names the `Pilot` while another person is confirmed as FI | Preserve the different recorded PIC and FI; review the uncommon combination instead of replacing PIC with FI. |
| `Begleiter/FI` is populated, or `Dual-Time` is nonzero, without verified FI role evidence | Accompanied or dual-time evidence; instructor identity/status is unresolved. Do not turn the combined heading into an FI credential. |
| `Flugart` is `S`, with no companion shown | The code alone does not establish an instructor on board. If `PIC` matches `Pilot`, show that recorded PIC; ground supervision remains possible. |
| `PIC` is missing, conflicting or only matched by an ambiguous display name | Recorded PIC is unresolved; do not infer command from `Pilot`, `Begleiter/FI`, flight type, seat or time columns. |

A “flight with an instructor on board” filter or paper-writing decision requires flight-linked explicit FI evidence or a reviewed provider/club mapping tied to the person. Keep legal command, instructor function and PIC/Dual/FI time distinct. The historical prototype rule that always places `Begleiter/FI` in PIC is superseded for current source interpretation; its original snapshot remains unchanged.

## Capture inventory

“Core” means prioritize obtaining and verifying the field, not reject a raw observation if it is absent. Availability below distinguishes displayed values from configuration/manual evidence. Catalogue examples do not prove cross-class flight mapping. No actual export bytes have yet been inspected.

| Priority / group | Capture fields | Evidence and remaining verification |
| --- | --- | --- |
| Core: source and coverage | Provider, scoped account/club references, candidate flight reference, capture time, source view, raw field labels/values, adapter version; requested/returned dates, participation/column filters, pages/caps, completion/errors | Candidate `flid` matched one detail reference; stable context, repeat identity and complete history are open. Coverage metadata is adapter evidence, not a flight column. Do not retain credentials or signed navigation secrets. |
| Core: date and time | `Datum`, `Start`, `Landung`, reported `Flugzeit` and unit; `Off-Block`, `On-Block`, reported block duration when available | Flight/clock/minute fields displayed; off/on-block offered in configuration. Manual says UTC input. Verify selected representation, overnight date association and corrections; retain missing date/time basis explicitly. |
| Core: aircraft | `Lfz.`, `Lfz.-Muster`, `Luftfahrzeugart`; catalogue registration/model/class and candidate aircraft reference where accessible | Flight fields and catalogue classes observed. Verify the flight-to-catalogue join, historical coverage and conflicts. Store classification evidence/freshness, not ownership/contact details. Cleaned model is a later derived value. |
| Core: people and role evidence | `Pilot`, `PIC`, `Begleiter/FI`, additional companions and `SIC`; `PIC-Time`, `Dual-Time`, `FI-Time` and units; subject-pilot association and person references if available | First three people fields and PIC/dual times displayed; additional companions/SIC/FI time offered in configuration. Exact person identity, role allocation and blank semantics remain open. |
| Core: operations and places | `S.-Art`, `Flugart`, `Flugmodus`, `Startort`, `Landeort`, `Landungen`, `Km` | Distinct list/detail labels observed; preserve raw codes/text. Verify code dictionary, club-configured flight-type meanings, units and total landings. Do not presume day/night split. |
| Core: status and changes | `Duplikat`, `Bemerkung`, necessary source club/creation/change metadata; retrieval revisions | Duplicate flag offered; detail provenance observed. Verify export/adapter representation and update semantics. Source absence is not deletion. Remarks may contain private data and remain local. |
| Conditional: engine | `M.-Start`, `M.-Ende`, `Motorzeit`, aircraft meter unit | Configuration/manual evidence; actual readings and units require comparison. Do not default missing motor time to zero. |
| Conditional: operational conditions | Explicit day/night takeoff/landing counts, night/IFR duration, flight rules, cloud/aerobatic conditions and endorsements if exposed | Not verified as dedicated fields in the selected own-flight view. Inspect details/export and document gaps. Free-text or clock-based guesses must not become confirmed conditions. |
| Later association | `Ausbildungsschritt zugeordnet`, stable training-objective references if available | Configuration and training links observed, stable joins open. Preserve a relevant link when available; defer broad syllabus retrieval. Multiple objectives must not duplicate flight time. |

Do not collect member contact records, medical documents, aircraft-owner identities or the complete training/duty dataset to support this slice. Following Manuel's subsequent 2026-10-11 suggestion, own-flight costs are a separate optional enrichment proposal, rather than a mandatory logbook field: verify charge lines, currency, total, charged-party attribution and billing status before using them. See the [list/detail proposal](../architecture/vereinsflieger-import-contract.md#list-discovery-plus-per-flight-detail-enrichment--2026-10-11-proposal). Pilot profile details, starting totals, locally confirmed corrections and endorsements may need separate inputs if absent from the source. Source capture completeness and eventual logbook completeness are different checks.

## Preservation rules

- Retain the necessary original labels, values and provenance locally; preserve empty cell positions and units. A normalized value links back to its evidence and mapping version. No personal sample belongs in Git.
- Distinguish unavailable/not captured, source blank, invalid/unresolved and known value (including zero). Do not silently normalize all these to zero or an empty string.
- Keep reported durations alongside derived comparisons. Preserve overnight context rather than subtracting same-date clock strings blindly. Timezone is attached to verified representation, not inferred from the dashboard.
- Keep source-flight identity independent of book-entry identity. Retrieval is shared across the pilot's books; assignment, paper progress and output placement are later book-scoped work.
- Retain source revisions and conflicting classifications/roles for review. Missing records do not delete saved evidence. Failed/partial retrieval does not establish coverage.
- The present native probe is capped at 20 raw rows and is not a production implementation of this inventory. Canonical live import stays gated by the [import contract](../architecture/vereinsflieger-import-contract.md).

## Next executable slice

1. Verify this core inventory against the personal list, configuration, details and permitted export if exposed. Prefer a bounded read-only method that does not reset the user's saved preferences. Record each field as available, permission-limited, missing or unresolved, with source label, unit and meaning.
2. Compare repeated retrieval and details for representative accessible own flights; check corrected duration, multi-landing, companion/instructor distinction and duplicate flags. Verify catalogue joins across available classes. If the user has no own flights in a class, use synthetic cases and mark live mapping untested rather than inspect unrelated members' flights.
3. Demonstrate complete bounded date/participation coverage and stable account/club/flight identity, including pagination, a verified empty window and an interrupted refresh. Preserve source evidence locally and reopen it offline.
4. Use sanitized synthetic fixtures for the verified field mappings and meaningful failure cases: missing columns, blanks versus zero, changed column order, overnight flights, corrected durations, changed records, ambiguous crew/category and duplicates. Present concrete mapping/identity changes for architecture review before canonical database integration.
5. Complete the multi-book isolation/migration proof before production import. Define book-specific output profiles after source capture and normalization are reliable; final visual polish follows the working flow.

#10 supplies discovery evidence; #2 owns the capture/retrieval proof and later canonical integration; #11 retains shared-source/multiple-book requirements. No new issue is needed for this review. Broad training/duty feature implementation is later work.

The [2026-10-11 bounded follow-up](../verification/2026-10-11-vereinsflieger-capture-fields.md) records desktop repeat/default-column/empty-date observations and the executable raw-field inspection/default-view reader fix. Complete verified history and canonical import remain open.

The [proposed capture/storage data model](../architecture/vereinsflieger-capture-data-model.md) is the consolidated presentation of what will be stored: source/coverage records, flight fields, aircraft lookup/revisions, optional costs and missing/conflict states. Source data is shared across books; paper progress/output remain separate.

## Review verification

The supplied JSON was read in full. Reviewed against the recorded authenticated provider/manual findings, existing import contract, multi-book requirements and primary sources linked above. Documentation-only changes: local Markdown destinations and whitespace checked before publication. No new browser inspection, export retrieval, native test, schema implementation or architecture approval is claimed.

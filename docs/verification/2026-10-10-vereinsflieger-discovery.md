# Vereinsflieger website and manual discovery

Observed: 2026-10-10, Europe/Berlin. Tracking: [#10](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/10), import [#2](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/2), statistics [#9](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/9), multiple books [#11](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/11).

## Scope and evidence

Manuel authorized this investigation and signed into Chrome directly. Inspection used the member UI and authenticated online help, read-only navigation, date/participation filters, initial list configuration inspection without applying changes, and bounded DOM structure checks. Later Manuel explicitly suggested resetting the flightbook configuration; that reset was applied and verified, without deleting the saved named configuration. The displayed application version was `2026.07.11 (27.562658)`; individual manual pages did not display a revision date. This is desktop browser evidence, not a new native adapter test or a supported API contract.

No flights, training records, assignments, bookings or messages were created/edited. No calendar subscription was created. No personal rows, member identifiers, flight identifiers, signed navigation URLs, private feed links or screenshots are included in this report. Counts and labels below describe structure; examples are synthetic. Previously stored native captures remain separate from the canonical logbook.

Findings cover all three requested areas, but export bytes, complete history/paging, exact roster timezone and additional aircraft-class flight examples remain unresolved. The aircraft catalogue follow-up below verifies glider, powered, TMG and UL catalogue entries. Keep #10 open for those follow-ups; this report does not claim complete discovery or feature acceptance.

## Navigation and capability inventory

Paths below were observed under `https://vereinsflieger.de`. Parameter names describe observed links; personal values are deliberately omitted. They are navigation evidence, not endpoints to call outside the authorized browser session.

| Area / navigation | Observed path | Result and limits |
| --- | --- | --- |
| Mein Profil → Mein Flugbuch | `/member/profile/flightlog.php` | Own-flight list; date and participation filters; configurable columns; summary and record count. |
| Flight eye icon → details | `/member/profile/viewflight.php?flid=…` | `Eintrag` matched the selected list link's reference. Includes provenance/change metadata and detailed fields. Cross-account durability and export parity remain unproven. |
| My club → Luftfahrzeuge | `/member/community/planes/list` | Explicit aircraft category separate from model, registration and ownership; glider, powered, TMG and UL entries observed. Visibility and historical coverage must not be assumed complete. |
| Berichte & Statistiken → Meine Auswertungen | `/member/reports/?category=Meine Auswertungen` | Personal monthly/yearly flights, winch launches, UL/TMG flights, distance and gliding-time reports were listed. Report presence does not establish all formulae or class mappings. |
| Meine Flüge pro Monat | `/member/reports/19` | Opened successfully; year filter and columns `Monat`, `Starts`, `Blockzeit`. Its duration measure is block time, not automatically airborne time. |
| Mein Profil → Meine Ausbildung | `/member/profile/usereducation/` | Own training enrolment visible with syllabus, start/end, association reporting and practical/theory progress columns. |
| Training eye icon → Übersicht | `/member/profile/usereducation/summaryueid?ueid=…` | Separate practical/theory objectives, progress checks, training-flight totals, syllabus/publisher/training establishment and comments. Unneeded identity/contact/document content must not be ingested by the future adapter. |
| Praktische Ausbildung | `/member/profile/usereducation/editelidp?ueid=…` | Own hierarchical objectives, start/end dates and instructors, landings and block time. Student editing is unavailable; the path name does not imply permission to edit. |
| Theoretische Ausbildung | `/member/profile/usereducation/editelidt?ueid=…` | Own objectives with start/end dates, instructors and duration. |
| Mein Profil → Mein Trainingsstand | `/member/profile/skill.php` | Accessible separate experience/licence-status view; not the syllabus completion record. |
| Mein Profil → Meine Dienste | `/member/profile/myservices.php` | Personal current/upcoming list accessible; empty in this inspection. |
| Alle anstehenden Dienste | `/member/profile/allservicelist.php` | Accessible assignments list with duty, period and people. Current data contained cleaning duties; no assignment names retained. |
| Club → Dienste | `/member/community/serviceshedulelist.php` | Plan and current/upcoming filters. Instructor, flight-leader and winch-driver plans offered. Selected `Fluglehrer` and `Flugleiter 2026` returned no matching current/upcoming records. Historical assignments and instructor-plan pagination were subsequently verified; Manuel confirms scheduling ended last week for winter. |

## Primary manual sources

The [manual workflow follow-up](2026-10-10-vereinsflieger-manual-workflows.md) adds the visually verified generic CSV export menu, club-defined flight types, curriculum validity/assessment scales, duty/reservation interactions and calendar subscription scope. Actual personal-flight export remains unresolved.

All links were opened and read in the authenticated browser unless explicitly described as a public lead. Summaries describe the provider, not independently validated regulatory rules.

| Manual page | Evidence relevant to MoFlight |
| --- | --- |
| [Mein Flugbuch, 16002](https://vereinsflieger.de/member/help/index.php?hid=16002) | Period/participation selection, detailed flight view, footer statistics; duplicate marking excludes records from licence-maintenance checks. Personal flightbook visibility differs from club main flightbook visibility. Excel/PDF export described. |
| [Arbeiten mit Listenansichten, 2002](https://vereinsflieger.de/member/help/index.php?hid=2002) | Column filters/sorting, pagination, configurable column order/visibility and rows per page. Some fields depend on rights. Exports described. |
| [Hauptflugbuch, 5000](https://vereinsflieger.de/member/help/index.php?hid=5000) | Club list visibility depends on rights; aircraft holder/owner affects scope. Date filters and aggregate footer are described. |
| [Erfassen und bearbeiten von Flügen, 5001](https://vereinsflieger.de/member/help/index.php?hid=5001) | Start and landing input use UTC. Pilot may be the student; companion can be instructor or guest. Flight minutes can be corrected; off/on-block values can differ. Landings can exceed one. |
| [Luftfahrzeuge – Erfassen und bearbeiten, 4001](https://vereinsflieger.de/member/help/index.php?hid=4001) | Aircraft category is explicit; TMG is distinguished from a glider with a retractable engine. Model description is free text. Engine-meter unit is configured per aircraft. |
| [Berichte & Statistiken, 14000](https://vereinsflieger.de/member/help/index.php?hid=14000) | Reports use period/sort/filter settings; club and linked-club scope differ. |
| [Meine Ausbildung, 16011](https://vereinsflieger.de/member/help/index.php?hid=16011) | Page exists but has no substantive explanatory body; use the fuller Ausbildung section below. |
| [Ausbildung, 8500](https://vereinsflieger.de/member/help/index.php?hid=8500) | Role-controlled training records, student read-only view, practical/theory sections and linked flights. Instructor-only comments must remain inaccessible to student integrations. Sharing with another training club is explicit. Student exports described. |
| [Praktische Ausbildung, 8508](https://vereinsflieger.de/member/help/index.php?hid=8508) | Objectives have start/end dates and instructors; assigned school flights contribute block time/landings. Comments can target instructors or the student. |
| [Theoretische Ausbildung, 8501](https://vereinsflieger.de/member/help/index.php?hid=8501) | Subject, teacher and attendance duration in hours/minutes are recorded; completion is a separate action. |
| [Mein Trainingsstand, 16001](https://vereinsflieger.de/member/help/index.php?hid=16001) | Experience display is based on historical flights and includes separate licence indicators. The page contains legacy regulatory references and acknowledged display limitations; do not use it as a current legal eligibility specification. |
| [Meine Dienste, 16004](https://vereinsflieger.de/member/help/index.php?hid=16004) | Distinguishes personal, all-upcoming and exchange views. Calendar integration is configured separately; no private feed was generated or inspected. |
| [Dienstpläne / Dienste, 12000](https://vereinsflieger.de/member/help/index.php?hid=12000) | Plan visibility/edit rights are independent. Special instructor plans may feed reservations. Plan export is described, but its availability to this member was not established. |

## Flight field dictionary and import implications

### Aircraft catalogue follow-up

Following Manuel's pointer, `My club → Luftfahrzeuge` was inspected on 2026-10-10 at `/member/community/planes/list`. The visible columns are `Lfz.`, `Wkz`, `Luftfahrzeugart`, `Musterbezeichnung`, `Eigentümer/Halter` and `Vereins-LFZ`. Aircraft links expose `viewplane.php?apid=…`, a candidate provider aircraft reference; cross-view identity matching and reference durability remain unverified. No registration, owner names or actual identifiers are retained here.

The catalogue explicitly contained `Segelflugzeug`, `Motorflugzeug`, `Reisemotorsegler` and `Ultraleicht - Aerodynamisch`. This closes the earlier gap for **observed catalogue examples** of powered/TMG/UL categories, but does not verify flights or export mappings for those categories, nor the provider's complete category vocabulary. Model names and aircraft category are separate fields. A reservation-only placeholder was also present; catalogue membership alone does not prove a real aircraft or a flown record. Visibility is permission-scoped, as described by [Benutzerrollen](https://vereinsflieger.de/member/help/index.php?hid=17002), so this is not proof of coverage for every aircraft in a pilot's history.

Recommended mapping: preserve any explicit category from the flight; use a verified aircraft-reference match to the catalogue as supplementary classification evidence. Where flights expose only registration, validate an unambiguous match and retain source/freshness; missing or conflicting matches remain unknown for review. Do not infer class solely from model text or silently overwrite a conflicting flight category. Aircraft category can inform statistics and proposed book routing, but does not identify a particular pilot logbook or its paper format. No connector code or automatic book routing was changed.

In the inspected flight list, column headers are duplicated into fixed-layout presentation elements; some `th.innerText` values were empty while `textContent` contained the labels. Empty cells are meaningful and must retain their positions. Resolve headers explicitly and reject ambiguous mappings rather than relying on text order or nonempty cells.

| Provider field | Evidence / meaning | Preservation and unresolved points |
| --- | --- | --- |
| `Eintrag`, link `flid` | Same candidate reference in one list/detail comparison | Preserve provider-scoped reference; confirm repeat/export stability and account/club identity before production keys. |
| `Datum` | Date shown as day.month.year | Preserve source date; verify cross-midnight and export date/time mapping. |
| `Start`, `Landung` | Clock values; manual 5001 specifies UTC input | Documentation basis is now known; still verify each selected export/adapter representation. Do not infer timezone from page clock. |
| `Flugzeit`, `Flugzeit in hh:mm` | Minutes and formatted airborne duration | Manual permits correction, so a duration differing from clock subtraction requires review, not silent overwrite. |
| `Blockzeit in Minuten` / `Blockzeit in hh:mm`, `Off-Block`, `On-Block` | Separate time measures; latter fields offered in configuration | Keep distinct from flight/engine time. Full native mapping remains open. |
| `Pilot`, `PIC`, `Begleiter/FI` | Separate visible fields; pilot can be student, companion can be instructor or guest | Do not equate Pilot with PIC, or every companion with instructor. Stable person IDs remain unverified. |
| `Begleiter 2`, `Begleiter 3`, `SIC`, `FI-Time` | Additional fields offered in configuration | Existing crew/role model must be reviewed; field presence alone does not settle semantics. |
| `PIC-Time`, `Dual-Time` | Separate visible duration columns | Preserve provider values and unknowns; exact allocation rules still require comparison. Blank is not automatically zero. |
| `Lfz.`, `Lfz.-Muster` | Registration and model description | Model is free text per manual; neither provides a verified stable aircraft identity. |
| `Luftfahrzeugart` | Explicit class column present; glider values observed | Preserve raw class. TMG distinction documented; actual UL/powered records and complete category vocabulary not inspected. Class does not identify a MoFlight book or paper format. |
| `S.-Art`, `Flugart`, `Flugmodus` | Launch method, flight type/purpose and operational mode are distinct | Detail view expands labels; do not merge categories. Full code dictionary remains open. |
| `Startort`, `Landeort`, `Km`, `Landungen` | Places, distance and landing count | Place identifiers/distance precision remain unverified. Landings may exceed one. |
| `Duplikat` | Explicit field offered in configuration; duplicate count in footer | Preserve marked records and flag; exclude from appropriate counts only with verified policy. Never silently delete or merge different IDs. |
| `Verein`, `Bemerkung`, provenance/change metadata | Source context, free text, creation/change details | Retain necessary provenance locally; display names are not identity keys. Minimize unrelated billing/contact information. |
| `M.-Start`, `M.-Ende`, `Motorzeit` | Optional engine readings/time | Per-aircraft meter units documented; cannot reuse the gliding minute calculation blindly. |
| `Ausbildungsschritt zugeordnet` | Optional training association field | Treat objective membership separately from flight identity and paper-book membership. |

### Filters, coverage and visual conventions

- Observed period choices: recent 20 flights within 24 months, recent 7/90 days, recent 1/2/3 years, named months/years, and custom from/to controls. Custom boundaries and flight-list multi-page traversal were not executed here; duty pagination was checked separately.
- Observed participation choices: `Pilot`, `Pilot oder Fluglehrer`, `Fluglehrer`, `Begleiter`, `Pilot oder Begleiter`. A 90-day pilot selection and subsequent pilot-or-companion selection both loaded successfully. Equality of this user's result counts does not prove equivalence of the filters.
- Configuration showed 200 rows per page and offered 5 through 1000. It was initially inspected without applying settings. The subsequent user-requested flightbook reset returned a default 16-cell layout (including the action column), recent-20/Pilot filters and a visible success message; named `Flugbuch Export` remained available. The default omits model, explicit PIC, aircraft class and the separately displayed block/PIC/dual duration columns from the previous 24-cell view. Resetting is therefore not a sufficient import contract and should not be an automatic destructive-to-preferences prerequisite. Future automation must detect pagination and column filters, not assume a fixed page size or all-history coverage. Signed `_params` navigation links must be followed as supplied, not fabricated or committed.
- In the inspected sample every flight occupied one DOM row with 24 cells and row spans of one. Text wrapping can make it look like several lines. Alternating `alternative` classes produced pale-blue/transparent backgrounds independently of date/role. This supports readability striping in this view, not semantic grouping.
- A distinct `disabled` class occurred exactly as often as the footer's duplicate count; these records occurred on both stripe colours. The total record count equalled counted flights plus marked duplicates. Combined with manual 16002 and the available `Duplikat` column, this supports the duplicate explanation for the previously observed discrepancy. It does not establish a stable CSS contract or prove that all future disabled rows have the same meaning.
- Multi-row records in other configurations remain unverified. Use explicit flight references, preserved empty cells and status fields; never use background colour as identity or record boundary.
- Excel/PDF exports are documented, but no export control was exposed in the inspected desktop list/configuration view, including after the user-requested reset. The saved configuration named `Flugbuch Export` is not evidence of an export action. No export bytes or structured-response contract were inspected in this pass; the cause of the missing controls remains unknown.

## Training semantics and future use

The own-training overview and both detail tabs loaded. Practical columns are `No`, `Status`, `Lernziel`, `Fluglehrer (Begonnen)`, `Begonnen am`, `Fluglehrer (Beendet)`, `Beendet am`, `Landungen`, `Blockzeit`. Theory has the corresponding objective/start/end fields and `Dauer`. The overview separates not-started, started and completed objectives, progress checks, theory hours and training-flight totals.

Manual 8500 documents green completed/yellow started progress and separates student-visible from instructor-only comments. Some status cells have no accessible text; a blank status cell must not be interpreted as not started. A future adapter should use documented date/status evidence and verify icon semantics. A completion date can be present without a displayed completing instructor; retain missing attribution explicitly.

The practical view warns when a flight belongs to multiple objectives. Consequently, objective membership is many-to-many: aggregate distinct flight identities, not the sum of every objective's flight counters. The manual also distinguishes all flights since training start from flights assigned to the syllabus. Neither the training summary nor a flight count is complete pilot history.

Syllabus name, publisher, training establishment and enrolment reference were visible, but a stable syllabus version and objective identifiers were not verified. Training data could later personalize SPL study suggestions, while MoFlight quiz mastery, provider-recorded completion and formal qualification remain separate facts. No grades, signatures, regulatory eligibility or licensed training-content reuse are inferred from these pages.

## Duty semantics and availability

Own and all-upcoming views are distinct. The club view supplies a plan filter with `Fluglehrer`, `Flugleiter`, a year-specific flight-leader plan, `Windenfahrer` and cleaning plans. The inspected current/upcoming instructor and year-specific flight-leader selections were empty. Manuel subsequently confirmed that these assignments are published here and the scheduled season ended last week as winter approaches. The `Alle Dienste` filter then exposed historical flight-leader and instructor-plan assignments. This resolves the seasonal explanation for this inspection; a general adapter must still distinguish empty results, missing access and retrieval failure.

Fields are duty label, period and assigned people; personal view also offers exchange and originating-plan columns. Retain the precise provider role; do not translate Flugleiter into Fluglehrer. Scheduled assignment is not guaranteed availability. Multi-person assignments and date ranges occur. No names are retained here. The historical instructor-named plan contained multiple duty labels, including Fluglehrer, Flugleiter and Windenfahrer, with some exchange-offer annotations. Plan name alone is not the assignment role. Its next-page link was followed successfully and a second page of records loaded; full data was not retained. The current/upcoming period was restored afterward.

At the observation date, next week is 2026-10-12 through 2026-10-18 and its weekend is 2026-10-17/18 in Europe/Berlin. These are request-resolution dates, not a verified provider timezone. Exact duty timezone, day-boundary interpretation, update cadence, stable assignment IDs and removal/change semantics remain open. A future answer must state scope, retrieval timestamp and cached/stale status, and distinguish no matching assignment from inaccessible data or retrieval failure.

## Recommended next executable checks

1. Resolve the export-control discrepancy and inspect a bounded own-flight export privately. Compare reference, class, duplicate status, roles, UTC values, flight/block time and row count against UI/details. If unavailable, document why and review a strict table/detail adapter with explicit required fields.
2. Review [ADR 0007](../adr/0007-multiple-logbooks-and-formats.md) and the migration plan before canonical live imports. Use one synthetic pilot, four books (two with one format), independent paper state and shared source evidence. Keep unknown classification/book routing in review.
3. Add focused synthetic adapter cases for reordered/missing columns, preserved empty crew cells, duplicate flags, wrapped/multi-row presentation, multiple crew, flight/block/engine differences and corrected durations. Prove complete bounded-window import, retries and transaction rollback separately from discovery.
4. Use the verified historical duty structure to prepare synthetic cases for mixed-role plans, pagination, exchange annotations and winter/no-assignment results. Manuel confirms the plans are maintained here. Verify timezone, assignment IDs and refresh semantics before an automated answer; do not infer future people from past flights.
5. Keep training integration later. First verify syllabus/objective versions, explicit completion/status semantics and student-visible comments; do not import unrelated student-file documents.

No schema change, live canonical import, cloud provisioning, AI call or GUI redesign is part of this evidence update. ADR 0007 remains proposed. Final visual design follows a usable end-to-end workflow; essential book selection, review, copy confirmation and readability are tested during development.

## User clarification and view reset

Manuel confirmed on 2026-10-10 that instructor/flight-leader duties are maintained in Vereinsflieger and this season's planned duties ended the previous week. He did not know the export procedure and suggested resetting the list configuration. The reset was executed through `Konfiguration laden → Zurücksetzen`; its success message and changed headers were verified. A local screenshot records the result but remains outside Git because it contains personal flight rows. The browser was returned to the default personal flightbook. No named configuration was deleted; no export was generated.

Validation of this documentation change: current repository/Issues/ADRs reviewed; relative Markdown links and whitespace checked; no runtime code changed or app tests rerun. The browser observations above are the new executable evidence.

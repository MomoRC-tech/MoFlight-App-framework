# Vereinsflieger manual: feature workflows and implications

Investigated 2026-10-10 for [#10](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/10). Follow-up to the [authenticated discovery report](2026-10-10-vereinsflieger-discovery.md), following Manuel's request to investigate how the features work through the manual. This is documentation research, not feature implementation or architecture approval.

The authoritative source used is the provider's online **Hilfe und Anleitungen**. Its index explains that the question-mark control opens contextual help and its search box searches the manual. An internet search did not locate an authoritative standalone general PDF handbook; that does not establish that none exists. The linked REST PDF is an interface specification, not the general user manual. Manual pages were read through authenticated Chrome; their links may require login. No revision dates were shown on the chapters below.

## Lists and exports

The [list manual](https://vereinsflieger.de/member/help/index.php?hid=2002) describes this workflow: select period/scope, filter or sort through column headings, configure visible columns/order and page size, then choose the export format at the upper right. Its **illustration**, beyond the accompanying text, explicitly shows XLS, XLSX, CSV and portrait/landscape PDF in a menu beside the configuration selector. Thus CSV is documented for the generic list UI, but an actual personal-flight CSV schema is still unverified.

Configuration and export are separate controls. The [personal flightbook chapter](https://vereinsflieger.de/member/help/index.php?hid=16002) describes Excel/PDF export specifically. After the authorized reset, the live personal-flight toolbar contains the configuration selector and configuration gear, with no corresponding export control. This was checked against the illustrated toolbar and its rendered DOM. The reason remains unresolved; the manual does not justify attributing it to the user's permissions. A saved view named `Flugbuch Export` is not an export action. No file was generated.

MoFlight should discover headers and verify required fields, filters and complete pagination. It should not require a preference reset or assume that generic export documentation proves a usable export in every account/view. The search result titled `Datenexport` (chapter 6502) concerns accounting/SEPA and is not evidence for flight export.

## Flight types and statistics

[Flugarten](https://vereinsflieger.de/member/help/index.php?hid=17008) distinguishes fixed flight types from club-defined additions. Custom types can carry training and/or aerotow flags. A school flight may be solo or with an instructor. Aerotow as the towing aircraft's flight type is different from aerotow as the glider's launch method.

Implication: retain raw flight-type codes/labels and verified classification flags; do not derive dual time solely from `Schulflug` or merge launch method with flight purpose. A universal hard-coded label dictionary would lose club-specific meaning. This chapter describes provider behavior, not an independently verified legal eligibility rule. Exact PIC/dual/FI allocation still needs source-value comparison.

## Training records and curricula

The [training manual](https://vereinsflieger.de/member/help/index.php?hid=8500) explains how instructors create a student's syllabus record, mark objectives started/completed and assign flights. Students see their own record read-only. Comments can be student-visible or instructor-only. Training flights can be filtered to flights since training began or flights assigned to the selected syllabus; those are different scopes. The chapter documents student Excel/PDF exports and additional CSV export for training lists, without establishing current account availability.

[Lehrpläne](https://vereinsflieger.de/member/help/index.php?hid=17019) adds important structure: organizations can supply curricula or define their own; classifications include training courses, class ratings, other authorizations and instructor qualifications. A validity end date stops new assignments but does not terminate a student's existing curriculum. Practical assessment scales are configurable by the owning training organization, including grades and colors.

Implication: preserve curriculum owner, classification, validity and original assessment scale when exposed. An expired assignment window is not failed or expired student progress. Do not normalize an unfamiliar grade/color into pass/fail, or equate provider completion with MoFlight quiz mastery. A stable curriculum revision identifier remains unverified.

## Duties, reservations and calendars

The [duty manual](https://vereinsflieger.de/member/help/index.php?hid=12000) separates plan visibility, editing and member self-enrolment. A specially configured instructor plan restricts enrolment to instructors and feeds the reservation view; a plan merely named `Fluglehrer` does not prove that configuration. It documents instructor booking restrictions within a rolling six-month past/future window for instructors maintaining such a plan; instructors without entries can be bookable at other times. Therefore empty duties do not establish unavailability.

Duty CSV download is documented through `Dienstplan runterladen`. Import provides a preview but can overwrite online changes/exchange offers; no import was attempted. Accepted exchanges update the plan. Mixed-role plans cannot restrict exchange offers by equivalent role; the manual recommends separate plans for that purpose. Retain role separately from plan name and refresh after changes.

The [reservation manual](https://vereinsflieger.de/member/help/index.php?hid=7000) distinguishes reservations, requests, instructor duty availability and aircraft/instructor blocks. Its calendar colors encode those states; this differs from ordinary flight-list striping. The list view offers current or historical entries. Aircraft must be reservable and user rights apply. Reservations may include an instructor; a waiting-list request can become a binding reservation after availability changes.

Implication: first implement only the requested read-only scheduled-duty answer. A later availability feature would additionally need reservations and blocks. It must not infer availability solely from duties, or initiate a booking while answering a question.

The [calendar manual](https://vereinsflieger.de/member/help/index.php?hid=13500) documents timed/all-day events with title, location and description; visibility can depend on membership status, club function or section. Selected categories can be subscribed to through ICS/iCal. A subscription reflects selected categories and permitted visibility, not necessarily the whole club roster. No feed was created or read; feed timezone, stable identifiers and refresh behavior remain unverified.

## Access and integration boundaries

[Benutzerrollen](https://vereinsflieger.de/member/help/index.php?hid=17002) documents additive role permissions and separate report visibility, with club-defined roles. One member's visible feature inventory is not every member's inventory. The chapter does not identify the cause of the missing export menu.

The [REST manual entry](https://vereinsflieger.de/member/help/index.php?hid=21101) reconfirms a club-created AppKey, 500 requests per day per key and a general commercial-use prohibition. This is already recorded in the [access investigation](../architecture/vereinsflieger-access-investigation.md); it is not a new transport decision. Manuel's browser-first direction remains unchanged, and REST specification/key work is future-only. No key, API call, private feed, booking or provider message was created.

## Next bounded work

1. Keep #10 open for the live export discrepancy, exact coverage, role/time mappings and roster timezone/identifiers. The manual investigation has now supplied concrete workflows and constraints; repeating the generic manual search is not the next gate.
2. For #2, compare a bounded own-flight retrieval against independently visible details and any accessible real export. Fail explicitly for missing required fields or incomplete coverage. Generic manual CSV support does not validate the synthetic import fixture.
3. Carry the club-specific type and curriculum-scale findings into future synthetic adapter cases. Training, calendar and reservation implementation remain later scope.
4. Retain the proposed multi-book proof (#11/ADR 0007) before canonical imports; this research neither approves that ADR nor changes the agreed development-GUI sequencing.

Validation: linked manual chapters read directly, export illustration visually inspected, live toolbar compared without changing provider settings. Documentation links and whitespace checked; no runtime code changed, so app tests were not rerun. No personal records, screenshots or private identifiers included.


## 18 October 2026 duty-name follow-up

Manuel changed duty review item 4 to include **all duties in the timeframe**, because clubs can define their own names. He requested research into standard Vereinsflieger proposals as possible identification aids. This bounded follow-up is read-only research and requirements documentation, not an adapter, retrieval, classification or UI implementation.

| Source/evidence | Finding | Limit |
| --- | --- | --- |
| [Official members description, Dienste](https://vereinsflieger.de/Mitglieder), read 18 October 2026 | Gives Betriebsleiter, Windenfahrer and Fluglehrer as examples | Does not establish a mandatory/default duty catalogue or stable type codes |
| [Official calendar description](https://vereinsflieger.de/Termine), read 18 October 2026 | Gives Windendienst and Betriebsleiterdienst as examples | Example labels are not proof of universal semantics or default configuration |
| [Duty manual 12000](https://vereinsflieger.de/member/help/index.php?hid=12000), current browser attempt 18 October 2026 | Rendered the public login page; no authenticated help session was connected in the available browser | Current standard proposals/configuration could not be inspected; no credentials entered or provider settings changed |
| Existing [10 October authenticated discovery](2026-10-10-vereinsflieger-discovery.md#duty-semantics-and-availability) and duty-manual section above | A plan can contain several duty labels; specially configured instructor-plan behavior is not established by its name | Earlier bounded evidence, not a fresh authenticated/default-catalogue check or proof for all clubs |
| [Official demo access](https://vereinsflieger.de/Demozugang), read 18 October 2026 | Demo provision requires contacting the provider for an individually created platform | No request/contact/account was made |

Result: public material confirms examples; a universal default/proposal list, stable identifiers and an automatic semantic mapping are **not verified**. An authenticated read-only check of documented duty configuration/proposals remains tracked in #10. If standard metadata is available, it may support a reviewed club-scoped identification mapping; retain the source label, separate plan from assignment, and leave unknown/custom names included. Do not infer a role or restrict inclusion from an unverified label dictionary. Calendar-day, permissions, coverage/freshness and #15 privacy/name-display gates remain open.

Documentation verification: current journey/provider inventory/screen inventory/README/roadmap checked for agreement and unsupported default/success claims; source links and local anchors checked; `git diff --check` passed. No app/provider integration/device tests, new private data capture, settings changes, messages or paid execution. Temporary browser help tab closed; existing provider sessions/emulators untouched.

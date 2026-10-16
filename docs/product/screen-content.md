# MoFlight screen content and placement

Version **0.1**, 2026-10-16. Owner: Manuel. Working inventory for review, independent of visual styling. Git preserves revisions. Stable IDs let us change individual placements without describing an entire screen again.

## Purpose and authority

M1 discovery deliverable: state **what information belongs on which screen, in which logical area, and where an action leads**. Dependencies: the [reviewed journeys/information needs](2026-10-13-journey-information-map.md), the latest explicit placement choices recorded in [app-design.md](app-design.md), and the [v0.23 preview](prototypes/2026-10-16-clickable-v023.html). Existing Issues #9 and #11 were checked open on this date; no new Issue is needed.

This file is the working content-placement record; app-design.md covers appearance and its visual decision history. The journey map explains user goals and required behavior; the roadmap controls delivery. Review acceptance: Manuel can identify, add, move or remove information by ID; each selected item has a destination/scope, and unresolved placements are visible. Creating this inventory neither approves new placement proposals nor completes M1.

No colors, icons, card shapes, typography, charts or pixel measurements are specified here. “Top,” “summary,” “list” and “details” describe information hierarchy rather than an exact visual composition. The current prototype is evidence of a presentation, not the source of new requirements. Documentation/UI language: English here, German labels in the app.

**Status key:** **Selected** = explicit current placement choice; **Required / placement open** = information need already confirmed, exact placement unresolved or missing from the prototype; **Draft** = prototype arrangement or engineer proposal awaiting review. Status is about content/placement, never implementation or provider availability. Guided and later views below are intended content, not delivered app features.

## Shared screen areas

| ID | Area | Information / action | Status |
| --- | --- | --- | --- |
| G01 | Header | Current destination or Start branding; contextual Back on subordinate screens | Selected |
| G02 | Header, sync control | Source-data freshness state and last successful retrieval date/time; action requests refresh. Do not imply paper progress or cross-device sync is current | Selected; freshness policy/scope open |
| G03 | Header, profile entry | Open profile/account/settings | Selected; settings content partly draft |
| G04 | Main navigation | Start, Flüge, Papierbuch, Verein; retain destination context | Selected |
| G05 | Guided paper-book steps | Book identity and Back; main navigation hidden while checking/reviewing/preparing | Selected |
| G06 | Relevant data section | Missing/unknown values, incomplete coverage, stale/unavailable state and appropriate next action; failed refresh retains saved information | Required; exact presentation open |

## Start — overview and entry points

Order: flying overview → paper-book overview → club overview. This reflects the selected Micro Bento arrangement without prescribing its visual treatment.

| ID | Area / order | Information shown | Action / destination | Status |
| --- | --- | --- | --- | --- |
| S01 | Flying heading | Current season/year | Context for S02–S05 | Selected |
| S02 | Flying summary | This year's flight count; compact comparison with the same period last year | Count analysis and contributing flights in Flüge | Selected |
| S03 | Flying summary | This year's known flight time; number of flights with unknown duration | Time analysis, prior-year comparison and contributing flights | Selected; prior-year time comparison is in details |
| S04 | Flying summary | Most-flown aircraft; share/count of the selected period's flights | Aircraft analysis and contributing flights | Selected; exact aircraft/model grouping open |
| S05 | Flying attention item | Number of flights needing review, such as missing duration | Flüge restricted to affected flights | Selected; issue eligibility/count scope open |
| S06 | Paper-book overview | Entry-proposal count and book-review/correction-case count across the user's books | Open Papierbuch overview at last-used book, with selector there | Selected; production aggregation/unknown rules open |
| S07 | Club overview, own duties | Next own duty: role, date and time; indication of further assignments through the following week's weekend | Full own-duty overview in Verein, including later-duty preview and relevant Putzdienst partner | Selected summary; completeness rules and later preview extent open |
| S08 | Club overview, work | Annual work hours completed and obligation | Work-hour details in Verein | Selected; source meanings/freshness unverified |
| S09 | Club notices | New news/documents, own assigned tasks, upcoming events; distinguish inactive from relevant/unknown | Corresponding Verein information | Selected summary; grouping/new-state/upcoming rules open |
| S10 | Club overview, flight operation | Current/upcoming Fluglehrer, Flugleiter and Windenfahrer assignments through the following week's weekend | Full flight-operation overview in Verein | Required / placement open: compact Start information is in the journey map but absent from v0.23 |

**Not directly on Start:** book selector, book names/last-entry details, flight-by-flight data, complete duty rosters, account balances, license/training details. Earlier saved-history totals are no longer on Start; obtain them from the all-years scope in Flüge. Book-specific progress remains separate even when S06 summarizes work across books.

## Flüge — list entry

| ID | Area / order | Information shown | Action / destination | Status |
| --- | --- | --- | --- | --- |
| F01 | Top summary | Flight count and known flight time for the active period/query; missing-duration count and coverage | Context for the displayed flights | Selected; query/state contract open |
| F02 | Search and filters | Search; period, aircraft, person flown with, own recorded role; active query scope | Update the displayed results; filter choices open over the list | Selected; exact searchable fields and persistence open |
| F03 | Group heading | Flight date | Group compact flight rows by day | Selected; ordering/time basis open |
| F04 | Flight row, main information | Aircraft registration/model and duration | Open that flight's detail view | Accepted for now; can revisit after layout review |
| F05 | Flight row, supporting information | Departure time, airfield, own recorded role | Same flight detail | Accepted for now |
| F06 | Affected flight row | Missing/uncertain-data marker and short reason | Review details; do not infer missing facts | Selected; resolution/editing behavior open |

## Flüge — analyses and flight details

| ID | Screen / area | Information shown | Action / destination | Status |
| --- | --- | --- | --- | --- |
| A01 | Analysis context | Selected measure, period, filters, comparable coverage, last update and unknowns | Preserve context from the summary that opened it | Selected behavior; exact hierarchy draft |
| A02 | Count/time analysis | Current-year value, same-period prior-year value and difference; known time qualified when durations are missing | Inspect contributing flights; select comparable period/year | Selected information; exact calculations/state rules open |
| A03 | Aircraft analysis | Aircraft distribution and supporting flights; distinguish instance from model | Inspect aircraft-specific flights | Selected information; grouping presentation open |
| A04 | Duration analysis | Distribution of known flight durations; unknown-duration count separately | Inspect contributing flights | Required information; duration bands/entry route open. Earlier Start summary need is absent from v0.23; decide its placement explicitly |
| A05 | Analysis, below summary | Flights behind the selected result | Flight details | Selected |
| D01 | Flight detail, overview | Date, aircraft and duration; prominent missing/uncertain values | Read the recorded flight | Selected; exact field arrangement draft |
| D02 | Flight detail, aircraft | Registration/model and recorded aircraft/start information | Read supporting detail | Selected section; exact fields draft |
| D03 | Flight detail, times/route | Departure/arrival information where recorded, duration, start/landing places and time basis | Read supporting detail | Selected section; availability/source semantics open |
| D04 | Flight detail, people/roles | User's recorded role and other pilot/person information | Read supporting detail | Selected section; identity/privacy policy open |
| D05 | Flight detail, evidence | Supporting source identification, retrieval context and uncertainty | Inspect evidence relevant to the flight | Selected section; source-field selection draft |

Flight details use one page with logically grouped information. This inventory specifies groups, not a visual layout. Unknown values stay unknown; no chart or AI suggestion silently establishes a recorded fact.

## Papierbuch — multiple independent books

| ID | Screen / area | Information shown | Action / destination | Status |
| --- | --- | --- | --- | --- |
| B01 | Overview, top | Selected book name and book selector; distinguish successive volumes of the same format | Switch the displayed book; entry defaults to last used | Selected; no-book/removed-book fallback open |
| B02 | Selected-book identity | Book format and volume/status where relevant | Context for every following book item | Book identity required; exact supporting fields draft |
| B03 | Selected-book status | Last confirmed paper entry, with number/date and identifying flight information | Open starting-point check | Selected information; exact entry fields open |
| B04 | Selected-book status, separately | Assumed writing progress and the template/batch it came from, when present | Verify at next use; never label it confirmed paper evidence | Required; exact presentation/trigger contract open |
| B05 | Selected-book pending work | Entries proposed for this book; review/correction cases | Review this book's work | Selected; eligibility/count/exception semantics open |
| B06 | Primary next action | “Buchstand prüfen” for the selected book | Begin guided starting-point check | Selected |
| B07 | Guided check | Current book, remembered last entry, confirmed-versus-assumed basis; ask whether it matches paper | Confirm unchanged entry, or obtain current photo | Selected journey; real recognition not delivered |
| B08 | Photo/evidence review | Visible entries, proposed transcription/matches, uncertain fields/format and source differences | Confirm/correct suggestions or leave unresolved | Required future view; detailed placement open |
| B09 | Proposed-flight review | Date, aircraft, duration and recorded own role; unresolved required values | Open flight/details; resolve relevant blockers before preparing instructions | Selected journey; detailed placement open |
| B10 | Writing preparation | Proposed entries for an adjustable page-sized batch; numbering/carryovers/totals appropriate to that book's format | Prepare phone-side and printable writing instructions from one snapshot | Selected journey; detailed presentation/format gates open |
| B11 | Exception/history access | Open, left unchanged/acknowledged and resolved discrepancies; prior decisions remain revisitable | Review/reverse decisions when relevant | Required / placement open |

All B-items are scoped to the selected book. One pilot may own multiple books, including same-format volumes. Changing books must not mix paper evidence, assumed progress, proposals, photos, decisions or writing snapshots. Remembering a prepared batch as assumed written is the selected journey; exact trigger, cancellation/reopening and partial-writing recovery remain open. No mandatory separate “finished writing” prompt is selected.

## Verein — full club information

These information needs were reviewed earlier. The v0.23 club page is only a small example; its order below is a **draft grouping**, not a newly approved full page.

| ID | Area | Information shown | Action / scope | Status |
| --- | --- | --- | --- | --- |
| V01 | Club context | Relevant club identity and freshness/coverage | Context for club information | Draft grouping; identity/access rules open |
| V02 | Own duties | All own assignments in the focused window, with role/date/time and later preview | Inspect duty; include the same-day Putzdienst co-assignee when applicable | Required; summary route selected, full arrangement open |
| V03 | Flight-operation duties | Fluglehrer, Flugleiter, Windenfahrer assignments through the following week's weekend | Inspect relevant duty roster | Required; source/access/coverage unverified |
| V04 | Work hours | Annual obligation, completed work and remainder; preserve hours versus monetary credit | Inspect work details | Required; definitions and detailed fields open |
| V05 | Own tasks | Assigned tasks and their status | Inspect a task | Required; detail arrangement open |
| V06 | News/documents | Relevant new items and their content/metadata | Open news/document | Required; “new” and read/access semantics open |
| V07 | Events/meetings | Upcoming relevant events, date/time and details; exclude birthdays | Inspect an event | Required; horizon and detailed fields open |

## Profile, connection and retrieval

| ID | Area | Information / action | Status |
| --- | --- | --- | --- |
| P01 | Profile/account | MoFlight account identity and relevant account settings | Profile entry selected; exact content open |
| P02 | Provider connection | Vereinsflieger authorization/connection/session status, distinct from MoFlight account identity | Required; exact placement/connection flow open |
| P03 | Retrieval request | Last successful update and proposed adjustable period; first retrieval defaults to current and previous year, subsequent request suggests since last success | Required; request-panel placement open; not proof of safe delta retrieval |
| P04 | Retrieval in progress/result | Progress, cancellation, completion/failure, retained saved data, retry and recovery when relevant | Required / placement open; prototype only has scripted status examples |
| P05 | Preferences | App-language preference and relevant display choices | Draft: German UI first; English option later; exact settings not selected |

## Placement backlog and deliberate omissions

| ID | Information | Current decision / next placement work |
| --- | --- | --- |
| O01 | Costs | Desired outputs: yearly flying costs separate from membership/other charges, then total flying costs per aircraft. Exact entry point/destination open; billing inspection/semantics deferred. Do not add a fifth main destination by assumption |
| O02 | Account balances | Detailed costs only; not Start and not a flight-cost total |
| O03 | License/training status | Detailed Flüge area only; exact access/position open and absent from v0.23. Do not infer that a provider indicator is qualification certification |
| O04 | Duty placement gaps | S10 flight-operation Start summary and later-own-duty preview extent still need a placement review; prototype omissions do not delete confirmed needs |
| O05 | Deferred concepts | Activities live, chat/AI, tutor and weather retain roadmap gates; no new Start item or implementation scheduled here |
| O06 | Excluded for now | Runway condition, defects and maintenance; birthdays excluded from relevant club events |
| O07 | Own reservations | User's reservations/resources and dates, details-only. Exact destination open; absent from the current prototype |

## How we review changes

Use an ID and a plain request, for example: “Move S04 into Flüge,” “Add the next event date to S09,” or “B03 should show the last entry number and date only.” The next revision records the answer and updates affected rows; examples here are not proposed changes. Mark a new field/placement Draft until Manuel selects it. Update the visual prototype after reviewing placement, rather than treating its current rendering as a constraint on information needs.

## Change log

| Version | Date | Change |
| --- | --- | --- |
| 0.1 | 2026-10-16 | Extracted current choices and unresolved needs into a design-independent screen-content inventory at Manuel's request. No new feature, field or placement approved by extraction |

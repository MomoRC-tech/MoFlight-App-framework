# MoFlight screen content and placement

For current visual directives, colors, typography, shapes and navigation presentation, use the [UI design handbook](design/README.md). This file retains content-placement requirements and their history; historical prototype descriptions do not establish current implementation status.

## Native shell update — 17 October 2026

Current native navigation is Übersicht / Flüge / Flugbuch / Verein / AI. A compact shared header stays fixed, shows the approved Thermik logo and opens Profil & Einstellungen from its far-right user control. Flüge remains saved searchable history; Flugbuch contains selected-book/paper status and access to existing reconciliation/writing tools. Local profile display name persists per synthetic library; cloud account, goals/medical and language switching remain unconnected. Season rings represent actual aircraft shares of flight count and known minutes. See [scope and acceptance](2026-10-17-native-shell-corrections.md). Historical screen specifications below retain their original statuses. [Verified native result](../verification/2026-10-17-native-shell-corrections.md): fixed header, five tabs, local profile and segmented rings implemented; physical retest and cloud integrations remain open.


> **Native target update — 16 October 2026:** the explicit [four-screen implementation request](2026-10-16-four-screen-implementation.md) selects Übersicht / Flüge / Verein / AI for the current native slice. Earlier inventories below preserve discovery placement history. Paper assistance opens from Übersicht; weather is an unavailable dashboard panel; AI includes supported deterministic local queries and an unavailable free-text service state. Actual selected-book facts replace reference examples. Club sections remain unavailable without a source. This does not complete canonical retrieval, weather, club or AI integration.

Version **0.7**, 2026-10-16. Owner: Manuel. Working inventory for review, independent of visual styling. Git preserves revisions. Stable IDs let us change individual placements without describing an entire screen again.

## Purpose and authority

M1 discovery deliverable: state **what information belongs on which screen, in which logical area, and where an action leads**. Dependencies: the [reviewed journeys/information needs](2026-10-13-journey-information-map.md), the latest explicit placement choices recorded in [app-design.md](app-design.md), and the [current v0.30 preview](prototypes/2026-10-16-clickable-v030.html). Existing Issues #9 and #11 were checked open on this date; no new Issue is needed.

This file is the working content-placement record; app-design.md covers appearance and its visual decision history. The journey map explains user goals and required behavior; the roadmap controls delivery. Review acceptance: Manuel can identify, add, move or remove information by ID; each selected item has a destination/scope, and unresolved placements are visible. Creating this inventory neither approves new placement proposals nor completes M1.

The [two Start alternatives, design review v0.31](2026-10-16-start-alternatives.md), explore clearer presentations of this content. Neither is selected; this inventory remains v0.7. In particular, the numerical overview in Klarer Überblick is a proposed alternative to the selected rings, not an adopted content decision.

No colors, icons, card shapes, typography, charts or pixel measurements are specified here. “Top,” “summary,” “list” and “details” describe information hierarchy rather than an exact visual composition. The current prototype is evidence of a presentation, not the source of new requirements. Documentation/UI language: English here, German labels in the app.

**Status key:** **Selected** = explicit current placement choice; **Required / placement open** = information need already confirmed, exact placement unresolved or missing from the prototype; **Draft** = prototype arrangement or engineer proposal awaiting review. Status is about content/placement, never implementation or provider availability. Guided and later views below are intended content, not delivered app features.

## Shared screen areas

| ID | Area | Information / action | Status |
| --- | --- | --- | --- |
| G01 | Header | Current destination or Start branding; contextual Back on subordinate screens | Selected |
| G02 | Header, sync control | Source-data freshness state and last successful retrieval date/time; action requests refresh. Do not imply paper progress or cross-device sync is current | Selected; freshness policy/scope open |
| G03 | Header, profile entry | Open profile/account/settings | Selected; settings content partly draft |
| G04 | Main navigation | Start, Flüge, Logbuch, Verein and Wetter; retain destination context. Logbuch is a short tab label for the existing Papierbuch destination, whose page title and flows remain Papierbuch | v0.26 draft |
| G05 | Guided paper-book steps | Book identity and Back; main navigation hidden while checking/reviewing/preparing | Selected |
| G06 | Relevant data section | Missing/unknown values, incomplete coverage, stale/unavailable state and appropriate next action; failed refresh retains saved information | Required; exact presentation open |

## Start — overview and entry points

Order: Meine Saison (flying totals, aircraft breakdown, monthly count chart, goals and medical indicator) → paper-book overview → club overview. The v0.26 prototype adds year-scoped user goals, a compact medical indicator, and Wetter placeholder; browser observations are recorded in the [v0.26 report](../verification/2026-10-16-weather-goals-medical-preview.md), while Manuel's visual review remains pending.

| ID | Area / order | Information shown | Action / destination | Status |
| --- | --- | --- | --- | --- |
| S01 | Season heading | Meine Saison and current year | Context for S02–S05, S08 and S11–S14 | Selected |
| S02 | Season aircraft summaries | Current-year and same-period prior-year flight count and known flight time, shown in two compact measure-specific rings; prior-year values are quieter in each center | Tap a ring to open its aircraft breakdown; open yearly comparison in Flüge | v0.28 selected preview presentation; same-period semantics remain open |
| S03 | Season aircraft summaries | Known flight time only; show missing-duration count separately and never include unknown durations as zero | Open flight-time aircraft breakdown; inspect affected flights in Flüge | Selected content; time comparison follows the same period as the count comparison |
| S04 | Season aircraft breakdown, inline below both rings | For the selected ring: aircraft short names/colors, count and known time; unknown-only time remains explicitly unknown. Selected aircraft contributes its count, known time and flight list | Tap a ring to open its compact breakdown; close it with its close button. Tap a row to open that aircraft's flights; yearly comparison opens in Flüge | v0.28 selected preview interaction; exact suffix convention remains open |
| S05 | Flying attention item | Number of flights needing review, such as missing duration | Flüge restricted to affected flights | Selected; issue eligibility/count scope open |
| S06 | Paper-book overview | Entry-proposal count and book-review/correction-case count across the user's books | Open Papierbuch overview at last-used book, with selector there | Selected; production aggregation/unknown rules open |
| S07 | Club overview, own duties | Next own duty: role, date and time; indication of further assignments through the following week's weekend | Full own-duty overview in Verein, including later-duty preview and relevant Putzdienst partner | Selected summary; completeness rules and later preview extent open |
| S08 | Season metrics, alongside flying overview | Annual work hours completed and obligation | Work-hour details in Verein | Requested move from club overview; source meanings/freshness unverified |
| S09 | Club notices | New news/documents, own assigned tasks, upcoming events; distinguish inactive from relevant/unknown | Corresponding Verein information | Selected summary; grouping/new-state/upcoming rules open |
| S10 | Club overview, flight operation | Current/upcoming Fluglehrer, Flugleiter and Windenfahrer assignments through the following week's weekend | Full flight-operation overview in Verein | Required / placement open: compact Start information is in the journey map but absent from v0.23 |
| S11 | Season, expanded below aircraft distribution | Monthly flight-count comparison for current year and prior year, month by month | Tap a month for exact counts and its contributing flights in Flüge | Selected for v0.25 prototype; unchanged in v0.28. Empty/future/current-partial month states must not imply zero or complete coverage |
| S12 | Season, around annual metrics | User's target for 2026 flight count and known flight time; annual Soll-Arbeitsstunden target is separate from completed hours shown as a Vereinsflieger example | Edit targets in Profile; inspect completed-hour example in Verein | v0.26 draft; synthetic values only, future year selector and live source mapping open |
| S13 | Season heading | Compact pulse symbol, visible “Med” label, one badge showing total documented medical entries (example: 2), state symbol and only the earliest recorded expiry date | Open medical details in Profile; show Klasse 2/LAPL entry names and dates there | v0.30 presentation; synthetic fixtures; intended source location reported by Manuel but unverified; date/state policy as described in app-design |
| S14 | Wetter destination | Placeholder page only; no defined weather content, data source or provider | Destination stub | v0.26 placeholder; scope and provider open |

**Not directly on Start:** book selector, book names/last-entry details, flight-by-flight data, complete duty rosters, account balances, license/training details. Earlier saved-history totals are no longer on Start; obtain them from the all-years scope in Flüge. Book-specific progress remains separate even when S06 summarizes work across books.

S02–S04 and S11 use the selected current-year scope. v0.28 shows flight count and known flight time in two small, label-free rings; each center contains the current value and a quieter same-period prior-year value. There is no measure toggle, external aircraft label, or connector. Tapping either ring opens its compact aircraft breakdown below both rings; a close action hides it. The breakdown shows short aircraft names, stable colors, count and known time; row tap opens the selected aircraft's flights and a yearly-comparison action opens Flüge. Unknown durations remain excluded from known-time totals; aircraft with no known time must remain visibly unknown, not be represented as zero. The per-ring goal remains beneath its ring; the missing-time notice stays with known-time context. S11's paired monthly count bars remain separate and unchanged; monthly gaps are still not zero. S12–S14 retain v0.26 meanings and states. Exact suffix convention remains open.

## Flüge — list entry

| ID | Area / order | Information shown | Action / destination | Status |
| --- | --- | --- | --- | --- |
| F01 | Top summary | Flight count and known flight time for the active period/query; missing-duration count and coverage | Context for the displayed flights | Selected; query/state contract open |
| F02 | Search and filters | Search; period, aircraft, person flown with, own recorded role; active query scope | Update the displayed results; filter choices open over the list | Selected; exact searchable fields and persistence open |
| F03 | Group heading | Flight date | Group compact flight rows by day | Selected; ordering/time basis open |
| F04 | Flight row, main information | Aircraft registration/model and duration | Open that flight's detail view | Accepted for now; can revisit after layout review |
| F05 | Flight row, supporting information | Departure time, airfield, own recorded role | Same flight detail | Accepted for now |
| F06 | Affected flight row | Missing/uncertain-data marker and short reason | Review details; do not infer missing facts | Selected; resolution/editing behavior open |
| F07 | Changed saved flight | Orange label or small dot when a later verified Vereinsflieger update changes its data | Explicitly acknowledge the change; opening alone does not clear it; paper progress is independent | Selected 18 October 2026; exact form/placement and revision/concurrent-update details open in [#30](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/30) |

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
| D06 | Flight detail, source changes | Each changed field with last acknowledged → current values across all unacknowledged provider updates; retain source revisions | Inspect changes; explicit acknowledgement remains separate | Selected 18 October 2026 in [#30](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/30); all changes since last acknowledgement selected; layout and detailed revision/concurrency handling remain open |

Flight details use one page with logically grouped information. This inventory specifies groups, not a visual layout. Unknown values stay unknown; no chart or AI suggestion silently establishes a recorded fact.

## Papierbuch — multiple independent books

| ID | Screen / area | Information shown | Action / destination | Status |
| --- | --- | --- | --- | --- |
| B01 | Overview, top | Selected book name and book selector; distinguish successive volumes of the same format | Switch the displayed book; entry defaults to last used | Selected; no-book/removed-book fallback open |
| B02 | Selected-book identity | Book format and volume/status where relevant | Context for every following book item | Book identity required; exact supporting fields draft |
| B03 | Selected-book status | Last confirmed paper entry, with number/date and identifying flight information | Open starting-point check | Selected information; exact entry fields open |
| B04 | Selected-book status, separately | Assumed writing progress and the template/batch it came from, when present | Verify at next use; never label it confirmed paper evidence | Required; trigger selected 18 October 2026; presentation/recovery open |
| B05 | Selected-book pending work | Entries proposed for this book; review/correction cases | Review this book's work | Selected; eligibility/count/exception semantics open |
| B06 | Primary next action | “Buchstand prüfen” for the selected book | Begin guided starting-point check | Selected |
| B07 | Guided check | Current book, remembered last entry, confirmed-versus-assumed basis; ask whether it matches paper | Confirm unchanged entry, or enter actual last written flight number for the named book; clarify/photo if unknown, ambiguous or required continuation values are missing | Selected journey; real recognition not delivered |
| B08 | Photo/evidence review | Visible entries, proposed transcription/matches, uncertain fields/format and source differences | Confirm/correct suggestions or leave unresolved | Required future view; detailed placement open |
| B09 | Proposed-flight review | Date, aircraft, duration and recorded own role; unresolved required values | Open flight/details; resolve relevant blockers before preparing instructions | Selected journey; detailed placement open |
| B10 | Writing preparation | Proposed entries for an adjustable page-sized batch; numbering/carryovers/totals appropriate to that book's format | Prepare phone-side and printable writing instructions from one snapshot | Selected journey; detailed presentation/format gates open |
| B11 | Exception/history access | Open, left unchanged/acknowledged and resolved discrepancies; prior decisions remain revisitable | Review/reverse decisions when relevant | Required / placement open |
| B12 | Paper-total discrepancy | Known paper carryover, provider comparison/coverage, signed difference when known and affected book/time category | Review all affected totals together and confirm once; persist a separate adjustment per total for future templates; review/reverse with history | Accepted 18 October 2026 in [#7](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/7); detailed layout/copy and category mapping open |

All B-items are scoped to the selected book. One pilot may own multiple books, including same-format volumes. Changing books must not mix paper evidence, assumed progress, proposals, photos, decisions or writing snapshots. Assumed writing starts on opening final instructions or successfully saving/sharing the printable sheet; preview/adjustment leaves progress unchanged (Manuel, 18 October 2026; [contract](writing-template-presentation.md#content-and-interaction-contract)). Reopening the same snapshot cannot duplicate advancement. Cancellation/retry and partial-writing recovery details remain open. No mandatory separate “finished writing” prompt is selected.

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
| P06 | Profile, season targets | User-editable 2026 flight-count goal, known-flight-time goal and annual Soll-Arbeitsstunden; targets are scoped to the season/year and saved only in this synthetic preview | Edit local values; Start reflects 2026 goals | v0.26 draft; example defaults only, year switching and provider sync are not implemented |
| P07 | Profile, medical details | Synthetic documented medical entries with class and recorded expiry date; show Klasse 2 and LAPL separately, including expired dates | Open from season pulse indicator; record details remain unverified | v0.26 draft; Manuel reported Vereinsflieger personal data as intended source location, but fields/authorization/validation are unverified |

## Placement backlog and deliberate omissions

| ID | Information | Current decision / next placement work |
| --- | --- | --- |
| O01 | Costs | Desired outputs: yearly flying costs separate from membership/other charges, then total flying costs per aircraft. Exact entry point/destination open; billing inspection/semantics deferred. Do not add an extra costs destination by assumption |
| O02 | Account balances | Detailed costs only; not Start and not a flight-cost total |
| O03 | License/training status | Detailed Flüge area only; exact access/position open and absent from v0.23. Do not infer that a provider indicator is qualification certification |
| O04 | Duty placement gaps | S10 flight-operation Start summary and later-own-duty preview extent still need a placement review; prototype omissions do not delete confirmed needs |
| O05 | Deferred concepts | Weather navigation placeholder is selected for v0.26; weather content/provider/integration remain deferred. Activities live, chat/AI and tutor retain their roadmap gates; no weather Start item or implementation is scheduled here |
| O06 | Excluded for now | Runway condition, defects and maintenance; birthdays excluded from relevant club events |
| O07 | Own reservations | User's reservations/resources and dates, details-only. Exact destination open; absent from the current prototype |
| O08 | Medical-data source gap | Current prototype uses synthetic records; Manuel reported the intended source location as Vereinsflieger personal data, but no fields are connected or verified. Authorization, semantics and any independent validation path remain open; do not present the pulse as provider-verified status |

## How we review changes

Use an ID and a plain request, for example: “Move S04 into Flüge,” “Add the next event date to S09,” or “B03 should show the last entry number and date only.” The next revision records the answer and updates affected rows; examples here are not proposed changes. Mark a new field/placement Draft until Manuel selects it. Update the visual prototype after reviewing placement, rather than treating its current rendering as a constraint on information needs.

## Change log

| Version | Date | Change |
| --- | --- | --- |
| 0.1 | 2026-10-16 | Extracted current choices and unresolved needs into a design-independent screen-content inventory at Manuel's request. No new feature, field or placement approved by extraction |
| 0.2 | 2026-10-16 | Recorded Manuel's requested season revision: move annual work hours into Meine Saison; retain yearly count/time and add close, compact per-aircraft count/time breakdown using short labels. Manuel selected separate aircraft with short suffixes when models repeat. Graphic treatment remains proposed; v0.23 preview unchanged |
| 0.3 | 2026-10-16 | Recorded the selected season graphic and expandable monthly count comparison for v0.25: paired current/prior counts by month below aircraft rows, month tap to exact counts/contributing flights, future months empty and current month partial. Optional time toggle remains a later proposal. Bounded browser observations are recorded separately; visual review remains pending |
| 0.4 | 2026-10-16 | Added the v0.26 Wetter placeholder destination, Logbuch tab label for the existing Papierbuch flow, editable local 2026 goals distinct from reported club work hours, and a synthetic medical summary/details fixture with explicit neutral/unknown and expiry states. Manuel reported the intended source location; provider fields remain unverified; browser observations are recorded separately |
| 0.5 | 2026-10-16 | Recorded the v0.27 toggle ring, superseded by v0.28. |
| 0.6 | 2026-10-16 | Recorded Manuel's v0.28 selection of two label-free flight-count/known-time rings, each with current/prior totals; tapping either opens the shared compact aircraft detail panel. Monthly paired count bars remain separate. Bounded browser observations recorded; Manuel's visual review remains open |
| 0.7 | 2026-10-16 | Updated only S13 to name the visible Med label carried by the v0.30 indicator and linked the current preview. Content placement and provider/source status are unchanged. |

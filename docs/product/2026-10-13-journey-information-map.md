# Journey and information map — discovery consolidation

Subsequent design preparation: Manuel rejected both [rough German Figma wireframes](2026-10-13-rough-figma-wireframes.md) as crowded and lacking a concept/navigation header. [Dark concept revision](2026-10-13-dark-concept-review.md) records his clean/dark/navigation references and an unselected local preview; Figma edits are currently limited by the plan's tool-call cap. Confirmed product choices and delivery boundaries continue to govern design work. Statements below about no created wireframes describe the earlier map-review state.

Date: 2026-10-13 (Europe/Berlin). Product owner: Manuel Singer. Source: explicit answers and corrections in guided discovery. This is a reviewable product record, not application implementation, final navigation, a production schema or acceptance evidence. The [roadmap](../project-plan.md) retains milestone order and gates.

## How to read this record

**Product review completed, 2026-10-13:** Manuel explicitly confirmed each of seven grouped summaries: paper catch-up, flying summaries/detail/filters, retrieval, costs, duties/partners, remaining start-screen club content, and details/excluded/deferred scope. The map matches his intended experience. This does not finalize layouts, detailed operation contracts, first-release scope, feasibility or application acceptance. Subsequent duty-placement and period decisions are recorded below; detailed layout and later-preview extent remain open. Next: prepare and compare rough German screen arrangements grounded in this reviewed content.

The choices below are confirmed product intent. They do not establish provider capability or first-release inclusion. This record supersedes the earlier completion-confirmation requirement for the future writing journey and the earlier “only my own duties” choice. Existing synthetic lab behavior and dated verification reports remain historical evidence; no application code has changed.

Manuel requested journeys and needed information before choosing overall layouts. The three earlier in-chat German concepts are exploratory and unselected; their explicit completion-checkbox flow is now outdated. Figma files and reviewed application wireframes have not been created. Keep UI text German, documentation/communication English. Ask one focused question at a time, offer clickable suggested answers and free text, and wait for an actual reply. A preselected option is not an answer. Confirm the preceding answer before opening the next question.

## First use — guided start and trust

**Added 18 October 2026, requested by Manuel; tracking: [#22](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/22).** This complements the seven areas reviewed on 13 October; that earlier review does not approve this addition's detailed design. Authorized work here is journey revision/documentation. Application implementation, exact presentation/copy and release inclusion remain open. M1 discovery, with M2 retrieval, M3 saved-history and M4 analytics dependencies; no milestone reorder.

**Requested outcome:** after downloading and first opening MoFlight, the user understands what it helps with, receives guidance around first login and data security, knows a useful first action, sees which Start tiles gain information after retrieval, and learns what each area shows and can do when first opening it. Manuel suggests Vereinsflieger login as the first action; this is the proposed default below, with a route to explore or return later.

**Refined UX proposal:** one short welcome followed by help where the user needs it. Prefer inline cards and an optional anchored hint beside a relevant control; use an app-owned sheet for the pre-login explanation. Show one hint at a time, with a clear dismiss/skip action. Avoid a mandatory tour of every feature. Instructions must stay available through help after dismissal. These are reviewable design recommendations, not selected components or implemented behavior. Keep the approved visual reference and existing navigation; guidance supplements them.

| Step / user situation | Intended experience and next action |
| --- | --- |
| 1. Download, install and open | Once an approved distribution build is available, open into a brief welcome explaining the available benefits: understand saved flying and, when delivered, keep a paper logbook current. Offer **Loslegen** and **Später erkunden**. Do not require a MoFlight cloud account merely to start the local journey. Label any demo data as synthetic; do not present future/unconnected features as available. |
| 2. Find the first useful action | On Start, one setup card recommends **Mit Vereinsflieger verbinden**, explains that this enables retrieval of the user's own flights, and points to the connection control. Let the user explore or resume later, including without a provider account or network. Keep empty/unknown states useful; unavailable features explain their prerequisite. |
| 3. Understand the login before entering credentials | Show concise app-owned information about the purpose of access, the original provider page/origin, what the current build stores and where, and how to disconnect/forget a saved login. Offer further data-handling details and the reviewed privacy/contact information. Distinguish Vereinsflieger authentication from a local MoFlight profile and any later MoFlight cloud login. No blanket security promise or optional password-saving preselection. |
| 4. Sign in and confirm the right account | Open the original provider login with visible verified HTTPS origin and separate MoFlight Close/Back controls. Explain any provider verification in context; closing returns to MoFlight and does not log out. Verify the provider account/club under the applicable association contract, showing a required confirmation where needed. An expired session asks for sign-in again; mismatch/cancel/error preserves existing data and offers a safe next step. A login alone does not mean flights were retrieved. |
| 5. Retrieve the first information | After a matching association, suggest **Flüge aktualisieren** as an explicit action. Suggest current and previous year, adjustable; explain the selected period without making technical filters a setup task. Show progress, cancellation and actual result/coverage. Login or viewing a hint never starts retrieval. Automatic scheduling remains #19. Raw capture and usable saved history remain separate. |
| 6. Understand what changed on Start | Offer **Zur Übersicht** with a concise result. Mark only tiles whose usable content actually changed, using a text badge such as **Neu verfügbar** or **Aktualisiert**, an accessible label and an optional restrained visual emphasis. Keep retrieval time, period and gaps visible in details. Recommend one useful next action, usually reviewing saved flights; do not force navigation through every tile. |
| 7. Open a tile for the first time | In that destination, explain what is shown, its source/coverage and the available actions, then offer one relevant action. For Flüge/Mein Fliegen: inspect a flight or filter the available period; for Flugbuch: select a book and establish paper state; for connected club content: inspect the relevant duty/news/details. Show only delivered capabilities and applicable prerequisites. Prefer an inline explanation; an anchored hint must not cover its target. Opening an area does not prove a flight is written or a qualification valid. |
| 8. Leave and return | Retain dismissed/completed guidance locally and resume from the first relevant unfinished step after interruption. Do not repeat the welcome on every login or restart. Offer **Hilfe & Einführung** to reopen explanations or restart the optional tour. Replaying help performs no login, retrieval, deletion or paper-state changes. Recheck account-specific prerequisites after switching without exposing the previous account's information. |

### Trust information at the point of action

Reuse [#17's concise login guidance](2026-10-18-header-status-review.md#smallest-next-package--1a-login-guidance) and [the current disconnect distinctions](2026-10-17-safe-disconnect.md); onboarding adds context rather than another authentication flow. The following are content requirements, not evidence that all safeguards or production policies are complete:

- Explain what is requested (initially own flights), why, where credentials/session data and retrieved records go, and whether a selected operation sends anything to a MoFlight service or third party. Revisit the notice before a later cloud/AI/photo operation; first-use dismissal is not consent to those features.
- Distinguish provider cookies/session reuse, system autofill and optional app-owned saved credentials. The current lab's explicit device-local Save/Use/Forget aid is not an approved production credential policy. Copy must match the build and verified storage/backup behavior; never say that MoFlight cannot hold a password while offering app-owned saving.
- Explain **Schließen** (return to the app), **Bei Vereinsflieger abmelden** (verify provider sign-out in this app browser), **Lokale Anbietersitzung löschen** (supported browser-store scope), **Gespeicherte Zugangsdaten vergessen** (app-owned saved secret), and separate deletion of local flight data. Do not imply one action performs the others or signs out other devices. Preserve pending work and show consequences before an applicable destructive action.
- Explain that session-check status and saved-data freshness are different. Existing offline records do not require a continuously valid provider session. Security/privacy claims must follow evidence and dispositions under [#21](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/21); avoid unsupported claims such as complete encryption, certified compliance or data never leaving the device. Brief reassurance cannot substitute for the applicable notice.

### Which tiles can show new information

| Result / affected area | Marker and first-open rule |
| --- | --- |
| Flights saved to the usable library | Mark Flüge and only affected summaries whose supported data changed. State actual period/coverage; a first partial import is not complete history. Explain filters, recorded details and unknown values on first visit. |
| New flights relevant to a book | A book-scoped suggestion may point to Flugbuch after mapping/review rules are satisfied. Missing paper evidence stays unknown; new provider flights alone do not establish an exact unwritten count or advance paper progress. |
| Club, costs, Medical or AI | Own-flight login/retrieval does not populate these tiles. Mark a tile only after its separately supported source/operation supplies usable changed content. Explain unavailable/unknown states; do not advertise integration success or grant flight eligibility. |
| Raw capture only; empty, failed, cancelled or unchanged retrieval | Show the actual result, including any verified partial save and remaining gaps. Raw capture alone earns no saved-flight/analytics marker. Failure/cancellation preserves prior usable data; unchanged content gains no fresh new-data marker merely because a check time changed. |

Proposed marker semantics: retain a content-change marker until the user visits the affected content, separately from whether its introductory hint was dismissed. Changes arriving during a visit remain indicated until that version is presented; unchanged retries/restarts do not recreate acknowledged markers. Tile attention, news-item read state, paper confirmation and actual content completeness are independent. Scope account data/markers to the owner, book-related steps to the book, and generic help preferences to the installation; neither switching nor replay may transfer account/book acknowledgments or reveal another owner's data. Exact persistence/version contract remains implementation work.

### Acceptance and remaining delivery work

Review this journey, German wording and a small synthetic walkthrough before a separately authorized implementation package. Cover first open, skip/resume/replay, no provider account, offline, login cancellation/expiry/mismatch, empty/partial/failed/unchanged retrieval, actual saved-data changes, first tile visits, restart and account/book switching. Help must not start operations or change domain decisions. Check non-color cues, reduced motion, screen-reader focus/reading order, large text, keyboard and narrow layouts at the affected native checkpoint; Android/iOS/live-provider evidence stays distinct.

Current boundary: bounded login guidance exists under #17, but raw provider captures still do not feed the saved flight library. No end-to-end first-use tour or new-data tile behavior is claimed by this document. #22 owns the journey/help work; #16 owns session safeguards, #19 scheduling, #2/#4/#18 real saved history/mapping, #9 analytics, #10/#15 club content/privacy, #20 header design, #21 privacy wording/evidence and #5/#8 UI/platform acceptance.

Documentation verification, 18 October 2026: local Windows/Python/Git checks passed for seven added relative links/anchors, eight ordered steps, new table structure and `git diff --check`; requested-versus-proposed behavior and capability claims were checked against the existing journeys, current Issue contracts and login UI source. #22 records the documentation commit/publication status. No application, device, provider or usability tests were run for this documentation package.

## Catch up on the paper logbook

| Step | Confirmed behavior and needed information |
| --- | --- |
| Notice | Offer a next-action suggestion whenever available flights extend beyond the remembered last written entry. Indicator/animation and exact wording remain open; a flashing dot was an example, not a selected design. |
| Open suggestion | Show remembered book status and recommend the next step. Identify the book and last entry with number/details, and distinguish confirmed state from assumed progress. |
| Verify starting point | Almost always start by asking whether the displayed entry really is the last written entry. A confirmed unchanged anchor can be reused; if the user cannot confirm, request a current photo. This later instruction replaces the earlier generic “Have you added entries?” prompt. |
| Check evidence | Review visible photo entries, uncertain recognition/book format, required values and differences against available source evidence. Preserve gaps individually; the last entry does not establish all earlier entries. |
| Review proposed flights | Before preparing the template, show date, aircraft, flight duration and the user's recorded role in a compact list; open a flight for more details. |
| Clarify | Help resolve missing required information before affected writing instructions become ready. Consequential unresolved carryovers cannot be guessed. Exact handling of deferred discrepancies that affect continuation remains open. |
| Prepare | Suggest enough entries to complete the next physical page, with an adjustable batch. Both phone-side writing instructions and a printable sheet use the same reviewed snapshot. Book-format rules govern layout, numbering and totals. |
| Remember progress | Assume the identified entries in the prepared template were written, without a separate completion question. Retain this as assumed progress associated with that template revision; it does not overwrite the last confirmed paper evidence or source facts. |
| Return later | Present the remembered last entry for confirmation. If it is not confirmed, reconcile a current photo with the assumed batch, retaining unwritten entries and earlier evidence/decisions. |

The exact event that records the prepared batch as assumed written, cancellation/reopening/idempotency behavior and recovery after partial writing need a detailed contract later. The user has selected the interaction principle, not those implementation details. An assumption must never enter a confirmed-paper query as confirmed evidence. A last-page photo cannot prove unseen pages correct.

Retain the exception register: open, left unchanged/acknowledged and confirmed resolved remain distinct. Preserve original source/paper values and explicit choices, reuse unchanged decisions without repeated questions, and allow reversal. Changed relevant evidence prompts targeted review. No acknowledgment silently corrects a paper entry.

## Understand my flying

| Surface/action | Confirmed information and behavior |
| --- | --- |
| Compact “Mein Fliegen” section | Narrow-height, swipeable quick summaries. Initial view: this year's flight count and known flight time, with a small comparison to the same period last year in that same view. |
| Other swipe views | Aircraft flown most often; flight-duration distribution. Exact measures, thresholds and visual forms remain open. |
| Tap summary | Open that statistic in detailed “Meine Flüge”, with expanded information/chart and contributing flights; carry over period and filters. |
| Filters | Period, aircraft, person flown with and the user's recorded role. Aircraft instance/model and person identity/role must stay distinct. Additional category filter is not selected as an initial requirement. |
| Open flight | Show recorded details, missing/uncertain values and access to supporting source information. |
| Retrieval fails/offline | Saved statistics remain available with last update time and a retry option; show stale/limited coverage. Unknown durations stay separate from zero. |
| Retrieve newer flights | User taps “Flüge aktualisieren”; always show last update time. Suggest since the last successful update, with an adjustable period. This is a user-facing default, not proof of a safe delta algorithm; older-source corrections require a verified reconciliation strategy. |
| First retrieval | Suggest current and previous year, with an adjustable period. Older history may be needed for paper catch-up; neither default implies lifetime completeness. |

Counts and time use deterministic computations over sufficiently established identities and semantics. Compare years only with visible comparable coverage; exact time basis, treatment of incomplete periods and initial release measures remain to be reviewed.

## Understand costs

Desired entry point: this year's flying costs, with membership and other charges separate. Next: **total flying costs per aircraft**. Average cost per flight/hour was not selected. Account balances belong in detailed costs only.

Source remains Vereinsflieger “Meine Abrechnungen”. A guided billing walkthrough was explicitly deferred. The existing browser tab initially displayed an account's billing preview incidentally; that does not establish evaluated billing semantics, complete yearly charges or integration feasibility. Define charge/payment/credit meaning, currency, period, allocations, flight/aircraft links and retrieval permission before calculating totals. No manually entered external-expense feature is selected.

## Shared start screen and detailed information

These are content/placement choices, not a finalized screen order or navigation structure.

| Information | Confirmed placement/scope | Remaining evidence or design work |
| --- | --- | --- |
| Own flying | Compact swipeable summaries described above | Definitions, detailed behavior and source/live-history gates |
| Paper logbook | Next-action suggestion and remembered status | Revised assumption/confirmation contract, recognition and book-format gates |
| Work hours | Compact start summary of annual obligation and completed work | Preserve hours versus monetary credit; definitions/permission/freshness |
| Own duties | Focus on all assignments from today through the following week's weekend, plus a preview of later duties | Compact arrangement and later-preview extent open; verify dates/timezone/assignment identities |
| Putzdienst partner | When own duty is Putzdienst, show the other member assigned alongside the user on the same day | Manuel reports two assignees; verify shared duty/day matching and multi-day intervals rather than infer a partner by name |
| Flight-operation duties | Compact start-screen summary; tap opens full overview. Include current/upcoming Fluglehrer, Flugleiter and Windenfahrer assignments from today through the following week's weekend | Verify role labels, permitted member scope, dates/timezone and complete roster coverage |
| Open assigned tasks | Compact start notice with details when opened | Own-task identity/status and retrieval; observed task section was empty |
| Club news/documents | Compact notice when something is new, details when opened | Define “new”/read state, relevant metadata and document access; observed News section empty |
| Club events/meetings | Upcoming items on start; exclude birthdays | Distinguish categories and event dates; only birthdays were visible in inspected overview |
| Own reservations | Details only | Bookings/resources, dates and access; own section empty when inspected |
| License/training status | Detailed “Meine Flüge” only | Provider status/periods and semantics; observed indicator is not MoFlight qualification certification |
| Account balances | Detailed costs only | Balance semantics distinct from charge totals; billing walkthrough deferred |
| Runway condition, defects, maintenance | Leave out for now | No implementation/integration selected |
| Activities live | Deferred: who flew today, aircraft/duration; airborne status if reliably feasible | Future interface/layout relevance retained; placement open; separate deferred Issue |

Duty-period clarification, Manuel, 2026-10-13: use today through the end of the following week's weekend for both the focused own-duty window and other members' flight-operation assignments. In the Tuesday 13 October example, this ends Sunday 25 October, not 18 October. Own duties additionally have a later preview; this refines the earlier “next own duty only” summary. Exact preview extent and week-boundary/date rules still need a contract. Displaying the explicit date range and making it adjustable in the full overview were engineer suggestions, not explicit user decisions. Name-display/privacy policy remains deferred in #15.

The general club reservation roster and overview report links have not been selected or rejected. Empty sections in the current account do not prove that data cannot exist later. No automatic import of all overview content or access to other members' private records is authorized.

## Feasibility and delivery map

| Area | Existing evidence | Needed before delivery |
| --- | --- | --- |
| Own-flight summaries/detail | Synthetic deterministic query proofs; browser raw-capture lab | Reviewed M1 measures/states, reliable M2 retrieval, M3 identities/normalization/live storage, M4 analytics acceptance |
| Paper catch-up | Synthetic writing/multi-book proofs and draft physical format | Revised state contract, production book/source boundary, validated interpretation/comparison, approved bounded handwriting evaluation and real phone/print journey; current M5 gate remains |
| Club information | Main-screen read-only inventory; older duty/training discovery | Selected-field meanings, permitted transport/visibility, coverage/freshness, later scoped interface and acceptance |
| Costs | User outcomes; billing preview visibility only | Guided billing inspection, verified attribution/semantics and retrieval before totals |
| Activities live | Recent club-flight table visible | Today's complete coverage, explicit ongoing-flight status, latency/freshness, access/retention and refresh feasibility; deferred implementation |

## Next review and open decisions

Deferred privacy task, explicitly requested by Manuel on 2026-10-13: [#15 member-data privacy and name-display policy](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/15). Review full/real names versus abbreviated names and other options for duty rosters, Putzdienst partners, person-related flight views and Activities live. Display/access/cache/retention/share policy remains unselected; abbreviation does not establish anonymity. Keep fictional names in concepts pending policy review. This task does not authorize new access or personal-data collection and does not relax existing ownership/privacy boundaries.

1. Product review of the seven summarized areas is complete. Proceed to rough screen arrangement; ask only unresolved questions that materially affect it and do not re-ask confirmed choices.
2. Discuss the smallest useful release and writing's immediate value without automatically reordering M2–M5.
3. Billing walkthrough remains deferred; review it when Manuel is ready.
4. Resolve consequential carryover exceptions, assumed-writing trigger/recovery, time basis/duration bands/year comparability, club freshness/new-item semantics and duty horizon as affected journeys need them.
5. Prepare German low-fidelity concepts from this map, then review detailed operation/state contracts before separately scoped application implementation. No subscriptions, paid AI, cloud integration, production schema expansion or additional services are authorized here.

Traceability: existing Issues #2 retrieval, #5 UI/application boundary, #7 paper/photos/writing, #9 queries/analytics, #10 provider information and #11 product/book scope. Dedicated deferred [#14 Activities live](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/14) tracks future concept/feasibility work. [Discovery brief](user-journey-ui-discovery.md), [state semantics](flight-logbook-state-and-queries.md), [writing presentation](writing-template-presentation.md) and [provider discovery](vereinsflieger-information-discovery.md) retain detailed boundaries.

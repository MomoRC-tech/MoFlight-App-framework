# Journey and information map — discovery consolidation

Date: 2026-10-13 (Europe/Berlin). Product owner: Manuel Singer. Source: explicit answers and corrections in guided discovery. This is a reviewable product record, not application implementation, final navigation, a production schema or acceptance evidence. The [roadmap](../project-plan.md) retains milestone order and gates.

## How to read this record

**Product review completed, 2026-10-13:** Manuel explicitly confirmed each of seven grouped summaries: paper catch-up, flying summaries/detail/filters, retrieval, costs, duties/partners, remaining start-screen club content, and details/excluded/deferred scope. The map matches his intended experience. This does not finalize layouts, detailed operation contracts, first-release scope, feasibility or application acceptance. Duty-overview placement and horizon remain open. Next: prepare and compare rough German screen arrangements grounded in this reviewed content.

The choices below are confirmed product intent. They do not establish provider capability or first-release inclusion. This record supersedes the earlier completion-confirmation requirement for the future writing journey and the earlier “only my own duties” choice. Existing synthetic lab behavior and dated verification reports remain historical evidence; no application code has changed.

Manuel requested journeys and needed information before choosing overall layouts. The three earlier in-chat German concepts are exploratory and unselected; their explicit completion-checkbox flow is now outdated. Figma files and reviewed application wireframes have not been created. Keep UI text German, documentation/communication English. Ask one focused question at a time, offer clickable suggested answers and free text, and wait for an actual reply. A preselected option is not an answer. Confirm the preceding answer before opening the next question.

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
| Own duties | Show next upcoming assignment when available | Source dates, interval/timezone and assignment identities |
| Putzdienst partner | When own duty is Putzdienst, show the other member assigned alongside the user on the same day | Manuel reports two assignees; verify shared duty/day matching and multi-day intervals rather than infer a partner by name |
| Flight-operation duties | Include all current/upcoming Fluglehrer, Flugleiter and Windenfahrer assignments | Placement and horizon open; verify precise role labels, permitted member scope and complete roster coverage |
| Open assigned tasks | Compact start notice with details when opened | Own-task identity/status and retrieval; observed task section was empty |
| Club news/documents | Compact notice when something is new, details when opened | Define “new”/read state, relevant metadata and document access; observed News section empty |
| Club events/meetings | Upcoming items on start; exclude birthdays | Distinguish categories and event dates; only birthdays were visible in inspected overview |
| Own reservations | Details only | Bookings/resources, dates and access; own section empty when inspected |
| License/training status | Detailed “Meine Flüge” only | Provider status/periods and semantics; observed indicator is not MoFlight qualification certification |
| Account balances | Detailed costs only | Balance semantics distinct from charge totals; billing walkthrough deferred |
| Runway condition, defects, maintenance | Leave out for now | No implementation/integration selected |
| Activities live | Deferred: who flew today, aircraft/duration; airborne status if reliably feasible | Future interface/layout relevance retained; placement open; separate deferred Issue |

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

1. Product review of the seven summarized areas is complete. Proceed to rough screen arrangement; ask only unresolved questions that materially affect it and do not re-ask confirmed choices.
2. Discuss the smallest useful release and writing's immediate value without automatically reordering M2–M5.
3. Billing walkthrough remains deferred; review it when Manuel is ready.
4. Resolve consequential carryover exceptions, assumed-writing trigger/recovery, time basis/duration bands/year comparability, club freshness/new-item semantics and duty horizon as affected journeys need them.
5. Prepare German low-fidelity concepts from this map, then review detailed operation/state contracts before separately scoped application implementation. No subscriptions, paid AI, cloud integration, production schema expansion or additional services are authorized here.

Traceability: existing Issues #2 retrieval, #5 UI/application boundary, #7 paper/photos/writing, #9 queries/analytics, #10 provider information and #11 product/book scope. Dedicated deferred [#14 Activities live](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/14) tracks future concept/feasibility work. [Discovery brief](user-journey-ui-discovery.md), [state semantics](flight-logbook-state-and-queries.md), [writing presentation](writing-template-presentation.md) and [provider discovery](vereinsflieger-information-discovery.md) retain detailed boundaries.

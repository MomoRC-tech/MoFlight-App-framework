# User journeys and UI concept discovery

Date: 2026-10-13 (Europe/Berlin). Owner: Manuel Singer, guided by the engineer. M1 discovery has started; M1 application implementation has not started. [Project roadmap](../project-plan.md) controls sequencing and acceptance. Existing task references: #5, #9 and #11; documentation traceability: #12.

## Agreed purpose

Explore which user situations matter, which features help and what is feasible before fixing detailed interfaces. Deliver a small set of user journeys, a feature-priority/feasibility map and rough screen concepts. Future ideas may be explored without scheduling implementation. Figma Design remains the main reviewed design workspace; Google Stitch is optional exploration.

## Guided process

1. Explore the confirmed audience of students, instructors and pilots across aircraft categories, then choose two or three valuable situations. Manuel's experience is a concrete example, not evidence that all groups share his needs.
2. Walk through each situation: trigger, current workflow/difficulty, desired outcome, information needed, steps, successful result and failure/offline alternatives. Use plain language and ask a small number of questions at a time.
3. Map features to those needs; distinguish essential, useful and later ideas. Record Manuel's priorities and unresolved choices rather than treating suggestions as decisions.
4. Assess feasibility from existing repository evidence, recording available capability, missing work and permission/data dependencies. Unproven behavior stays unproven; proposed future services require separate investigation when relevant.
5. Sketch two or three navigation/layout approaches and walk through realistic examples, including missing data and retrieval failure. Review usefulness before visual polish.
6. Refine selected concepts into reviewed wireframes, detailed operation states and application contracts, followed by separately scoped implementation under the roadmap.

## Confirmed audience

**UI language (Manuel, 2026-10-13):** the initial app UI is German. Use German user-facing text in wireframes, prototypes and the initial implementation. Add an option to switch to English as a later feature; English language switching is not part of the initial UI scope. Keep user-facing text separable from application logic so later translation does not require changing business rules. Project documentation remains English under AGENTS.md. Exact localization implementation and locale-specific formatting are not selected here.

Manuel confirmed during guided discovery: “should include students, instructors, and pilots of different aircraft categories.” The concept should cover this broader audience rather than only Manuel and pilots with similar needs. Specific launch-category coverage and role-specific needs remain to be reviewed. A person may have overlapping roles; separate apps, accounts or navigation modes are not selected by this audience decision.

Discovery should examine shared flight-history/logbook needs and differences by role/category. Student training progress, instructor workflows and category-specific information are hypotheses to explore, not approved features or evidence of available data. Instructor access to another person's records requires a separately defined permission/data boundary; this audience decision grants no such access.

## Confirmed priorities and start-screen direction

Manuel selected “Understand my flying” and “Keep my logbook current” as the first useful-version outcomes. He also wants flight cost tracking and relevant general information from the Vereinsflieger main screen. This confirms discovery priorities, not detailed measures or delivery acceptance.

- Understand flying: desired questions include flight counts and hours by period, aircraft flown, flights with particular people and comparisons with previous years. Manuel also wants a flight-duration distribution chart, for example short/medium/long flights. Definitions, ranges and initial delivery scope require design review; these are desired capabilities, not accepted live analytics.
- Keep the logbook current: identify missing paper entries and explore writing assistance, retaining existing writing/photo/book implementation gates.
- Track costs documented in Vereinsflieger's “Meine Abrechnungen” section (source specified by Manuel). Explore separating flying costs from membership and all other charges. This covers costs recorded in that section; manually entered external expenses are not selected. The section has not been inspected in this discovery: available fields, charge/payment/credit meaning, period, currency, flight links and retrieval permission/support remain to be verified before defining totals or implementation. The proposed split and first-release inclusion remain open.
- Shared start screen: explore general information useful across students, instructors and other pilots, without requiring a user-group-specific landing screen. Exact sections, personalization and navigation remain open.
- Provider discovery: the actual Vereinsflieger main screen was inspected read-only during continued discovery on 2026-10-13; relevance review with Manuel is ongoing. The Hauptflugbuch observation supports the deferred Activities live concept below. Record selections and access/retrieval/freshness dependencies; visible fields do not establish extraction support. The billing walkthrough remains deferred.

Discovery continues with journey clarification and relevance review of the inspected provider main-screen sections; perform the separate billing walkthrough when ready. These are facilitation steps, not additional implementation authorization.

## Primary logbook journey: catch up on a backlog

Manuel reports that many pilots do not document flights immediately and later have many flights to enter. He identifies the logbook writing template as an immediate benefit. This is product-owner input about the target problem, not an independently measured claim about how most pilots behave.

Confirmed desired outcome: help a pilot catch up efficiently on accumulated flights in the paper logbook using a writing template. Design discovery should give this journey prominence rather than assuming daily entry or treating writing assistance as a minor future concept.

Proposed journey for review:

1. Open MoFlight and see the last known logbook state and flights potentially awaiting entry; show uncertainty where the paper state or source coverage is unverified.
2. Photograph/upload the actual last written logbook page to establish where the paper book stands. Use the layout to propose its type/format; ask for selection/confirmation when the type or extracted values are uncertain. Retain remembered confirmed state for later sessions; a new photo is not mandatory on every launch.
3. Compare readable photographed entries with available provider evidence, present discrepancies separately from new entries, and obtain targeted clarification of relevant missing/ambiguous facts. Identify missing flights individually rather than assuming every flight before the last entry number was written.
4. Prepare writing instructions suited to the chosen physical book, including required layout and deterministic totals/carryovers where supported.
5. Copy entries in manageable batches and explicitly confirm which entries were written. Merely displaying or preparing a template does not mark entries as copied.

Manuel's desired output is both a phone-side writing view and a printable sheet. Both should represent the same reviewed writing instructions and selected flights; viewing or printing alone does not confirm paper entry. Exact phone interaction, printable layout, export/printing mechanism and delivery scope remain to be designed and verified.

Open UX choices include batch size, interruption/resume, recognition feedback and presentation of findings. The photo-based starting point is now confirmed product intent; automatic reading/format detection and live comparison remain unproven. The last-page photo supports checks of visible entries and available carryovers; it cannot establish that every unseen historical page is correct. Additional pages/evidence may be needed for a broader comparison.

### Two results and a persistent exception register

Manuel confirms two expected results: (a) inconsistencies in existing paper entries and (b) what the pilot now needs to write. Users may deliberately leave past entries unchanged because correction is unwanted or too difficult. Preserve that decision and offer a user-visible register of open and acknowledged exceptions; acknowledgment is not proof that a discrepancy was corrected.

For concept exploration, propose finding states such as open, acknowledged/left unchanged, and confirmed resolved, with the affected book/page/entry/field, observed difference, supporting evidence and user's decision/date/reason. Users can look up past findings and revisit decisions. Reuse unchanged decisions without asking again; relevant changed evidence prompts targeted review while preserving the prior decision. A decision applies to the specific discrepancy, not all future discrepancies.

**Working comparison-screen design:** show a summary first, for example “12 flights to write; 3 discrepancies” using clearly fictional counts in concepts. Provide separate actions to inspect discrepancies, prepare the writing template and view retained exceptions. Individual findings can then be reviewed one at a time. Manuel replied “yes” to the preceding proposal, without explicitly choosing between summary-first and guided-first presentation; summary-first is the engineer's stated working assumption for prototype review, not a finalized preference. Distinguish new/open findings from previously acknowledged exceptions and show incomplete/uncertain coverage rather than implying an exact backlog when evidence is insufficient.

Keep the source value, actual paper value and any explicit chosen/effective value distinct. Leaving a discrepancy unchanged must not silently rewrite data or mark the paper as corrected. New-entry continuation and carryover handling must disclose consequential differences; an unresolved required value needs clarification rather than a guessed total. Exact handling of consequential exceptions remains a design/acceptance question.

This refines existing [user stories](flight-logbook-user-stories.md) and [remembered state/decision semantics](flight-logbook-state-and-queries.md#remembering-and-reusing-decisions), rather than adding an unrelated exception subsystem. These are intended product behaviors; no photo recognition, provider comparison or exception UI acceptance is claimed.

Roadmap implication: writing is currently scheduled in M5. Its immediate product value should inform a later review of the smallest useful release and delivery order after this journey is defined. No automatic reordering, production schema change or OCR/provider/budget authorization follows from this discovery input.

## Analytics journey: understand my flying

Manuel's response “i guess all of that” includes the proposed questions about flights/hours this year, aircraft flown, flights with particular people and changes versus previous years. He additionally requested a “how long are my flights” diagram, with short/medium/long groups as an example.

Proposed journey: choose a period and relevant aircraft/category/person filters, review deterministic summaries/charts, then select a result to inspect its contributing flights and evidence. Comparisons across years must show actual coverage; incomplete years/history cannot be presented as fully comparable without qualification. Registration and aircraft model, person identities and roles remain distinct.

For duration distribution, explore a bar chart counting distinct flights in explicit duration ranges. Short/medium/long is a suggested presentation, not fixed thresholds. Finer minute/hour bands are another concept option. Display the range boundaries and the duration measure used; unknown durations are reported separately rather than treated as zero. Counts in each group must lead to their supporting flights. Thresholds, duration basis, treatment of uncertain records and whether ranges differ by aircraft context remain open.

Screen examples must use labeled synthetic data. This discovery input expands the desired analytics concept; first-release measure selection and contract/fixture/live-history acceptance still follow M1/M3/M4 gates.

## Starting situations — hypotheses for discussion

| Situation | Possible outcome | Current feasibility boundary |
| --- | --- | --- |
| After a flying day | See recent flights and spot missing or questionable records | Browser raw capture exists; saved live history/normalization remains M3 work |
| Looking back over a season | Understand flights, known durations and aircraft breakdowns | Synthetic deterministic queries exist; measures need review and live history is gated |
| Finding a particular flight | Find by date, aircraft or person and inspect supporting evidence | Synthetic queries exist; source identity, ambiguity and live integration remain open |
| Reviewing flight costs | Understand what flying has cost the user | Raw provider cost fields are evidence only; personal attribution, semantics and canonical integration remain open |
| Updating a paper logbook | Know which entries need writing and obtain clear instructions | Synthetic writing/book proofs exist; real photo-to-writing and production book integration remain deferred |
| Preparing for a flying day | Obtain useful preparation information | Weather/tutor/training ideas remain discovery candidates with separate access and scope gates |

These are prompts, not selected journeys or evidence of wider user demand. The overview → filtered flights → detail journey is an initial hypothesis; navigation is open to review.

## Decision and evidence record

### Deferred concept: Activities live — Manuel, 2026-10-13

During the actual Vereinsflieger overview walkthrough, Manuel requested an **Activities live** concept in place of simply reproducing the club's recent-flight list:

- See who flew **today**, in which aircraft and for how long.
- If feasible, also see who is **currently airborne**.
- Preserve the concept for later work and consider its UI/navigation relevance and future application-interface needs now. This does not authorize application implementation, live polling or a production interface contract.

The walkthrough confirmed that the visible club Hauptflugbuch displays dated flights with aircraft, pilot and start/end times. It did not establish complete today's coverage, update latency, in-progress-flight visibility, duration semantics, or an authorized automated retrieval path. No private rows, names, screenshots or exports are stored in this documentation.

Future interface/design preparation should distinguish today's completed activity from an explicitly source-supported in-progress status; retain club/date/timezone, source update time, retrieval time, coverage and unknown values. A missing landing time alone must not establish that someone is airborne. Offline or stale information must not imply a live status. Placement, refresh cadence, supported permissions and retention of other members' information remain open.

Before implementation, investigate the source's status semantics, complete-day coverage and freshness, permitted retrieval and account/club visibility. Keep this deferred under the [roadmap](../project-plan.md), using existing Issues #10 (provider discovery) and #11 (product scope); no milestone reordering or new service is selected. See the [provider discovery specification](vereinsflieger-information-discovery.md#deferred-activities-live-concept--2026-10-13).

- Confirmed: journey/UI concept discovery comes first; explore relevance and feasibility, then refine detailed behavior/contracts.
- Confirmed: rough concepts may include future ideas; inclusion does not authorize feature implementation.
- Confirmed: the intended audience includes students, instructors and pilots across aircraft categories (Manuel's direct answer).
- Confirmed UI language: German initially, with an English-switch option as a later feature; project documentation remains English.
- Confirmed: first outcomes are understanding flying and keeping the logbook current; flight cost tracking and relevant provider main-screen information are desired. Initial main-screen inspection has now occurred; relevance review is ongoing and billing inspection remains deferred.
- Confirmed direction: a shared start screen with general information across user groups; review provider main-screen relevance in a later walkthrough.
- Confirmed cost source: Vereinsflieger “Meine Abrechnungen”; Manuel proposes a flying versus membership/other-cost split.
- Confirmed logbook problem/value: accumulated flights need later paper entry; a writing template provides immediate benefit (Manuel's observation). Backlog catch-up is a primary design journey.
- Desired writing outputs: both a phone-side view and a printable sheet (Manuel: “ideally both”); exact interaction and delivery scope remain open.
- Confirmed photo journey: use the last written page to help establish paper state and book type, show discrepancies and new writing instructions, and retain user decisions to leave past entries unchanged in a browsable exception register.
- Desired analytics: counts/hours by period, aircraft, person-based queries, comparisons with previous years and a flight-duration distribution chart; chart bands and measure definitions remain open.
- Open: detailed journeys, billing-section fields/semantics, final cost categories and first-release inclusion, specific initial aircraft-category coverage, role-specific needs, start-screen content and preferred UI approach.
- No interviews, completed wireframes, Figma files, user validation or live feature acceptance are claimed here.

Record future answers as confirmed decisions or hypotheses with their source. For the feature map, keep user value, priority and technical feasibility separate. Do not infer lifetime completeness, known missing values or real-user demand from sample screens.

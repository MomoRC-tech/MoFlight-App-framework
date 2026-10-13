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

Manuel confirmed during guided discovery: “should include students, instructors, and pilots of different aircraft categories.” The concept should cover this broader audience rather than only Manuel and pilots with similar needs. Specific launch-category coverage and role-specific needs remain to be reviewed. A person may have overlapping roles; separate apps, accounts or navigation modes are not selected by this audience decision.

Discovery should examine shared flight-history/logbook needs and differences by role/category. Student training progress, instructor workflows and category-specific information are hypotheses to explore, not approved features or evidence of available data. Instructor access to another person's records requires a separately defined permission/data boundary; this audience decision grants no such access.

## Confirmed priorities and start-screen direction

Manuel selected “Understand my flying” and “Keep my logbook current” as the first useful-version outcomes. He also wants flight cost tracking and relevant general information from the Vereinsflieger main screen. This confirms discovery priorities, not detailed measures or delivery acceptance.

- Understand flying: review flights, totals and trends; choose exact measures during journey review.
- Keep the logbook current: identify missing paper entries and explore writing assistance, retaining existing writing/photo/book implementation gates.
- Track costs documented in Vereinsflieger's “Meine Abrechnungen” section (source specified by Manuel). Explore separating flying costs from membership and all other charges. This covers costs recorded in that section; manually entered external expenses are not selected. The section has not been inspected in this discovery: available fields, charge/payment/credit meaning, period, currency, flight links and retrieval permission/support remain to be verified before defining totals or implementation. The proposed split and first-release inclusion remain open.
- Shared start screen: explore general information useful across students, instructors and other pilots, without requiring a user-group-specific landing screen. Exact sections, personalization and navigation remain open.
- Later provider discovery: walk through the actual Vereinsflieger main screen with Manuel, inventory its information and ask which items are relevant. Record selections and access/retrieval/freshness dependencies; do not assume fields or extraction support before inspecting them. No provider walkthrough was performed for this update.

Proposed next discussion: develop the backlog-to-writing-template journey below and clarify how the user wants to use the template. Review candidate start-screen sections using those needs, and perform the provider main-screen/billing walkthrough when ready. These are facilitation steps, not additional implementation authorization.

## Primary logbook journey: catch up on a backlog

Manuel reports that many pilots do not document flights immediately and later have many flights to enter. He identifies the logbook writing template as an immediate benefit. This is product-owner input about the target problem, not an independently measured claim about how most pilots behave.

Confirmed desired outcome: help a pilot catch up efficiently on accumulated flights in the paper logbook using a writing template. Design discovery should give this journey prominence rather than assuming daily entry or treating writing assistance as a minor future concept.

Proposed journey for review:

1. Open MoFlight and see the last known logbook state and flights potentially awaiting entry; show uncertainty where the paper state or source coverage is unverified.
2. Confirm/update where the paper logbook stands, with missing entries handled individually rather than inferred solely from the last entry number.
3. Review the backlog and resolve relevant missing or ambiguous facts.
4. Prepare writing instructions suited to the chosen physical book, including required layout and deterministic totals/carryovers where supported.
5. Copy entries in manageable batches and explicitly confirm which entries were written. Merely displaying or preparing a template does not mark entries as copied.

Open UX choices include phone-side use versus print, batch size, interruption/resume and how to establish the paper anchor. These proposed steps retain existing evidence and confirmation boundaries; they are not a completed design or accepted live workflow.

Roadmap implication: writing is currently scheduled in M5. Its immediate product value should inform a later review of the smallest useful release and delivery order after this journey is defined. No automatic reordering, production schema change or OCR/provider/budget authorization follows from this discovery input.

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

- Confirmed: journey/UI concept discovery comes first; explore relevance and feasibility, then refine detailed behavior/contracts.
- Confirmed: rough concepts may include future ideas; inclusion does not authorize feature implementation.
- Confirmed: the intended audience includes students, instructors and pilots across aircraft categories (Manuel's direct answer).
- Confirmed: first outcomes are understanding flying and keeping the logbook current; flight cost tracking and relevant provider main-screen information are desired.
- Confirmed direction: a shared start screen with general information across user groups; review provider main-screen relevance in a later walkthrough.
- Confirmed cost source: Vereinsflieger “Meine Abrechnungen”; Manuel proposes a flying versus membership/other-cost split.
- Confirmed logbook problem/value: accumulated flights need later paper entry; a writing template provides immediate benefit (Manuel's observation). Backlog catch-up is a primary design journey.
- Open: detailed journeys, billing-section fields/semantics, final cost categories and first-release inclusion, specific initial aircraft-category coverage, role-specific needs, start-screen content and preferred UI approach.
- No interviews, completed wireframes, Figma files, user validation or live feature acceptance are claimed here.

Record future answers as confirmed decisions or hypotheses with their source. For the feature map, keep user value, priority and technical feasibility separate. Do not infer lifetime completeness, known missing values or real-user demand from sample screens.

# User journeys and UI concept discovery

Date: 2026-10-13 (Europe/Berlin). Owner: Manuel Singer, guided by the engineer. M1 discovery has started; M1 application implementation has not started. [Project roadmap](../project-plan.md) controls sequencing and acceptance. Existing task references: #5, #9 and #11; documentation traceability: #12.

## Agreed purpose

Explore which user situations matter, which features help and what is feasible before fixing detailed interfaces. Deliver a small set of user journeys, a feature-priority/feasibility map and rough screen concepts. Future ideas may be explored without scheduling implementation. Figma Design remains the main reviewed design workspace; Google Stitch is optional exploration.

## Guided process

1. Establish the initial users and choose two or three valuable situations. Start with Manuel's experience as a concrete example; whether it represents other pilots remains an open question.
2. Walk through each situation: trigger, current workflow/difficulty, desired outcome, information needed, steps, successful result and failure/offline alternatives. Use plain language and ask a small number of questions at a time.
3. Map features to those needs; distinguish essential, useful and later ideas. Record Manuel's priorities and unresolved choices rather than treating suggestions as decisions.
4. Assess feasibility from existing repository evidence, recording available capability, missing work and permission/data dependencies. Unproven behavior stays unproven; proposed future services require separate investigation when relevant.
5. Sketch two or three navigation/layout approaches and walk through realistic examples, including missing data and retrieval failure. Review usefulness before visual polish.
6. Refine selected concepts into reviewed wireframes, detailed operation states and application contracts, followed by separately scoped implementation under the roadmap.

## Starting situations — hypotheses for discussion

| Situation | Possible outcome | Current feasibility boundary |
| --- | --- | --- |
| After a flying day | See recent flights and spot missing or questionable records | Browser raw capture exists; saved live history/normalization remains M3 work |
| Looking back over a season | Understand flights, known durations and aircraft breakdowns | Synthetic deterministic queries exist; measures need review and live history is gated |
| Finding a particular flight | Find by date, aircraft or person and inspect supporting evidence | Synthetic queries exist; source identity, ambiguity and live integration remain open |
| Updating a paper logbook | Know which entries need writing and obtain clear instructions | Synthetic writing/book proofs exist; real photo-to-writing and production book integration remain deferred |
| Preparing for a flying day | Obtain useful preparation information | Weather/tutor/training ideas remain discovery candidates with separate access and scope gates |

These are prompts, not selected journeys or evidence of wider user demand. The overview → filtered flights → detail journey is an initial hypothesis; navigation is open to review.

## Decision and evidence record

- Confirmed: journey/UI concept discovery comes first; explore relevance and feasibility, then refine detailed behavior/contracts.
- Confirmed: rough concepts may include future ideas; inclusion does not authorize feature implementation.
- Open: initial audience, priority situations, essential information/actions and preferred UI approach.
- No interviews, completed wireframes, Figma files, user validation or live feature acceptance are claimed here.

Record future answers as confirmed decisions or hypotheses with their source. For the feature map, keep user value, priority and technical feasibility separate. Do not infer lifetime completeness, known missing values or real-user demand from sample screens.

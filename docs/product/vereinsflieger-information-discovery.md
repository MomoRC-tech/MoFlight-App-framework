# Vereinsflieger website/manual discovery and future features

Date: 2026-10-08. Source: Manuel's later-user-story request. Status: backlog/discovery; available information, supported transport and permissions are unverified. Tracking: [#10](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/10); own-flight access remains separate in #2.

## Expanded task — requested by Manuel, 2026-10-10

Next discovery task: inspect the Vereinsflieger website in depth and read its online manual to establish where relevant information is located and what it means for MoFlight. Future feature implementation remains later scope. This is a read-only investigation; this documentation update does not claim the investigation has run.

Requested future uses:

- Flight statistics: identify all necessary source fields, stable flight identities, roles, dates/time basis, durations, aircraft/classes and coverage. Connect findings to [#9](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/9) and the [multi-logbook scope](moflight-feature-scope.md); do not assume statistics requirements are limited to the current count/latest-flight trial.
- Ausbildungsstand: the pilot's own theory and practical training progress. Locate relevant training records and manual sections; establish syllabus/training type/version, exercise/topic meaning, recorded completion/status, assessments/sign-offs and responsible instructor where available. Distinguish logged flight experience, recorded training progress and formal qualification; a flight count alone does not establish completion. Missing/hidden records and not-completed training are different outcomes. Exact fields and available capabilities remain unverified.
- Planned duties for next week or next weekend: Fluglehrer, Flugleiter and other relevant roles. Preserve the original provider role names until their precise meanings are established; instructor and flight-operation leadership duties must not be conflated. Resolve the selected club and explicit date range/timezone, including whether the user requests the whole next week or its weekend.
- Additional uses to be reasoned about after discovery: maintain evidence-backed candidates and questions for Manuel rather than commit to unrequested features.

## Investigation method and deliverables

1. Read the online manual sections relevant to flights/statistics, theory/practical training and duty planning. Record actual section title, URL/location, document version or observed date and what each section establishes. If access is unavailable, mark that section blocked rather than infer its contents.
2. Inspect corresponding pages within the signed-in member's authorized access. Record navigation path, observed URL, visible German labels, filters/ranges, sorting, paging, hidden/expanded details and any export options. Do not retain credentials, private feed links or personal screenshots/rows in Git.
3. Build a field dictionary: provider label, precise meaning, units/timezone, identity/reference, source page/manual section, availability/permission, missing-value behavior and relevance to each future feature. Distinguish manual claims from observed UI behavior and unresolved interpretations.
4. Check row grouping and visual conventions. Manuel suspects alternating flight-row background colours improve readability; verify whether they are simple striping or encode status/grouping, including whether one flight occupies several rows. Do not use colour alternation alone as a record boundary or semantic field. Compare any proposed interpretation with actual row structure/identities and manual evidence.
5. Map permitted retrieval options and preservation needs to future statistics, training and roster stories. Identify freshness, account/club/book scope, coverage, ambiguous fields and unresolved questions. Use synthetic examples; avoid broad collection of other members' data.
6. Publish the navigation map, field dictionary, manual references, capability evidence and remaining questions through this specification or linked investigation documents from the central README. Propose the next small executable retrieval checks only after meanings and access are established.

Acceptance for discovery: every requested category has a source-backed navigation/manual/field entry, or an explicit unavailable/blocked result; colour meaning is verified or remains explicitly unknown. Do not call the inventory complete when an inaccessible manual or relevant page remains unresolved. No live discovery, training-progress retrieval or roster/statistics acceptance has been performed for this expansion.

## User story FL-17

As a club member, I want to ask “Who is scheduled as flight instructor next weekend?”, so that I can plan a visit. Before implementation, establish whether the member's Vereinsflieger access provides that information through a supported/approved retrieval path. Neither prior flight history nor the mobile app's technical ability establishes this capability.

Resolve club, exact displayed Saturday/Sunday dates, local timezone and requested duty/role. Distinguish published assignment from guaranteed presence/availability. If dates or club are ambiguous, request selection. Return source, retrieval time and known schedule scope with the answer; stale/offline data is explicitly labeled. No assignment, unknown access and retrieval failure are distinct outcomes.

## Discovery inventory

Record categories only after checking official documentation/access and permitted usage; sample values in this table are hypotheses, not discovered endpoints or services.

| Candidate information | Potential use case | Current evidence |
| --- | --- | --- |
| Flight records and statistics | Future flight statistics and source-field coverage (#9) | Unverified beyond existing bounded own-flight evidence; inventory required. |
| Theory and practical training records (Ausbildungsstand) | Personal training progress | Unverified; locate manual/UI records and establish status/sign-off semantics. |
| Instructor, Flugleiter and other duty assignments | Next-week/next-weekend planning | Unverified; determine whether retrievable and which club/member roles may access it. |
| Club calendar/training events | Dates of planned activities | Unverified; field semantics, date scope, freshness and access unknown. |
| Operational notices/status | Relevant published club information | Unverified; available categories and permission scope unknown. |

### Official public-feature lead — 2026-10-09

The [official personal-area page](https://vereinsflieger.de/MeinBereich) describes viewing assigned duties, offering a duty for exchange and calendar integration for open dates. This is primary evidence of a **member UI feature**, not a discovered API/feed contract or permission to retrieve all instructors' duties. The description does not establish that “Who is the instructor next weekend?” can be answered in the requesting member's scope. No private calendar URL, schedule, session or account was accessed; no calendar integration was implemented. Next discovery must resolve feed/API semantics, role visibility, club scope, dates and permitted caching before adopting a transport. [Own-flight investigation](../architecture/vereinsflieger-access-investigation.md) records the current documentation-access limitation.

For each confirmed capability record: official source/document/version, authentication/authorization, supported transport, information fields, club/role restrictions, date/time meaning, update cadence, paging/limits, permitted caching and resulting user stories. Mark unavailable/unsupported access explicitly. Do not infer permission merely from a page being visible in a session or distribute application secrets.

Start with read-only queries in the requesting member's permitted scope. Preserve source freshness and club context, minimize stored third-party personal data and use synthetic examples in Git. This backlog item does not authorize sending messages, booking activities, changing assignments or broad collection of other members' data.

## Later acceptance gate E17

Given a supported roster source and an authorized member, resolve a named club and explicit weekend dates, retrieve the permitted assignments and answer with source/freshness. Test multiple/no assignments, changed/outdated roster, missing access, wrong-club/role requests and offline cache. If supported access is not established, report the capability as unavailable rather than generate an inferred instructor answer.

Priority clarification, 2026-10-10: the website/manual inspection is requested as a next discovery task; statistics, training-progress and duty-query implementation remain later scope. Coordinate with #2 own-flight investigation to reuse evidence; the initial local logbook workflow and early Supabase feasibility do not depend on broad feature integration. No capability discovery or live roster test has passed in this documentation change.

# Later: Vereinsflieger information discovery and club questions

Date: 2026-10-08. Source: Manuel's later-user-story request. Status: backlog/discovery; available information, supported transport and permissions are unverified. Tracking: [#10](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/10); own-flight access remains separate in #2.

## User story FL-17

As a club member, I want to ask “Who is scheduled as flight instructor next weekend?”, so that I can plan a visit. Before implementation, establish whether the member's Vereinsflieger access provides that information through a supported/approved retrieval path. Neither prior flight history nor the mobile app's technical ability establishes this capability.

Resolve club, exact displayed Saturday/Sunday dates, local timezone and requested duty/role. Distinguish published assignment from guaranteed presence/availability. If dates or club are ambiguous, request selection. Return source, retrieval time and known schedule scope with the answer; stale/offline data is explicitly labeled. No assignment, unknown access and retrieval failure are distinct outcomes.

## Discovery inventory

Record categories only after checking official documentation/access and permitted usage; sample values in this table are hypotheses, not discovered endpoints or services.

| Candidate information | Potential use case | Current evidence |
| --- | --- | --- |
| Instructor duty/assignment roster | Next-weekend instructor question | Unverified; determine whether retrievable and which club/member roles may access it. |
| Club calendar/training events | Dates of planned activities | Unverified; field semantics, date scope, freshness and access unknown. |
| Operational notices/status | Relevant published club information | Unverified; available categories and permission scope unknown. |

### Official public-feature lead — 2026-10-09

The [official personal-area page](https://vereinsflieger.de/MeinBereich) describes viewing assigned duties, offering a duty for exchange and calendar integration for open dates. This is primary evidence of a **member UI feature**, not a discovered API/feed contract or permission to retrieve all instructors' duties. The description does not establish that “Who is the instructor next weekend?” can be answered in the requesting member's scope. No private calendar URL, schedule, session or account was accessed; no calendar integration was implemented. Next discovery must resolve feed/API semantics, role visibility, club scope, dates and permitted caching before adopting a transport. [Own-flight investigation](../architecture/vereinsflieger-access-investigation.md) records the current documentation-access limitation.

For each confirmed capability record: official source/document/version, authentication/authorization, supported transport, information fields, club/role restrictions, date/time meaning, update cadence, paging/limits, permitted caching and resulting user stories. Mark unavailable/unsupported access explicitly. Do not infer permission merely from a page being visible in a session or distribute application secrets.

Start with read-only queries in the requesting member's permitted scope. Preserve source freshness and club context, minimize stored third-party personal data and use synthetic examples in Git. This backlog item does not authorize sending messages, booking activities, changing assignments or broad collection of other members' data.

## Later acceptance gate E17

Given a supported roster source and an authorized member, resolve a named club and explicit weekend dates, retrieve the permitted assignments and answer with source/freshness. Test multiple/no assignments, changed/outdated roster, missing access, wrong-club/role requests and offline cache. If supported access is not established, report the capability as unavailable rather than generate an inferred instructor answer.

Priority is later discovery. #2 may gather official capability leads while proving own-flight access, but the initial local logbook workflow and early Supabase feasibility do not depend on broad Vereinsflieger queries. No capability discovery or live roster test has passed in this documentation change.

# Guided discovery consolidation verification

Date: 2026-10-13 (Europe/Berlin). Environment: Windows/PowerShell, existing MoFlight-App-framework checkout. Baseline: main at `49ebf0e`. Documentation/backlog work only; no application implementation, build, device test, provider retrieval trial, paid AI or new cloud service.

## Scope and authorization

Manuel authorized consolidation of the current conversation's confirmed journeys/content choices, updates to relevant existing Issues, a dedicated deferred Activities live Issue and a concise map for review. He also changed the preferred simpler-task model to GPT-6 Luna. [Journey/information map](../product/2026-10-13-journey-information-map.md) records actual selections, later corrections and open questions; its review precedes more overall layout comparison.

Updated active product/story/state/presentation requirements and narrow ADR clarifications distinguish assumed prepared-template writing progress from confirmed paper evidence, with next-session last-entry confirmation/photo recovery. Phone and printable outputs are both desired; concrete renderer/export technology and actual delivery remain unselected/gated. Source facts, account/book separation and earlier lab verification evidence are preserved. ADR 0007 remains proposed; milestone order unchanged.

## Checks and review

- Existing Issues #1–#13 checked before mutations; no existing Activities live task found. Created [#14](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/14) as explicitly deferred, with dependencies and discovery completion criteria.
- Appended current follow-up sections to existing #2, #5, #7, #9, #10 and #11 via full body files, preserving their earlier contents. Revised #7 interaction explicitly supersedes its earlier completion-confirmation/in-app-only requirements for future product behavior.
- `python pocs/project-audit/check_docs.py`: 78 tracked Markdown files, 514 local destinations, zero missing files/heading warnings. `git diff --cached --check` passed. No application/native/provider acceptance follows from these documentation checks.
- Independent read-only audit identified active completion-confirmation contradictions; amended product rules while retaining historical implementation/tests. GPT-6 Luna review identified remaining phone/print wording conflicts; corrected them.
- An explicit `gpt-6-luna` subagent spawn was accepted and produced the review despite omission from the advertised tool model list. The earlier assertion of unavailability based on that list was corrected. AGENTS.md now records Manuel's requested simpler-task preference without substituting another Luna version.

## Evidence and limits

Earlier in this chat, CUA read-only inspection of the signed-in Vereinsflieger overview inventoried visible sections and the club Hauptflugbuch fields (date, aircraft, pilot, start/end times). Product relevance answers are in the map. Private rows/names/photos/screenshots/credentials were not copied into Git. Guided billing walkthrough remains deferred; incidental preview visibility is not evaluated billing semantics or complete history evidence.

Source access/transport, stable identities, duration/cost meaning, complete coverage, live/airborne status, roster/partner matching, new-item semantics and future refresh behavior remain unverified where stated in the map. Prepared-template assumption trigger/cancellation/retry and partial-writing recovery need a later detailed contract. Existing lab code is unchanged and does not satisfy revised acceptance automatically.

The pre-existing ecosystem-research insertion in `docs/product/README.md` and untracked ecosystem-research document were preserved and excluded from this task's staging/commit. Only the independent journey-map/presentation index lines were staged from that README. No Issue was closed, no PR created and no hosted CI dispatched.

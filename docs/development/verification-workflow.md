# Development and verification workflow

Approved by Manuel on 17 October 2026 after requesting lower token use and authorizing this workflow to be remembered. Tracking: [#6](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/6#issuecomment-6232382831), coordinated with #5. This supersedes routine visual verification/delegation; it does not authorize the proposed connection-state refactor, change milestone order or close an acceptance gate.

## Select checks by the change

| Change | Development loop | Acceptance checkpoint |
| --- | --- | --- |
| Logic, state, parsing, persistence | Relevant automated tests and TypeScript; no routine screenshots or emulator use | Broader regressions when shared contracts/data safety are affected; relevant native persistence/offline checks where required |
| Provider/controller or platform integration | Contract/controller tests first | Platform exports, committed-source Release and one focused native trial plan for the changed behavior |
| Small UI change | Inspect only the affected screen/state when a visual question needs answering | Targeted layout/accessibility/keyboard check appropriate to the change |
| Substantial layout, navigation or typography | Targeted screen iteration | Relevant MIN360 / MAIN390–412 / MAX600+ matrix, enlarged text/keyboard/landscape as applicable; actual dp/density/font recorded |
| Documentation | Links, traceability, consistency and approval/status claims | No application tests, exports, builds, device actions or screenshots |

The approved visual reference and existing screen-size requirements remain authoritative when visual checks apply. A logic-only change does not trigger the matrix. Prefer nonvisual native assertions for behavioral questions. Do not inspect every screenshot produced by an existing harness automatically; inspect images only for a specific visual acceptance question or failure.

## Work in bounded packages

1. Read current authorization and relevant source/evidence. Reuse the matching GitHub Issue; capture distinct work before implementing it.
2. Record a short contract in that Issue: **scope / exclusions / acceptance**, including milestone and dependencies. Add a separate specification only when the contract or decision needs it.
3. Implement several small, traceable commits with affected tests and TypeScript. Keep logic behind application contracts; use existing development-client/Metro tooling when interactive iteration helps. Do not rebuild a standalone APK for each commit.
4. At the planned integration checkpoint, run the required broader checks/exports, build committed source and perform focused native checks. Record any unverified native/live/iOS/physical gates; code committed to main is not automatically accepted. A concrete platform uncertainty can justify an earlier small native PoC without a full visual audit.
5. Repeat only checks affected by a change, failure or unresolved risk. If native testing exposes a code defect, rebuild the corrected committed source and retest the affected behavior. Reuse unaffected evidence with explicit source provenance; never present different builds/runs as one result.
6. Publish one concise package verification summary with source, environment, checks, results, limits and links to logs. Extend the existing report for follow-ups instead of creating a report/specification for every edit. Update README/roadmap only for meaningful status/decision changes.

No routine subagents for small tasks. Use independent parallel work only when it warrants the added cost; justified simpler delegation retains `gpt-6-luna`. Avoid repeated full repository audits and verbose progress narration.

## Preserved gates

[ADR 0009](../adr/0009-local-android-development-and-checkpoint-ci.md) still requires committed-source Release and relevant native evidence before scoped integration acceptance/device handoff. Tests/bundles do not prove live-provider, native, iOS or physical acceptance. Preserve data, recovery journals, private sessions and dirty checkouts; destructive smoke remains restricted to the verified synthetic AVD. Hosted CI remains optional/manual-only, with no paid usage authorized. Deferred Pixel testing stays deferred until Manuel resumes.

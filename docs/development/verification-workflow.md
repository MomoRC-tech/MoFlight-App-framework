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

## Local checks without model calls

Run `pnpm check` from the repository root for a complete host check: TypeScript, the TypeScript unit/controller/SQLite suite, standard Python unittest discovery and read-only fixture parity. It uses the installed runtimes and synthetic fixtures without model calls, credentials, package installation, hosted CI or devices. Some integration tests use a loopback HTTP server. Individual commands and focused tests remain available for smaller changes; documentation-only changes still use documentation checks.

The command prints one result and duration per check, continues through independent failures and returns nonzero if any check fails, cannot start or exceeds 180 seconds. Each run gets a new ignored `build/host-checks/<run>/` directory with full numbered logs and `report.json` containing commands, exit codes, timings, Python version and the starting Git commit/dirty-tree state. `python scripts/verify_host.py --output <new-directory>` selects a different location; existing directories are refused to preserve evidence.

Read the compact summary first. Passing checks normally need no further log inspection; failures print the last 12 log lines, with full diagnostics retained for focused investigation. Add regression assertions for repeatable behavior when a bug exposes a coverage gap. Keep actual layout/native/provider acceptance at its applicable checkpoint. Reuse existing node:test, unittest and native harness assertions rather than asking a model to repeatedly judge deterministic results.

Launching or reviewing checks through an assistant still uses conversation tokens; the test processes themselves perform no LLM inference. Future AI-response validation should use frozen synthetic responses for ordinary contract tests. Actual handwriting/model-quality evaluation stays separate, requires permitted inputs and approved execution budget, and cannot be established by mocked responses. No token-saving percentage has been measured.

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

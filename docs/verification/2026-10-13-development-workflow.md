# Development workflow agreement — 2026-10-13

## Scope and authorization

Manuel requested: “ok, capture that as how we want to proceed.” This authorized recording the preceding development-workflow discussion. Base checkout: `main`, `d1eda53`, clean working tree; Windows/PowerShell, Europe/Berlin.

- Added the agreed workflow, responsibilities, contract-based separation, prototype review and incremental native implementation to [the authoritative roadmap](../project-plan.md#11-agreed-development-workflow--2026-10-13).
- Recorded Figma Design as the main design workspace and Google Stitch as optional exploration, with official capability references checked during the preceding discussion.
- Recorded the first representative M1 journey and retained the broader M1 screen scope and unresolved product decisions.
- Linked the agreement from [README](../../README.md). No application changes, design-file creation, paid usage or native/provider workflows were performed. M1 remains next; the agreement does not establish implementation or acceptance.

## Verification

- GitHub Issues #1–#13 were freshly read with `gh issue list --state all`; all remain open. No Issues were created, changed or closed.
- `python pocs/project-audit/check_docs.py`: local file/heading destinations checked with no missing files or heading warnings.
- `git diff --check`: passed.
- Independent read-only review found no actionable roadmap/scope consistency issues. The reviewer lacked the later tooling discussion; the parent checked Figma/Stitch and the clickable-prototype checkpoint against the proposal Manuel accepted. Preferred 6.1 Luna is unavailable; the reviewer used the current model.

Application tests/builds and native trials are not applicable to this documentation-only change. This report belongs to the same traceable direct-main documentation commit as the roadmap update.

## Follow-up: guided journey and UI discovery

Manuel subsequently confirmed user journeys and the overall UI concept as the next discovery step and requested: “ok, capture that, and lead me through this.” Base checkout: `main`, `a2ac7ae`, clean working tree.

- Added [the guided discovery brief](../product/user-journey-ui-discovery.md), linked it from README and recorded the agreement in roadmap section 1.2.
- Updated M1 to discovery started/application implementation not started. The immediate task now explores needs, feature relevance/feasibility and rough concepts before detailed contracts. M2–M5 sequencing and existing gates remain intact.
- Candidate situations are hypotheses; initial audience and priorities remain open. No completed design files, broader user research or product acceptance are claimed.
- Issues #1–#13 were freshly read and remain open; no Issue changes were made.
- Documentation checker passed: 76 Markdown files, 486 local destinations, no missing files or heading warnings. Staged whitespace checks passed. Independent read-only review found no material scope/sequencing issues; its wording clarifications were applied. Application code, builds, native/provider workflows and paid services are outside this documentation change.

## 18 October 2026: local host-check runner

Manuel requested implementation of the testing/LLM-usage review. [Authorized package contract under #6](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/6#issuecomment-6246754534). Source base: `760d39b1c5573e6ff990b7bc880bf1355cdb6a00` plus this package's working edits; the generated report correctly records `working_tree_dirty: true`. The #6 completion comment identifies the local package commit containing the tested runner/test changes. Windows/PowerShell, Node 24.18.0, pnpm 11.25.0, Python 3.12.10.

Added `pnpm check` using existing runtimes/standard libraries, compact results, independent check continuation, nonzero failure exits and separate ignored logs. Python helper imports now restore the original import path, and the existing disabled-ancestor selector assertion is included in standard discovery. Workflow/runbook/agent instructions explain summary-first review, focused iteration and separate native/visual/live-AI gates.

| Executed check | Result |
| --- | --- |
| `pnpm check`: TypeScript | Passed, 3.440 seconds |
| `pnpm check`: mobile unit/controller/SQLite tests | 203 passed, none skipped, 2.285 seconds including command overhead |
| `pnpm check`: standard Python discovery | 48 passed, none skipped, 4.772 seconds including command overhead |
| `pnpm check`: read-only fixture parity | Passed, 0.105 seconds |
| Runner behavior within the Python suite | Real subprocess success/failure and shell exit propagation, failure followed by success, bounded terminal output/full saved diagnostics, missing executable, timeout and preservation of existing logs passed |
| Documentation/whitespace | Local file/heading checker and `git diff --check` passed |

[Archived generated command/exit/timing summary](evidence/host-checks-2026-10-18.json). Its numbered log filenames refer to the original ignored local run directory `build/host-checks/20261018T065312Z-a63b063a/`; full synthetic logs remain there and are not committed. An earlier direct standard-discovery run also passed after the import/selector repair; the table records the final aggregate run, including the stronger subprocess exit test.

No inference/API calls, credentials, package installation, hosted dispatch, native rebuild, emulator/provider action or visual inspection was needed. Cross-platform execution was not performed; native/live/iOS/physical acceptance is unchanged. The runner's timeout is per check. No token-saving percentage is claimed.

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

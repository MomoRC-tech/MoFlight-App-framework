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

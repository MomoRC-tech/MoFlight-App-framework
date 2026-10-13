# Product README refactor verification

Date: 2026-10-13 (Europe/Berlin). Environment: Windows/PowerShell. Source baseline: `34d847a`. Tracking: existing documentation Issue #12. Manuel requested a human-readable product teaser, provisional logo, emoji accents, Mermaid diagrams, collapsed later chapters and removal of outdated information.

## Result

Follow-up requested by Manuel: the opening now explicitly lists Android/iOS App, Data privacy, Local-first, Offline access, Paper-logbook companion and In development with icons. These are labeled product priorities/target platforms; no privacy certification, encryption guarantee or completed iOS acceptance is claimed.

Second layout follow-up: replaced the wrapping inline icon strip with a two-row, three-column HTML table. Each cell consistently stacks an icon, bold label and short qualifier. GitHub's sanitized Markdown response preserves the column widths/alignment; no custom CSS is required in the README.

Commercial ownership decision, Manuel, 2026-10-13: he does not want others allowed to reuse/modify/sell the original source and intends a proprietary commercial product. Before this change, no root license file/package license declaration existed; GitHub reported no detected license and a private repository. Added an all-rights-reserved ownership/reuse notice in LICENSE, root package metadata `UNLICENSED`, and a ninth collapsed ownership chapter. Third-party rights are explicitly retained; no dependency compliance audit or commercial end-user agreement is claimed complete. This changes source reuse policy documentation, not repository visibility or release readiness.

The [README](../../README.md) now leads with MoFlight's intended benefits and an explicit early-development status. Nine closed-by-default chapters separate product journeys, roadmap/status, architecture, development setup, privacy/verification, requirement IDs, hosting/cost boundaries further documentation and commercial ownership. Features and complete product journeys are not presented as already delivered. Approved stack, current roadmap and unselected revised UI direction remain intact.

The [provisional SVG logo](../assets/moflight-logo.svg) is an original wing/open-logbook mark. It has descriptive text, no embedded scripts and no external resources. Branding remains replaceable.

Outdated update logs, historical test counts, former sequencing/architecture options and estimates were removed from the active entry point. The [complete previous README](../reference/2026-10-13-readme-development-history.md) remains dated, clearly superseded reference evidence. All source content was preserved there; only a provenance header and relative-link rebasing were added. The active README retains the requirements-and-evidence heading used by existing audit links and all R01–R15 identifiers.

## Checks actually performed

- GitHub Markdown API rendered the final GFM source successfully, retaining all nine details/summary chapters and recognizing both Mermaid blocks.
- Browser inspection of that rendered response in a local styled preview verified the logo loads, initial chapters are collapsed, expand/collapse works and both Mermaid diagrams render after opening. Default-viewport content had no document-wide horizontal overflow; inspected browser error log was empty. The preview styling is not a pixel-identical GitHub page, and no phone/native acceptance is claimed.
- Compared the archived text with `git show 34d847a:README.md`, reversing only the local-link rebase: original content matched. All 99 archived local file destinations resolve.
- XML parsed the SVG; checked nine balanced details blocks and two Mermaid source blocks.
- Tracked Markdown file/heading destination audit and staged whitespace checks passed. No application tests/builds/native/provider workflows were rerun for this documentation/asset change.
- GPT-6 Luna independently reviewed product/status boundaries and links. Ambiguous cost wording and a too-narrow M1 next-action summary were corrected. Reviewer noted pre-existing dirty research/index files; they were intentionally preserved, not created by this task.

The unrelated ecosystem-research insertion in `docs/product/README.md` and untracked ecosystem-research file are excluded from this commit. No application code, milestone order, architecture approval, subscription or billing setting changed. The local preview server is task-owned and stopped after inspection.

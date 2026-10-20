# Decisions, history and known gaps

[Handbook entry point](README.md). Current guidance is in this handbook. Dated sources stay at existing paths; historical selected/confirmed/latest wording describes its original checkpoint unless explicitly carried forward.

## Decision register

| Date / owner | Scope / status | Implementation / evidence |
| --- | --- | --- |
| 13 Oct 2026 / Manuel | Approved Thermik dark/light logos and icon artwork | Dark header logo implemented; the later #25 package integrates the approved square AI icon. [Brand record](../../assets/branding/README.md). |
| 16 Oct 2026 / Manuel | Approved four-screen composition and reference fidelity | Native UI exists with documented photo/data-state differences. [Scope](../2026-10-16-four-screen-implementation.md), [refinement](../2026-10-16-ui-fidelity-refinement.md), [evidence](../../verification/2026-10-16-ui-fidelity-width-matrix.md). |
| 17 Oct 2026 / Manuel | Approved five tabs, compact header/profile, aircraft and aircraft-share rings | [Shell report](../../verification/2026-10-17-native-shell-corrections.md) records Android checks and remaining iOS/physical limits. |
| 18 Oct 2026 / Manuel | Approved B, contextual Back/provider Close, one active header, Connection → Med → Profile unknown | Medical follow-up in application `8b51f5a`. [Decision](../2026-10-18-header-status-review.md#package-1b-decision-checkpoint), [evidence](../../verification/2026-10-18-header-navigation.md). |
| 18 Oct 2026 / Manuel | Authorized this handbook/export consolidation under #23 | Documentation implementation; no new appearance, code-token refactor or runtime acceptance. |
| 18 Oct 2026 / Manuel | Selected duotone symbol family, M2 Medical card and supplied folded paper plane; authorized guide and app integration | Supersedes aircraft B and stethoscope artwork. [Selected assets](symbols/README.md), [source-specific verification](../../verification/2026-10-18-icon-option-2.md). Navigation/unknown meanings and branding are preserved. |
| 18 Oct 2026 / Manuel | Made Modern Duotone the default and requested removal of old icon designs | [Default library](symbols/index.html) contains only the 29 current masters. Old aircraft assets, unselected proposals and icon comparison pages are removed; retired X01–X03/B04 no longer appear in the active catalogue. Original references and dated evidence remain. [Authorization](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/20#issuecomment-6250110588). |
| 18 Oct 2026 / Manuel | Authorized starting the urgent #25 launcher package using the existing approved Thermik logo | Square AI icon adapted for legacy/iOS and padded adaptive/themed exports; no new brand design. [Execution contract](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/25#issuecomment-6250575222), [installed Release evidence and platform limits](../../verification/2026-10-18-launcher-icon.md). |
| 18 Oct 2026 / Manuel | Continued with #26/#27 route/tool cleanup | Existing functions classified before implementation. Ordinary paper entry becomes read-only status; backup stays an ordinary product control, and synthetic proofs move behind Settings → Development. Current cards/symbols are reused; full paper redesign remains M5. [Scope, disposition and source-specific evidence](../../verification/2026-10-18-development-navigation.md). |

## Preserved history

**20 October implementation amendment:** Manuel selected profile administration with direct Start/header shortcuts and a non-blocking more-than-seven-day capture-age reminder, then authorized implementation. The first increment reuses shared cards/actions, adds a Start/profile session/data summary and presents saved own Medical class/expiry as original source text with retrieval time. Med / Angaben means source rows exist, never validity or fitness. Empty/foreign/ambiguous source remains unknown. The current sequence is imported/stored flights and working Flüge first, then statistics; neither Medical nor appearance refinements delays it. [Decision](../2026-10-13-journey-information-map.md#retrieval-first-and-profile-administration--20-october-2026), [focused evidence and pending native checks](../../verification/2026-10-10-vereinsflieger-discovery.md#retrieval-first-usability-increment--20-october-2026). This amends the earlier unknown-only Medical wording; source/date interpretation remains unverified.

| Source | Current use |
| --- | --- |
| [App design chronology](../app-design.md) | Original prototype choices/provenance; older refresh header, palettes, Medical expiry, goals and navigation do not override later decisions. |
| [Screen content](../screen-content.md) | Content-placement history/requirements; apply current amendments and feature contracts. |
| [Stitch archive](../design-sources/2026-10-16-stitch/README.md) / [DESIGN.md](../design-sources/2026-10-16-stitch/DESIGN.md) | Generated third-party source with typography/extra concepts not adopted wholesale. |
| [Micro Bento](../design-sources/2026-10-16-micro-bento/README.md) | Earlier prototype context; later four-screen native reference controls fidelity. |
| [Start alternatives](../2026-10-16-start-alternatives.md) | Two unselected compositions. |
| [v0.30](../prototypes/2026-10-16-clickable-v030.html) | Preserved historical interaction snapshot with synthetic states; its icon vocabulary is excluded from the current catalogue. |
| Retired icon comparisons | A/B and later six-candidate reviews were superseded by the selected M2 / folded-plane family. Removed comparison files remain recoverable through Git history. |
| [Dark-concept review](../2026-10-13-dark-concept-review.md) | Earlier rationale and revisions, not a competing current guide. |

## Known differences and open choices

| Item | Current facts / disposition | Tracking |
| --- | --- | --- |
| Local styling literals | Shared theme plus local colors/gradients/geometry, including retained/unused declarations. Preserve appearance; semantic code cleanup is separate. | [Proposed follow-up #24](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/24), #5 |
| Prototype popup/canvas/fonts | Pale v0.30 sheets, lighter canvas and Inter differ from current dark overlays/system fonts. Preserve current implementation and approved image/amendments; remaining fidelity disputes need concrete comparison/choice. | [#20](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/20) |
| Photos | Licensed scenes substitute for exact reference scenes. No replacement here. | #20 / [branding](../../assets/branding/README.md) |
| Launcher icon | Approved square Thermik AI artwork is configured through deterministic iOS/legacy/adaptive/themed exports; original branding is preserved. Acceptance and platform limits are source-specific. | [#25](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/25), [verification](../../verification/2026-10-18-launcher-icon.md) |
| Icon coherence / targets / focus | Selected duotone artwork is shared across product screens; text/data notation and native busy indicators are intentionally retained. Scoped Android geometry is checked separately; spoken focus/accessibility and affected small targets retain their explicit acceptance limits. | #20 / [#8](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/8) |
| Connected data | Medical/AI/weather/club presentation retains unknown/unavailable states. This guide establishes no evidence source/integration. | Existing #20/#7/#10/#13 scopes |
| Runtime limits | Existing Android checks are source-specific. Spoken TalkBack, iOS, physical-device and positive provider-history/original-page keyboard remain separate. | #20/#8 and linked reports |

The later selected duotone symbols supersede earlier artwork choices in their scope. Other unresolved appearance changes remain for later review.

## Maintenance and evidence

- 18 Oct 2026: 51-entry symbol catalogue and README index introduced; the later default-family cleanup retires four obsolete entries, leaving 47 current IDs.
- 18 Oct 2026: chapters, complete source-literal inventory, component shape examples and portable/copyable views assembled under #23. Application UI and original assets are unchanged.

Regenerate with `python scripts/design_handbook.py`; validate freshness/links/coverage with `python scripts/design_handbook.py --check`. Focused tooling checks: `python -m unittest discover -s tests -p test_design_handbook.py -v`. The command normalizes source line endings before hashing and performs no network/app operations. [Package verification](../../verification/2026-10-18-design-handbook.md) records actual results and limits.

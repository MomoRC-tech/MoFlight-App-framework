# Pilot hub implementation plan

Working plan for [#116](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/116), 2 November 2026. This document tracks the isolated experiment; the [project plan](../../project-plan.md) still controls project-wide priorities and GitHub Issues remain the backlog.

## Authorization and baseline

The owner requested a complete implemented redesign, including Start, color scheme and high-level UI simplification, without a preliminary approval pause. The subsequent direction is a **hub of subapps**: every module has a Start section containing its major metrics or latest information; details live inside that module. Challenge choices against current Android Developer and Material 3 guidance. **Latest navigation instruction:** retain persistent navigation even with six destinations. Keep testing deliberately small until the layout is reviewed.

Branch: `codex/pilot-ui-redesign`. Exact parent: published rollback release `rollback-2026-11-02-eeda7a0`, commit `eeda7a063fb5266b89cf306d6ad9b937946b0496`. Separate worktree preserves dirty main and existing sessions. This request supersedes earlier Start-preservation/main-only/proposal-first instructions **for this branch**. Implementation is authorized; final visual acceptance and merging to main are not established.

## Product and data findings

| Subapp | Start summary | Detail / capability boundary |
| --- | --- | --- |
| Papierflugbuch | Purpose and writing availability | Three-step workflow; saved-flight review works. Production paper matching and writing templates remain unfinished, visibly marked |
| Flüge | Latest saved flight, aircraft and duration | Existing search, filters, crew, source details and offline history |
| Statistik | Current-year flight time and flight count | Existing period, aircraft, launch/role charts and contributor routes. Unknowns are not zero |
| Verein | Next own duty from stored excerpts | Task menu for duties, events, work hours, tasks and document notices. No verified live activity/news feed |
| Kosten | Current-year known billed flying subtotal | Existing evidence/period/account/aircraft views. Partial, booking-date and conflict qualifications remain visible; never imply total liability or payment |
| Assistent | Suggested uses and availability | Local question starters, drafts/history/source evidence; ordinary AI transport remains closed |

Medical is a supporting recorded-date reminder below the module summaries, with its existing details. Sync and Profile remain shared top-bar actions. No schema, domain, provider, billing or service activation changes.

## Design decisions and Android challenge

- Ink canvas, distinct slate surfaces, soft mint actions and a warm paper accent. Remove decorative dashboard photography and horizontally hidden metrics. Preserve the original logo. Dark only for this review.
- Start is the stable hub. Six persistent destinations are Flüge, Flugbuch, Verein, Kosten, Statistik and Assistent; Start remains reachable from the header and wide navigation rail. **Owner-selected departure:** Android recommends primary navigation bars for 3–5 peers. The owner explicitly wants six. Use labelled, minimum-48-dp targets, a bottom bar on compact windows and a rail on wide windows; wrap into two rows at enlarged font sizes. This replaces the earlier hub-only experiment before delivery. Native navigation acceptance is still pending.
- Module overview cards expose details through named actions, avoiding nested complete dashboards. Verein uses a task menu rather than six stacked full lists. Reuse existing typed application operations behind presentation components.
- Interactive targets at least 48 logical dp; scalable text; no fixed card heights. Phone uses one column; wide hub uses two bounded columns. No gesture-only essential actions. Check newly introduced foreground/surface contrast; do not claim app-wide accessibility acceptance.
- Preserve current account-scoped data, sync confirmation, recovery/backup/session guards, offline behavior and retained detail/filter state. Avoid rewriting stable persistence to simplify UI.

Sources consulted 2 November: [Android navigation](https://developer.android.com/design/ui/mobile/guides/layout-and-content/layout-and-nav-patterns), [Android accessibility](https://developer.android.com/design/ui/mobile/guides/foundations/accessibility), [Material navigation bar](https://m3.material.io/components/navigation-bar/overview), [Material color roles](https://m3.material.io/styles/color/roles). Material pages require JavaScript in text retrieval; Android's official rendered guidance supplies the concrete navigation and accessibility rules above.

## Execution checklist

- [x] Identify published rollback source and preserve unrelated work.
- [x] Create isolated branch/worktree; capture categorized Issue #116 before implementation.
- [x] Review actual feature/data capabilities and current design/source boundaries.
- [x] Consult current Material and Android guidance; record the hub navigation tradeoff.
- [x] Implement semantic dark palette and calmer shared surfaces.
- [x] Replace Start with six subapp summaries and supporting Medical reminder.
- [x] Add a truthful paper workflow screen and direct existing Costs/Statistics entries.
- [x] Replace Verein's crowded overview with a task launcher, retaining detailed sections.
- [x] Add local assistant prompt starters without enabling transmission.
- [x] Finish six-destination persistent navigation, a wide rail and contextual paper-to-flights return.
- [x] Add useful focused regressions for navigation, context retention and financial isolation/lifecycle behavior.
- [x] Prepare a clearly synthetic visual review artifact; inspect compact and wide composition briefly.
- [x] Run TypeScript and focused presentation/financial/navigation checks; fix affected failures. No full suite or native matrix at this stage.
- [x] Update this plan, handbook, roadmap and one concise verification summary with actual results and limits.
- [x] Commit and push the implementation branch; prepare review links. Application commit: `6428d51`.
- [ ] Owner chooses/refines layout and palette. **Pending review, not an implementation blocker.**
- [ ] Later, after design selection: scoped committed-source native/physical/iOS acceptance and optional APK handoff. No new APK is claimed in this package.

## Verification and known work in progress

Final TypeScript passes. There are 91 focused passing checks: 26 retained financial/AI/preview checks, 62 updated shell checks and three new control/isolation checks. The shell checks caught and resolved flight-context clearing during module switches. Native leaf mocks and the source-rendered synthetic preview establish no native acceptance. Offline dependency installation completed from the local cache, without lifecycle scripts or network downloads. No native, provider, paid AI or hosted CI runs were requested.

Final focused evidence and remaining limits are recorded in [the package report](../../verification/2026-11-02-pilot-hub.md). Existing domain/source tests are reused; new checks protect navigation and isolation behavior rather than freeze incidental spacing/text. The [implementation branch](https://github.com/MomoRC-tech/MoFlight-App-framework/tree/codex/pilot-ui-redesign) is pushed; application commit `6428d51` is ready for design review. Remaining work is owner layout/color selection; expanded native acceptance is deliberately deferred.

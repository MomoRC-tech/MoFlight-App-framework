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

### Visual revision — owner feedback, 2 November

The owner rejects the first palette and describes the UI as clumsy. Keep the six-subapp structure and persistent navigation; rework the visual treatment directly on the same branch. The earlier ink/slate/mint treatment is rejected, not selected.

**Additional owner instruction:** remove unnecessary visible text and combine metrics in richer graphics. Implement a season instrument with outer aircraft-time segments, an inner current-flight-count arc, a labelled previous-year marker, direct values and matching aircraft mini-bars. Rings describe saved distributions/comparisons, never an invented goal or completeness. Keep fuller explanations in accessibility labels and detailed subapps. Reuse deterministic summaries and native ring rendering; no dependency/service addition.

- [x] Replace muted mint/slate with deep aviation blue, clear sky-blue actions and restrained warm/violet module accents.
- [x] Put actual season figures and the latest flight first; remove the large unfinished-paper hero and repeated full-width buttons.
- [x] Use compact rows, a paired paper/assistant area, fewer outlines and a clearer type hierarchy. Keep 48-dp targets, scalable text and honest unknowns.
- [x] Refine shared surfaces/navigation and module entry pages consistently; remove repeated explanatory and marketing copy.
- [x] Add the combined season instrument, exact aircraft labels/bars, prior-year count marker and direct aircraft-detail routing. Unknown and zero data draw no false progress.
- [x] Refresh source-rendered phone/wide review; TypeScript, focused lint and 67 financial/navigation/instrument checks pass. This is no native acceptance.
- [ ] Update evidence/handbook and push the revision. Native acceptance stays deferred.

Android challenge: color supports hierarchy rather than decorating every panel; essential actions retain labels, sufficient contrast and independent touch targets. Preserve the owner's six-item exception and wide rail. Do not make unavailable workflows visually dominate verified current facts.

- First revision (rejected): ink canvas, slate surfaces, soft mint actions and a warm paper accent. Preserve its source history; replace its appearance in this follow-up. Original logo and dark-default remain.
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

Focused evidence and remaining limits are recorded in [the package report](../../verification/2026-11-02-pilot-hub.md). The [implementation branch](https://github.com/MomoRC-tech/MoFlight-App-framework/tree/codex/pilot-ui-redesign) preserves first application commit `6428d51`; its initial visual treatment was rejected and is superseded by the blue/instrument revision above. Remaining work is owner layout/color selection; expanded native acceptance is deliberately deferred.

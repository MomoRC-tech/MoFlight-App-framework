# Pilot UI experiment adoption review — 2 November 2026

**Original review recommendations; later owner selection is recorded below. No whole-branch import or resumption.** Independent Start restoration under Issue121 is authorized separately. Latest steering: keep tiles lean and current colors; restore the earlier season-card layout/metric strip.

Reviewed main **158c2ca** (application8ca43fc), and clean experiment **0dbca8e8bf0e0786dfe8d00131fe113daa721629**, application revisions6428d51/80a9f6d, rollback parenteeda7a0. Main advanced beyond the prompt's historicalb0e0d93. Read actual diffs, source, plans, evidence, Issue116 and existing blue preview image. No tests, builds, preview servers, browser sessions or devices were run for the experiment review. Preserve its stopped branch/worktree and main's unrelated dirty performance files.

Sources: [frozen experimental tree](https://github.com/MomoRC-tech/MoFlight-App-framework/tree/0dbca8e8bf0e0786dfe8d00131fe113daa721629), [plan](https://github.com/MomoRC-tech/MoFlight-App-framework/blob/0dbca8e8bf0e0786dfe8d00131fe113daa721629/docs/product/design/pilot-hub-implementation-plan.md), [evidence](https://github.com/MomoRC-tech/MoFlight-App-framework/blob/0dbca8e8bf0e0786dfe8d00131fe113daa721629/docs/verification/2026-11-02-pilot-hub.md), [Issue116](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/116).

## Later owner selection — 2 November 2026

Owner chose **Verein + starters only; keep current navigation**. Implement adapted items 11/13 in current main, supported only by necessary small presentation/test/documentation work. Preserve five tabs, lean Start and current colors. Other proposed navigation/hub/instrument/cost/Medical/Paper/style changes remain unselected. [Selected implementation/evidence](../../verification/2026-11-02-selected-experiment-adoption.md). The full 21-item table below retains the review rationale; its recommendations are not blanket approval. Start's independent #122 cleanup also removes beneath-chart prose and merges the latest-flight/header rows.

## Decision table

**Adopt** recommends behavior, not approval to transplant code. **Adapt** retains an idea with changes. Checks below are proposed after selection, not performed for this review.

| # / change | Recommendation and reason | Dependencies / regression risk | Proportionate check after selection |
| --- | --- | --- | --- |
| 1. Global six-feature Start hub | **Adapt.** Use concise subapp summaries; preserve the familiar global Start with lean tiles. Avoid an extra landing page before every useful list. | Module boundaries/packageB. PilotHome replaces selected season/Medical/work presentation. | Summary→detail→Back, offline/unknown/empty; no extra task step. |
| 2. Six persistent destinations; Start elsewhere | **Adapt.** Honor six peer modules as the preferred proposal; keep restored global Start reachable. | Reapply on current shell/owner keys. One global Start affordance per size, avoiding header+rail duplication. Not implemented now. | Six targets/selected state, entry/Back, compact width/large font/wide rail. |
| 3. Bottom bar / rail / large-text rows | **Adapt.** Good adaptive pattern; six is an intentional exception, not proven more usable. | Labels/48dp targets; two rows reduce reading area. Use window dimensions, not device labels alone. | One selected-source compact/main/wide/font/keyboard checkpoint. CSS preview is not native geometry. |
| 4. Contextual Start/Back and busy guards | **Adopt.** Preserve paper→flights→paper and deliberate-module AI-return revocation. | Current shell's8ca43fc Back forwarding, active provider/Sync guards and account boundaries must survive. | Toolbar/system Back, busy lock, flight/filter context, stale AI return. |
| 5. Direct Costs/Statistics/current-year entry | **Adapt.** Recommend direct modules without duplicate internal switch in this configuration. | PackageB; preserve #118 owner/loading/mode fixes. Fresh entry resets year; Back retains period/contributors. | Each entry, same-module reselect, nested Help/Back, account and loading transitions. |
| 6. Combined season instrument | **Adapt outside restored global Start.** Suitable candidate for Flights/Statistics overview. | Fix `prior??0`: known current/unknown prior can paint a full count ring. Suppress comparison arc/marker unless both known. Use current SVG, and equal cutoffs or clearly labelled raw annual periods. | Asymmetric unknown/zero/count cases, coverage, marker endpoints; one selected native visual. |
| 7. Instrument drilldowns | **Adapt.** Keep exact latest/list/Statistics routes; make aircraft links specific or accurately label aggregate navigation. | Aircraft rows are one button opening generic aircraft Statistics; no registration/filter passed. | Four callbacks, aircraft identity/filter, exact contributor scope and Back. |
| 8. Unknown/zero/non-goal meaning | **Adopt invariant; adapt code.** Already essential in main. | Item6 asymmetric case violates the intent. Visible comparison basis matters, not just accessibility prose. | Known0 vs unknown, partial/unmatched periods, visible/accessible agreement. |
| 9. Home cost summary | **Defer on global Start.** Keep chosen lean/restored contents. Consider lifecycle logic for Costs' own overview. | Adds another financial read; no last-checked timestamp is displayed. Preserve owner/store/account/background/unmount fencing and subtotal caveat. | If selected: delayed two-account reads, foreground/hidden/unmount/failure and synthetic arithmetic. |
| 10. Aggregate Medical reminder | **Reject as replacement.** Keep current compact per-record dates/badges. | Aggregate status loses which Medical each date belongs to; lean must not erase record identity. | Reuse per-record/unknown/expiry-boundary checks; affected visual only if changed. |
| 11. Club task menu | **Adapt.** Focused launcher plus useful next-own-duty information where proven. | Keep detailed sections/scroll return and partial-source meaning; retain lean global duty tile. | Five detail/return paths, unknown/empty/partial, no automatic provider call. |
| 12. Three-step Paper workspace | **Defer extra unavailable stages.** Keep one useful flight-review entry and concise preparation state. | Two disabled stages are not production matching/writing. A real Paper milestone may justify them. | Available/unavailable semantics and paper→flight→paper when selected. |
| 13. Assistant draft starters | **Adapt.** Useful local affordance, not AI activation. | Current draft/controller/owner/conversation scope, existing unsent text and busy/send-disabled guards. | Starter changes intended draft only; no send/model/provider call or silent draft loss. |
| 14. Aviation-blue/sky palette | **Defer.** Keep current colors now; blue is an unaccepted aesthetic alternative. | Shared theme changes all retained pages/Start. Original assets stay. Do not conflate rejected first experiment with current main. | Side-by-side choice/contrast and affected dark check only after selection. |
| 15. Shared geometry/header/buttons | **Adapt selectively.** Some experimental padding/faces grow, opposing compactness. | Broad shared consumers/restored Start can shift. Scope selected changes to a module before global tokens. | Affected minimum/main/wide and font/keyboard states, not every page. |
| 16. Less copy/compact rows/paired entries | **Adapt.** Remove repetitions outside protected Start; retain current lean tiles. | Preserve error/unavailable/source/unknown/subtotal meanings. Paired Paper/AI must not displace Medical/work functions. | Review actions/copy and changed font-scaled state; no build for prose alone. |
| 17. Removing year/roles/work/charts/target | **Reject.** Lost functionality, especially the unreconnected work-target editor. | Preserve restored Start controls. No replacement editor exists in experiment. | Existing year/target/edit/reset/busy Back/role/chart routes; calculation engine unchanged. |
| 18. Presentation extraction/titles | **Adapt.** Small leaves are useful; no rollback-era shell rewrite. | Metadata splits hub-child PilotTab and six Subapp IDs intentionally; make roles explicit. Move shared PilotLink out of Home, share data ports/SVG. | Type/route exhaustiveness and meaningful package contracts; no domain/storage rewrite. |
| 19. Synthetic HTML/screenshots | **Adapt as review aid only.** Preserve blue references. | DOM is not Expo; detail pages are placeholders and HomeCosts effects are stubbed. No native Back/keyboard/isolation/performance proof. | Regenerate selected synthetic source, inspect phone/wide; native evidence separate. |
| 20. Tests/evidence | **Adapt.** Port behaviors, not old leaf/pixel assumptions. | Final80a9f6d has67 affected checks;91 combines earlier-source evidence. Keep newer #118/#120 tests. | Focus selected package, one stable integration checkpoint. No experiment tests run here. |
| 21. Issue/plan/handbook/roadmap | **Adapt.** Preserve source-specific history; reconcile selected outcomes into maintained main. | Old docs erase newer status/financial implementation. Issue116 body cites older91/source; recommendations are not decisions. | Links, source/evidence/approval consistency only; no app checks. |

## Evidence and interpretation

Google's current [layout/navigation guidance](https://developer.android.com/design/ui/mobile/guides/layout-and-content/layout-and-nav-patterns) recommends3–5 navigation-bar destinations and rails on large windows. [Adaptive navigation](https://developer.android.com/develop/ui/compose/layouts/adaptive/build-adaptive-navigation) responds to window size; [accessibility defaults](https://developer.android.com/develop/ui/compose/accessibility/api-defaults) require48dp interaction targets. Six is a deliberate owner adaptation: verify readable labels/two-row height rather than silently reducing the count or shrinking targets. Material3 navigation text returned a JavaScript shell; the old layout URL404 was not used as evidence.

The blue image can be aesthetically attractive and information-rich. No native/user trial demonstrates faster comprehension, greater usability or lower runtime cost. Source review does establish:

- **Instrument:** `PilotSeasonInstrument.tsx:27–40` normalizes via missing-prior-as-zero. Its15–20 strip renderer creates about120 Views/full circle; main's current SeasonRing uses native SVG. Tests54–68 cover both unknown/both zero, missing the asymmetric case.
- **Links:** instrument50–52/PilotHome46 open a generic aircraft section, not a chosen aircraft; exact latest-ID/list links are wired.
- **HomeCosts:**10–37 scopes local reads/lifecycle; tests stub reader/calculator and prove isolation, not native arithmetic. Do not add it to global Start now.
- **Lost target:** baseline Dashboard has the year, role/work and target controls; PilotHome has no replacement target-editor route.
- **Evidence:** branch report21–28 records earlier91; final blue source46 records67. The latest source has no APK/native/live/phone/iOS acceptance.
- **Integration:** main-to-experiment diff removes current TrendChart/geometry/expense-chart files and rolls maintained financial/status docs backwards. Neither shell nor docs should be transplanted wholesale.

## Original proposed packages — narrowed by the later selection

| Package | Scope | Dependency / acceptance |
| --- | --- | --- |
| A. Small affordances | Local starters13, exact routes7, shared leaf18. | After selection: preserve drafts/no send and scoped IDs/Back. No global Start redesign. |
| B. Six-module navigation |2–5 and route metadata18, on current main. | Explicit selection; retain restored Start and current source/recovery guards. Focused routes/fresh-entry-vs-Back/busy/account tests, then one native responsive checkpoint. |
| C. Module overviews |1/11 and selected short copy16. Paper12 only when useful stages exist. | Start with Verein launcher/meaningful summary; preserve global Start. Five detail returns and source-state checks. |
| D. Instrument refinement |6–8 in Flights/Statistics, current SVG and clear period basis. | Fix asymmetric unknowns, select placement/design. Geometry/exact-route checks and focused native inspection. Work target17 stays reachable. |
| E. Optional finance overview |9 in Costs' own overview, no new global tile now. | Share validated reads, async isolation/subtotal caveat, local fixtures. |
| F. Styling/evidence | Selected14–16/19–21. | Current palette/Start stay; preserve current docs and67-vs-earlier91 attribution. Pending native/live/iOS limits remain. |

Recommended sequence if selected: A, B, C, D. E is optional; F accompanies only an approved package. This original sequence is superseded by the narrower owner selection above: only Verein and local starters are authorized, adapted to current main. No wholesale experiment code or navigation is imported.

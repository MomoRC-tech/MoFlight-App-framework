# Backlog execution — 2 November 2026

Owner requests working through issues, closing only fulfilled scopes and pausing conflicting requirements for a later consolidated decision. Initial inventory: 48 open issues. This is the first bounded execution package, not full backlog/beta completion. GitHub remains the backlog source of truth.

| Issues | Action and limits |
| --- | --- |
| #123 / #94 | Correct compact Action native measurement after viewport/font changes. Inner face remounts on configuration changes; touch target, callbacks, disabled state and geometry remain. Three existing behavior checks, types/lint pass. Committed-source 127e96d Android Release/iOS export and bounded MIN360x900/font1.6 → WIDE800x600/font1 native trial paint full Zur Übersicht and all starter labels. Parent inspected both PNGs. This fixes the observed case, without claiming the Android renderer's full root cause or all-button acceptance. |
| #24 | Complete the bounded first shared-token increment: four identical 28dp face geometry values reused by segment and Assistant faces. Preserve separate colors, surfaces, borders, typography and alignment. One-off old/new resolved key/value parity: segment 5 keys, starter 7 keys; focused AI/content 23 checks, typecheck/lint pass. No brittle retained value/pixel snapshot test. #123 Action body unchanged; reuse its source-specific native rendering evidence, not a new transition run. |
| #29 / #34 | Reconcile current v3 default, raw financial v4 and evidence v5 documentation. Later cc22902 repeated-save/cancel/retry proof supersedes abe76e8 failure. Same-operation v5 restore/re-export preserves six sections; installed build attributed by chronology only, not independent APK hash. Keep remaining settings/version/owner/recovery/first-beta/platform gates open. Documentation checks only. |
| #9 | Initially paused; owner confirmed retiring collapse-persistence acceptance. Resumed with the current always-visible Start and remaining native saved-data/account-switch/phone gates. |
| #1 | Initially paused; owner confirmed a single-app trial without cross-app identity/session requirements. Resumed; actual Free setup, two-user Auth/recovery/isolation and platform gates remain. No provisioning/spending authorized by this scope correction. |
| #13 / #79 and AI service issues | Local starter implementation does not revoke the previously selected live-AI beta requirement. Activation/evaluation remain gated by service, allowed inputs/privacy and explicit funding. No paid/model calls or deployment performed. |
| #97 / #98 / #107 / optional features | Publisher/distribution facts, actual physical-device acceptance, and optional learning/webcam/WeGlide/standalone-HA inputs remain. Do not invent facts, add navigation destinations or accept existing scopes by assumption. |

Independent targeted reviews found no other audited issue fully met its explicit remaining acceptance; implementation alone is not a reason to close it. No full app suite, repeated whole-repository audit, live-provider session manipulation, private-data upload or new paid execution.

Native #123 trial is on the named offline synthetic AVD only. Original display/font/network/install identity restore without cleanup errors; initially stopped AVD is stopped after review. Tooling wall-clock is recorded under #90, not app latency or a speedup. Final integrated source/build/download evidence follows below. Six pre-existing dirty historical timing groups remain preserved and excluded from commits.


## Final integrated checkpoint

Actual APK source **8501e715e798757352650b5eb5216bcba249ef92**, SHA-256 **11f3819cf78dfe32f1036f69715a3c5bbf1e5527571e462e783044f0a9c95a3f**. Android Release and iOS export pass. Native fix validated on 127e96d; final token-only extraction has exact old/new resolved key/value parity and unchanged Action body (independently compared). Reuse the native fix evidence with that explicit source boundary; no repeated screenshot matrix for unchanged geometry. [Native evidence](2026-11-02-backlog-native.json), [MIN](assets/2026-11-02-backlog/min-ai-paint.png), [WIDE](assets/2026-11-02-backlog/wide-ai-paint.png).

Controller 30 actions/2 captures, elapsed 172.672s including observer/model/ADB overhead, not app latency. Display/network/install identity restored without errors; initially stopped synthetic AVD stopped again. Ledger freshness/ten focused ledger checks pass. Final code checks: 23 existing AI/content cases, types/lint and handbook freshness; no full application suite. Documentation reconciliation used links/consistency checks only.

[Download APK ZIP](https://github.com/MomoRC-tech/MoFlight-App-framework/releases/download/lab-backlog-2026-11-02-8501e71/MoFlight-Backlog-8501e71.zip) · [fresh downloaded bytes/source/hash/exact inventory proof](2026-11-02-backlog-release.json). Only intended APK and sanitized metadata. Existing rollback releases and frozen experiment preserved; six unrelated historical timing groups remain unstaged. The owner confirmed retirement of the obsolete #1/#9 criteria; both issues are resumed. Other service/privacy/beta/device questions remain open; no unanswered option is treated as approval. This closes the bounded #24 and #123 deliverables, not the other 47 outstanding issue scopes.


## Owner confirmation and documentation alignment

Owner approved removal of the obsolete two-app and collapse-persistence requirements. Updated GitHub #1/#9 bodies, retaining their open acceptance checklists. README, documentation map, roadmap baseline and trial runbook now reflect that decision. The roadmap's stale 29 October “latest app” pointer is replaced by actual delivery 8501e71; the previously fixed #123 label case is no longer listed as an unresolved roadmap blocker. Historical verification findings, artifacts and source-specific limits remain intact.

Documentation assessment is bounded: maintained entry points, affected contracts and generated handbook checked; not a fresh exhaustive audit of every historical file. Handbook generation is current (no stale outputs). Local link targets/affected anchors and current issue wording checked. Documentation-only update: no app tests, builds or devices run; existing dirty performance files preserved.

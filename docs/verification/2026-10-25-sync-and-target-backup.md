# Sync clarity and annual-target backup — 25 October 2026

Selected by Manuel after the bounded continuation at `0779a82`: #83 presentation proposal and #29 provisional annual-target inclusion, coordinated with #34/#8. M1–M3; R01/R04/R12, FL-03/10/11, E07/E09/E11. No new dependency, provider scope, AI activation or paid execution. Beta starting versions and replacement-device identity remain unselected.

## Implementation and verification scope

Sync uses a readable attention mark and explicit Details notices; session proof/timestamp and saved receipt remain independent in Profile/Status and accessibility. Work takes precedence over old results; settled local read failure precedes failed/partial results, then advice. Local read retry does not start provider work. Quiet idle remains quiet. Existing reduced-motion, duplicate-job, safe-save/cancel and source-result boundaries remain.

Manual backup v3 contains configured targets for the selected owner/store/account across years. Restore merges explicitly archived years, including zero; other years/accounts remain untouched. v1/v2 restore skips targets. Exact validation precedes activation; the existing aggregate recovery journal and target lock guard reads/edits while a multi-file restore is pending. Per-operation original bytes remain preserved. Legacy synthetic/foreign preferences are preserved outside the selected export. Ordinary target edits continue using their existing file format and name.

Focused state/component tests cover notice priorities, Details/retry, session/age separation, foreign source advice and reduced motion. Backup tests cover scoped contents, old versions, validation, interrupted replay and target-storage locks. Independent review found and corrected a post-read restore-lock race and a stale error after successful subscribed reload. Host and native results are recorded after the combined checkpoint below; implementation alone does not establish acceptance.

The Development target-file witness uses only fixed synthetic identities and restores its original fixture bytes. It exercises native target storage, not ordinary owner-registry/SAF/full-user replacement-device recovery. The synthetic Sync preview exercises presentation without provider retrieval. Prior source-specific live evidence is reused only within its recorded limits.

## Host checkpoint and review

Implementation source `4a035e1`; preview isolation correction `bf60089`. Windows, Node 24.18.0, pnpm 11.25.0, Python 3.12.10. Combined `pnpm check` passed all five stages: TypeScript, lint, 1,286 mobile tests passed / 2 skipped, 134 Python tests / 16 skipped, and fixture parity. Local logs: `build/host-checks/20261025T102241Z-59306e4b/`. Supplemental target cleanup/native tests: 10/10. Android/iOS bundle exports passed before the preview-only correction; iOS runtime was not tested. The correction passed 41 navigation tests, TypeScript and affected ESLint; the final Android Release recompiles it.

The first checkpoint found three lint errors, which were fixed. Its reporter then failed on Windows legacy-console Unicode output; the successful rerun used process-local `PYTHONUTF8=1`. Permanent tooling repair is tracked separately in #88. The default isolated Android checkout had a different origin and was preserved; the clean matching `mf-ui-build` checkout was used.

An initial native preview exposed an outer real-account notice above the synthetic Sync state, causing its Details action to target ordinary status. `bf60089` isolates the preview overlay and adds a navigation regression. No provider or backup behavior changed. Initial trial display settings were restored before the affected rerun. Detailed local logs and screenshots are under `build/sync-target-backup/`; committed evidence contains only synthetic/sanitized results.

## Android checkpoint and delivery

Final Release source **`bf600898109d561d58d2fcb4d0add6a1ba152d53`**, containing implementation `4a035e1` and the preview correction. Both arm64-v8a and x86_64 are included. Installed APK hash was checked against the build: `1d0f7db28fe9e9b8379f115de20b3fbb713e930c933fec3b7a569cc3b394ed2f`.

**21 scoped checks passed** on a read-only instance of `MoFlight_Synthetic_API37`, actual Android API 37. MAIN 390×900 dp/font1, MIN 360×900 dp/font1.6 and WIDE 800×700 dp/font1, all at density 160. Screens include approximately 24 dp top/bottom system insets. The final report verifies exact restoration of original size/density/font/animation settings; the agent-started emulator was stopped. No private/provider emulator or default build checkout was reset.

MAIN covered ordinary header, Profile session evidence, never-synced, age and changed-count advice, read error/Details, partial/retry, login-required, failed and quiet idle. MIN/large text and WIDE repeated busy, read error/Details, partial and quiet idle. Inspected affected rows remain readable and actionable. These are synthetic presentation checks, not live retrieval or measured provider performance. Target-file witness passed four groups: selected-account all-year export, explicit-year restore including zero, repeated replay, and invalid-input/foreign-year/account preservation with fixture cleanup. It uses native files and production target helpers, not ordinary SAF or aggregate replacement-device recovery.

[Sanitized summary](assets/2026-10-25-sync-target-backup/summary.json), [MAIN partial](assets/2026-10-25-sync-target-backup/main-partial.png), [MIN large-text read error](assets/2026-10-25-sync-target-backup/min-large-read-error.png), [WIDE read error](assets/2026-10-25-sync-target-backup/wide-read-error.png). Handbook generation/freshness and `git diff --check` pass. Earlier host and native evidence is reused only for unchanged behavior.

[Download APK ZIP](https://github.com/MomoRC-tech/MoFlight-App-framework/releases/download/sync-target-backup-2026-10-25-bf60089/MoFlight-Android-bf60089.zip): only `app-release.apk` and sanitized `build.json`; exact ZIP contents and embedded APK hash verified. Development-signed standalone build, with AI requests still disabled.

## Remaining gates

#83's selected presentation scope is complete. #8 still owns the current populated sync→filtered list/detail→background→offline restart composition, independent persisted source outcomes/retry and actual second-account/platform cases. #29 retains ordinary populated external save/readback/full-user restore, portable identity and attachment inventory. #34 retains beta starting/skipped-version selection and ordinary in-place update acceptance. #86 still needs a verified annual required-hours source; manual targets remain provisional, with no EUR conversion. Physical phone, iOS runtime, live-provider coverage, process-death/full-aggregate target recovery, power-loss/storage-exhaustion and spoken accessibility were not established by this package. No paid execution or live-AI activation occurred.


## Separate status controls and Sync confirmation — 26 October 2026

M1 presentation over the existing M2 coordinator; #83, R01/R04/R12, FL-03/10/11 and E07/E09/E11. Manuel approved Separate controls and a short pre-sync confirmation. Two 48 dp targets now carry independent sync/result and login badges; actual work uses a circular indicator respecting foreground/reduced motion. No key button, dependency, provider/schema change, background service or performance optimization. Ordinary Sync/retry asks “Daten synchronisieren?” with “Abbrechen” / “Starten”. Fixed badge-reason and confirmation events support #90's future phone analysis.

Full-job success requires the current session's scoped completed result and a usable saved receipt. Restored flight evidence alone has a neutral saved badge; no new durable full-job outcome is claimed. Current work precedes old errors, read errors precede settled partial/failed results, and advice precedes success. Existing Details/source limitations remain. Profile opens existing account/settings and shows independent bounded session proof.

Focused checks cover state priority, honest receipt/result distinction, independent session evidence, cancel/dismiss/background, duplicate and late callbacks, and account change. New deterministic tests exercise behavior rather than pixels; native checks own layout/Android dialog acceptance. Checkpoint and release results will be added after execution; implementation alone does not establish device acceptance.

Host checkpoint: Windows, Node 24.18.0, pnpm 11.25.0; focused package 116/116 passed, then `pnpm check` passed all five stages (types, lint, mobile tests, Python tests, fixture parity). Logs: `build/host-checks/20261026T094800Z-37ff5e40/`, `build/sync-badges-focused.log`. Android and iOS bundle exports passed (`build/sync-badges-bundle.log`); this is not iOS runtime acceptance. Generated handbook freshness/link coverage and `git diff --check` passed. The native checkpoint remains pending at this implementation commit.

# Native backup, task recovery and account statistics — 4 November 2026

Owner-requested completion of #29, #56 and #9. This package completes their selected engineering checks; the shared source, identity, phone, iOS and beta gates retain their existing owners. AI remains preparation-only, with no paid/model calls or new service.

## Source and verification

Application source: `a8dfee00584ae90fadb5dc74d1ba1e2c25fa1522`, including the task-controller correction `9a380e3`. The clean source passes one complete `pnpm check` checkpoint (types, lint, mobile/SQLite tests, Python tests, fixture parity), both Android/iOS Hermes exports and the normal committed-source Android Release build. The focused controller regression fails before the correction (12/13) and passes afterward (13/13). No broad suite was repeated for evidence/documentation edits.

| Artifact | SHA-256 | Boundary |
| --- | --- | --- |
| Normal a8dfee0 Release | `4f9d00e71da28db1507f4cf40ade75b6b5c91638de7e1f67501d5a4696670765` | Ordinary entry and flags; final offline readback |
| Initial observation Release, base 641aad3 | `dc90a476a3f6c7b9e8e005ca385f17b6a61fa3d850ccfdaafc627d2f6c6b6322` | Exposed the recovery defect; not final acceptance |
| Fixed observation Release, base a8dfee0 | `7e707bdb73d32ab73b1844f1bd109dea67adc1a2b8c9b4f9cdf2e5eb36b834a1` | Actual production logic with WebView inspection and packaged-manifest run-as |
| Statistics isolation fixture, base a8dfee0 / fixture 9e37ee9 | `af11a5a4689f477d215082403711c3596af2e0e59b23e63a5039955a6b4957c7` | Production shell/reader/cache over two isolated synthetic native graphs |

The observation builder changes only WebView inspection and packaged `android:debuggable`; Release `BuildConfig.DEBUG` remains false. It restores source, packaged manifest and the normal APK. The first builder attempt failed in an included Gradle build; `cf3bda9` corrects task scoping. The Statistics build's first attempt lacked the SDK environment; it succeeded after applying the existing Windows setup. These tooling failures are retained locally, without app-success credit. Neither instrumentation APK is publishable. No new APK delivery is claimed here; the existing public delivery retains its actual source.

Raw archives, provider HTML, credentials, screenshots, UI trees and diagnostics stay in ignored local storage. [Sanitized assertions](2026-11-04-native-acceptance-completion.json) provide source/artifact boundaries. Host logs: `build/host-checks/20261104T125430Z-13c92f6a`; local native evidence: `build/closure-native-20261104/`. These local paths identify retained evidence, not downloadable artifacts.

## Task-selector same-install crash recovery — 4 November 2026

The ordinary provider/WebView flow switched from independently verified original `allopen` to own/open tasks. An actual HTTP 200 response was paused after navigation; the real SQLite checkpoint retained the original selector. Force-stop, a fresh process and an in-place app update preserved that exact checkpoint. Ordinary launch performed no restoration; explicit Sync consent and Continue were required.

The first actual resume exposed a defect: at the same profile URL, recovery called the page-loaded callback without producing a new load-start. The fresh-page guard correctly refused cached context and the original 90-second deadline expired. The correction explicitly navigates and requests native reload, retaining all owner, scope, epoch, nonce and deadline checks. The regression models the real callback semantics.

On the fixed observation artifact, explicit resume completed through the ordinary controller. Two independent provider responses were HTTP 200 with exact `allopen` selection; verified readback preceded checkpoint clear. The normal Sync recorded success. Existing completed source jobs were reused, and no provider records were edited. The original server selector was restored. Saved task details subsequently reopened fully offline with the captured-source empty state, rather than an unknown or provider-completeness claim.

This completes #56's selected own/open task-selector recovery deliverable. Complete source/category/day/paging coverage remains #10/#2; live second-account boundaries remain #16; phone acceptance #107 and iOS #8 remain separate.

## Backup rejection and interrupted restore — 4 November 2026

On the populated provider AVD, the current ordinary writer produced **v3**: this selected owner had 101 captured flight rows and information data, with no financial selection database. The current pilot-book and AI-conversation sections were empty (selected book null); their exact preservation is not populated book/chat acceptance. No financial data was seeded to manufacture v5 evidence. The earlier successful v5 resume and exact six-section SAF re-export remain [historical evidence with chronology-only build attribution](2026-11-02-financial-restore-reconciliation.json).

All work used fully offline native SAF files. Five actual picker cases—foreign owner, foreign store, newer v6, corrupt checksum and malformed JSON—returned refusal with enabled Backup controls. Independent before/after snapshots preserved active owner/store/book, restore journal and all **22 business database logical hashes**. Input files were unchanged. The generic UI refusal does not identify the reached codec reason; deterministic host coverage supplies that distinction.

Two fresh current-source external saves/readbacks matched every included section exactly: pilot, real flights, information, AI and duty targets. Aggregate and nested checksums were independently verified. The selected same-content archive was SHA-256 `01adb82412e6c2a5f4b519bc0aa64bde81718bbd7e24168229463364ad4ea030` (9,695,722 bytes). No pre-existing pending aggregate or task recovery conflicted.

The app was frozen/force-stopped only after the exact archive had a durable `prepared/pending` operation. A fresh process retained the pending operation and visibly required the same file; ordinary library reads were blocked. Explicit resume completed that same operation once, with exactly one real-history activation and the original owner/store/book preserved. Twenty original database logical hashes remained identical; candidates were additional files. A normal post-resume SAF export (SHA-256 `fd8e984d794a0c7d2e4acc20d406204093ebba1faed4130c05eb802917b60951`) preserved all five included sections exactly, including IDs, values and relationships.

The final ordinary Release, independently hash-verified after replacing instrumentation, reopened offline with saved Start metrics and **97 flights plus four additional duplicates** in Flüge (the 101 captured rows). No unreadable-data banner remained. The current-source v3 trial supplements issued v1–v5 host/SQLite coverage and the historical v5 result; it does not relabel them current-source native v5 acceptance.

Observer corrections were kept separate: compressed fresh UI trees/list view resolved picker visibility; one parallel UI observer conflicted with Android UI automation; Windows default text decoding caused an incorrect host comparison and was corrected to UTF-8 without repeating the save. The outer pending-recovery route returns to the normal Backup page without the inner route's success banner; its label observer was stopped after independent journal/ready-page verification. The initial journal-only tar observer failed and was replaced with explicit safe file arguments; the actual pending row was read independently before interruption. None of these observer failures was represented as an app acceptance failure or passed assertion.

This completes #29's selected same-install/same-owner/store engineering scope. Replacement-device adoption and Android system restore remain outside this manual JSON contract (#37). The named beta baseline/version matrix remains #34; actual phone/iOS gates remain #107/#8. Text references do not export attachment bytes; no credentials or provider sessions are included.

## Start and Statistics account isolation

The first fixture APK (`de0f92391fa30b828499ce73e8dfc314396ebbb8630772f195722681c3026877`) correctly failed production validation: its synthetic export preset was invalid. Follow-up host validation also rejected blank dates for saved history. The old fixture cleaned its owned namespace before update. Fixture-only correction `9e37ee9` uses the accepted export preset and complete synthetic 2024–2026 window with valid dates; no production guard changed. Both exact captures passed real in-memory SQLite import/save/read and production Statistics models, plus TypeScript/focused lint, before rebuilding only the fixture. No extra application suite or normal build was needed.

On the read-only synthetic API37 AVD, the actual production `MobileApp`, Start, Statistics, native SQLite reader and default Start cache rendered two distinct saved owner/store/account graphs. Only the clearly labelled fixture selector and isolated adapter were injected; the ordinary app still has no user-facing account switch. The original default owner/selection was not replaced. Dark mode was checked at 411.43 × 800 logical dp, 420 dpi and font scale 1.0. There was no layout change or new visual acceptance matrix.

| Synthetic account | 2026 flights / known time | All-history flights / known time | Unknown reported durations |
| --- | --- | --- | --- |
| A / 101 | 3 / 1:42 | 4 / 1:57 | 1 |
| B / 202 | 2 / 0:45 | 3 / 1:15 | 1 |

The actual Start accessibility values and visible monthly viewer, Statistics totals, exact contributor-card counts/registrations and detail/Back routes passed for A and B. Both selected 2025 screens showed the empty saved selection; all-history added each account's own 2024 flight. Actual Start graphics changed from A's June/July bars and 0–1:12 h scale to B's June-only bar and 0–0:45 h scale; saved screenshots were inspected. Unknown reported duration remained unknown despite available start/landing times. The previous-year zero belongs to this synthetic complete-window fixture, not a live-provider completeness assertion.

A → B → A retained the correct Start/Statistics values without foreign registrations. A real force-stop/fresh-process reopen retained selected B, both owner/store identities and every flight ID. Actual B Start/Statistics values and a subsequent A return passed fully offline. Real saved cache reads verified owner/store/account/provider scope and selection sequence; stale cross-owner caches were rejected, and valid same-owner previews were accepted. The fixture's last same-owner B report correctly has `staleSelectionRejected:false`; that flag describes its last selection, not failure to check the cache. The original seed had rejected stale selection for both accounts.

Two observer assumptions were corrected from the existing native state without repeating the trial: detail titles use date/registration rather than a fixed “Flugdetails” title, and a fresh same-owner cache need not report stale rejection. Native production content/values and persisted identities supplied the assertions. Unknown dates are not claimed by this valid-history fixture; auxiliary provider sections, live two-account authentication and ordinary account-switch UX remain outside it.

This completes #9's selected saved-data/always-visible viewer engineering scope. The Start design and five persistent destinations are unchanged. Phone usefulness/presentation remains #107, live identity/account boundaries #16, source completeness #2/#10 and iOS/beta light/spoken acceptance #8/#94.

## Preservation and measurement boundaries

The provider AVD ran read-only. Only exact newly staged files/exports and two empty owned directories were removed; original radios, font, rotation and display were restored. An independent read-only restart recovered the original APK/UID/settings/display and **all 21 original SQLite files byte-for-byte**, with no new SQLite files. The observation APK was installed only to inspect these files and was never launched during discard verification. Both owned provider instances stopped; unrelated emulator 5554 was untouched. This is not a whole-disk or cookie-byte identity proof.

All gathered runtime measurements, including failures/interruption, source-reported running entries, stages/counters and environment observers, belong to the [performance ledger](performance/README.md) under #90. Inspection/interception/debug flags, polling and UI-observer overhead prevent ordinary-app latency or speedup conclusions. A completed durable restore is independently proved above; a retained `running` diagnostic entry is not reclassified as an operation result. No first-presented-frame or phone/iOS performance claim follows.

The synthetic fixture removed only its owned UUID namespace, provider-scope rows and random cache keys before shutdown. Original settings/display were restored. An independent read-only boot recovered the original APK/UID/settings/display without launching the app; both owned synthetic instances stopped. All six synthetic source-image sizes and mtimes matched. This is not an original private-database or whole-image byte comparison. All four owned trial/verification instances are stopped.

The ledger append adds five run groups / 48 observations / 7,153 numeric values, preserving all prior 192 groups exactly. It includes 40 source-session diagnostic operations, four app/tooling observers and four environment boots. Source-reported failures, cancellation, interruption and running states remain as recorded. Untimed fixture/UI/host-observer barriers are documented above; no zero-duration samples were invented. Ledger generation/freshness and the focused generator tests pass. Documentation checks cover links, status/limits and sanitized JSON; no application tests/builds were repeated for documentation changes.

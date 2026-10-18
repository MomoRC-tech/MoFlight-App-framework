# Synthetic import preview — 18 October 2026

M3 preparation with M2 dependencies, [#18 execution contract](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/18#issuecomment-6251766157). Manuel authorized implementation with “start implementing, ask if You have questions (eg on desired behaviour)”. This is a disposable synthetic review, not approval of a production importer or ADR 0007.

## Behavior and boundaries

Settings → Development → **Importvorschau öffnen** opens an inert screen. **Synthetischen Vergleich starten** creates a separate in-memory fixture: eight incoming source IDs, five new, one changed, one unchanged and one conflicting ID, plus one repeated identical row. An omitted earlier flight remains in the test stand. No current library fixture, provider capture or private session supplies these inputs.

The existing reconciliation validator supplies binding, source-ID, flight and complete-window checks. Its new review result exposes conflicting variants; the original strict planner still rejects conflicts. Book suggestions reuse the existing book/aircraft-class/format contracts and effective dates. Confirmed choices for the same fictional aircraft can suggest a book only when eligible; unknown class, source duplicates, ambiguous history and multiple eligible books remain reviewable. Registration alone establishes no class. Unknown minutes/roles remain unknown, and reported minutes are not recalculated from the clocks.

The editor shows previous/current evidence, changed fields and source variants. Selecting a book is a draft until **Auswahl im Test bestätigen**; **Später zuordnen** is an explicit retained choice. Changed source evidence preserves the former choice with a review warning. Unsupported/foreign books cannot be confirmed. Conflicting source variants require a choice before that source can replace prior evidence. Cancelled edits, incomplete attempts and repeat comparison retain the usable test stand.

**Teststand übernehmen** updates only this test stand and retains distinct previous/current observations. It rejects stale or forged plans, leaves unresolved conflicting sources untouched, never deletes omitted sources and never turns an unconfirmed suggestion into a book choice. There is one explicit primary book choice per scoped source ID. Returning through overlays preserves the session; an app process restart deliberately discards it. This limitation is visible on the first screen. No SQL schema, saved library, recovery journal, paper progress, source capture or provider request is changed.

## Source and host verification

Application and initial harness source: **`6b5c5ea64555fc18c8d78f2afd7b15caebe99b28`**. Windows, Node **24.18.0**, pnpm **11.25.0**, Python **3.12.10**, JDK **17.0.20.1**. No dependencies, services, LLM calls or paid jobs.

All five `pnpm check` checks passed: TypeScript, lint, **236 mobile / 81 Python tests**, fixture parity. The [host report](assets/2026-10-18-synthetic-import-preview/host-check.json) records pre-commit `4ce693f` with the package dirty; application/test content was unchanged between that run and the application commit. Detailed local logs: `build/host-checks/20261018T154505Z-8ab21260/`. Focused planner/component/shell/reconciliation checks also passed. The component tests execute actual handlers and planner rules with native leaves replaced; they establish no native-layout result.

New useful regressions cover classifications/conflicting observations, source revisions, repeats/no deletion, explicit corrections/deferral and unchanged selections, changed-evidence review, unknown minutes/roles/class, duplicate markers, date/format eligibility, contradictory confirmed history, two owners/foreign IDs, stale/forged plans and immutable inputs. Actual screen tests cover inert entry, explicit start, correction/conflict choice, cancelled edits, failed comparison/retry and simulated acceptance. Shell tests cover session retention and nested return to the same saved flight without provider work.

Both Android/iOS Hermes exports passed (`build/import-preview-bundle.log`). Handbook generation/freshness and local link coverage passed; Python harness syntax/help and Git whitespace checks passed. A first handbook HTML write returned a Windows invalid-argument error; regeneration succeeded and all outputs are saved/fresh. No application code changed for that retry.

## Platform checkpoint

Committed-source Android **Release and `lintVitalRelease` passed**. [Build metadata](assets/2026-10-18-synthetic-import-preview/build.json): **49,881,422 bytes**, SHA-256 **`cad6e71c5dd1df902562ebd5029e04000161f55fe754c5101563e6dc55190f7a`**, embedded JavaScript/Hermes and **arm64-v8a/x86_64**. Build total **107.172 s**, Gradle **102.082 s**; native configuration/caches reused. Local detailed logs: `build/import-preview-android-build.log`, `build/import-preview-lint-release.log`; APK: `build/import-preview/android/app-release.apk`.

Installation/native execution is pending confirmation that the running emulator is free: the separate experiment recorded a shutdown request, but `adb devices` still lists `emulator-5562` (its recorded synthetic serial). Its current AVD identity is not rechecked and no installation, app interruption, display change or UI capture has been performed by this package. The existing short build checkout was clean and reused without touching unrelated drafts. No manual hosted job was dispatched.

The bounded [native harness](../../scripts/android_import_preview_smoke.py) is prepared for only **MoFlight_Synthetic_API37**. It verifies the installed APK hash, reads offline flags, changes only disposable preview choices, records comparisons/corrections/repeats, checks the affected 390 dp / 360 dp enlarged-text / 800 dp landscape states, restores display exactly and verifies the saved four-flight library after restart. It does not clear, seed or restore the saved library, change network flags or touch provider operations. This description is a plan, not native success evidence.

## Traceability and remaining gates

Supports bounded **R01/R04/R12/R15**, **FL-03/FL-10/FL-11** and **E05/E07/E09/E11** aspects: review/deduplication, preserved unknowns and choices, owner/book separation, retry, offline test-session navigation and explicit restart semantics. Paper/photo end-to-end scenarios are not exercised. Unit/component passes accept no complete product journey.

Native checkpoint remains pending. Native iOS, physical Android, spoken TalkBack/focus, real second-account/provider operation and live capture → reviewed save → saved history → offline reopening are not tested. Production identity/source durability, transactional persistence, migrations/backups, raw-data adoption, automatic assignment/polling and ADR 0007 acceptance remain separate under #2/#4/#11/#16/#18. The synthetic preview does not complete M3 or M5; #18 remains open for its broader discovery/integration work.

Unrelated `43aed5d` preparation and `4ce693f` experiment/evidence commits were preserved; this package launched no worker or comparison experiment and changes no standing delegation policy.

# Live capture and readable offline review

Date: 18 October 2026. Tracking: [#2](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/2), coordinated with #16/#18. M2 evidence/review increment; M3 canonical import remains separate.

## Contract and implementation

Manuel replied **start** to the concrete live capture → readable flight review → offline reopen proposal. The execution contract was saved in #2 before coding. Application/test/design commit: **`3c352d6`**; final application **`7849318`** corrects the Android scroll-clipping issue observed during native review. The working tree was initially clean; concurrent documentation commits were preserved. No dependency, schema, credential policy, canonical writer, book assignment or paid service was added.

Connections now exposes **Flugdaten jetzt abrufen** with a small initial request covering the last 30 device-calendar days, inclusive. The existing disclosure can edit the exact dates. Explicit provider/profile confirmation, view protection, bounded extraction, durable save and restoration remain owned by the same retained controller. Request dates establish no flight-clock timezone.

[CapturedFlights](../../apps/platform-lab/src/mobile/CapturedFlights.tsx) connects the existing owner-scoped saved snapshot to the [source assessment](../../apps/platform-lab/src/vereinsflieger/source-assessment.ts) through a [read-only presentation model](../../apps/platform-lab/src/vereinsflieger/capture-review.ts). Five-row pages show date, aircraft, source clocks and reported duration. Details preserve separate crew slots and eight-field raw pages without truncating original text. Missing, blank, invalid, contradictory and explicit-zero values remain distinct. Source identity/time basis/landing day/crew credit/class/duplicate policy remain unresolved. No duration is calculated from clocks and no canonical flight is created.

Saved review is available without provider authentication/network, even before recovery diagnostics finish or after they fail. Registry authorization still precedes scoped file access; a changed owner immediately hides the old snapshot. Only a successful durable capture changes the current review. Older immutable captures remain in storage; this package adds no historical-capture browser or legacy adoption.

## Verification

Environment: Windows, Node **24.18.0**, pnpm **11.25.0**, Python **3.12.10**. The full host checks ran on the initial application/test files before commit; `3c352d6` contains the same checked source. The host runner records starting HEAD `b32aab2` plus a dirty tree; this is not a claim that the feature existed in that parent commit. The final clipping follow-up has its separate checks below. Later documentation/comment cleanup changes no runtime behavior.

| Actual check | Result / local detailed evidence |
| --- | --- |
| Focused review/component/controller/SQLite tests | **81 passed, 0 failed**; ignored `build/capture-review-focused.log` |
| `pnpm check` | **5/5 passed**: TypeScript, lint, **264 mobile tests**, **107 Python tests**, fixture parity. `build/host-checks/20261018T201157Z-71386f56/report.json` and numbered logs |
| `pnpm bundle` | Android and iOS exports passed on both application commits; ignored `build/capture-review-bundle.log` / `build/capture-review-bundle-final.log`. Exports do not prove native runtime |
| Design handbook generation/check and `git diff --check` | Passed; current source inventory, component C15 and portable views regenerated |
| Final-source clipping follow-up | **13 presentation tests**, TypeScript, focused lint and handbook generation/check passed. Existing logic/storage results remain applicable; the changed native clipping behavior needs visual evidence, rather than a test mirroring the prop |
| Committed-source Android Release/lint | Both builds passed **622 tasks**, including `:app:lintVitalRelease`, embedded JS and arm64-v8a/x86_64 inspection. Final build/source/sha256 below; ignored `build/capture-review-build-final.log` |

New regressions cover real presentation handlers/selection/paging, exact long raw text, separated crew fields, unsupported/empty snapshots, absent/blank/invalid/conflicting/zero values, repeat/correction independence, all five-row pages through the 20,000-record contract, year/leap/DST date windows, SQLite close/reopen/idempotency/conflict rejection, two owners/forged file routing, offline initialization despite recovery failure and capture preservation after cancel/failure. Existing broader controller/security tests were reused. No new model or network call is part of these checks.

## Native checkpoint

The default build attempt stopped before compilation because `C:\Users\Momo\mf-build` points to a different source path. That checkout was left untouched. The replacement uses a separate `C:\Users\Momo\mf-live-review-build` with explicit source `3c352d6`; no dirty checkout is reset.

Final APK: ignored `build/capture-review/android-final/app-release.apk`; manifest `build/capture-review/android-final/build.json`. Compiled source **`7849318`**, Release, JDK 17.0.20.1+1. SHA-256 **`f6677039ff7bc28af920a929eb7bd811ebc44150157100bee06d35fc2dfac79f`**. Update-only installation succeeded without clearing either AVD's app data.

Synthetic Android API 37 on `MoFlight_Synthetic_API37` passed **seven** empty-review/date-scroll/disabled-retrieval/offline-process-restart checks on `3c352d6`. Actual viewports: **390×900 dp / font 1.0**, **360×900 dp / font 1.6**, **800×600 dp / font 1.0**, all at **160 dpi**. The 520 dp card cap and reachable controls were reviewed in [MAIN](evidence/android-2026-10-18-live-review/empty-390.png), [MIN/enlarged text](evidence/android-2026-10-18-live-review/empty-360-large-text.png) and [landscape](evidence/android-2026-10-18-live-review/empty-800-landscape.png). These unchanged empty-state results retain their original source; no final-build empty-device rerun is claimed. No fixtures, restore or provider operation was invoked. Original size/density/font/network flags were restored exactly and the initially stopped AVD was stopped again.

The preserved provider AVD's existing five-row capture reopened without login under verified airplane mode / Wi-Fi off / mobile data off. The first `3c352d6` run completed ten structural checks, but independent image review exposed blank retained space when switching from the list to details. **Those structural passes are not visual acceptance.** `7849318` disables clipped-subview removal for this dynamic connection ScrollView; the final 390 dp detail image confirms restored preceding cards and readable content, without the blank region. Private values remain under ignored `local-data/capture-review-native-saved[-final]/`.

On final source **`7849318`**, the preserved provider AVD passed **ten** saved-list/detail/raw-field/crew/offline-process-restart checks at the same three measured viewports. Independent review of all three detail images confirms the clipping correction, readable wrapping and centered 520 dp landscape groups. Original display and network flags were restored exactly. These are **real saved-capture** checks over the existing five flights, not a fresh retrieval or an independent new source-reference comparison. [Sanitized source/check/cleanup summary](evidence/android-2026-10-18-live-review/native-summary.json); full private screenshots/hierarchies remain ignored.

**18 October fresh live attempt: blocked at provider sign-in.** The retained browser opened the original HTTPS login, and the fresh profile check did not establish a matching authenticated session. One explicit use of the existing opt-in saved-login helper also failed to establish a verified session. No retry loop, new capture, cancellation or post-new-capture restart test was completed in that attempt. Manual sign-in/available provider verification was required before continuation; the cause is not inferred as password failure or natural expiry. Existing saved evidence, credentials and provider settings were preserved; radios were restored. Private attempts: ignored `local-data/capture-review-live-final/` and `local-data/capture-review-saved-login-final/`. The initially stopped provider AVD was stopped again after cleanup; the separate LoginUX AVD was untouched. The successful 19 October continuation below supersedes this integration blocker, while preserving the earlier result.

Earlier [five-row source/reference/repeat/cancel evidence](2026-10-17-safe-disconnect.md#scoped-row-review-reference-comparison-and-repeatcancel--18-october) retains its source-specific scope. The adapter/retrieval protocol is unchanged; the new initial request dates and readable review are exercised by host tests and the native checks above. That earlier evidence alone did not replace the then-blocked final-source fresh-capture integration gate. No whole-history, real second-account, iOS runtime, physical-device or spoken-accessibility acceptance is inferred.

## Fresh capture continuation — 19 October 2026

The handover continuation stayed within Manuel's existing **start** authorization. Initial checkout and remote `main` both matched **`e510ac3b6378cfb89ff0c7e176f47f00499b881a`**, with a clean working tree. Reused the existing **`7849318` Release**, verifying both the local and installed APK against the SHA-256 above; no application change, rebuild or reinstall. Existing host/export/Release and layout-matrix evidence retains its recorded scope and was not rerun.

The provider AVD **MoFlight_API37 / emulator-5554** was already running with an authenticated original provider page. A new protected-profile check matched the retained provisional association. No credential values were read/entered, saved-login helper repeated, session cleared or other AVD started.

| Actual acceptance check | Result |
| --- | --- |
| Explicit initial-window retrieval | **9 records / 48 columns**, 2026-09-20–2026-10-19 inclusive, saved as a new immutable capture; controller restoration completed and retrieval was re-enabled. Coverage is the requested list, not lifetime history |
| Readable independent sample | One newly saved flight matched the original personal list's date, model, registration, Pilot, PIC and Begleiter/FI; its observed read-only eye link independently matched source reference, date, start/landing clocks and explicitly reported flight minutes. Original last-20/Pilot preferences were not edited for comparison |
| Enabled cancellation | A second request was cancelled while cancellation was enabled. The app reported cancellation, completed restoration and re-enabled retrieval; capture ID, retrieval time, row/column counts, period and coverage matched the successful capture exactly |
| Offline force-stop/restart | Verified airplane mode **1**, Wi-Fi **0**, mobile data **0**. Force-stopped/relaunched the app, reopened the same capture metadata and the compared readable date, aircraft, clocks, reported duration, separate crew fields and source reference without provider login |
| Visual check and cleanup | Fresh and restarted detail PNGs were independently reviewed at the existing **480×800 dp / 160 dpi / font 1.0** setup. Original network flags **0/1/1** were restored; display overrides/font were unchanged. The initially running provider AVD remains running with the saved detail open; synthetic/LoginUX AVDs were untouched |

The [sanitized continuation checklist](evidence/android-2026-10-18-live-review/native-summary.json) retains the initial blocked attempt separately. Full private metadata, provider cells and PNG/XML evidence remain ignored under `local-data/capture-review-2026-10-19/`; the local-only driver is `build/capture_review_continue.py`. Initial comparison-driver attempts stopped on a second accessibility grid, Windows text encoding and nonunique icon-cell labels. Those harness stops are retained separately from the corrected passing comparison; no extra successful capture or provider edit was triggered by them. The original provider-detail image and both readable-detail images support the bounded comparison and visual judgment.

**Scoped fresh capture → readable sample comparison → cancellation → offline reopen acceptance passed.** One independently compared row does not establish every saved row/optional field. No canonical library/book/statistics writes, legacy adoption, production identity/schema/migration, second-account, iOS, physical-device or spoken-accessibility acceptance is claimed. #2 remains open for its broader contract.

Publication checks: 297 local Markdown file links across the changed documents, the continuation anchor, evidence/result/cleanup consistency, private-value exclusion and preservation of unrelated historical Issue text passed, together with `git diff --check`. These are documentation checks; application tests/builds were reused from their recorded sources above.

## Traceability and remaining gates

R12; FL-03/10/11; E07/E09 are covered for capture review, deterministic evidence presentation, offline read and preservation aspects. Canonical review/assignment/save → flight library/statistics → offline reopen, production source/account/club durability, complete-history coverage, role/timezone/overnight semantics, schema/migration and real second-account/iOS/physical acceptance remain separate under #2/#4/#11/#16/#18. ADR 0007 remains Proposed. No broader milestone or Issue is closed.

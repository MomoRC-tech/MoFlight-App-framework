# Safe disconnect verification — 17 October 2026

## Bounded reconnect/retrieval follow-up

Manuel authorized this package with **go** after the project review. [Issue contract](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/2#issuecomment-6234200621), [initial findings](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/2#issuecomment-6234267523) and [observed footer/fix scope](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/2#issuecomment-6234427806). Baseline main `4a09ee9` was clean. Application commits: `cc0caf5` (safe feedback/assisted-login regressions), `5bc6220` (owned failure stage through cleanup), **`abd8f68`** (single-page footer fix and saved-count feedback). No new dependency, production identity/schema/credential policy, canonical import, paid/hosted run or physical retest.

### Findings and delivered behavior

One explicit saved-login helper attempt on `81128d0` remained unconfirmed. One tap on the visible original provider **Anmelden** then opened the authenticated overview, followed by a fresh observed account/club check and provisional confirmation. This proves assisted original-page re-login; helper failure cause and automatic saved-login success remain unknown. Credential values were not inspected, replaced or forgotten.

Small-period requests failed at flight-row/page validation. Independent native original-page inspection on `5bc6220` selected **2026-10-01 through 2026-10-17**, **Pilot oder Fluglehrer**, and showed five records with footer **5 Datensätze**. The reader previously required the paginated **Datensatz N bis N von N** form for nonempty data. The fix accepts the observed explicit single-page total only with an unambiguous footer, exactly matching decoded row count, first page and no pagination links. Date, source-reference, columns, account, role and coverage checks remain enforced. Inconsistent totals, ambiguous footers, forward pages and unverified emptiness fail closed; row count alone never proves coverage.

German failure hints and stage diagnostics use fixed allowlists, preserving the stopping stage through verified cleanup without echoing provider payloads/errors. Successful raw feedback now shows validated record/page counts. Assisted-login tests require fresh same-account evidence and reject another account before capture/preference writes; no automatic credential retry follows manual continuation.

### Actual checks and source provenance

| Check | Outcome and limits |
| --- | --- |
| Final host checks on `abd8f68` | **168 tests**, TypeScript and Android/iOS Expo exports passed. [Host evidence](evidence/android-2026-10-17-disconnect/reconnect/host-checks.json). Exports are not iOS runtime acceptance. |
| Final committed-source Android Release/lintVital | Passed; 585 tasks, 52.29 seconds Gradle / 53.24 seconds overall, native regeneration false. **48,737,771 bytes**, SHA-256 `7c668339a273b5d0068d1218f9c13a7269d91641b768111afa7caf0d8b77aa70`; embedded JavaScript and ARM64/x86_64 verified. [Final build](evidence/android-2026-10-17-disconnect/reconnect/build-footer-release.json). |
| Earlier focused synthetic native on `cc0caf5` | **Four checks passed**: safe German offline detail with positive bounds, local-flight screen after closing, retained WebView on retry/unconfirmed session, exact display/font/network restoration. **390×900 dp, 160 dpi, font 1.0**. [Report](evidence/android-2026-10-17-disconnect/reconnect/feedback-native.json), [its build](evidence/android-2026-10-17-disconnect/reconnect/build-release.json). Unchanged offline-feedback evidence is reused; this is not a final-APK four-check run. |
| Intermediate stage diagnostic on `5bc6220` | 166 tests/types/exports and [Release](evidence/android-2026-10-17-disconnect/reconnect/build-stages-release.json) passed; live failure narrowed to export-read before the observed footer correction. |
| Final bounded live Android on `abd8f68` | Preserved provider session survived update-only installation and fresh context checks. Small raw retrieval saved **five records/one page**, matching the separate visible provider reference; retrieval re-enabled with no recovery warning. A second request was cancelled while Cancel was enabled; cancelled result observed and successful-save time **15:30:47 Europe/Berlin** remained unchanged. |
| Independent post-cancel original-page readback | Original **Die letzten 20 Flüge (max. 24 Monate)** / **Pilot** were visible, matching the pre-reference scope. Fresh same-context check then passed; local flight screen remained reachable. Full column/filter/sort comparison remains the controller's journal verification, not independent native DOM readback. |

[Sanitized live observations](evidence/android-2026-10-17-disconnect/reconnect/live-observations.json). Environment: Windows/PowerShell, Node 24.18.0, pnpm 11.25.0, Python 3.12.10, JDK 17.0.20.1+1. Provider **MoFlight_API37**, API 37/x86_64, **480×800 px at 160 dpi = 480×800 dp**, font 1.0; provider display/network configuration unchanged. Synthetic checks used only verified **MoFlight_Synthetic_API37**. Affected failure/result paragraphs were inspected at the measured viewports; no unrelated visual matrix was repeated. Earlier evidence is not combined into a final-build native check total.

### Remaining limits and final state

Read-only private SQLite inspection was denied and `adbd root` refused; no bypass or data mutation followed. The existing desktop reference tab timed out twice, so the bounded reference came from the native original page instead. One date-entry harness assertion stopped before any retrieval; corrected date fields were checked before submission. The final build used an explicit committed ref while unsaved evidence remained in the source checkout; the initial default preflight refused that untracked evidence without building. Private screenshots, hierarchies and host logs remain ignored under `local-data/provider-connection-private/reconnect`; only sanitized metadata is published.

The provider AVD is left **signed in**, saved credentials preserved, visible original period/role restored and no pending-recovery warning; the local flight screen is open. No canonical flights were imported. Independent inspection of every prior persisted capture, full original preferences, exact row/ID/field semantics, durable production binding, natural expiry, second-account native isolation, complete cookie-store removal/server revocation and iOS runtime remain open. Pixel testing stays deferred. This completes the bounded assisted-login/small-raw-retrieval/cancellation proof, not full M1/M2/#2 acceptance.

## Scope and sources

Manuel explicitly authorized the [bounded package](../product/2026-10-17-safe-disconnect.md) with **do it**; [start record in #2](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/2#issuecomment-6231895092), coordinated with #5/#8. Baseline main was clean at `85d9fd0c43eb3dd5312296d98954a47f45278c71`, matching origin/main and live remote. No unrelated changes were overwritten. No new dependency/transport, canonical import, production binding/schema/credential policy, paid service, hosted run or physical-phone test.

Final application: `81128d0bae4e8fe0f1d709ad12e4bd3bc1155352`. The full width/lifecycle run compiled `689fc384a80fb8a88a1521f0b005b175a120c284`, driven by harness `bb3cfd3`. Subsequent application changes preserve known idle login-required/error/mismatch states when hiding, require native observation of the owned protected-profile navigation, and disable the original-page check until loading completes. Layout, text, widths and keyboard behavior did not change. A separate targeted native run verifies final source; these are not represented as one APK/run.

## Implementation

- Provider sign-out and app-owned credential forgetting are separate explicit actions. Sign-out opens the original page for the provider's own **Abmelden** control; no endpoint/method was guessed.
- Verification requires a fresh protected-profile navigation observed by native callbacks, current generation/nonce, exact native document/origin and the appropriate reader message kind. Exact root login-form structure after redirect can prove sign-in required. A queued navigation, root load alone, still-readable profile or network failure cannot.
- Disconnect refuses while recovery is unknown/pending or capture/save/restoration/login/check owns the workflow. Finish/cancel and verify recovery first, then explicitly retry; nothing destructive is queued after an uncancellable save. Journals, raw evidence, library and books are not deleted.
- The prior provisional account/club association survives disconnect within the app run. Reconnect requires a fresh check; mismatch cannot silently replace the association. Durable production binding remains open.
- Existing development saved-login use is explicit, immediately invalidates confidence and runs once. No secret is read at startup. Duplicate load-end events cannot duplicate a read; deferred reads cannot submit after close/background. German feedback distinguishes unconfirmed response, unavailable login, failure and cancellation.
- Hiding an idle known login-required/error/mismatch result preserves it. Canceling an owned check/login or unconfirmed observation invalidates it and clears deferred actions. Hiding during owned capture/restoration keeps presentation-only semantics.
- `disconnectedAt` is an app-run sign-out-verification timestamp, separate from session-check and raw-save times. It says nothing about flight freshness, cookie deletion or other devices.

## Local checks and Release

Windows/PowerShell, Node **24.18.0**, pnpm **11.25.0**, Python **3.12.10**, JDK **17.0.20.1+1**, existing Android SDK. The separate `C:/Users/Momo/mf-ui-build` checkout was clean before committed-source builds; no reset/uninstall/data clear.

| Check | Actual outcome |
| --- | --- |
| TypeScript | Passed. |
| Mobile tests | **162 passed**, zero failures: prior 149 plus 13 controller/reader cases. Shared controller suite: 38 cases including all 17 legacy recovery cases. Native/storage stubs do not prove live authentication. |
| Android/iOS Expo exports | Both passed on final source; not iOS runtime acceptance. |
| Android Release/lintVitalRelease | Passed on final committed source; 585 Gradle tasks, about 50.6 seconds. |
| APK validation | Embedded JavaScript and ARM64/x86_64 libraries verified. |
| Full synthetic matrix | **19 passed** on `689fc38`; readable controls/notices, no observed overlap or excessive stretching. Exact settings restored. |
| Final-source targeted native | **8 passed** on final `81128d0`, harness `e9fdd63`; exact original settings restored. |

[Host checks](evidence/android-2026-10-17-disconnect/host-checks.json), [final build](evidence/android-2026-10-17-disconnect/build-release.json), [matrix build](evidence/android-2026-10-17-disconnect/build-width-matrix.json).

Final dual-ABI APK: **48,714,539 bytes**, SHA-256 `82a140eb9fce2879ecc2a368ca8483e12d1a491d06d14787b6ca32b78cb50991`, in the existing short-path Release output. The older `local-data/phone-demo/MoFlight-demo-2026-10-17-arm64.apk` remains the `db15203` demo; it was not replaced or offered as this increment.

## Synthetic native evidence

[Full matrix report/screenshots](evidence/android-2026-10-17-disconnect/width-matrix/report.json): verified **MoFlight_Synthetic_API37**, API 37/x86_64, update-only install, no fixture/data reset or provider network access. All radio settings were observed settled before browser creation.

- 360×900, 390×900, 412×900, 600×1100 and 840×1100 dp at font 1.0.
- 360×900 and 600×1100 dp at font 1.4; 840×412 dp landscape at font 1.0.
- Overrides at **160 dpi**; actual pixels/density/font/calculated dp accompany every checkpoint. Large cards remain centered/capped around 520 dp; MIN enlarged text wraps the Forget label without overlap.
- Enlarged MIN keyboard: second date field reached above the actual WindowManager IME frame, using positive bounds rather than clipped/inverted rectangles.
- Header/Profile entry, offline failure, close/tab/retry, restart without cookie-based confidence, absent-credential deletion and repeated offline disconnect refusal. Forget does not claim logout; offline failure has no logout timestamp. WebView/wrapper IDs match across close/retry and disconnect-failure/retry.

Absent synthetic credential deletion tests that explicit native operation/feedback; no real provider key was deleted. Deferred/failing deletion and serialization have controller coverage. Screenshot review does not establish live authentication.

[Final-source targeted report/screenshots](evidence/android-2026-10-17-disconnect/final-lifecycle/report.json) records the narrower 390×900 dp/font 1.0 follow-up, including retained WebView IDs, offline retry/disconnect refusal and independent credential-forget feedback. It deliberately skips the already measured width matrix and does not turn the two source-specific runs into one 27-check run.

## Bounded live Android observations

The preserved **MoFlight_API37** was identity-checked and updated in place. No reset, inspection/logging of credential values or cookies, hidden-field read, export, canonical import or view-setting mutation was invoked. Only the explicit existing saved-login action reads app-owned secure storage. Its **480×800 px at 160 dpi = 480×800 dp, font 1.0** configuration was unchanged. Private screenshots/hierarchies stay ignored under `local-data/provider-connection-private/disconnect/`; only sanitized observations are published.

On `8117151`, the existing session was provisionally confirmed. Checking sign-out while the profile remained authenticated correctly failed without a logout timestamp. The first helper failed to open the provider menu and did not reach Abmelden; no logout success is claimed for it. Opening the original menu and choosing its visible **Abmelden**, then checking the protected profile, produced the app's sign-out confirmation. This is bounded same-browser logout evidence, not independent server/all-device revocation or cookie-store deletion.

On `689fc38`, one explicit existing saved-login attempt returned **not confirmed**. Successful re-login was not established; password validity, challenge cause, autofill/OTP and natural expiry are not inferred. On `04c862d`, supported sign-in-required evidence remained **Anmeldung erforderlich** after hiding, validating the dismissal correction. On final `81128d0`, a fresh protected-profile check returned supported sign-in-required evidence and retained **Anmeldung erforderlich** after hiding. A second fresh, natively observed profile request verified the already signed-out browser and displayed **Nicht verbunden**, with a separate sign-out-verification time **11:20:57 Europe/Berlin**. The provider AVD is left signed out; successful re-login remains open. [Sanitized observations](evidence/android-2026-10-17-disconnect/live-observations.json) identify each source and limit. Saved provider credentials were preserved. No row/page count or independent raw-database/preference comparison is claimed.

## Corrections and diagnostic attempts

- Late profile-reader responses at root cannot masquerade as login-form proof: distinct message kind plus observed native protected navigation. Regression coverage also rejects an old root completion after only queued navigation.
- Saved-login use now clears confidence/deferred actions and serializes reads. Close/background cancels deferred submission. Known idle login-required state survives hiding.
- Initial `767c58c` native run passed 12 checkpoints, then an old offscreen result search failed after the panel grew. Exact settings were restored. Searches now account for retained scrolling and control order.
- A zero-check startup attempt sampled asynchronous radio changes before settling. Immediate cleanup reported mobile data 0; a following read-only check returned original 1. The harness now waits for actual isolation/restoration convergence. [Diagnostic summaries](evidence/android-2026-10-17-disconnect/diagnostic-attempts.json); original ignored local artifacts remain preserved.

A final-source targeted attempt passed its first entry check but failed the home accessibility-readiness assertion after changing density between startups; its exact settings were restored. The post-restoration [diagnostic](evidence/android-2026-10-17-disconnect/runtime-density-home-diagnostic.png) shows unusually narrow home cards. This is tracked separately in [#5](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/5#issuecomment-6232248505) for runtime configuration/readiness reproduction; no home source changed and no product fix is claimed. The targeted harness now starts at its one measured viewport. This does not close the deferred configuration finding.

## Remaining acceptance

Successful real re-login/fresh credentials/autofill/OTP, natural expiry, second-account native isolation, broader renderer/process loss, stable production account/club/library binding, full cookie/session-store removal and iOS runtime remain open. The pinned WebView public API has no cookie deletion method; cache/history clearing or an incognito side effect is not a substitute. No all-device logout or production credential policy is claimed.

Canonical import/refresh/coverage remain later scope. Full M1/M2 and #2/#5/#8 remain open. Pixel 6a testing stays deferred without another request.

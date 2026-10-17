# Safe disconnect verification — 17 October 2026

## Bounded reconnect/retrieval follow-up

Manuel authorized this next package with **go** after the project review. [Issue contract](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/2#issuecomment-6234200621) records scope/exclusions/acceptance; [live findings and diagnostic change](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/2#issuecomment-6234267523). Baseline main `4a09ee9` was clean. The preserved provider AVD still runs application `81128d0` at this initial boundary; subsequent source/build evidence will be recorded separately below.

- One explicit existing saved-login action remained unconfirmed. One tap on the visible original provider **Anmelden** then opened the authenticated overview; a new protected-profile check returned observed account/club context and was provisionally confirmed. No credential value was inspected, replaced or forgotten. The helper-failure cause is unknown; automatic saved-login success is not established.
- Verified the raw-request inputs independently through the native date fields: **2026-10-01 through 2026-10-17**, inclusive. Retrieval reported failure, retained the observed provisional connection, showed no successful app-run capture timestamp and no pending-recovery warning. This is not successful retrieval or independent proof of unchanged persisted captures/preferences.
- Direct read-only SQLite inspection was refused by the Release sandbox; this production-image emulator also refused `adbd root`. No bypass, file mutation, app reset or credential/cookie inspection followed. The existing desktop reference tab timed out twice. Independent row/reference/preference comparison therefore remains unavailable at this boundary.
- The existing development lab correctly blocks a second provider controller while the shell owns the connection. No alternative controller was started. Private screenshots stay ignored under `local-data/provider-connection-private/reconnect`; no private exports, identifiers or screenshots are published.
- A small feedback change maps known controller failures to fixed German text in the existing development raw-retrieval card. Unknown/provider-supplied text is never echoed. New regressions cover failed-helper → original-page navigation → fresh same-account check → retrieval, rejected foreign account, stale/foreign helper messages, no automatic credential retry and safe failure feedback.

Initial local checks: **50 targeted tests passed**, TypeScript passed. Full regression/export, committed-source Release and focused native retry are pending at this commit. MIN/MAIN/MAX layout is unchanged apart from the affected failure paragraph; no full visual matrix is scheduled. Existing independent/native/physical/iOS limits remain open. Further outcomes belong in this section, not a duplicate report.

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

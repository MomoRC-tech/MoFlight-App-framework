# Connection controller PoC verification — 17 October 2026

## Scope and source

Manuel explicitly authorized [this bounded connection increment](../product/2026-10-17-connection-controller-poc.md) after selecting it ahead of the deferred physical retest. Existing #2/#5 track scope; #8 physical/iOS gates remain open. No canonical import, production identity/schema, new dependency, background guarantee, paid service or hosted run.

Final application source: `ac27723a45cdc67d85db1b9e31cc5d273177b578`. Main had a clean tree at `519ec89` before work. Subsequent application commits add the connection/controller slice and corrections described below. Unrelated drafts were preserved. The existing provider AVD was updated in place for the separately described bounded live trial, without uninstalling or resetting its data. The earlier ARM64 phone demo remains untouched; this increment is not a new physical-phone handoff.

## Implementation

- Header link indicator and Profile → Connections entry share a controller above tab and sheet lifetimes.
- Original provider login is shown in an in-app overlay with the actual allowed HTTPS origin. The same native parent/key survives hide/show, tab change and explicit navigation. No automatic provider request or saved-password read occurs at product startup.
- `useAccessController` extracts the existing probe/export/view-restoration behavior; the legacy access presentation reuses it. The product path adds nonce-scoped profile observations before capture, after capture before save, and after restored-view readback before journal deletion.
- Numeric profile evidence plus club display label remains provisional. Explicit confirmation is app-run only; changed context cannot silently rebind. A cookie, redirect or a successful load cannot produce a connected/green status.
- Durable preference journaling, uncancellable SQLite writes, cancellation and recovery remain. Wrong/unknown context retains the journal instead of restoring preferences into an unverified account.
- Close during a capture check hides presentation without losing request ownership. Background interruption invalidates confidence and preserves required recovery; it cannot start normal export after a deferred journal write.
- Raw capture uses the existing separate database. `lastCheckedAt` and this app-run's successful raw-save time are separate. Full logout/cookie clearing is not implemented or claimed.

## Local checks

Windows/PowerShell, Node 24/pnpm 11.25, Python 3.12, existing JDK 17.0.20.1+1/Android SDK and clean short-path build checkout `C:/Users/Momo/mf-ui-build`. Credential-free native checks use only `MoFlight_Synthetic_API37`. A separate bounded live trial uses the preserved `MoFlight_API37` on port 5556, updated with the same APK; no destructive synthetic harness runs there. No physical phone is used.

| Check | Actual outcome |
| --- | --- |
| TypeScript | Passed after final application correction. |
| Mobile tests | **149 passed**: all previous 136 remain, plus five pure connection-state tests and eight product-controller regressions. The 17 legacy access/recovery cases remain intact in the shared-controller harness. |
| Android/iOS Expo exports | Both passed after the final application correction. Bundles do not prove iOS runtime. |
| Android Release and lintVitalRelease | Passed from committed final source, 585 Gradle tasks; measured build duration in build manifest. |
| APK | **48,704,567 bytes**, SHA-256 `4800299facedc469cb29542331fca2a0eec77d57cc28f93862095ea35b25328d`; embedded JavaScript and ARM64/x86_64 libraries verified by existing APK checker. |
| Synthetic native checks | **16 passed** on final application source; [report/screenshots](evidence/android-2026-10-17-connection/report.json), including actual native WebView retention across close/tab/retry, width/font/keyboard/landscape, offline errors and restart. |

Commands: `pnpm typecheck`, `pnpm test`, `pnpm bundle`, `python -m py_compile scripts/android_connection_smoke.py`; existing `scripts/build-android-local.ps1 -BuildDirectory C:/Users/Momo/mf-ui-build -SourceRef <commit> -JavaHome <existing-JDK17> -Configuration Release`, then `adb install -r` only after checking the exact synthetic AVD. No app storage clearing or fixture seeding.

The real-controller host harness stubs native rendering/storage and drives the extracted handlers. It covers stale/foreign/canceled messages, deliberate confirmation, changed account before snapshot and raw save, hide during post-capture check, final context check before clearing recovery, background during deferred journal write and login redirect during export. These are synthetic controller checks, not live provider runtime acceptance.

## Synthetic native evidence

[Build identity](evidence/android-2026-10-17-connection/build-release.json) and [native report](evidence/android-2026-10-17-connection/report.json) identify compiled `ac27723` and harness `72a6505`; application inputs are identical between them. APK installation used update-only `adb install -r`, with no data reset or fixture seed. All radios were disabled before provider-view creation, then original settings were restored exactly: physical 1080 × 1920 px/420 dpi, no size/density overrides, font 1.0, airplane off, Wi-Fi/mobile data on.

Eight panel configurations: 360 × 900, 390 × 900, 412 × 900, 600 × 1100 and 840 × 1100 dp at font 1.0; 360 × 900 and 600 × 1100 dp at font 1.4; 840 × 412 dp landscape at font 1.0. All overrides use 160 dpi and the report records measured pixels/dp/density/font. Initial Profile entry also uses measured 411.43 × 731.43 dp at 420 dpi. The enlarged MIN keyboard check measures its top at 601 px and reaches the second date input at `[22,236,338,284]` above it by scrolling within the form.

Native Activity dumps show the same WebView/wrapper instance IDs before and after close, tab switch and explicit offline retry. This is actual retention evidence; the separate live trial below establishes bounded hidden execution. Reviewed [MAIN header](evidence/android-2026-10-17-connection/03-connection-header-w390-font1.0.png), [MIN panel](evidence/android-2026-10-17-connection/02-connection-w360-h900-font1.0.png), [enlarged keyboard](evidence/android-2026-10-17-connection/10-connection-min-enlarged-keyboard.png), [wide panel](evidence/android-2026-10-17-connection/07-connection-w840-h1100-font1.0.png) and [landscape](evidence/android-2026-10-17-connection/12-connection-w840-h412-font1.0.png). Final screenshots keep the overlay clear of the status bar and remove closed-panel drawing from the shell. Geometry is not a complete accessibility/pixel-fidelity certification.

## Bounded live provider trial

[Sanitized native observation record](evidence/android-2026-10-17-connection/live-observations.json).

The existing `MoFlight_API37` was cold-started without loading/saving snapshots or resetting data. Same APK installed as an update. Android API 37/x86_64, existing 480 × 800 px override at 160 dpi = 480 × 800 dp, font scale 1.0; provider display/network settings were not changed. This live functional viewport is additional evidence, not a replacement for the synthetic MIN/MAIN/MAX matrix.

- Existing provider session was usable after cold boot/update. Original-page sign-in view opened already authenticated; no credential entry or credential-store inspection was required. The new allowlisted profile check returned observed account/club evidence, followed by explicit provisional association for this engineering trial. No stable production binding is inferred.
- A manually selected bounded period **2025-01-01 through 2026-12-31** ran while the provider page was hidden. Closing Connections and switching to Flüge preserved the active spinner and empty canonical/local library. Reopening Connections showed successful raw-save time **09:52:51 Europe/Berlin**, a separate post-restoration check **09:52:56**, re-enabled actions and no recovery warning.
- A second request exercised the saving lock (Cancel disabled), then cancellation while enabled. The controller showed restoration in progress, then **Abruf abgebrochen**, re-enabled actions and no recovery warning. Prior successful raw-save time stayed **09:52:51**; the final context check was **09:54:13**.
- A quick close during an idle pre-retrieval check canceled that check without starting a new export. After explicit recheck, retry completed successfully: raw-save time **09:56:35**, final post-restoration context check **09:56:42**, actions re-enabled and no recovery warning. The provider view stayed hidden throughout capture/restoration.

These are primary-agent observations of the actual native app. Successful cleanup means the controller completed its full original-view readback and final account check before clearing the journal. No independent external preference/row comparison or measured row/page count is claimed for this new flow. Private screenshots stay in ignored `local-data/provider-connection-private`; they are not Git artifacts. No raw flight rows, personal account/club identifiers, databases, credentials or signed URLs are committed.

## Findings corrected

1. The first native screenshots showed the connection Back control overlapping the Android status bar. The retained overlay now accounts for actual safe-area insets; the browser's measured top includes those insets.
2. Further screenshot review showed closed panel contents drawing through gaps between shell cards despite passing accessibility/geometry checks. The entire closed presentation is now transparent and noninteractive while retaining its native browser. Earlier automated native passes on `d031542` and `80f8336` are diagnostic, not final visual acceptance.
3. Inspection identified imperative navigation firing before a new handler generation committed. A post-commit effect now initiates retained navigation; stop/cancel discards queued navigation.
4. The first stricter keyboard assertion treated an off-screen clipped/inverted input rectangle as visible and skipped its swipe. The harness now requires a positive rectangle before stopping; the final run actually scrolls to the second date field. The failed harness run is retained locally and is not combined into the 16-pass result.
5. Controller tests exposed close during post-capture checking orphaning retrieval, background during journaling continuing export, and expiry redirect retaining stale session confidence. The fixes retain operation/journal ownership and require fresh sign-in evidence. Original preference/recovery regressions remain passing.

## Open acceptance

The bounded existing-session/hidden raw-capture/tab/cancel flow above now has Android runtime evidence. Fresh credential entry/autofill, independent live reference comparison, natural expiry/re-login, wrong-account/second-account native isolation, complete disconnect, renderer/process loss, secure-storage behavior and iOS runtime remain unverified. Stable production account/club/library binding and canonical normalization/import remain separate gates. Synthetic retention alone does not prove hidden execution; the separate successful live trial supports only its measured bounded scope. The current-year adjustable raw-capture PoC does not implement the full refresh/overlap planner.

Manuel reports Pixel 6a/Android 17 and explicitly defers more physical testing. No new test request is made, and no updated physical pass or waiver is inferred. #2/#5/#8 remain open for their remaining scope.

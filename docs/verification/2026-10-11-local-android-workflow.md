# Local Android workflow rollout — 2026-10-11

Tracking: #6. Decision: [ADR 0009](../adr/0009-local-android-development-and-checkpoint-ci.md). The commit containing this initial report identifies the implementation; follow-up evidence identifies the exact source tested.

## Initial validation

- Windows Python 3.12: 31 host tests passed, including seven new trigger/cache/provenance/device-selection regression checks.
- actionlint 1.7.12, shellcheck disabled: both workflow files passed.
- PowerShell parser: local build helper passed; git diff --check passed.
- Trigger cases: docs and ordinary app/domain TypeScript excluded; package manifests, lockfile, app config/plugins, Android helpers/tests and checkpoint workflow included.
- Planner tests: changed app source and expired artifacts prevent reuse; force-fresh avoids artifact lookup; docs-only reuse records both compiled and requested source and uses no-renames comparison.
- Device tests: a different AVD is rejected before reset/install; explicit serial scopes adb calls.

## Rollout gates

Fresh local build, incremental build, dedicated synthetic emulator smoke, development-client update without compilation, hosted checkpoint and automatic concurrency execution remain pending at initial publication. Existing private provider emulator is not used for destructive synthetic testing. No new live-provider, cloud, physical-phone or iOS acceptance is claimed.

## Completed local and hosted verification

Windows desktop: Node 24.18.0, pnpm 11.25.0, Python 3.12.10, the existing Temurin JDK 17 and installed Android SDK. New dedicated AVD `MoFlight_Synthetic_API37`, x86_64 Google Play API 37, port 5558; existing `MoFlight_API37`/5554 provider session was not reset, installed over or used for synthetic tests. Build checkout: `C:\Users\Momo\mf-build`, frozen hoisted dependencies and generated-only native path settings.

| Local build | Source commit | Gradle duration | Result |
| --- | --- | --- | --- |
| Fresh generated native project, existing shared dependency/tool caches | `c6a80bef045ff5b7e396b6e1b483750ab1f05bc6` | 369.95 s (6m09s) | Release passed; 585 tasks executed |
| Final helper fingerprint regenerated native project once | `c6a5900d5ec9aaf226ec565261735bdad553c030` | 138.49 s (2m18s) | Release passed; both architectures and embedded JavaScript |
| Same source, native tree/caches retained | `c6a5900d5ec9aaf226ec565261735bdad553c030` | 31.42 s | Release passed; 575/585 tasks up-to-date, identical APK checksum |
| Development client, first Debug build | `c6a5900d5ec9aaf226ec565261735bdad553c030` | 393.49 s (6m33s) | Debug passed; no offline acceptance inferred |

Standalone APK: 46,886,647 bytes, SHA-256 `e4c04b73508856088a44a653e96e21286320378981b9b9e9a3a10fd41d47c35d`. [Actual local report](2026-10-11-local-android-native-report.json): **23 checkpoints passed, complete diagnostics**, including offline restart/isolation, selective copy, external backup/picker restore, invalid-file rejection, byte-for-byte re-export and preserved original database. First-to-final report timestamps span approximately 23 minutes; full acceptance tests remain slower than the edit/reload loop. These are synthetic tests, not new live-provider acceptance.

[Development-loop proof](2026-10-11-local-dev-loop.json): the Debug APK loaded through Metro on IPv4 loopback with ADB reverse. A temporary title changed to `MoFlight Local Reload Verified` and became visible without running Gradle or reinstalling the app. Original source bytes/title were restored; the build checkout was clean. Debug APK SHA-256 stayed `97b5a9e77a2d01f0ac5cce36ec1c14f1f442f243727066790d96339d3ac52776`. Metro source was `4b1d3da4e5ef6fd41846fa6f8f19692e2482cad4`; application/native dependency inputs were unchanged from the compiled source. Metro and the task-created headless synthetic emulator were stopped after verification; provider emulator remained running.

Safety checks: actual selection of provider AVD 5554 was rejected before mutation and produced only a rejection report, with no screenshots/logcat. A temporary draft in the build checkout caused rejection and its bytes were preserved. Default dirty-source rejection and explicit committed-snapshot preservation are covered by Windows execution tests. Source drafts from the concurrent project audit were preserved and subsequently published by their own task.

[Manual hosted checkpoint 38118325052](https://github.com/MomoRC-tech/MoFlight-App-framework/actions/runs/38118325052) **completed successfully**: selected/compiled source `b6342732097a8c72b3513b686be46682ec3f4f2e`, force-fresh enabled, clean API 35 emulator, [23 passed checkpoints with complete diagnostics](2026-10-11-hosted-android-checkpoint-report.json). Workflow head was `8a6d396b38aef89e7cb5a0c38a7fa0ca1b641ee0`; the report correctly records the separately selected application source. Later workflow-only changes have independent policy checks; this is not a native pass claim for every subsequent commit.

Automatic concurrency: superseded push runs were cancelled while the manual checkpoint remained independent. The original `always()` job condition delayed cancellation of an obsolete smoke job; it was replaced with `!cancelled()`. Superseded run 38118467435 required one force-cancel; subsequent ordinary cancellations completed. Its successfully compiled APK remains valid for matching application inputs. The current planner was also tested on a historical Git checkout lacking any planner script, proving selected SHA/force-fresh handling comes from current workflow tooling.

Documentation-only commit `c6a5900` started only [fast checks 38118619686](https://github.com/MomoRC-tech/MoFlight-App-framework/actions/runs/38118619686), which passed. Native/workflow/helper pushes started checkpoints as expected. Latest implementation [fast checks 38120327906](https://github.com/MomoRC-tech/MoFlight-App-framework/actions/runs/38120327906) passed. [Automatic checkpoint 38120327925](https://github.com/MomoRC-tech/MoFlight-App-framework/actions/runs/38120327925) **completed successfully**: it resolved matching compiled source `4d84d163af0da65711c169c2a539f39439902f9f`, skipped compilation, downloaded/checked the APK and passed all 23 emulator checkpoints with complete diagnostics. Its [actual reuse report](2026-10-11-hosted-android-reuse-report.json) records validated source `4b1d3da4e5ef6fd41846fa6f8f19692e2482cad4` separately from the compiled source. This verifies the current tooling split, cancellation guard and APK reuse path in a completed hosted run.

Final local validation: **38 host tests passed**, including 14 new build-policy/device/checkout tests; actionlint 1.7.12 with shellcheck disabled, PowerShell parser and git diff --check passed. No application feature, framework version, paid service, production signing, private capture or iOS execution was added.

## Recoverable rollout failures

- First helper attempt combined the Gradle task/options into one PowerShell string. Stopped before completion; corrected argument separation, then executable builds passed.
- Metro initially generated an additional app tsconfig. Preserved that generated file in ignored local-data, disabled automatic TypeScript setup because the strict workspace configuration/dependencies already exist, and verified a clean build checkout.
- Windows localhost resolved to IPv6 while ADB reverse used IPv4. The helper now invokes Node with IPv4-first DNS resolution; observed Metro listening on 127.0.0.1 and successfully loaded the app.
- First hot-reload label lookup was obscured by the developer-menu overlay. Dismissed the menu; label change and restoration passed without modifying the APK.

## Remaining limits

One complete local cycle, one hosted fresh-build cycle and one hosted APK-reuse cycle passed, so the primary local development loop is adopted. Cold builds on another PC, physical-phone/iOS acceptance, provider-session expiry and production distribution remain separate gates. APK reuse ignores only documented non-application inputs (including the isolated project-audit PoC and Windows-only helpers); unknown files or actual application/dependency changes still require compilation. Full synthetic smoke suites are checkpoint tests; use Metro for small screen/logic iterations.

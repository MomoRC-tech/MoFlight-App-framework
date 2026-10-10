# Android selective copy and external backup trial — 2026-10-10

Tracking: #4/#6/#7/#8/#9. Manuel requested autonomous testing through the existing GitHub emulator, with a later local-PC continuation. Current app source: [596c110](https://github.com/MomoRC-tech/MoFlight-App-framework/commit/596c11019e2d68900403b89738094f398a2a2bbe). **All 21 actual native checks passed** in [run 38025640272](https://github.com/MomoRC-tech/MoFlight-App-framework/actions/runs/38025640272), harness [07f47a7](https://github.com/MomoRC-tech/MoFlight-App-framework/commit/07f47a7e4aa72c3b3fbd9fccdb6aa886ed37c392). This run reused the exact compiled 596c110 APK after checking unchanged build inputs; host/mobile-contract jobs also passed. Earlier failures are retained below.

## Scope and implementation

The existing Expo file module supplies Android Storage Access Framework folder selection, JSON creation/write and read-back. **Save synthetic backup to a device folder** requests access through the native picker and reports verified saving only after the read-back matches. It adds no dependency, service, second SQLite writer or test-only app endpoint. Existing share export remains available on Android/iOS. Picker cancellation and share-sheet return no longer misleadingly report that an external backup was saved.

The Python/adb harness drives ordinary app buttons and Android DocumentsUI. It confirms only entry 70, checks entry 71 remains pending and survives offline force-stop/reopen; cancels save/restore/share; writes an actual external backup; checks its envelope/checksum, original evidence and revision history; selects corrupt/checksum/oversized JSON through the actual picker; restores a ten-entry backup after advancing the original to eleven; and compares the full restored re-export byte for byte. Returning to original dataset A must still show eleven entries.

The harness may create a dedicated folder and invalid synthetic input documents through adb in shared Documents storage. It does not write SQLite/app-private files or inject picker results. The app itself exports the valid backup and imports every selected document through its native file APIs. The emulator-only reset guard and explicit offline network settings remain in place. Each passed checkpoint saves a screenshot; failures preserve report, last XML, screenshot and full launch log.

## Local verification

Linux / Node 24.19.0 / pnpm 11.25.0 / Python 3.12: strict TypeScript passed, 10 TypeScript/real-disk-SQLite tests passed, 20 host reference tests passed, canonical fixtures matched, Android/iOS Hermes bundles exported, Python harness compilation and whitespace checks passed. No Android SDK/adb/Xcode is available in this local workspace. These host results are separate from the completed native sequence below.

## Native attempts and results

### Initial expanded run

Run 38022619023 compiled the new APK successfully (Gradle 10m 18s), passed host/mobile-contract jobs and five native UI checkpoints, then failed while locating the fixed snapshot heading after returning from B to A. The failure screenshot still displays the rendered writing instructions/audit and backup controls; this does not prove the missing snapshot-ID assertion. Copy/backup checks did not execute. [Actual failure artifact](https://github.com/MomoRC-tech/MoFlight-App-framework/actions/runs/38022619023/artifacts/11660105535), ZIP SHA-256 `310c702cbad4cc2574c06cda8a66d18046faecb9ba75236950d9ca2e81b7305d`, was downloaded and its report/XML/screenshot inspected.

Compiled APK: 46,125,122 bytes, SHA-256 `21876c50b24387d2cb54881f41a2e7b7a9ab8ae6af706f8895d2e45b4952fc60`; embedded JavaScript and arm64-v8a/x86_64 libraries independently checked. [APK artifact](https://github.com/MomoRC-tech/MoFlight-App-framework/actions/runs/38022619023/artifacts/11658929798), ZIP SHA-256 `29b31d161336b224f2ccb502226e7976d1002df9dd82457ea9e7e91efa833622`, expires 2026-10-17. This artifact is tied to source 596c110, not later harness-only commits.

Harness correction [b137de8](https://github.com/MomoRC-tech/MoFlight-App-framework/commit/b137de8228a556639685bf4f7ffc38a154042889) uses slow overlapping scrolls and starts snapshot-ID search at the top. App/APK inputs are unchanged. Its actual retry result is recorded below; no pass is inferred from the correction itself.

## Boundaries and local-PC continuation

Use [the platform-lab runbook](../../apps/platform-lab/README.md) for the pinned environment and complete manual gates. The emulator script is for a **disposable synthetic emulator**, never a physical phone: it clears the lab package before seeding fixtures. On the local PC, start one fresh Android Studio API 35 x86_64 Google APIs emulator with no files in Documents/MoFlightSmoke, make the SDK's platform-tools/adb available to the local Codex terminal, and verify `adb devices` lists that emulator. Download/extract the tested APK from the recorded run, then run:

```bash
python scripts/android_smoke.py --check-apk /path/to/app-release.apk
python scripts/android_smoke.py --apk /path/to/app-release.apk --output local-data/android-smoke-pc-20261010
```

Use Python 3.12 (`python3` on Linux if needed). Run from the repository root with a new output folder. The emulator folder must be empty; wipe/recreate the disposable emulator before repeating the full sequence. Do not remove files from a real phone to satisfy this condition. These local-PC commands are a prepared handoff; they have not been executed on Manuel's PC. A local Codex session can inspect the repo and run those installed tools; this cloud chat does not automatically gain desktop control.

The older phone APK 6957ce2 lacks the explicit folder-save action. Android/iOS full readability, large text/orientation, physical-phone copy/picker behavior, iOS compilation/execution, production encryption/authenticity/migrations and all cloud/live/handwriting/RAG gates remain separate. Experimental backups are unencrypted synthetic JSON; no paid calls or subscriptions are introduced.

References reviewed for the existing module/picker contract: [Expo FileSystem legacy API](https://docs.expo.dev/versions/latest/sdk/filesystem-legacy/) (SDK 57.0.7), [Android SAF documents](https://developer.android.com/training/data-storage/shared/documents-files). The locally installed matching module's TypeScript definitions and Android implementation were inspected.

### First harness retry

[Run 38023719874](https://github.com/MomoRC-tech/MoFlight-App-framework/actions/runs/38023719874), b137de8, reused the compiled 596c110 APK after verified unchanged inputs; compilation correctly skipped. Host/mobile contracts passed. **Nine native checks passed**, including all original seven, explicit confirmation of only entry 70 (entry 71 enabled/pending) and preserved ten-entry/copy/query/snapshot state after offline restart. The next save-cancellation check failed because one Android Back action navigated from Documents to the storage root instead of exiting the picker. The failure screenshot/XML shows actual DocumentsUI still in front; no app-state cancellation/export pass is claimed.

[Original failure evidence](https://github.com/MomoRC-tech/MoFlight-App-framework/actions/runs/38023719874/artifacts/11659447622), ZIP SHA-256 `ce14f56a4af11b49641a0f290649839a4b147fc936bbd4017762f435973179d2`, was downloaded; nine-check report and failure screenshot/XML inspected. Harness-only [2dc5ed0](https://github.com/MomoRC-tech/MoFlight-App-framework/commit/2dc5ed0fba2c6e9e3f2bfd34c2603ba5721e8da2) waits for actual return from known picker/share surfaces with bounded Back actions, and uses fast ordinary swipes to locate footer controls. ID/row assertions remain unchanged and do not bypass the picker. Its actual thirteen-check retry and final result are recorded below.

The supplied old/new APK signing-block v2 certificate digests match (`fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`). This is signing identity inspection, not a tested physical-phone update; runtime install validation happens on the emulator.

Durable original failed reports/screenshots: [attempt 1 report](evidence/android-2026-10-10-copy-backup/attempt-1-report.json), [attempt 1 screenshot](evidence/android-2026-10-10-copy-backup/attempt-1-failure.png), [attempt 2 report](evidence/android-2026-10-10-copy-backup/attempt-2-report.json), [attempt 2 screenshot](evidence/android-2026-10-10-copy-backup/attempt-2-failure.png). These original CI files contain synthetic emulator data. Private phone screenshots are not committed.

## Second harness retry and completed run

[Run 38024543206](https://github.com/MomoRC-tech/MoFlight-App-framework/actions/runs/38024543206), 2dc5ed0, passed thirteen native checkpoints, including all cancellation cases and an actual externally saved, checksum-verified backup with ten paper entries and 25 record revisions. It failed on the first invalid-file selection: DocumentsUI exposed a disabled storage breadcrumb with the same label as an enabled root item. The report/screenshot/XML were inspected; no rejection/restore pass is inferred. [Artifact](https://github.com/MomoRC-tech/MoFlight-App-framework/actions/runs/38024543206/artifacts/11659018247), ZIP SHA-256 `c5ba6446c47356eec4fdc5463043f071ed93d3048c71fe3bd2e78b325d4bb896`. [Original report](evidence/android-2026-10-10-copy-backup/attempt-3-report.json) and [failure screenshot](evidence/android-2026-10-10-copy-backup/attempt-3-failure.png) retain that failure.

Harness-only 07f47a7 selects enabled actual file-title items in the remembered DocumentsUI folder, and uses bounded backwards searching for copy controls. Rejected-import preservation is strengthened by exporting through the app and comparing the entire backup byte for byte. App code/APK inputs did not change.

### Final environment and observations

Run 38025640272 passed on API 35 / sdk_gphone64_x86_64 / x86_64, 480×800 with density override 160, airplane mode, Wi-Fi/data disabled and no Metro. The emulator job completed within its 30-minute limit. APK identity is the 596c110 hash recorded above. The original [passed report](evidence/android-2026-10-10-copy-backup/passed-report.json) lists all 21 checks. No checkpoints from failed attempts are combined into this report.

| Tested sequence | Actual result |
| --- | --- |
| Fresh install, import/override, ASK 21 query, fixed snapshot, offline restart, B isolation, remembered selection, repeated import | All seven checks passed; nine initial paper entries, four effective ASK 21 flights, same fixed snapshot; no duplication |
| Confirm only entry 70, then offline restart | Ten paper entries; entry 70 disabled/already copied, entry 71 enabled/pending; query and snapshot retained |
| Cancel folder save, restore and share | Data unchanged; no external file created; sharing does not claim an external backup |
| Save through Android folder picker | Actual JSON in Documents/MoFlightSmoke, verified checksum, original CSV/page evidence and all 25 record revisions, ten paper entries |
| Select checksum-invalid, >2 MB and malformed JSON through DocumentsUI | All rejected; each subsequent app-exported backup exactly matched the original, proving preserved full dataset history |
| Advance original A to eleven, select empty B, restore saved ten-entry backup | New restore database selected; ten paper entries, entry 71 pending, ASK 21 count four and identical snapshot; original file preserved |
| Offline restart of restored selection, external re-export, reopen original A | Restored selection/state survived; entire backup re-export identical; original lab-a.sqlite still had eleven entries |

Fixed snapshot: `1779f26a8640136789613acabefa7a82c5e9acf87567748dceac271941800e70`. External backup SHA-256: `94b9157f9e044070ce2e00f1ffbe573af4f7c3584d84a9b109a9d3a95615fde2`. Restore selection: `synthetic-lab-a · restore-eb6836f3-359c-4ef6-ab09-01bec32752f6.sqlite`.

[Full original CI artifact](https://github.com/MomoRC-tech/MoFlight-App-framework/actions/runs/38025640272/artifacts/11660631540) includes all 21 screenshots, rejection screenshots, XML, report and logcat; ZIP SHA-256 `a39555e60045dca48734cbbe6b3c974d453a9ca131d88737982bfea85390ef85`, expires 2026-10-17. It was downloaded, digest checked, and report plus selected screenshots inspected. Durable screenshots: [external save](evidence/android-2026-10-10-copy-backup/13-external-folder-backup-original-bytes-history-and-checksum.png), [checksum rejection](evidence/android-2026-10-10-copy-backup/input-invalid-checksum.json-rejected.png), [restored selection after restart](evidence/android-2026-10-10-copy-backup/19-restored-selection-and-copy-state-survive-offline-restart.png), [preserved original eleven entries](evidence/android-2026-10-10-copy-backup/21-restore-preserves-newer-original-database.png). Screenshots alone do not show every traversed assertion; the script/report supply that scope.

This completes the bounded Android emulator selective-copy/external-backup/picker-restore trial. It does not establish physical Pixel picker behavior, iOS execution, full readability/new-evidence review, production backup security or any cloud/live/OCR/RAG gate. The new standalone APK is available for later phone/PC trials; no paid service or dependency was added.

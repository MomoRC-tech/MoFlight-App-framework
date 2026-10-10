# Android selective copy and external backup trial — 2026-10-10

Tracking: #4/#6/#7/#8/#9. Manuel requested autonomous testing through the existing GitHub emulator, with a later local-PC continuation. Current app source: [596c110](https://github.com/MomoRC-tech/MoFlight-App-framework/commit/596c11019e2d68900403b89738094f398a2a2bbe). [Initial expanded run](https://github.com/MomoRC-tech/MoFlight-App-framework/actions/runs/38022619023) is pending completion at preparation time; no new native pass is claimed here yet.

## Scope and implementation

The existing Expo file module supplies Android Storage Access Framework folder selection, JSON creation/write and read-back. **Save synthetic backup to a device folder** requests access through the native picker and reports verified saving only after the read-back matches. It adds no dependency, service, second SQLite writer or test-only app endpoint. Existing share export remains available on Android/iOS. Picker cancellation and share-sheet return no longer misleadingly report that an external backup was saved.

The Python/adb harness drives ordinary app buttons and Android DocumentsUI. It confirms only entry 70, checks entry 71 remains pending and survives offline force-stop/reopen; cancels save/restore/share; writes an actual external backup; checks its envelope/checksum, original evidence and revision history; selects corrupt/checksum/oversized JSON through the actual picker; restores a ten-entry backup after advancing the original to eleven; and compares the full restored re-export byte for byte. Returning to original dataset A must still show eleven entries.

The harness may create a dedicated folder and invalid synthetic input documents through adb in shared Documents storage. It does not write SQLite/app-private files or inject picker results. The app itself exports the valid backup and imports every selected document through its native file APIs. The emulator-only reset guard and explicit offline network settings remain in place. Each passed checkpoint saves a screenshot; failures preserve report, last XML, screenshot and full launch log.

## Local verification

Linux / Node 24.19.0 / pnpm 11.25.0 / Python 3.12: strict TypeScript passed, 10 TypeScript/real-disk-SQLite tests passed, 20 host reference tests passed, canonical fixtures matched, Android/iOS Hermes bundles exported, Python harness compilation and whitespace checks passed. No Android SDK/adb/Xcode is available in this local workspace. These results do not stand in for the pending native sequence.

## Native attempts and results

### Initial expanded run

Run 38022619023 compiled the new APK successfully (Gradle 10m 18s), passed host/mobile-contract jobs and five native UI checkpoints, then failed while locating the fixed snapshot heading after returning from B to A. The failure screenshot still displays the rendered writing instructions/audit and backup controls; this does not prove the missing snapshot-ID assertion. Copy/backup checks did not execute. [Actual failure artifact](https://github.com/MomoRC-tech/MoFlight-App-framework/actions/runs/38022619023/artifacts/11660105535), ZIP SHA-256 `310c702cbad4cc2574c06cda8a66d18046faecb9ba75236950d9ca2e81b7305d`, was downloaded and its report/XML/screenshot inspected.

Compiled APK: 46,125,122 bytes, SHA-256 `21876c50b24387d2cb54881f41a2e7b7a9ab8ae6af706f8895d2e45b4952fc60`; embedded JavaScript and arm64-v8a/x86_64 libraries independently checked. [APK artifact](https://github.com/MomoRC-tech/MoFlight-App-framework/actions/runs/38022619023/artifacts/11658929798), ZIP SHA-256 `29b31d161336b224f2ccb502226e7976d1002df9dd82457ea9e7e91efa833622`, expires 2026-10-17. This artifact is tied to source 596c110, not later harness-only commits.

Harness correction [b137de8](https://github.com/MomoRC-tech/MoFlight-App-framework/commit/b137de8228a556639685bf4f7ffc38a154042889) uses slow overlapping scrolls and starts snapshot-ID search at the top. App/APK inputs are unchanged. The retry remains pending; no new pass is inferred from this correction.

## Boundaries and local-PC continuation

Use [the platform-lab runbook](../../apps/platform-lab/README.md) for the pinned environment and complete manual gates. The emulator script is for a **disposable synthetic emulator**, never a physical phone: it clears the lab package before seeding fixtures. On the local PC, start one Android Studio API 35 x86_64 Google APIs emulator, make the SDK's platform-tools/adb available to the local Codex terminal, and verify `adb devices` lists that emulator. Download/extract the tested APK from the recorded run, then run:

```bash
python scripts/android_smoke.py --check-apk /path/to/app-release.apk
python scripts/android_smoke.py --apk /path/to/app-release.apk --output local-data/android-smoke
```

Use Python 3.12 (`python3` on Linux if needed). These local-PC commands are a prepared handoff; they have not been executed on Manuel's PC. A local Codex session can inspect the repo and run those installed tools; this cloud chat does not automatically gain desktop control.

The older phone APK 6957ce2 lacks the explicit folder-save action. Android/iOS full readability, large text/orientation, physical-phone copy/picker behavior, iOS compilation/execution, production encryption/authenticity/migrations and all cloud/live/handwriting/RAG gates remain separate. Experimental backups are unencrypted synthetic JSON; no paid calls or subscriptions are introduced.

References reviewed for the existing module/picker contract: [Expo FileSystem legacy API](https://docs.expo.dev/versions/latest/sdk/filesystem-legacy/) (SDK 57.0.7), [Android SAF documents](https://developer.android.com/training/data-storage/shared/documents-files). The locally installed matching module's TypeScript definitions and Android implementation were inspected.

### First harness retry

[Run 38023719874](https://github.com/MomoRC-tech/MoFlight-App-framework/actions/runs/38023719874), b137de8, reused the compiled 596c110 APK after verified unchanged inputs; compilation correctly skipped. Host/mobile contracts passed. **Nine native checks passed**, including all original seven, explicit confirmation of only entry 70 (entry 71 enabled/pending) and preserved ten-entry/copy/query/snapshot state after offline restart. The next save-cancellation check failed because one Android Back action navigated from Documents to the storage root instead of exiting the picker. The failure screenshot/XML shows actual DocumentsUI still in front; no app-state cancellation/export pass is claimed.

[Original failure evidence](https://github.com/MomoRC-tech/MoFlight-App-framework/actions/runs/38023719874/artifacts/11659447622), ZIP SHA-256 `ce14f56a4af11b49641a0f290649839a4b147fc936bbd4017762f435973179d2`, was downloaded; nine-check report and failure screenshot/XML inspected. Harness-only [2dc5ed0](https://github.com/MomoRC-tech/MoFlight-App-framework/commit/2dc5ed0fba2c6e9e3f2bfd34c2603ba5721e8da2) waits for actual return from known picker/share surfaces with bounded Back actions, and uses fast ordinary swipes to locate footer controls. ID/row assertions remain unchanged and do not bypass the picker. Its retry is pending.

The supplied old/new APK signing-block v2 certificate digests match (`fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`). This is signing identity inspection, not a tested physical-phone update; runtime install validation happens on the emulator.

Durable original failed reports/screenshots: [attempt 1 report](evidence/android-2026-10-10-copy-backup/attempt-1-report.json), [attempt 1 screenshot](evidence/android-2026-10-10-copy-backup/attempt-1-failure.png), [attempt 2 report](evidence/android-2026-10-10-copy-backup/attempt-2-report.json), [attempt 2 screenshot](evidence/android-2026-10-10-copy-backup/attempt-2-failure.png). These original CI files contain synthetic emulator data. Private phone screenshots are not committed.

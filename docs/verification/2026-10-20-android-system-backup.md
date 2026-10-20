# Android system backup permission — 20 October 2026

Tracking: [#37](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/37), M3 local persistence, coordinated with #29/#34/#16/#21/#8. Manuel explicitly approved allowing Android phone system backups and requested configuration/documentation implementation. This selects backup permission; it does not claim recovery acceptance.

## Implementation and policy

[`app.json`](../../apps/platform-lab/app.json) sets `android.allowBackup=true`. [`withAndroidBackup.cjs`](../../apps/platform-lab/plugins/withAndroidBackup.cjs) generates app-owned XML for Android 11-and-earlier backup and Android 12+ cloud backup/device transfer. Exclusion-only rules preserve Android's default file/database/preferences coverage, including eligible flight/capture databases, local settings and app-document data. SecureStore preferences and default WebView storage (`app_webview`, `WebViewChromiumPrefs.xml`) are excluded from all three paths. No custom WebView data-directory suffix is configured in the current app.

The pinned SecureStore 57.0.4 plugin/resources were read before implementation. Its bundled rules include only shared preferences, which would omit flight databases/files. MoFlight disables that plugin's automatic backup configuration and supplies its own rules with the same SecureStore exclusion plus WebView exclusions. Password storage itself is unchanged. The launcher test's obsolete disabled-backup assertion is removed; backup policy now has its own integration check.

[Android Auto Backup documentation](https://developer.android.com/identity/data/autobackup), checked 20 October 2026, documents conditional scheduling, phone backup settings, default data coverage, excluded cache/no-backup directories, the 25 MB cloud quota and separate legacy/cloud/device-transfer rules. OS/user-selected backup transport controls the destination and protection; this adds no MoFlight-operated cloud service. Backup may be absent, stale or exceed quota. Independent portable backups (#29) and compatibility/recovery (#34) remain necessary acceptance work. This approval does not establish legal compliance or waive remaining #21 inventory/notice obligations.

## Verification and limits

Environment: Windows, Node 24.18.0, pnpm 11.25.0, pinned installed Expo/config-plugins/SecureStore; synthetic temporary native files only. This report's publishing commit identifies the changed source.

- `node --import tsx --test tests/mobile/android-backup-config.test.ts`: **1 integration test passed**. Runs the real Expo allowBackup, SecureStore and custom manifest/file mods against isolated native files; checks enabled manifest, both resource references, all three exclusion sets, default database/file coverage and repeat-generation stability.
- `pnpm typecheck` and focused ESLint for the plugin/test: **passed**.
- `python -m unittest tests.test_launcher_icons -v`: **2 tests passed**, preserving launcher/config identity coverage.
- Documentation policy/supersession, local references and `git diff --check`: **passed**. Historical disabled-backup observations remain dated evidence, annotated with the current policy.

No application Release build, installation, cloud backup/restore, device transfer, physical-phone/OEM or iOS test was performed. No private data/session was accessed or changed. Existing generated native checkouts and installed APKs are preserved; the policy takes effect in a newly prebuilt/rebuilt Android binary. Host rule generation does not prove that restored ownership, selection, absolute paths, pending operations, keys or version migration work. Keep #37 open for native packaged-manifest/XML and synthetic restore/transfer acceptance; never claim this source change guarantees complete/latest recovery.

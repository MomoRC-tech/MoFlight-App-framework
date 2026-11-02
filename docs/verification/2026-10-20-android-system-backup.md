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

## Packaged configuration follow-up — 20 October 2026

The ordinary Flüge Release `b47ef1e` includes this configuration. The later controller-maintenance Release `096c9fb` now supplies direct packaged `aapt2` evidence: `allowBackup=true`, full-backup/data-extraction resource references, and SecureStore/default WebView exclusions in the legacy, cloud-backup and device-transfer XML. Resource-table IDs resolve the optimized binary XML paths. [Source, APK hash and evidence location](2026-10-17-current-status-and-open-issues.md#20-october-review--baseline-repair-and-bounded-controller-refactor). This supersedes only the packaged-rule inspection gap above; actual cloud backup/restore, device transfer, ownership/key/version recovery and broader #37 acceptance remain open.


## Current inventory and trial boundaries — 2 November 2026

The [maintained durable-data inventory](../architecture/local-first-implementation-plan.md#durable-data-and-portable-backup-inventory--22-october-2026) now reflects v1–v5 manual archives and current stores. System eligibility differs: normal app databases/document files can include owner/selection registries, pending recovery and local diagnostic files; SecureStore Help/chart/reminder settings are excluded alongside saved credentials, as are default WebView sessions. Cache/no-backup paths are disposable. Eligibility does not prove restored ownership, key independence or consistency. No configuration/processing policy changed here.

[Current Android Auto Backup guidance](https://developer.android.com/identity/data/autobackup), checked 2 November: cloud backup uses a private Google Drive app area, retains the latest dataset and has a 25 MB per-app/user quota; excess data is not backed up to the cloud. Scheduling depends on device backup settings, time since backup, idle/network conditions. Client-side encryption depends on supported Android and device screen-lock capability; the current XML does not add an encryption-capability condition. Device-to-device transfer is a separate setup/transport path with its own rules; cloud timing/quota observations do not establish transfer behavior. Both need actual destination/platform evidence.

**Trial gate:** no selected cloud transport/destination or transfer-partner device is recorded for this package. A local synthetic backup-manager transport can exercise file mechanics but cannot close actual cloud/transfer or destination/protection acceptance. An emulator recovery snapshot is also not an Android Auto Backup trial. Before destructive isolated trials, preserve originals and use a synthetic app/user dataset; verify included files/SQLite and excluded secrets, fresh provider login, owner/book isolation, pending-state safety and version boundaries separately on each selected path. Do not use a private/provider AVD or introduce an unrelated Google account without selection.

Source/docs checks only; no app build, device, cloud account or transfer was run for this follow-up. #37 remains open for actual transport/restore/replacement-device acceptance, with #21/#16/#34 owning their corresponding privacy/identity/version gates. The wording correction to manual backup disclosures is tracked separately in the [backlog report](2026-11-02-backlog-execution.md#backup-inventory-and-exclusion-wording--2-november-continuation-293431).

# Compact Cockpit implementation and verification — 24 October 2026

Delivered under [#61](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/61), M4/R04/R12, FL-03/10/11, E07/E09. [Approved contract, preserved route inventory and data limitations](../product/design/compact-cockpit.md). [Original approved reference](../product/design-sources/2026-10-24-compact-cockpit/reference.jpg) is saved unchanged. The original app logo bytes match the pre-change source.

The app now uses a compact logo/wordmark toolbar, adjacent Sync/Profile controls, conditional saved/sync status, unified photographic season card, current/prior metrics, latest-flight navigation, Medical/paper tiles and compact club header above its retained duty body. Shared midnight/teal tokens and outlined symbols carry through existing routes. Season selection opens Statistics in the same year. Enlarged text stacks the two tiles and permits horizontal metric scrolling. Existing provider, persistence, offline, account/book, backup/import/export and recovery architecture remains in place. The provisional target is an isolated local UI preference, not a provider or flight mutation.

## Verification

| Check | Measured result and scope |
| --- | --- |
| Host | c643d9d application/test inputs: **1,013 mobile/SQLite tests, 114 Python tests**, TypeScript, lint and fixture parity pass. Local logs: `build/host-checks/20261023T235018Z-c409f67d/` and `build/compact-cockpit/host-published.log`. No model calls. |
| Meaningful regressions | Confirmed empty-season versus unknown coverage, known zero/unknown durations, selected/prior year, financial-value exclusion, provisional target parsing, account/year isolation, write failure and restart, exact flight/statistics routes, preserved processing reuse, contextual Back and scoped activity advice. Existing source/auth/library/backup/sync coverage is reused. |
| Build/export | Committed-source Release **c643d9da076d588675eecbc690a94c619e9528a0**, embedded Hermes JavaScript, ARM64/x86_64; total 61.625 s. Android/iOS Hermes exports pass in the isolated builder at this source. iOS export is not iOS runtime acceptance. |
| Final APK native | c643d9d: Android API37 x86_64, 390×900 dp, density160/font1. Five actual tabs and selected states, profile, populated synthetic overview/statistics/aircraft, flight list/detail/filter, AI keyboard and unavailable-service draft retention pass. The installed APK was pulled back and its SHA256 matches the built artifact. |
| Responsive/state evidence | 010af4a covers 390/360×900 and 800×700 dp at density160/font1. 4974ae7 verifies corrected 360×900/font1.6 labels, stacked tiles, horizontal duty metric and vertical club scrolling; configured/unconfigured paper, unknown Medical, loading/read-error, sync warning/retry/completion and target 30 h save/offline restart/restoration to 25 h. Later c643d9d changes only scope the status advice and repair the Development statistics caption; the otherwise unchanged layout/state evidence is reused. |
| Documentation | Approved source/contract, handbook, roadmap acceptance map and current agent guidance aligned. The portable handbook now includes Compact Cockpit and embeds its reference. Ten focused handbook tests, generation freshness, local references and whitespace checks pass. |

All screenshot data is explicitly fictional Development-preview data, or an empty selected real-library UI. No real user records were modified for visual checks. Details and logs remain under ignored `build/compact-cockpit/`; the [sanitized summary](assets/2026-10-24-compact-cockpit/summary.json) records source/hash/viewport provenance.

**Native tooling limit:** normal-motion sync progress was directly screenshot-reviewed because its pulse prevented UIAutomator from settling. The visible completion control returned to idle; host tests verify busy/disabled and duplicate admission. A font-setting Activity recreation required reopening the preview. A transient handbook export write failed during verification; regeneration and freshness checking subsequently saved all outputs. These limits are not silently counted as successful hierarchy assertions.

The task-owned emulator used a read-only `MoFlight_Synthetic_API37` overlay. Original display/density/font/animation settings were restored and compared, then the owned emulator stopped and was independently confirmed absent. The underlying AVD and provider sessions were preserved. No paid service, hosted native run, credentials or private fixture publication.

## Screenshots

[Overview](assets/2026-10-24-compact-cockpit/overview.png) · [Statistics](assets/2026-10-24-compact-cockpit/statistics.png) · [Flights](assets/2026-10-24-compact-cockpit/flights.png) · [Profile](assets/2026-10-24-compact-cockpit/profile.png) · [360 dp enlarged text](assets/2026-10-24-compact-cockpit/large-text.png) · [800 dp landscape](assets/2026-10-24-compact-cockpit/landscape.png). Development scaffolding is intentionally visible; these images do not impersonate a user's saved records. The summary identifies the source of each image.

## Remaining limitations

Required annual duty hours are unavailable: captured Pflicht/Geleistet are EUR. The configurable 25 h fallback always says **Soll vorläufig**; unknown completed hours stay —. The local target is excluded from MoFlight's manual backup archive. Club location remains **Ort unbekannt** and the reused thumbnail is decorative. Real paper setup is still in preparation; configured synthetic books and proof tools remain accessible under Development, and the configured tile was tested synthetically.

Physical-phone UI, iOS runtime, a fresh live-provider sync/second account and spoken screen-reader acceptance were **not tested in this package**. Existing retrieval/storage safeguards and their prior evidence are retained; the UI checks do not reaccept every provider/source or native backup round-trip. No complete-history, medical-fitness or production-paper activation claim is made.

## Delivery

[Download Android APK ZIP](https://github.com/MomoRC-tech/MoFlight-App-framework/releases/download/compact-cockpit-2026-10-24-c643d9d/MoFlight-Android-c643d9d.zip) — actual APK source **c643d9da076d588675eecbc690a94c619e9528a0**. Development-signed Release lab build. The ZIP contains exactly the APK and sanitized `build-info.json`; anonymous public download, entries, source and both checksums were verified.

APK SHA256: `e33edc9b8e33ff611f82fe3023f91a80940500108313976b4ff90ea87ff36c8c`. ZIP SHA256: `956dbf0c0d9f990cc79cb7d302461b2daf1be9782083338fc6a74bceb195a932`. Later documentation commits do not change this APK source.

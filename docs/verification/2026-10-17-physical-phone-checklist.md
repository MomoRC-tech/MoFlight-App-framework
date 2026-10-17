# Updated physical Android retest — 17 October 2026

Status: **Physical retest deferred by Manuel; outcomes pending**. On 17 October Manuel confirmed Android 17 and said he does not want to test more right now. No further test request is needed until he resumes testing. M1 preparation under [#8](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/8#issuecomment-6231139305), coordinated with #5. This checklist supersedes the [16 October checklist](2026-10-16-physical-phone-checklist.md) for the updated demo; retain that earlier document as history.

## Candidate and prerequisites

- APK: `local-data/phone-demo/MoFlight-demo-2026-10-17-arm64.apk` (ignored local file), **30,623,626 bytes**.
- SHA-256: `b5a9cfc41c949edb97a4634234fe83396183c10a79b367cbe799ecaebca1d4b7`.
- Application source: `db15203628abcc0bed5104b2fcb522dbf91d1968`; package `de.momorc.moflight.lab`, version 0.1.0/code 1. The visible version alone cannot distinguish this demo from its predecessor; record which APK was installed.
- Intended tester/device: Manuel, Google Pixel 6a; Android **17**, tester-reported on 17 October. Updated APK installation and detailed outcomes remain unconfirmed.
- Install manually as an update. Signing continuity is recorded in the [native verification](2026-10-17-native-shell-corrections.md#arm64-handoff). If installation fails, retain the error before considering another action; do not uninstall or clear storage merely to update.

Use the existing synthetic library. Do not load fixtures over personal data or alter provider sessions. If no synthetic library is available, report that prerequisite as missing. No provider login is needed.

## Manual checks

Mark each **PASS / FAIL / NOT TESTED**, with a short failure reproduction. Results remain **PENDING** until supplied by the tester.

| Check | Action and expected observation | Result |
| --- | --- | --- |
| Header | Scroll Übersicht: the compact logo header and top-right profile control remain pinned and usable. | PENDING |
| Five tabs | Open Übersicht, Flüge, Flugbuch, Verein and AI; labels and content remain reachable. Open a saved flight's details and return. | PENDING |
| Flugbuch | Open the existing selected-book/paper tools, then return without changing paper progress. | PENDING |
| Rings | Both compact segmented season rings and their labels are readable. Shares reflect the selected synthetic data; unknown time stays qualified. | PENDING |
| Profile | Note the original local display name. Save a temporary name through Profil & Einstellungen after returning from Flugbuch. Close/reopen the app and check persistence, then restore the original name through UI. | PENDING |
| Keyboard/layout | Focus flight search and the AI composer. Check keyboard-safe actions, scrolling and all five screens with enlarged text and landscape if practical; restore original settings. Record configurations actually checked. | PENDING |
| Offline restart | With no unsaved operation, note the selected book and saved flights. Record current network settings, enable airplane mode and ensure Wi-Fi/mobile data are off; force-stop via Android App info without clearing storage, then reopen. Local book/flights remain available. Restore original network settings. | PENDING |
| Unavailable services | Verein/weather, cloud authentication and backend AI remain visibly unavailable/unconnected; local deterministic questions are distinguished from generated AI. | PENDING |

## Concise reply template

```text
Test date / device / Android version:
Installed file: updated 17-Oct APK / previous APK / unknown
Display dp / density / font scale: measured values, or unknown
Header:
Five tabs / flight details / Flugbuch tools:
Rings:
Profile after restart (original name restored):
Keyboard / enlarged text / landscape (actual configurations):
Offline restart (network settings restored):
Unavailable states:
Failure steps / screenshot if available:
```

Unknown display measurements may stay unknown; do not infer logical dp or font scale from the model name. A short reply may mark unattempted checks **NOT TESTED**. The previous demo's quick test does not transfer to this APK.

## Acceptance and preparation evidence

Record actual observations under #8 and in a dated verification result; track reproducible regressions. Missing checks remain open. This bounded retest does not close the broader #8 auth/sync/live/iOS criteria or full M1 acceptance. Subsequent authorization: Manuel explicitly selected the [bounded connection/controller PoC](../product/2026-10-17-connection-controller-poc.md) ahead of this deferred retest; that scheduling exception does not pass or waive physical acceptance.

Preparation on Windows/PowerShell at repository `680871c`: read AGENTS.md, README, roadmap, provider proposal and current #2/#5/#8 bodies; independently reviewed acceptance evidence. Live remote main matched local main; working tree was clean. Recomputed the local APK's byte count and SHA-256 above. Application paths have no diff from tested `db15203`. Existing 136-test/71-checkpoint evidence was reviewed, not rerun. No phone, emulator or provider session was accessed. Documentation links and scoped whitespace are checked with this change; no new native or physical pass is claimed.

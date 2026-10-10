# Development tools and software

Updated: 2026-10-10. This inventory records the current tool roles and the recommended desktop workflow discussed with Manuel. It does not approve new services or claim that his local PC has been configured.

## Development and project record

| Tool / software | Purpose in MoFlight | Current status |
| --- | --- | --- |
| ChatGPT project | Main conversational development interface: requirements, architecture, decisions, implementation coordination and review. | In use; conversations supplement the versioned repository. |
| Local Codex in the ChatGPT desktop app | Edit the local checkout, execute builds/tests, investigate failures and maintain code/documentation through local tools. | Recommended Windows workflow; actual local folder, shell and SDK access still need verification. |
| Computer Use | Operate accessible desktop windows and visually inspect emulator UI, layout and file-picker flows. | Optional supplement; plugin availability, local permissions and accessible apps must be checked. Native desktop control is unavailable in the current cloud session. |
| GitHub | Authoritative code, README, ADRs, Issues and verification evidence. Changes go directly to main through traceable commits, without PRs. | In use. |
| Git | Local version history and synchronization with GitHub. | Required for the desktop checkout. |
| GitHub Actions | Automated checks, standalone Android APK compilation and emulator acceptance with retained reports/screenshots. | In use; see current verification evidence below. |
| VS Code | Optional TypeScript editor, navigation, refactoring, Git-diff review and configured debugging; can also host the Codex extension. | Optional; not required to build or test through local Codex. |

## Mobile development and testing

| Tool / software | Purpose in MoFlight | Current status |
| --- | --- | --- |
| Expo + React Native | Shared Android/iOS application foundation and native feature integration. | Approved initial native lab; pinned Expo 57.0.27 / React Native 0.86.3. |
| React + strict TypeScript | UI components, typed application logic and reusable pure domain modules. | In use; React 19.2.3. |
| Node.js + pnpm | Execute development tools, install pinned dependencies and run monorepo commands. | In use; Node 24 (tested 24.19.0), pnpm 11.25.0. |
| Metro | Serve JavaScript during normal development and support Fast Refresh. | Development builds depend on Metro; offline acceptance uses embedded JavaScript. |
| Android Studio | SDK/device management, emulator access, Logcat and native Android diagnosis. | Recommended desktop setup; not verified on Manuel's PC. |
| Android SDK | Platform libraries and build tools needed to compile Android apps. | Used in CI; required for local Android compilation. |
| Android Emulator | Disposable virtual Android devices for automated and visual checks. | Used in CI with API 35; recommended locally. |
| ADB / Android SDK Platform Tools | Install/launch/stop the app, obtain logs/screenshots and drive the Android test harness. | Used by the existing harness; local device access must be verified. |
| JDK 17 + Gradle | Execute native Android compilation and package APKs. | Used in CI; required by the current local runbook. Use the generated project's Gradle wrapper. |
| Pixel 6a / Android 17 | Physical-device acceptance, including readability, offline restart and native file selection. | Bounded manual offline/query/snapshot pass reported; full physical-device acceptance remains open. |
| Python 3.12 | Independent reference calculations, fixture checks and Android automation scripts. | In use. |
| Xcode + iOS Simulator | Native iOS compilation and runtime acceptance on macOS. | iOS execution not yet verified; Windows does not replace the macOS toolchain. See runbook for compatibility requirements. |

Native Android/iOS folders are generated and ignored. Durable native configuration belongs in Expo configuration/plugins rather than untracked edits to generated folders. The initial lab is separate from the future independently released learning and logbook apps.

## Data, backend and AI

| Tool / software | Purpose in MoFlight | Current status |
| --- | --- | --- |
| expo-sqlite / SQLite | Phone-local datasets, imported evidence, record revisions, findings/decisions, paper state and fixed writing snapshots. | Implemented; expo-sqlite is the sole native runtime database writer. |
| Expo file, sharing and document-picker modules | Private files, external synthetic backup export, folder selection and restore into a new database. | Implemented; Android emulator checks passed. Full physical-phone/iOS verification remains open. |
| Supabase Cloud Free | Selected early feasibility trial for Auth/user recovery, RLS-protected Postgres, private Storage and authenticated server functions; later cloud integration. | SQL/probe preparation exists; hosted verification blocked on disposable project/two-user access. No deployed backend is claimed. |
| OpenAI API | Planned server-side handwriting observations and tutor generation, behind authenticated validation and budget controls. | Not integrated or exercised; no paid calls authorized. |
| RAG / retrieval tooling | Retrieve permitted versioned learning material and supply evidence for tutor answers. Postgres full text/pgvector is a candidate, not a settled deployed implementation. | Planned retrieval-first evaluation; no completed RAG acceptance. |
| Vereinsflieger.de integration | Authorized own-flight retrieval; later discovery of other supported information such as instructor rosters. | Supported transport/documentation unresolved; current fixtures use synthetic CSV, not live access. |
| PowerSync | Possible future offline synchronization SDK. | Deferred; not required or implemented for the current milestone. |
| EAS / paid cloud-build services | Optional external build/distribution tooling if adopted later. | Not configured or required for local/CI lab builds. |

The current lab uses synthetic data and local storage. SQLite and JSON backups are unencrypted. Dataset separation is not authenticated cloud-account isolation. Cloud identity, live retrieval, handwriting analysis, RAG and cross-device synchronization need independent evidence.

## Recommended desktop workflow

1. Clone the repository and open its folder in a local Codex session in the ChatGPT desktop app. Verify local file and shell access before assuming any desktop control.
2. Configure the pinned Node/pnpm/Python tools, Android SDK and JDK; start a disposable emulator through Android Studio.
3. Let Codex run the existing build and test commands through shell/Gradle/ADB. Use the embedded-JavaScript offline build for force-stop/restart acceptance.
4. Use Computer Use for visual inspection when available. Under Windows it operates in the foreground; do not use the same desktop input concurrently.
5. Repeat relevant manual acceptance on the Pixel 6a. The automated harness must not clear physical-phone data.
6. Record actual environment, source commit, outcomes and limitations in GitHub. Keep real flight data and secrets out of commits.

VS Code can be added whenever Manuel wants convenient code navigation, manual edits or diff review. It does not by itself increase an agent's device access. If the desktop app cannot provide local folder/shell access, use Codex CLI or the VS Code extension with the same checkout. ChatGPT conversations remain useful for coordination; a new local session must read repository documentation rather than assume it has the full conversation history.

## Runbooks, decisions and evidence

- [Central README](../../README.md)
- [Platform-lab setup, builds and acceptance](../../apps/platform-lab/README.md)
- [Accepted initial stack and remaining proposals](../adr/0002-phase1-technology-proposal.md)
- [Local-first sequencing](../adr/0004-local-first-sequencing.md)
- [Native lab checks](../verification/2026-10-08-native-lab.md)
- [Android offline and physical-phone evidence](../verification/2026-10-09-android-offline.md)
- [21-check Android copy/backup evidence and local-PC handoff](../verification/2026-10-10-android-copy-backup.md)
- [Supabase trial preparation](../../pocs/supabase-trial/README.md)
- [Supported Vereinsflieger access investigation](../architecture/vereinsflieger-access-investigation.md)

Official desktop capability references reviewed during the 2026-10-10 discussion: [Windows local execution](https://learn.chatgpt.com/docs/windows/windows-sandbox), [Computer Use setup and foreground limits](https://learn.chatgpt.com/docs/computer-use). Availability does not establish access in a particular session.

Documentation verification: roles, versions and status checked against the current central README, lab runbook and ADR 0002; relative link targets checked before publication. This documentation change does not execute builds or establish new desktop/device passes. User request: document the tools/software overview, 2026-10-10. Existing tooling and verification work remains tracked in Issues #5/#6; no new implementation task or architecture decision is introduced.

# Local phone storage first, with early Supabase feasibility

Date: 2026-10-08. Owner: Manuel Singer. Status: selected sequencing under [ADR 0004](../adr/0004-local-first-sequencing.md); Expo/React Native/strict TypeScript/pnpm and expo-sqlite as the initial native-lab writer are now approved; detailed sync/protocol choices remain proposed. Supabase Cloud Free remains the first cloud candidate selected in ADR 0003; later self-hosting remains optional.

## Why change the order

The first logbook workflow can be exercised against phone-local data without requiring remote account sessions, email configuration, private-bucket uploads or synchronization. This reduces dependencies while testing persistent paper/import state, matching, remembered decisions and statistics. It does not remove handwriting-analysis, source-access or exact-presentation risks, and local success cannot prove cloud isolation/recovery.

Local SQLite was already planned. Build it as the initial persistence path behind a small storage boundary, not as a throwaway alternative database. Preserve stable flight/input/decision IDs, explicit dataset ownership, revisions, source references, time basis and tombstones from the beginning. Add only the abstractions needed by the first vertical slice; do not implement a general sync engine or parallel cloud/local application stacks.

## Revised priorities

| Priority | Deliverable / existing Issues | Required evidence |
| --- | --- | --- |
| 0 | Minimal platform-lab and runner, #6; finalize necessary mobile choices in #5 | Locked tooling, install/build evidence and truthful per-device status. |
| 1 | Local SQLite/files persistence, #4; session/decision model #7; query fixtures #9 | Import a synthetic CSV, retain a synthetic page observation, save one finding/response and paper state; restart/offline queries preserve results. No cloud account required to start the lab. |
| 1, same early cycle | Independent Supabase Cloud Free feasibility, #1/#5 plus #7 privacy probe | Two synthetic cloud users; real confirmation/recovery, private DB reads/writes, negative RLS/reference tests, bounded private-file access, authenticated server boundary, actual quota/configuration and pause/restore runbook evidence. Does not persist the main app dataset yet. |
| 1, next priority | Browser-based own-flight retrieval feasibility, #2 | Browser direction confirmed; next prove native in-app login, remembered session, bounded retrieval against reference and session/account behavior. ADR 0006 implementation details remain proposed; official API is future-only. CSV/local success does not pass this gate. |
| 2 | Local continuation, writing template and statistics, #7/#9 | Deterministic matching/roles/totals, remembered decisions, exact readable in-app page/row/field instructions and offline reopening, aircraft/person queries and supporting flights. Local backup/restore preserves data/assets/snapshots. |
| 2, independent | Handwriting/source risks, #7/#2 | Test actual photo analysis only under a separately approved budget; prepared observations do not pass this gate. Live access remains separately verified. |
| Later, optional | File output, #7 | Select useful PDF/HTML/image/other exports only if needed. Inspect reference code/schema before reuse; demonstrate actual runtime and parity with the in-app snapshot. |
| 2, independent | SPL retrieval/RAG feasibility, #3 | Small permitted corpus and measured retrieval/citations; paid generation remains separately gated. |
| 3, after early cloud gates | Account linking, Supabase persistence/upload and bounded sync, #1/#4/#7 | Explicit local-to-account migration, private upload, offline retry/conflict/deletion/version behavior, second-device convergence and no data loss. |
| 4 | Shared modules/two shells and integrated device acceptance, #8 | Preserve all existing framework requirements; complete Android/iOS/cloud/live evidence rather than treating local-only success as full acceptance. |
| Later | Broader Vereinsflieger information discovery, #10; historical product expansion | Evidence-backed supported capabilities/permissions and scoped use cases; no roster/API claims before discovery. |

“Same early cycle” means the cloud trial starts before a full local product or broad schema is built. This document cannot run agents concurrently; tasks may progress independently without making the main local workflow await all cloud setup. A failed Auth/private-file/availability gate triggers architectural review before substantial cloud-dependent implementation. Do not defer Supabase evaluation until the app is feature-complete.

## First local slice

Use one local profile/dataset identity and stable record IDs; the first lab need not require MoFlight cloud login. It still keeps profile/data/file boundaries so later account linking cannot mix users. Credentials or a local dataset ID are never accepted by the future backend as authenticated ownership.

Use synthetic inputs: a CSV export, manually specified page observations, an ambiguous finding with one user response, a saved confirmed paper anchor and a small aircraft/person query fixture. Clearly label prepared observations as a substitution for handwriting recognition. Preserve source rows and relevant evidence; repeat identical import/decision processing without creating new flights or repeated questions. Restart the process in airplane mode and verify persistence with actual SQLite/files, not an in-memory mock.

Add a private user-controlled backup/export package with schema/version, source snapshots, observations, decisions, paper state and required file bytes. Restore into a clean local profile and compare IDs/data/hashes. Device-local storage alone does not provide backup or cross-device access; deletion, app uninstall or device loss can lose data unless a backup exists. Avoid claiming encryption until driver/platform support is tested.

## Early Supabase trial boundary

Run a small separate lab/schema with synthetic accounts and records, using the selected Cloud Free mode. Verify actual email recovery and private row/file access, not only documentation or anonymous reads. Select/check a free SMTP arrangement for ordinary users; keep secrets off the device/repository. Prove an authenticated server command/function boundary without paid AI.

Record commands/configuration, provider/version, expected/actual results, limits and blocked steps. Test client behavior during unavailable service and capture owner restoration/probe monitoring as appropriate; do not claim guaranteed pause prevention. No service is provisioned by this documentation change. Neither a passed cloud lab nor local-first sequencing authorizes paid plans or AI.

## Later account linking and synchronization

When the cloud gates pass and integration is selected, the pilot explicitly chooses which local dataset to link to the authenticated account. Use a validated migration mapping plus authenticated server checks; do not overwrite an existing account's data, silently reassign ownership or clear pending local work. Same-account retry preserves IDs/receipts; changing account preserves the original dataset and requires deliberate selection.

Define identity mapping, transactions, conflict behavior and rollback before migration. Then implement one durable SQLite outbox and bounded push/pull, transactional cursor updates, change sequences, version checks, tombstones/stale reset and file lifecycles. A staged local-first milestone does not remove the original same-account/two-device/isolation requirements or adopt PowerSync.

## Writing-template and AI boundaries

Local persistence does not imply direct paid AI requests from the app or putting provider keys in a phone. AI calls remain behind an authenticated, budgeted server boundary when approved. The first local slice uses prepared observations; actual handwriting recognition is an independent risk trial.

The initial output is a user-friendly in-app writing template, not necessarily a file. Persist one resolved snapshot and show exactly what belongs in each paper page/row/field, with existing context distinct from new writing. Verify readability and offline reopening on the device under the [presentation contract](../product/writing-template-presentation.md); showing the template never marks entries as copied.

PDF or other downloadable formats are optional later work. Any renderer must consume the same fixed snapshot and pass content/placement parity checks. The existing Python renderer is reference material pending inspection; it does not automatically run on Android/iOS or an Edge Function. Test runtime/hosting only if reuse is adopted. No export worker is a prerequisite for the first local workflow.

## Current status

The [platform lab](../../apps/platform-lab/README.md) now includes the approved Expo app and pure TypeScript/SQLite slice, with exact synthetic queries, remembered decisions/paper state, fixed in-app row instructions and native backup/restore wiring. Ten TypeScript/real-disk-SQLite checks and the 20-test host reference pass; both native bundles/configurations generate. [Native evidence](../verification/2026-10-08-native-lab.md) separates these checks from untested device behavior and reports CI compilation separately. [Android runtime evidence](../verification/2026-10-09-android-offline.md) now adds standalone APK compilation and seven actual emulator checkpoints, including native SQLite/file-backed selection and same-snapshot airplane-mode restart. [Expanded Android evidence](../verification/2026-10-10-android-copy-backup.md) adds all 21 native checks, including selective copy, external backup, real picker restore/restart, invalid-import preservation and full byte-for-byte re-export. Pixel 6a / Android 17 has a bounded user-reported offline pass. Physical-phone copy/picker, iOS and full readability remain open. The independent [Supabase schema/probe](../../pocs/supabase-trial/README.md) remains blocked without project/two-user access; [own-flight investigation](vereinsflieger-access-investigation.md) now verifies interactive browser login/list and provider REST key/limit guidance; native retrieval and browser/export distribution terms remain unresolved; REST specification work is parked. Manuel prioritized this feasibility work on 2026-10-10; [ADR 0006](../adr/0006-vereinsflieger-connector-proposal.md) records Manuel's confirmed browser-route priority and proposes the bounded phone-local WebView/export trial. The [connection/retrieval journey](../product/vereinsflieger-connection-and-retrieval.md) distinguishes session reuse from optional saved credentials; the official API might work in the future only and does not gate this trial. Supabase Cloud Free stays selected; ADR 0002/0005 record mobile approval without approving sync.

## Official reference checks

Checked 2026-10-08. Expo is approved for the initial lab. These documented capabilities remain separate from actual device/runtime validation.

- [Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/): documents Android/iOS SQLite access, persistence across app restarts and prepared queries. Native driver/encryption/build behavior must still be tested.
- [Supabase React Native Auth guide](https://supabase.com/docs/guides/auth/quickstarts/react-native): reference for the separate early account/session trial.
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security): reference for independently tested authenticated ownership boundaries.


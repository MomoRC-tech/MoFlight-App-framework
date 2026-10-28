# Local phone storage first, with early Supabase feasibility

**Sequencing superseded — 2026-10-13:** the [project plan](../project-plan.md) is authoritative for current priorities and next actions. M1 defines the basic UI/application contract before service expansion, then M2–M4 cover retrieval, live history and analytics; the original writing/chat/cloud/SPL sequence is historical. Local AI chat foundations are now implemented; remaining activation and later journeys follow the current roadmap. The older priority table and October 10/11 sequences below preserve rationale and outstanding feasibility obligations, not active scheduling. Accepted local-first, ownership, deterministic/AI and validation boundaries remain applicable; proposed ADRs remain proposed.

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
| Current discovery; implementation later | Vereinsflieger website/manual discovery, #10 | [Authenticated findings](../verification/2026-10-10-vereinsflieger-discovery.md); resolve export/coverage and roster questions without broad feature implementation. |
| Before canonical live import | Multiple pilot-owned books and format boundary, #11 | ADR 0007 review and [proof/migration plan](multiple-logbooks-proof-plan.md); independent paper state, shared-source identity, safe backup migration. |

“Same early cycle” means the cloud trial starts before a full local product or broad schema is built. This document cannot run agents concurrently; tasks may progress independently without making the main local workflow await all cloud setup. A failed Auth/private-file/availability gate triggers architectural review before substantial cloud-dependent implementation. Do not defer Supabase evaluation until the app is feature-complete.

## First local slice

Use one local profile/dataset identity and stable record IDs; the first lab need not require MoFlight cloud login. It still keeps profile/data/file boundaries so later account linking cannot mix users. Credentials or a local dataset ID are never accepted by the future backend as authenticated ownership.

Use synthetic inputs: a CSV export, manually specified page observations, an ambiguous finding with one user response, a saved confirmed paper anchor and a small aircraft/person query fixture. Clearly label prepared observations as a substitution for handwriting recognition. Preserve source rows and relevant evidence; repeat identical import/decision processing without creating new flights or repeated questions. Restart the process in airplane mode and verify persistence with actual SQLite/files, not an in-memory mock.

Add a private user-controlled backup/export package with schema/version, source snapshots, observations, decisions, paper state and required file bytes. Restore into a clean local profile and compare IDs/data/hashes. Device-local storage alone does not provide backup or cross-device access; deletion, app uninstall or device loss can lose data unless a backup exists. Avoid claiming encryption until driver/platform support is tested.

## Android system backup — approved 20 October 2026

Manuel explicitly selected allowing user data to participate in Android phone system backups and requested configuration implementation under [#37](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/37). `allowBackup=true` and app-owned exclusion-only rules retain default file/database/preferences coverage, including eligible locally saved flights, source evidence and settings. Exclude SecureStore and default WebView session storage; require provider sign-in again after recovery where needed. This supersedes the earlier disabled Android backup policy; iOS remains unchanged/deferred.

Phone backup settings, platform scheduling/quotas and restore compatibility still apply. Enabling backup does not establish end-to-end recovery or freshness. Keep independent versioned portable backups (#29), compatibility (#34), account isolation (#16) and actual Android restore/device-transfer acceptance (#8/#37) explicit. [One package verification summary](../verification/2026-10-20-android-system-backup.md).

## App updates and backward compatibility — required before first beta

**Requirement selected by Manuel, 19 October 2026; [#34](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/34).** App updates must preserve local user data and support earlier saved data no later than the first beta test phase (Checkpoint A). The 22 October package below adds the bounded format matrix, unsupported-version preservation regression and an empty-library signed Android update witness. Full populated beta/skipped-version acceptance remains pending; this does not approve production schemas or a migration mechanism.

Preserve all durable state across an in-place update: profile/settings, each account/dataset and book, flights and raw source evidence, attachments, assignments, decisions/acknowledgements, paper progress/frozen snapshots and pending unsynchronized changes. Retain stable IDs, ownership, relationships and exact values. Routine updates must not require uninstalling, clearing storage, reimporting flights or a cloud connection to recover existing local work. A user-exported backup is an additional safeguard, not a prerequisite for a lossless routine update.

Backward compatibility here means a newer release can read or safely migrate supported earlier app/schema/backup formats, including supported skipped-version upgrades. Before beta, publish the starting-version and format matrix and decide whether existing development installations are included. Arbitrary older binaries opening newer schemas (binary downgrade) are a separate unresolved support choice. Unsupported newer/older or corrupt formats must preserve originals and provide a clear recovery path; never silently reset, delete or replace existing data. Prevent incompatible writers from modifying retained data.

Design version detection, migration and recovery before changing persistent formats. Failed or interrupted migration must leave recoverable originals, avoid selecting incomplete state and allow safe retry without duplicate effects. Preserve app identifiers, signing continuity and storage locations, or verify a deliberate transition. Coordinate persistence/versioning with #4/#11, packaging with #6, provider ownership with #16 and the complete backup inventory with #29. These are required outcomes; the concrete design remains to be reviewed.

**Acceptance before beta handoff and subsequent supported beta updates:** compare populated historical synthetic fixtures before/after every supported migration path, including skipped releases, multiple accounts/books, attachments and unsynchronized work. Inject interruption, repeated execution, storage/write failures and malformed/unsupported formats; verify preservation and recovery. Test supported older-backup restore without replacing valid data on failure. Then perform actual signed old-release → new-release in-place updates on each beta target platform and verify offline restart, settings, queries, attachment hashes, pending work and isolation. Host tests, clean installs and backup round-trips alone do not establish update acceptance; Android does not establish iOS. Record versions, environment, exact checks and limits in one package summary linked from #34 and the roadmap acceptance map. No update/migration acceptance is claimed by this documentation change.

## Durable-data and portable-backup inventory — 22 October 2026

**28 October reconciliation:** the original inventory is extended below for current AI, targets, Help and Sync recovery. Manual archive is v3 (v1/v2 readers retained), text-only and same-install/same-owner by the 25 October decision. This is source inspection, not new restore/update acceptance. Manuel subsequently selected inclusion of own financial data for #101 and manual text backup/restore. Current v3 still excludes these records; the planned explicit compatible extension must preserve v1–v3 reading and old-archive absence semantics, not silently change v3.

Approved bounded inventory/proof package: #29/#34. This describes the implemented lab; it does not select a new full-user backup format, encryption mechanism or production schema. Ordinary updates must preserve every durable row below even where portable export is incomplete.

| Durable data / owner | Current portable coverage | Update / restore boundary |
| --- | --- | --- |
| Account real-flight graph: source captures, current/prior facts, stable IDs, receipts, coverage and unresolved observations | Real-history v1 exports the selected validated graph; exact populated synthetic export/restore/re-export is tested | Preserve each candidate and owner relationship; restore into an isolated candidate, then validate before activation. Never overwrite the selected graph on invalid input. |
| Real owner registry, selected candidate, restore/selection history and unfinished command journal | Not a complete portable export; unresolved recovery blocks ordinary backup | Preserve all files, including unselected candidates and pending work. A backup is not a reason to reset an older read-only selection. |
| Raw provider evidence and separate own Medical/information stores, scoped by connection | Excluded from flight-only backup; the selected supported-user v1 archive includes allowlisted information/Medical, not every raw store | Preserve locally across updates; full-user portable coverage remains open under #29. Medical dates are source observations, not fitness decisions. |
| Synthetic pilot/books: sources, memberships, paper/decision/photo observations, pending state, frozen snapshots/entries | `moflight-pilot-proof-v1`; legacy `moflight-native-lab-backup-v1` has an explicit migration path | Synthetic proof only; real photo attachment lifecycle, production book activation and all-account full backup are not established. |
| Local display name, selected book/profile and selection journals | Supported-user v1 includes the selected pilot display name/book; flight/book-only backups and full registries retain their exclusions | Preserve local values/pointers; complete settings/all-account export and replacement-device mapping remain open. |
| Duty roster cache, including other assignees | Deliberately excluded; cache storage, 30-day expiry on next access | Never promote a missing/expired cache into an empty or complete roster. Refresh requires the selected source and fresh account/club scope. |
| Saved-login SecureStore and native WebView sessions | Deliberately excluded from portable and configured Android system backup | No credential export. A restored device may require original-provider login; preserved flights remain usable offline. |
| Local diagnostic journal/export | Separate deliberate support export; excluded from the proposed full-user package | Bounded technical diagnostics, no personal source values. Not required to reconstruct flight history. |
| Real-owner AI conversations/drafts and historical provider identity | Included since supported-user v2 and retained in v3; active protocol/enablement/server budgets excluded | Current owner/restore gates and interrupted-state recovery; ordinary populated/native paths remain #75/#29 |
| Provisional annual duty-hour targets | v3 includes selected owner/store/account years; v1/v2 preserve existing targets | Preserve explicit zero, unrelated years/accounts and interrupted restore; not provider-required hours |
| Contextual Help preference and seen-hint marker | Installation-scoped SecureStore values in `help-preferences-native.ts`; absent from manual archive | Inventory gap under #29/#34: preserve during supported update; explicitly decide/document manual-export exclusion versus extension before claiming all settings coverage |
| Interrupted Sync marker and optional-source completion | Owner/store SQLite recovery state; not part of manual archive | Preserve across updates/restart; never auto-resume a cancelled provider operation or treat a restored file as a fresh account proof |
| Financial ledger/invoice observations | Excluded by current v3; inclusion selected on 28 October for necessary own financial structured/text evidence in a compatible extension | #101/#29/#34 implement account/club identity, exact money/source relations, disclosure, older-version preservation and interrupted same-install restore. Attachment bytes, credentials and foreign-owner data stay excluded |
| Transient filters, reminder snooze and navigation state | No durable portable promise | No new persistence requirement is inferred from this inventory. |

Implementation references: [real native ownership/selection](../../apps/platform-lab/src/vereinsflieger/real-flight-native.ts), [real backup adapter](../../apps/platform-lab/src/vereinsflieger/real-flight-backup-native.ts), [current preservation tests](../../tests/mobile/real-flight-compatibility.test.ts), [Android system-backup exclusions](../verification/2026-10-20-android-system-backup.md). System backup eligibility is separate from a verified portable full-user backup and actual device-transfer acceptance.

### Bounded supported-format matrix

| Starting format / path | Current evidence and limit |
| --- | --- |
| Real-history SQL/payload v1 and real-history backup v1 | Current read/write and exact populated synthetic restore; interrupted writes/restore, restart/retry and no duplicate effects tested on real host SQLite. |
| Unsupported real-history SQL v2 or real-history backup v2; malformed/foreign input (separate from supported-user archive v2/v3) | Refuse opening/restoring; original database and command-journal bytes preserved. No reset or silent downgrade. |
| Legacy synthetic backup → pilot proof v1 | Existing explicit migration tests; not real production book migration. |
| Historical storage writers `766b719` / `20ade40` → `109d5a9` | Populated host read/recovery skips intermediate sources; current formats stay unchanged. Namespaced signed Android `766b719`→`109d5a9` preserves 15 files before reads, resumes recovery and reopens offline. Explicit synthetic fixture/entry overrides; not an ordinary registry/SAF or beta-platform matrix. |
| Signed Android `cf59bde` → current review-package Release | Bounded native in-place witness and offline reopening recorded in the [package report](../verification/2026-10-21-simple-flight-loading.md#review-continuation--22-october-2026). No format change in this package. |
| Supported-user archives v1/v2/v3 | Current readers accept these formats within the selected same-install/owner scope. v2 adds AI; v3 adds annual targets. Ordinary full populated native restore remains open; this is not real-history SQL v3. |
| Skipped beta releases, future schema migration, all development installations, binary downgrade and iOS | Not accepted. Select supported beta starting versions and exercise populated multi-account/book/attachment/pending-state paths before beta. Restoring a test's prior APK is cleanup, not downgrade support. |

### Selected populated-update proof — 24 October 2026

Manuel selected #34 with #29 only where recovery is needed and explicitly requested **no release**. The bounded matrix uses historical production modules from `766b719` and `20ade40` to write the same synthetic fixture, then current readers to reopen it without intermediate releases. This is an evidence matrix, not selection of all development installs as beta starting versions. Real history/payload v1, information SQL v1, command-journal SQL v1/v2, pilot proof v1 and supported-user archive v1 remain unchanged; no production migration/schema is introduced.

The fixture contains two real owner/store scopes, four synthetic books, source captures/receipts, memberships, saved decisions, frozen/confirmed writing, unsynchronized drafts, pending commands, Medical, display names, settings sentinels and two opaque attachment references/hashes. Files are isolated by an explicit proof namespace. The synthetic settings/attachment witnesses prove retention, not a production attachment lifecycle or complete portable inclusion. Owner/selection registry migration and ordinary app activation remain separate acceptance gates.

The recovered late-phase aggregate restore revalidates each store idempotently while retaining the furthest durable phase. Its journal still rejects backwards transitions. Existing command-journal v1→v2 migration gets rollback/retry verification with an injected write failure; malformed/foreign/newer inputs preserve original files. One combined host/native checkpoint and its exact limits are recorded in the [existing preservation report](../verification/2026-10-21-simple-flight-loading.md#populated-update-and-late-phase-recovery--24-october-2026). Android proof uses explicit test-entry overrides against historical/current storage modules; it is not ordinary UI, physical power-loss, real second-account, system-restore, downgrade or iOS acceptance.

## Early Supabase trial boundary

Run a small separate lab/schema with synthetic accounts and records, using the selected Cloud Free mode. Verify actual email recovery and private row/file access, not only documentation or anonymous reads. Select/check a free SMTP arrangement for ordinary users; keep secrets off the device/repository. Prove an authenticated server command/function boundary without paid AI.

Record commands/configuration, provider/version, expected/actual results, limits and blocked steps. Test client behavior during unavailable service and capture owner restoration/probe monitoring as appropriate; do not claim guaranteed pause prevention. No service is provisioned by this documentation change. Neither a passed cloud lab nor local-first sequencing authorizes paid plans or AI.

## Later account linking and synchronization

When the cloud gates pass and integration is selected, the pilot explicitly chooses which local dataset to link to the authenticated account. Use a validated migration mapping plus authenticated server checks; do not overwrite an existing account's data, silently reassign ownership or clear pending local work. Same-account retry preserves IDs/receipts; changing account preserves the original dataset and requires deliberate selection.

Define identity mapping, transactions, conflict behavior and rollback before migration. Then implement one durable SQLite outbox and bounded push/pull, transactional cursor updates, change sequences, version checks, tombstones/stale reset and file lifecycles. A staged local-first milestone does not remove the original same-account/two-device/isolation requirements or adopt PowerSync.

## Writing-template and AI boundaries

[ADR 0008](../adr/0008-logbook-ai-and-deterministic-boundary.md), accepted for boundaries/sequencing on 2026-10-11, specifies evidence-first capture and bounded AI proposals. Conventional code owns provider parsing, validated identity/matching, exact calculations and writing snapshots; AI can transcribe, interpret ambiguous text, propose matches and explain. Raw photo observations and provider facts stay separate. Whole-history LLM processing is an optional benchmark rather than the default pipeline.

Local persistence does not imply direct paid AI requests from the app or putting provider keys in a phone. AI calls remain behind an authenticated, budgeted server boundary when approved. The first local slice uses prepared observations; actual handwriting recognition is an independent risk trial.

The initial output is a user-friendly in-app writing template, not necessarily a file. Persist one resolved snapshot and show exactly what belongs in each paper page/row/field, with existing context distinct from new writing. Verify readability and offline reopening on the device under the [presentation contract](../product/writing-template-presentation.md); showing the template never marks entries as copied.

PDF or other downloadable formats are optional later work. Any renderer must consume the same fixed snapshot and pass content/placement parity checks. The existing Python renderer is reference material pending inspection; it does not automatically run on Android/iOS or an Edge Function. Test runtime/hosting only if reuse is adopted. No export worker is a prerequisite for the first local workflow.

## Historical implementation baseline — 8–10 October 2026

The paragraph below preserves the early lab checkpoint. Current implementation and acceptance are maintained in the [project plan](../project-plan.md), with the [22 October continuation](../verification/2026-10-21-simple-flight-loading.md#review-continuation--22-october-2026) covering the latest filtered query, duty guards and bounded preservation proof. Its remaining gates supersede older unqualified pending statements within that scope.

The [platform lab](../../apps/platform-lab/README.md) now includes the approved Expo app and pure TypeScript/SQLite slice, with exact synthetic queries, remembered decisions/paper state, fixed in-app row instructions and native backup/restore wiring. Ten TypeScript/real-disk-SQLite checks and the 20-test host reference pass; both native bundles/configurations generate. [Native evidence](../verification/2026-10-08-native-lab.md) separates these checks from untested device behavior and reports CI compilation separately. [Android runtime evidence](../verification/2026-10-09-android-offline.md) now adds standalone APK compilation and seven actual emulator checkpoints, including native SQLite/file-backed selection and same-snapshot airplane-mode restart. [Expanded Android evidence](../verification/2026-10-10-android-copy-backup.md) adds all 21 native checks, including selective copy, external backup, real picker restore/restart, invalid-import preservation and full byte-for-byte re-export. Pixel 6a / Android 17 has a bounded user-reported offline pass. Physical-phone copy/picker, iOS and full readability remain open. The independent [Supabase schema/probe](../../pocs/supabase-trial/README.md) remains blocked without project/two-user access; [own-flight investigation](vereinsflieger-access-investigation.md) now verifies interactive browser login/list and provider REST key/limit guidance; the later [Windows native trial](../verification/2026-10-10-windows-desktop.md) verifies bounded live raw retrieval and offline reopening. Canonical import, complete coverage and browser/export distribution terms remain unresolved; REST specification work is parked. Manuel prioritized this feasibility work on 2026-10-10; [ADR 0006](../adr/0006-vereinsflieger-connector-proposal.md) records Manuel's confirmed browser-route priority and proposes the bounded phone-local WebView/export trial. The [connection/retrieval journey](../product/vereinsflieger-connection-and-retrieval.md) distinguishes session reuse from optional saved credentials; the official API might work in the future only and does not gate this trial. Supabase Cloud Free stays selected; ADR 0002/0005 record mobile approval without approving sync.

## Official reference checks

Checked 2026-10-08. Expo is approved for the initial lab. These documented capabilities remain separate from actual device/runtime validation.

- [Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/): documents Android/iOS SQLite access, persistence across app restarts and prepared queries. Native driver/encryption/build behavior must still be tested.
- [Supabase React Native Auth guide](https://supabase.com/docs/guides/auth/quickstarts/react-native): reference for the separate early account/session trial.
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security): reference for independently tested authenticated ownership boundaries.


## Reviewed next sequence — 2026-10-10

Historical sequence, superseded by [M1–M5](../project-plan.md): initial analytics now precedes writing expansion, and basic UI review precedes additional services. Later visual polish remains separate from this early layout/contract review.

Proceed with #10 findings and unresolved export/roster checks, then review ADR 0007 and its bounded proof before enabling #2 canonical live imports. Finish one selected-book retrieval/review/writing/copy/backup journey before broad statistics, training, weather or tutor implementation. Early cloud/iOS risk checks remain independent. The present app is a development lab; final visual design follows functional validation, while book selection, confirmations and readability are validated throughout. No proposed ADR is accepted by this sequencing update.

## Logbook AI scheduling decision — 2026-10-11

Historical timing, superseded by the [project plan](../project-plan.md). AI/photo work is deferred; ADR 0008's evidence boundaries and evaluation prerequisite before completing real photo-to-writing remain in force.

Keep the current capture-first priority: verify relevant list/detail fields, source identity, missing states and coverage under #2; review/prove the #11 multi-book boundary before canonical import. Once the captured-field contract is stable, prepare synthetic photo/source cases and frozen expected results under #7 alongside canonical-import/reconciliation work. This preparation needs no API calls and can continue despite blocked live/cloud access.

Before completing the real photo-to-writing journey, perform the bounded handwriting/targeted-interpretation evaluation in ADR 0008. Prerequisites are permitted inputs, an explicit API budget and an authenticated validated server gateway; full cloud sync and visual polish are not prerequisites. Compare optional whole-history processing within that budget, measure omissions/matches/field errors/corrections/cost and integrate only validated proposals. Paid execution remains unapproved. Broader conversational history/query features come after the first complete selected-book workflow; optional interpretation never replaces exact local queries. ADR 0007 and production schemas remain proposed.

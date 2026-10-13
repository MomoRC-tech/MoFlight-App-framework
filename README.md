# MoFlight-App-framework

A reusable Android/iOS platform for multiple flight-related features or sub-apps, starting with a logbook helper and potentially an SPL tutor and gliding weather forecasts.

## Status and source of truth

**UI direction revision (2026-10-13):** Manuel rejected the two [initial Figma drafts](docs/product/2026-10-13-rough-figma-wireframes.md) as crowded, lacking a concept and a real navigation header. [Dark concept review](docs/product/2026-10-13-dark-concept-review.md) records his clean/dark/navigation references and an unselected isolated preview. Figma's Starter tool-call limit blocks edits there; no upgrade or spending change occurred. Prototype navigation was checked locally; product review and Figma transfer remain pending. No application implementation or milestone/order change.

**Next discovery step (2026-10-13):** explore user journeys, relevant features and feasibility, then compare rough UI concepts before fixing detailed contracts. [Guided discovery brief](docs/product/user-journey-ui-discovery.md) and [roadmap agreement](docs/project-plan.md#12-user-journeys-and-ui-concept-discovery--2026-10-13) distinguish proposed ideas from selected features and implementation scope.

**Discovery consolidation (2026-10-13):** [journey and information map](docs/product/2026-10-13-journey-information-map.md) records confirmed paper catch-up, swipeable flight summaries/detail/filters, manual retrieval periods, costs and club content. Reviewed-template entries will be assumed written, separately from confirmed evidence, then checked against the remembered last entry/photo at the next session; this supersedes the earlier mandatory completion prompt for the future product, not historical lab results. Review the map before further overall layouts. Activities live and billing inspection remain deferred; milestone order and implementation gates are unchanged.

**Agreed development workflow (2026-10-13):** define user journeys, sketch UI and application contracts together, review clickable prototypes, develop React Native screens against synthetic contract results, then connect and verify real operations incrementally. Figma Design is the main design workspace; Google Stitch is optional for exploration. Initial hypothesis: overview → filtered flights → flight detail and retrieval progress/failure examples; refine navigation through discovery. [Workflow, responsibilities and review boundaries](docs/project-plan.md#11-agreed-development-workflow--2026-10-13).

**Current priorities and next actions:** [MoFlight project plan](docs/project-plan.md), authorized 2026-10-13. Start with M1 basic UI wireframes and the application contract, then reliable retrieval, saved live history and initial analytics. Writing-template expansion, chat and other feature implementation are deferred. This roadmap supersedes conflicting older sequencing below; dated implementation/evidence records remain historical, and accepted responsibility/validation boundaries remain applicable.

2026-10-13 reset recovery follow-up: the first strategy-confirmed native default-origin export saved its capture but left cleanup pending because provider reset retained the last-20-flights period. `a4b2211` restores retained participation/relative period through original provider menus after structural reset, preserving existing journals and full verification. Strict TypeScript and 117 mobile tests pass. Its committed-source Android Release build recovered that existing failed journal with the saved capture unchanged; a fresh default-origin export also restored/verified successfully. The customized reserved backup survived and independently matches the original supported settings. Explicit native logout retains recovery and blocks exports; manual same-account sign-in/retry then restores and independently verifies the original view, with the saved capture unchanged. No recovery remains pending. No second authorized account is available for live account-switch testing; stable identity, natural expiry, broader page preferences and iOS runtime remain unproven. [Failure, correction and current evidence](docs/verification/2026-10-12-local-validation-and-provider-gates.md#2026-10-13-continuation-confirmed-reset-cleanup-failure).

2026-10-12 validation policy amendment: Manuel approved required documented local checks/builds/native trials with optional, manual-only hosted CI. Normal pushes no longer launch hosted runners. No paid CI, billing changes or increased spending limits are authorized. Hosted billing restrictions do not block scoped acceptance when the required local evidence is complete; live-provider, platform and feature-specific gaps still do. [Amended ADR 0009](docs/adr/0009-local-android-development-and-checkpoint-ci.md), [current validation continuation](docs/verification/2026-10-12-local-validation-and-provider-gates.md). Earlier dated mandatory-hosted statements are superseded. Chat proposal work is excluded from this continuation.

2026-10-12 interruption follow-up: legacy capture labs now remain closed until the recovery journal has loaded and are blocked by pending/failed recovery. Cancel stays in the Retrieve action slot, locked during SQLite writes and restoration. Strict TypeScript and 106 mobile tests pass. The committed Android Release build passed actual cancellation after verified provider reset, force-stop/reopen with pending recovery blocking new exports, failed offline cleanup retaining recovery, and successful connected retry. The prior capture stayed unchanged and independent provider readback matches the original supported settings. An opt-in lab checkpoint makes these trials reproducible; normal retrieval has no pause. Changed-account/expired-session/default-original trials, stable identity, page-preference proof, iOS runtime and hosted acceptance remain open. [Exact evidence](docs/verification/2026-10-12-reserved-view-backup.md#native-interruption-results).

2026-10-12 reserved-backup policy: Manuel authorizes refreshing the single saved configuration `MoFlight App user view backup`. Installation ownership is no longer required; pending recovery still blocks replacement. Export now uses temporary unnamed active settings and never selects/saves unrelated export presets. TypeScript, 97 mobile tests, both bundles and committed-source Android build pass. Two authenticated native ordinary-completion trials each saved 101 flights across 2 pages and restored the original supported settings; independent provider readback matches. [Current contract](docs/architecture/vereinsflieger-view-preservation.md#reserved-configuration-policy--2026-10-12), [exact evidence and remaining native/CI gates](docs/verification/2026-10-12-reserved-view-backup.md). Interruption/account-switch/default trials, stable identity, full native acceptance and hosted CI remain open.

2026-10-12 native preflight continuation: `3b01b45` confirms the blocker in the authenticated Android WebView: the existing provider backup has no ownership marker on this installation. Refusal retains the earlier capture and does not overwrite provider preferences. Fixed diagnostics, TypeScript, 96 mobile tests and a committed-source local Release build pass. Full restoration remains untested until the collision is resolved; new fast CI is also blocked by GitHub billing. [Evidence](docs/verification/2026-10-11-vereinsflieger-view-preservation.md#authenticated-native-diagnosis--0704-europeberlin).

2026-10-12 checkpoint recheck: `ca93e3f` APK compilation passed, but GitHub refused to start the smoke job because of an account payment/spending-limit restriction; no emulator test steps ran. Hosted native acceptance remains blocked. Billing settings were not changed. [Result and remaining gates](docs/verification/2026-10-11-vereinsflieger-view-preservation.md#checkpoint-recheck--2026-10-12).

2026-10-11 recovery-ordering review: `ca93e3f` adds account-display continuity checks before export mutations and a repeated backup-name ownership check immediately before save. Strict TypeScript, 95 mobile tests and both platform bundles pass. The earlier `d179d6b` Android checkpoint passed 34 synthetic checks. Actual live-provider preservation remains unaccepted. [Review and evidence](docs/verification/2026-10-11-vereinsflieger-view-preservation.md#recovery-ordering-review--1940-europeberlin).

2026-10-11 preservation continuation: the access lab now saves/verifies `MoFlight App user view backup`, or recognizes the complete observed default for reset, before changing export settings. Cleanup after success/cancel/failure verifies original columns/order, supported filters/operators, sorting, period and participation; interrupted cleanup remains visible and blocks further exports. This replaces the unpublished direct-replay draft. [Contract](docs/architecture/vereinsflieger-view-preservation.md), [desktop/synthetic checks and native limits](docs/verification/2026-10-11-vereinsflieger-view-preservation.md). Stable account identity, global page-preference proof and native live preservation acceptance remain open; implemented does not mean production accepted.

Deferred feature discovery: [ChatGPT-style in-app logbook chat](docs/architecture/logbook-chat-discovery.md), tracked in [#13](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/13), is retained under M5 of the [project plan](docs/project-plan.md). Its saved-data/photo requirements remain documented; implementation, model selection, key provisioning, personal-data transfer and paid evaluation remain unapproved. UI definition, retrieval and deterministic analytics take priority.

2026-10-11 update: Manuel authorized the export-filter approach. **Retrieve flights now uses the configured personal list as its primary source**: verify/repair all data columns, create `MoFlight App export filter` when absent, set explicit dates plus `Pilot oder Fluglehrer`, then traverse all pages before saving. Default dates cover the device's current calendar year; editable bounds support other windows. Costs/aircraft/engine/block/role fields remain raw. The previous 20-row/default-list restriction is no longer the active UI path. [Workflow/storage contract](docs/architecture/vereinsflieger-filter-export.md), [actual checks/native limits](docs/verification/2026-10-11-vereinsflieger-filter-export.md). Mandatory detail traversal is superseded. Canonical import/account binding, new native runtime acceptance and AI chat remain open.

Current live-retrieval continuation: [dated-window capture and discovery](docs/verification/2026-10-11-dated-window-capture.md) adds automatic calendar-year/inclusive participation selection, strict paged record coverage, explicit empty evidence and a durable raw-window journal. 69 TypeScript and 39 Python checks pass. Native results and the repaired hosted-checkpoint status are recorded in that report; canonical import and stable club identity remain gated. Manuel supplied his actual DIN A6, 590-start gliding book: [layout draft and read-only preview](docs/verification/2026-10-11-supplied-gliding-format.md), excluding TMG, with separate role-time/start-counter/distance evidence. Source mapping and the real photo-to-writing journey remain unfinished.

Current implementation continuation, 2026-10-11: [restore recovery, synthetic pilot-books and bounded capture](docs/verification/2026-10-11-recovery-books-and-capture.md) adds semantic backup validation, transactional selection recovery, a separate four-book/two-format native lab and durable three-detail capture with observed profile context. 52 TypeScript, 38 Python host checks and 33 local Android synthetic checks pass; the report records exact source boundaries and the still-running hosted checkpoint. Club identity is still label-only, list coverage bounded, and both canonical stores remain synthetic-only. Full live retrieve-to-writing, real format and iOS acceptance remain open. This summary supersedes the audit's unimplemented F01/F02 and book-proof descriptions without changing its historical evidence.

Project-wide audit, 2026-10-11: **development health Amber; full product acceptance blocked**. The [consistency, traceability and health audit](docs/verification/2026-10-11-project-audit.md) and [initial R01–R15 / FL-01–FL-17 register](docs/verification/2026-10-11-project-audit-register.md) distinguish current requirements, decisions, code and evidence. Fresh checks pass: 42 TypeScript tests, 36 Python tests after the concurrent build-policy update, fixture parity, both Hermes exports and Android configuration generation. Independent synthetic probes reproduce checksum-valid semantic backup acceptance, including a subsequent history-query failure. Recommendation: fix canonical restore/selection recovery first, continue verified capture context/coverage, and review/prove the multi-book boundary before enabling live canonical import. Documentation and scope reconciliation are tracked in [#12](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/12); full iOS/cloud/AI and latest native capture acceptance remain open. The dated notes below retain their original evidence scopes.

Current review, 2026-10-11: [prioritized reliability assessment and delivered recovery slice](docs/verification/2026-10-11-reliability-review.md) separates implementation, proposed design and evidence. Default-list capture now has request-scoped loading/saving, cancellation before persistence, stale callback guards and validated/idempotent raw-capture storage. 42 TypeScript checks and Android/iOS Hermes exports pass; the 24 Python reference checks and fixture parity pass at baseline. Native acceptance of this slice remains open. Next: verified account/club context, explicit list/detail coverage and recoverable native checkpoints. Canonical backup/selection validation also needs follow-up; raw-capture validation does not fix it. ADR 0007 remains proposed and canonical live import remains disabled.

The following dated overview retains earlier platform/device evidence; the linked review controls the new slice's scope and limitations.

As of 2026-10-10 (UTC), Manuel has approved Expo/React Native, strict TypeScript, pnpm and expo-sqlite as the single database writer for the initial native lab. Phone-local persistence precedes cloud integration, with a separate early Supabase Cloud Free feasibility trial (ADR 0004). The Expo lab now implements synthetic remembered source/paper/decision state, exact aircraft/person queries, fixed in-app writing instructions and backup/restore. Ten TypeScript/real-disk-SQLite checks plus 20 host reference checks pass; Android/iOS Hermes bundles and native configurations generate. Standalone Android APK compilation/upload and [21 native Android emulator checkpoints](docs/verification/2026-10-10-android-copy-backup.md) pass in GitHub Actions, including offline restart, selective copying, actual external backup, real document-picker restore, rejected invalid files, byte-for-byte re-export and preserved original database. Manuel reports the bounded offline restart/query/snapshot sequence working on Pixel 6a / Android 17; [manual evidence and limits](docs/verification/2026-10-09-android-offline.md#pixel-6a-manual-follow-up--2026-10-10) are recorded separately. iOS execution, full readability and physical-phone selective-copy/external-backup/picker checks remain open. Supabase remains blocked without test-project/two-user access. [Vereinsflieger browser login/own-flight UI and provider REST key/limit guidance](docs/verification/2026-10-10-vereinsflieger-access.md) are now verified; an isolated native WebView access probe is implemented and its standalone APK passed 23 functional synthetic emulator checkpoints (final diagnostic collection failed; see the evidence), and the subsequent [Windows Android trial](docs/verification/2026-10-10-windows-desktop.md#live-android-bounded-capture-and-restart) verifies native login, bounded raw retrieval and offline reopening. Manuel privately confirmed that the displayed captured fields match his provider flightbook. Independent reference/export validation, production connector acceptance and supported distribution conditions remain unresolved. No paid services or AI calls are authorized.

GitHub is the authoritative versioned project record. This README is the central documentation; supporting ADRs, source snapshots and evidence are linked here. Chats support discussion and do not replace this record. Documentation and communication use English; the original German source snapshot remains unchanged.

Confirmed Vereinsflieger UX: the visible provider webpage is acceptable for the current PoC. Later, users sign in inside MoFlight, return to its own screen and trigger an action such as “Get my data from Vereinsflieger.de”; provider navigation stays hidden during retrieval while MoFlight shows progress/results. See the [visibility requirement](docs/product/vereinsflieger-connection-and-retrieval.md#provider-page-visibility--confirmed-by-manuel-2026-10-10). This later UI flow remains to be implemented.

Changes go directly to `main` with traceable commits and Issues; no pull requests (Manuel's instruction, 2026-10-08). Manuel owns product decisions and binding architecture approval. A recommendation in an earlier draft is not an approval.

- [Requirements reconciliation](docs/architecture/phase1-reconciliation.md)
- [Original Phase 1 draft snapshot](docs/reference/Segelflug_Plattform_Architektur_Phase1.md): draft 0.2, Library version 2, read on 2026-10-08; preserved as historical evidence, not current operating instructions.
- [ADR 0001: Repository and direct commit workflow](docs/adr/0001-project-workflow.md)
- [ADR 0002: Phase 1 PoC stack](docs/adr/0002-phase1-technology-proposal.md) — accepted for initial mobile/workspace/SQLite lab; detailed sync choices remain proposed.
- [Technology comparison, current costs and executable test gates](docs/architecture/phase1-technology-review.md).
- [Complete backend comparison for weeks of non-use and no subscription](docs/architecture/low-usage-backend-comparison.md) — official-source review, quotas, recovery, trade-offs and approval choices.
- [ADR 0003: Low-usage backend and explicit offline sync](docs/adr/0003-low-usage-backend-proposal.md) — accepted for the Supabase Cloud Free first trial; detailed sync design remains proposed.
- [ADR 0004: Phone-local persistence before cloud integration](docs/adr/0004-local-first-sequencing.md) — accepted sequencing, with early Supabase feasibility retained.
- [Revised local-first implementation priorities](docs/architecture/local-first-implementation-plan.md).
- [Writing-template format clarification and verification](docs/verification/2026-10-08-writing-template-format.md).
- [Vereinsflieger website/manual discovery specification](docs/product/vereinsflieger-information-discovery.md) and [2026-10-10 authenticated findings](docs/verification/2026-10-10-vereinsflieger-discovery.md), tracked in [#10](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/10): flight fields/UTC/duplicates, training and duty views inspected; exports, complete coverage and roster semantics remain open.
- [Agent rules](AGENTS.md) and [ADR template](docs/adr/template.md).
- [German/EASA logbook requirements, printed formats and automatic routing](docs/product/logbook-requirements-and-routing.md): separate or combined books, distinct TMG evidence, three inspected layouts and remembered class-to-book assignments; production profiles remain unactivated.
- [Vereinsflieger capture requirements and Gemini schema review](docs/product/vereinsflieger-capture-requirements.md): capture-first field inventory, corrected time/class/role assumptions and the next bounded retrieval proof; output formats deferred.
- [2026-10-11 capture field proof](docs/verification/2026-10-11-vereinsflieger-capture-fields.md): repeated desktop reads, date-specific empty UI, default-view reader compatibility and raw missing/blank/value inspection; 32 contract tests pass, canonical import remains gated.
- [List discovery plus per-flight detail proposal](docs/architecture/vereinsflieger-import-contract.md#list-discovery-plus-per-flight-detail-enrichment--2026-10-11-proposal): richer flight/provenance fields and optional costs, with separate list coverage/detail completion; two desktop details inspected, bulk/native detail retrieval not implemented.
- [Proposed capture and storage data model](docs/architecture/vereinsflieger-capture-data-model.md): complete field inventory, aircraft lookup, cost records, source revisions, missing/conflicting values and retrieval progress; shared across books, production migration not implemented.
- [Bounded desktop detail-enrichment proof](docs/verification/2026-10-11-vereinsflieger-detail-proof.md): three own-flight pages read twice with identical ordered fields and matching candidate references; section-preserving lab decoder and synthetic disk-checkpoint resume/expiry checks, 38 tests pass. Native detail retrieval, verified account/club binding and complete coverage remain open.
- [Vereinsflieger manual workflow follow-up](docs/verification/2026-10-10-vereinsflieger-manual-workflows.md): export menu illustration, club-defined flight types, curriculum assessment scales, duty/reservation interaction and calendar subscription scope; live export availability remains unresolved.

- [Flight-logbook user stories and complete continuation workflow](docs/product/flight-logbook-user-stories.md).
- [Captured Flugbuch prototype sources and differences](docs/reference/flugbuch-prototype/README.md).

The next FL-03 slice has a [concrete verified-retrieval/import proposal](docs/architecture/vereinsflieger-import-contract.md) and pure reconciliation prototype: repeat/changed/partial/account checks pass in synthetic tests (25 mobile tests total), with no real canonical import enabled. [Export/history investigation](docs/verification/2026-10-10-vereinsflieger-retrieval-investigation.md) observed native date/role controls and a return to login; direct user sign-in is pending before inspecting export bytes and choosing the mapping.

Manuel explicitly authorized optional device-local saved login for remote development on 2026-10-10. The lab now implements an explicit Save/Use/Forget flow with protected native storage, separate from flight data and backups; [saved-login evidence and limits](docs/verification/2026-10-10-vereinsflieger-saved-login.md) distinguish synthetic checks from actual native use. Existing provider-page passwords are not collected. The updated Windows Android APK compiled/installed, reopened captures and retrieved 20 rows after cold restart using the provider stay-signed-in session. Manuel completed the app's credential entry, and recognition of the saved protected entry survived another cold restart. Actual provider authentication using the fallback and Forget remain untested; a transient first post-update activity crash and successful cold-start recovery are recorded in the evidence.

## Development tools and environment

[Tools and software overview](docs/development/tools-and-software.md) explains each tool's purpose and the Windows desktop workflow. [Windows setup/runbook](docs/development/windows-local-setup.md) and [actual desktop evidence](docs/verification/2026-10-10-windows-desktop.md) now verify local Windows shell/files, GitHub access, pinned dependencies, 20 TypeScript and 24 Python checks, fixture checks, bundles/prebuild, installed Android Studio, separate JDK 17 and usable emulator acceleration. SDK/ADB and a dedicated API 37 emulator are now verified; all 23 standalone native checks passed locally with complete diagnostics using the verified CI APK. Native authenticated login, session reuse, automatic capture of 20 visible personal-flight rows and offline force-stop/reopening now pass on the local API 37 emulator. Android origin-only bridge, hidden-heading and full-width-layout-row fixes are covered by synthetic regressions and native execution. Manuel confirmed the displayed-field comparison privately (Q4); independent reference/export validation, verified account/time basis and complete history remain open. Local standalone Release compilation passed using the documented isolated Windows build workaround. The current standalone CI APK is downloaded and verified; its CI report records 23 passed native checkpoints followed by a Logcat collection failure, so that workflow failed. Diagnostic collection and Windows portability fixes are documented alongside their tests; follow-up CI run 38042331748 passed all six jobs.

## Runnable first milestone

[Platform-lab runbook](apps/platform-lab/README.md) covers the approved native development app and the independent Python reference harness. Only synthetic prepared observations/CSV are included: neither proves handwriting recognition or live retrieval. Opening the app loads remembered state without re-importing or silently confirming copying.

```bash
npm install --global pnpm@11.25.0
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm fixtures:check
python3 -m unittest discover -s tests -v
pnpm bundle
# With a configured Android SDK / connected device or emulator:
pnpm --filter @moflight/platform-lab android
# On macOS with compatible Xcode / iOS simulator or signing:
pnpm --filter @moflight/platform-lab ios
```

For the airplane-mode force-stop check, use the runbook’s `android:offline` / `ios:offline` local Release-configuration commands to embed JavaScript; normal Debug builds depend on Metro. Neither local offline CLI command has been executed in this session; CI built the equivalent embedded-JavaScript Release APK, which passed the Android emulator subset. For an already-built APK, follow the runbook’s direct phone installation instructions; no local SDK/Metro is required. Use Node 24 (tested 24.19.0) and Python 3.12. Expo SDK 57 / React Native 0.86.3 / React 19.2.3 are pinned with the matching Expo modules. Native folders are generated locally and ignored. No EAS subscription or cloud build service is needed for local builds. The app uses dataset-specific SQLite files and explicit selection, entry-level copying confirmation, and a versioned JSON backup restored into a new database. Backup is unencrypted; sharing cancellation does not prove an external backup. The bounded ten-row fixture requires a newly confirmed continuation page after paper advancement.

- [Native slice checks, versions and missing device evidence](docs/verification/2026-10-08-native-lab.md).
- [Standalone Android APK and emulator offline checks](docs/verification/2026-10-09-android-offline.md): standalone APK compilation and seven actual native emulator checkpoints passed; earlier runner failures and remaining device/backup gates are retained.
- [Earlier 20-test host evidence](docs/verification/2026-10-08-host-local-slice.md) remains historical; its ZIP format is separate from native JSON backup.
- [Host scope and approved native-stack/driver decision](docs/adr/0005-host-lab-before-mobile-approval.md).
- [Independent early Supabase SQL and real two-user probe](pocs/supabase-trial/README.md): preflight blocked, SQL/hosted Auth/RLS/files not tested.
- [Vereinsflieger access comparison and concrete connector workflow](docs/architecture/vereinsflieger-access-investigation.md): interactive browser login and own-flight UI verified; club-created AppKey, 500 calls/day/key and general commercial REST prohibition read in authenticated provider help. Native retrieval/specification/terms remain open.
- [ADR 0006: Phone-local Vereinsflieger connector feasibility](docs/adr/0006-vereinsflieger-connector-proposal.md) — browser-route priority confirmed; original-page WebView implementation proposed; official API is future-only.
- [Vereinsflieger connection, retrieval and local-login user journey](docs/product/vereinsflieger-connection-and-retrieval.md): first login, automatic range selection/paging, repeat retrieval, expiry, session reuse and optional device-local credential storage.
- [Live Vereinsflieger browser checks and next native gates](docs/verification/2026-10-10-vereinsflieger-access.md): actual results, protected download limitation and untested devices/session behavior.
- [Native Vereinsflieger access probe and test limits](docs/verification/2026-10-10-vereinsflieger-native-probe.md): original-page login, automatic personal-list navigation, bounded raw captures and separate SQLite storage; the later Windows trial verifies live bounded retrieval, not complete canonical import.
- [Explicit synthetic fixture expectations](tests/fixtures/local-logbook/README.md): canonical prepared observations/CSV and generated mobile bundle, no OCR or live retrieval.

## Products and Phase 1 boundaries

[Product scope clarification (Manuel, 2026-10-10)](docs/product/moflight-feature-scope.md): MoFlight will contain multiple flight-related features/sub-apps. The logbook helper starts with gliding and must allow later ultralight and powered-aircraft support with different logbook formats. SPL tutoring and gliding weather forecasts are possible additional features. The earlier two-separate-app model is a planning baseline; one app versus separate releases remains an open product decision. Vereinsflieger is intended as a common source, but uniform storage/schema across aircraft classes is an unverified user assumption.

The possible SPL feature retains versioned questions, offline learning, personal progress and an evidence-based AI tutor as later scope. The logbook feature targets authorized own-flight retrieval, labeled CSV fallback, handwriting observations with field/anchor clarification, deterministic reconciliation and readable phone/print instructions. Reviewed-template progress is assumed separately from confirmed evidence and checked at the next session; no copied-entry completion prompt is required. Concrete PDF/other rendering technology remains undecided; neither feature is accepted as a complete product.

Phase 1 builds a technical test app first; the earlier two-product-shell plan remains provisional pending the clarified multi-feature packaging decision. It proves shared services with small synthetic examples. It does not deliver a complete exam mode/catalogue, shop, full historical logbook audit or production release. Digital-logbook acceptance/signatures and commercial release requirements remain later work.

Offline covers downloaded permitted content, learning events, flights, settings and file selection. Initial sign-in, password recovery, live retrieval, AI answers/photo analysis and cloud processing require connectivity. An offline AI request can remain a draft; paid execution is explicitly triggered later. Continuous background synchronization is not promised.

## Requirements and evidence

| ID | Requirement | Phase 1 evidence |
| --- | --- | --- |
| R01 | Android and iOS from one codebase | Installable native development builds; results per platform |
| R02 | Multiple flight-related features/sub-apps; release packaging open | Confirm one app versus separate releases before choosing package/bundle IDs and shell acceptance |
| R03 | Shared account identity | Same identity across features; separate sessions and cross-app SSO depend on final release packaging |
| R04 | Offline reads and writes | Airplane mode, restart and reconnect without data loss |
| R05 | Cross-device data | Same account on two devices/sessions converges |
| R06 | User isolation on every path | Negative API, sync, storage, job and local account-switch tests |
| R07 | Reusable modules | Domain packages do not depend on each other or vendor SDKs |
| R08 | Server-side AI | Authenticated validated requests, measured usage and server budget |
| R09 | File processing | Offline selection, resumable/repeatable private upload/download and export status |
| R10 | Agent-assisted development | Reproducible setup, small Issues, CI and actual test evidence |
| R11 | Commercial extensibility | Export/deletion design, source-rights metadata, entitlement boundary and release plan |
| R12 | Own Vereinsflieger flights | Authorized live retrieval, source comparison, repeat retrieval and session expiry |
| R13 | Measurable RAG | Ingestion, retrieval, citations, missing evidence, latency and cost evaluated separately |
| R14 | Later ultralight and powered-aircraft logbooks | Verify class-specific fields/layouts and source mapping using synthetic examples before enabling each format |
| R15 | Multiple independent logbooks per pilot, with extensible formats | Book selection, independent paper progress/totals and offline state; proposed boundaries and acceptance in ADR 0007 |

## Current architecture proposal

Manuel selected **Supabase Cloud Free for the first trial on 2026-10-08**, with a possible later move to self-hosted Supabase. This supersedes the earlier Convex/Firebase recommendation and the subsequent NUC-first suggestion. The [complete comparison](docs/architecture/low-usage-backend-comparison.md) retains alternatives and limitations. Phone-local SQLite/files now precede cloud integration, with a separate Supabase feasibility trial in the same early cycle (ADR 0004). The initial mobile/workspace/driver choice is approved; exact offline-sync design remains open in [#5](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/5); PowerSync remains deferred.

| Area | Selected baseline / remaining proposal | Validation / decision gate |
| --- | --- | --- |
| Mobile | Approved initial lab: Expo, React Native, strict TypeScript | Native Android/iOS builds, deep links and SDK behavior; focused Flutter comparison |
| Workspace | Approved pnpm monorepo; no additional build orchestrator initially | Reproducible lockfile/setup and fast CI |
| Backend | Supabase Cloud Free selected first cloud mode; early independent feasibility, integration later | Auth/recovery, RLS, private Storage/server commands before broad cloud-dependent work; SMTP, quotas and pause monitoring |
| Local data | Approved initial lab: expo-sqlite/local files per dataset/profile; later verified account linking | Restart/offline persistence, source/decision state, migrations, private backup/restore and encryption capability |
| Sync | Cloud sync follows local slice and early cloud gates; bounded explicit push/pull remains proposed | Stable IDs/revisions from day one; later outbox/cursor/retry/conflict/tombstone/account-linking tests; PowerSync deferred |
| AI / RAG | Authenticated server function gateway; Postgres full text/pgvector candidate | Retrieval-only first; validated evidence, authorization and budget; paid provider execution separately approved |
| Writing template | Phone and printable instructions from one reviewed snapshot; concrete file technology undecided | Exact values/placement, readable offline resume, phone/print parity and next-session paper-state check; inspect/test any prototype renderer before reuse |

Use one selected SQLite driver/write path and one durable account-scoped outbox for explicit sync. If a sync SDK is adopted later, replace the queue strategy rather than add a competing outbox. Supabase RLS alone would not prove that a replication/sync stream is private; test its filters separately.

Shared technical modules handle contracts, auth, data, sync, files, settings, permissions, AI calls and UI as needed. Learning and logbook domain code uses pure contracts/helpers and contains no Expo, Supabase or OpenAI SDK dependencies. Neither domain imports the other. App composition wires these boundaries; no universal plugin runtime is planned.

## Proposed repository layout

| Path | Responsibility |
| --- | --- |
| `apps/platform-lab/` | Minimal Phase 1 test app, before full product shells |
| `apps/spl-learning/` | Independently released learning app |
| `apps/flight-logbook/` | Independently released logbook; canonical spelling here, replacing draft's `glider-logbook` |
| `packages/` | Contracts, auth, data, sync, files, AI client and pure domains, only as needed |
| `backend/` | Technology-neutral backend contracts and authenticated command/job boundary |
| `convex/` | Historical alternative only; no implementation planned for the first trial |
| `supabase/migrations/`, `supabase/functions/` | Selected backend SQL/RLS migrations and server functions for the first trial |
| `services/document-worker/` | Bounded Python export worker if generator reuse is adopted |
| `pocs/`, `tests/fixtures/`, `tests/e2e/` | Small trials, synthetic fixtures and cross-platform acceptance |
| `docs/adr/`, `docs/architecture/`, `docs/reference/` | Decisions, supporting reconciliation and source snapshot |
| `.github/workflows/` | Checks triggered on pushes to main; native builds when relevant |

No empty package trees are created in advance. Use this repository, not the source draft's tentative `soaring-platform` repository name.

## Data and API invariants

- Generate stable IDs offline. Personal rows carry ownership; mutable records carry versions. Server determines identity from the authenticated session and validates referenced objects.
- Preserve source dates/times and their known timezone/offset. Derive UTC only with an established time basis. Flight arithmetic uses integer minutes; unknown carryovers remain unknown.
- Learning attempts are immutable events tied to question versions. Progress is derived from those events, not competing incremented counters.
- File metadata, actual upload completion, analysis observations and user-confirmed values are separate states. A job can use only an owned, completed input.
- Server-only usage/budget records and idempotency receipts prevent clients from modifying quotas. Retry identity includes an operation ID and payload check.
- Flight/paper-anchor writes compare a base version. Conflicts preserve both variants for resolution; no blind overwrite.
- Keep imports/source rows, observations, anchors, findings and versioned confirmed result snapshots traceable. Do not silently remove conflicting source rows.
- Deletions need tombstones or equivalent confirmed state so old clients cannot restore deleted data.

The draft's API names are proposed internal contracts, not deployed routes or claimed Vereinsflieger endpoints: `apply_mutations_v1`, upload create/complete, tutor answer, photo/export jobs, `fetch_own_flights_v1`, account export and account deletion. A common error includes code, message, retryability and request ID without secrets or foreign data. Write commands validate ownership, payload limits and schema versions.

Account switch stops the old sync, closes its database and selects account-scoped data/files/queues. Pending changes remain visible before logout/deletion and are never silently discarded or transferred. A permanently offline device can learn about remote deletion only on reconnection.

## Flight-logbook product workflow

Confirmed 2026-10-10: one pilot account can own several books (gliding, ultralight, powered airplane, or multiple volumes of the same format). Book identity, format and pilot identity must be distinct; book-specific paper progress and decisions must remain isolated. Adding formats must not require rewriting shared account/provider/persistence services. [ADR 0007](docs/adr/0007-multiple-logbooks-and-formats.md) proposes the boundary and a small proof before production schema expansion; current lab dataset selection is not proof of this capability.

The [canonical user stories](docs/product/flight-logbook-user-stories.md) define photo evidence, authorized retrieval, visible-row comparison, persisted decisions and format-neutral instructions. Both phone-side and printable instructions are desired from one reviewed snapshot; PDF remains an optional technology. The [presentation contract](docs/product/writing-template-presentation.md) defines exact destinations and offline continuation. Preserve confirmed paper evidence separately from assumed progress from reviewed template preparation. Almost always check the remembered last entry for catch-up; if not confirmed, request a current photo. No completion prompt is required; preparation is not proof of physical writing. Opening/querying needs no new photo/retrieval. Existing lab behavior predates this revised product requirement; no end-to-end acceptance is claimed.

Persistent ignored/overridden findings and deterministic aircraft/person queries are specified in [remembered state and flight-history queries](docs/product/flight-logbook-state-and-queries.md). Counts/latest-flight answers show their data basis, coverage, freshness and supporting flights. Distinguish aircraft instances/models, person identities/roles and source/effective/paper views. Query implementation is tracked in [#9](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/9); the bounded TypeScript and host implementations pass exact synthetic checks; bounded Android query/offline checks pass; full native and cloud acceptance remain open.

## AI, RAG and logbook behavior

[ADR 0008: Evidence-first logbook and bounded AI interpretation](docs/adr/0008-logbook-ai-and-deterministic-boundary.md) records Manuel's accepted responsibility boundary and sequence (2026-10-11). Capture and preserve relevant provider data with explicit coverage; use AI for handwriting, ambiguous text, candidate-match proposals and explanations. Validate proposals against evidence; conventional code owns identities, exact queries, calculations and writing snapshots. Whole-history LLM processing is an optional evaluation baseline, not the default importer. No model/provider or paid execution is approved by this decision.

The shared AI gateway handles authentication, input/output validation, allowed tasks, context limits, timeouts, usage and atomic quota reservation. Tutor retrieval and photo prompts remain domain-specific. A tutor cannot silently change learning progress. Unknown provider timeout outcomes are reported rather than retried indefinitely; request idempotency does not guarantee exactly-once provider billing.

RAG uses approved versioned sources, visibility-filtered retrieval and evidence-based answers. Source IDs must originate in the supplied context and citations must substantiate the answer. Demo content is five self-authored knowledge sections and ten synthetic quiz items; these are distinct from the evaluation set of at least 20 queries.

Targets, not achieved results:
- Relevant source among the first five hits for at least 90% of answerable evaluation queries.
- 100% of cited IDs belong to the provided context.
- All predefined missing-evidence cases are recognized.
- Manual assessment of factual support, plus recorded retrieval, latency, tokens and actual costs.

Photo AI produces observations for confirmation, with unreadable fields left unknown. Deterministic code handles flight matching, roles, minute sums, page closure and carryovers. Before reusing the existing generator, inspect current plugin/skill code and reconcile their rule differences. Preserve the existing plugin.

Regression inventory from the earlier draft: aircraft mismatch (its “flight 21” example), paper anchor despite additional historical CSV flights, no total on a partial page, tenth row closes a page, unknown carryovers, solo versus dual, ambiguous continuation, daylight-saving transitions and duplicate findings without silent deletion.

## Phase 1 execution plan and Issues

**Historical sequencing:** the table and early-parallel-work instructions below are superseded by the [2026-10-13 project plan](docs/project-plan.md). They preserve original obligations and dated lab status, not the current task order. Cloud/SPL feasibility obligations remain tracked; writing/chat/other feature implementation is deferred until retrieval and initial analytics acceptance.

The [revised priority plan](docs/architecture/local-first-implementation-plan.md) supersedes the earlier Auth/cloud-first implementation order. Original P1–P8 requirements remain the scope reference, not a required chronological order.

| Priority | Work | Tracking / status |
| --- | --- | --- |
| 0 | Finalize necessary mobile tooling and minimal platform-lab/CI | #5/#6, approved/pinned workspace; push CI, standalone Android APK and 21 emulator checkpoints, Android/iOS bundles/config; Pixel 6a / Android 17 bounded manual pass reported; iOS/full device gates open |
| 1 | Actual phone-local SQLite/files, synthetic import/photo observations, remembered state and decisions | #4/#7, Expo SQLite/private-file implementation; real-disk rules tested; bounded Pixel 6a offline restart pass reported |
| 1, same early cycle | Independent Supabase Cloud Free Auth/recovery/RLS/private-file/server-command feasibility | #1/#5/#7, independent SQL/probe prepared; blocked on project/sessions; no hosted tests |
| 1, next priority | Authorized browser-based own-flight retrieval feasibility | #2, bounded Android login/session reuse/retrieval/offline reopening verified; displayed-field match user-confirmed; complete import, session expiry and access terms open; official API might work in the future only |
| 2 | Local continuation/statistics, readable in-app writing template and private backup/restore; validate handwriting separately | #7/#9 with #4, 10 TypeScript + 20 host checks pass; in-app view/backup wired; Pixel 6a restart/count/snapshot pass reported; 21 emulator checks pass including copy/picker/backup; full readability, physical-phone copy/picker, iOS and handwriting pending |
| 2, independent | SPL ingestion/retrieval/RAG evidence | #3, not tested; permitted corpus and budget gates retained |
| 3 | Explicit account linking, cloud data/files and offline synchronization | #1/#4/#7, after local/early-cloud evidence; two-device/isolation tests retained |
| 4 | Shared modules, two app shells and integrated Android/iOS acceptance/runbook | #8, not tested; full original framework requirements remain |
| Current discovery; later features | Resolve export/coverage and roster questions after authenticated website/manual inspection | #10/#9, [findings](docs/verification/2026-10-10-vereinsflieger-discovery.md); training/duty views and flight semantics observed, no integration acceptance |
| Before canonical live import | Multiple-book identity/format and migration proof | #11, ADR 0007 remains proposed; separate source evidence from book membership and paper state |

No cloud login is required merely to start the initial local lab. A local dataset ID is not trusted cloud identity; later linking is explicit, ownership-checked and preserves data. Local storage needs backup/export and does not establish cross-device access. Supabase evaluation starts before broad local product implementation; do not postpone its risks until the end. Actual SQLite persistence, supported own-flight access, handwriting analysis and writing-template presentation each need separate evidence; optional PDF execution is tested only if adopted.

CSV/import fixtures do not prove live Vereinsflieger access. No stable supported flight or roster endpoint is claimed. Missing external access does not block independent local preparation.

## Security, testing and operating limits

Android development follows [amended ADR 0009](docs/adr/0009-local-android-development-and-checkpoint-ci.md): cached Windows builds and emulator testing are primary, with required documented local checks and relevant native trials before scoped acceptance/device handoff. [The runbook](docs/development/windows-local-setup.md#repeatable-local-build-command) supplies committed-source builds and development/standalone modes. Hosted workflows are optional/manual-only; no paid CI or billing changes are authorized. A green host test or bundle alone does not establish native acceptance. [Original rollout evidence](docs/verification/2026-10-11-local-android-workflow.md) retains historical results under #6; the 2026-10-12 amendment supersedes its automatic/mandatory hosted policy.

Local rollout passed 23 synthetic API 37 emulator checkpoints with complete diagnostics, a cached standalone rebuild in 31 seconds, and a real development-client title update/restoration through Metro without native compilation. A separately selected, force-fresh hosted API 35 checkpoint also passed 23 checks. Full smoke testing took approximately 23 minutes locally; small edit/reload iterations use Metro. Latest automatic checkpoint status and exact source/checksum identities remain in the linked evidence; iOS/physical-phone/production gates are unchanged.

Never commit secrets, real flight exports, photos or personal databases. Use synthetic fixtures. Keep provider/service-role keys server-side; public project configuration alone cannot authorize private operations. Test API, sync, storage, jobs and local isolation individually, including forged references and owner changes.

Separate environments, private files, short-lived download links and secure token storage are planned. Test actual token size/platform behavior, migrations and local encryption; do not assert encryption until verified. Source licensing and data processing across all chosen providers must be resolved before production.

CI follows direct-main commits: type/lint checks, focused domain/protocol tests, real SQL/RLS and SQLite/sync tests where available. Native Android/iOS E2E and structural/visual export checks follow relevant implementation. App rollback does not reverse database migration.

CI maintenance (2026-10-11, [#6](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/6)): the workflow uses Node 24 action runtimes via checkout/setup-node/setup-python v7, setup-java v6, upload-artifact v7 and download-artifact v8; android-emulator-runner v2 also declares Node 24. These versions address [GitHub's Node 20 removal](https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/). Application tooling remains Node 24.19.0, Python 3.12 and Java 17. Default zipped artifacts and existing APK names/paths are preserved. Multiple main pushes can overlap: APK reuse requires an already uploaded artifact with matching app inputs; an in-progress compilation cannot be reused. Recent successful full runs took roughly 22–24 minutes. Existing run annotations retain their original action versions; updated runtime behavior requires a new run. Local Windows validation: actionlint 1.7.12 (shellcheck disabled) and git diff --check passed; each referenced action's published action.yml was checked for node24. Hosted execution is tracked separately in #6.

Per test record commit, date, environment/device, synthetic inputs, command, expected/actual result, failures, latency/cost and limitations. platform-lab reports not tested, blocked, passed or failed with evidence. Full acceptance is in #8.

## Cost and effort status

The archived source contains an initial estimate of 18–28 person-days net, or 24–37 with integration reserve. It also contains supplier tariff assumptions and token-cost examples. These are inherited planning estimates, not a delivery commitment, fresh price verification or measured usage.

The [complete 2026-10-08 comparison](docs/architecture/low-usage-backend-comparison.md#quotas-and-charging-boundaries) verifies current official quotas and distinguishes free plans from $0-base metered plans. The independent early cloud trial uses Supabase Cloud Free, requiring separately verified free SMTP and monitoring arrangements; the first app dataset is local. It targets $0 infrastructure within quotas; it does not promise unlimited service, guaranteed pause prevention or free AI. Historical Supabase Pro + PowerSync Pro base fees of $74/month remain an alternative scenario, not our selected budget.

No cloud resources, monitoring schedules, subscriptions or AI calls have been created. Paid AI, embeddings and handwriting analysis remain separately gated. An optional export worker is evaluated only if needed.

## Low-usage availability and approval choices

The app may be unused for weeks. A routine automatic cold start is acceptable if the returning request succeeds; an owner-restored pause is a different availability risk.

| Choice | Idle / cost trade-off | Recommendation |
| --- | --- | --- |
| Convex Free + Firebase Auth Spark + explicit SQLite sync | Bundled data/files/search/functions; custom auth verifier, document model and quotas; idle behavior unproven | Earlier recommendation; alternative, not selected |
| Workers Free + D1 + Firebase Auth + private R2 | Request-driven serverless/SQL; more assembly and 10 ms Worker CPU gate; R2 requires metered subscription activation despite free allowance | Alternative if SQL and storage billing risk are acceptable |
| Neon Free + Workers + Firebase Auth + R2 | Explicit automatic database wake; Postgres/pgvector portability; extra compute quota/provider and R2 billing gate | SQL alternative |
| Supabase Free + SMTP + monitored real database checks | Integrated SQL option; weekly pause still possible and owner Dashboard resume may be required | Selected for initial trial; measure limitations rather than promise availability |
| Self-hosted Supabase/PocketBase | No managed weekly idle rule; owner handles hardware, network, patching, mail and private backups | Separate operating decision; no deployment |

Sources, complete component coverage and current quotas are in the comparison. A database ping can reduce Supabase's pause risk; it cannot guarantee an exemption or automatically restore a paused project. Convex preview deployments expire and must not be used as a durable backend. Absence of a documented idle rule for Convex/Firebase is an uncertainty to resolve before release, not an uptime promise.

PowerSync is optional and deferred from the recommended first trial: Free deactivates after a week idle, Pro starts at $49/month, and its listed source databases do not include D1/Convex. Our explicit-sync proposal retains all existing conflict, deletion and restart tests.

## Next action and unresolved decisions

**Current next action:** M1 in the [project plan](docs/project-plan.md): prepare basic UI wireframes, select the initial analytics scope with Manuel and specify the UI/application operation contract. The older AI/feature sequencing and dated evidence below are retained for context; the roadmap's decision register governs current open decisions. No proposed ADR or production schema is accepted by this priority update.

AI sequencing, accepted 2026-10-11: continue capture/detail/coverage work (#2) and the multi-book foundation proof (#11) first. Once the captured-field contract is stable, prepare synthetic AI evaluation cases alongside canonical-import/reconciliation work (#7). Run bounded handwriting and targeted-interpretation evaluation before completing the real photo-to-writing workflow, when permitted inputs, an authenticated gateway and a separately approved API budget are available; full cloud sync and visual polish need not precede it. Integrate only after evidence/validation gates pass. Conversational query polish and broad history narratives follow the first complete selected-book workflow. See [ADR 0008](docs/adr/0008-logbook-ai-and-deterministic-boundary.md); this does not accept ADR 0007 or authorize paid calls.

Manuel authorized proceeding with the reviewed sequence on 2026-10-10: website/manual discovery (#10), then review of the multi-logbook foundation (#11), verified canonical import (#2), one complete local logbook workflow and later production visual design. This authorizes the investigation and documentation; it does not mark proposed ADRs accepted.

The [authenticated discovery report](docs/verification/2026-10-10-vereinsflieger-discovery.md) now records the navigation map, manual references, field dictionary and limits. UTC input, distinct flight/block times, aircraft classification and provider-marked duplicates have evidence. Own practical/theory training and duty views are accessible. Historical instructor/flight-leader assignments and duty pagination were verified; current/upcoming selections were empty, consistent with Manuel's confirmed seasonal cutoff. Future availability is not inferred. Export bytes, complete paging/history, stable identity and cross-class mappings remain open.

Priority clarification, Manuel, 2026-10-11: first verify which relevant Vereinsflieger fields can be captured, preserving original values, missing states, units, crew distinctions and coverage. Follow the [capture inventory and Gemini review](docs/product/vereinsflieger-capture-requirements.md); defer further printed-output format work. The supplied universal schema is a checklist input, not adopted as the production model. Keep browser-based access as the selected route; official REST remains future-only.

Before canonical import, review [ADR 0007](docs/adr/0007-multiple-logbooks-and-formats.md) and its [bounded proof/migration plan](docs/architecture/multiple-logbooks-proof-plan.md). The current dataset-scoped planner and two synthetic databases are lab contracts. Prove independent books, shared-source deduplication and safe migration before enabling real canonical imports.

Continue independent early Supabase Auth/recovery/private-data/files/server-command checks (#1) when a disposable project and two synthetic sessions are available, and bounded iOS runtime checks (#8) when an execution environment is available. Preserve remaining physical-phone copy/picker/readability acceptance under #4/#7/#9. Handwriting and SPL/RAG remain separate evidence/budget gates; cloud linking/sync follows local and cloud proof.

The current GUI is a development lab. Final branding, polished layouts and animations follow the working end-to-end flow. Explicit book selection, ambiguous-import review, the next-session last-entry check with separate assumed/confirmed progress, offline state and readable phone/print instructions need usable screens and acceptance during implementation. Existing lab copying-confirmation tests remain historical evidence, not acceptance of the revised interaction.

Manuel requested more autonomous Android testing on 2026-10-10. The extended emulator harness now covers entry-level copy/restart, picker/share cancellation, externally saved JSON with checksum/original evidence, real picker restore/restart, rejected malformed/checksum/oversized files and unchanged full re-export. Android has an explicit native folder-save action using the already installed Expo file module; no new dependency or service. [Run 38025640272](https://github.com/MomoRC-tech/MoFlight-App-framework/actions/runs/38025640272) passed all 21 native checkpoints using the compiled source 596c110 APK. [Copy/backup evidence and local-PC handoff](docs/verification/2026-10-10-android-copy-backup.md) retains the complete result and all three preceding harness failures. Existing physical-phone APK predates the folder-save action; use the new tested APK for later device trials.

Open: detailed sync approval, idle-policy confirmation/multiweek trial, later PowerSync reconsideration, free cloud service configuration/test accounts, permitted Vereinsflieger transport and scope, content rights, API budget, available iOS/Android device environments, production privacy/deletion/encryption/migrations and release requirements. The approved lab schema/backup are experimental contracts.

Verification: [native evidence](docs/verification/2026-10-08-native-lab.md) records the current commands, outcomes, SDK metadata and CI compilation status; [host evidence](docs/verification/2026-10-08-host-local-slice.md) records earlier main publication and successful host CI. Earlier Linux sessions lacked Android SDK/adb and Xcode; SDK, Gradle and emulator evidence there came from GitHub Actions. The current Windows environment and pending/completed local checks are recorded in the desktop evidence linked above. [Android runtime evidence](docs/verification/2026-10-09-android-offline.md) passes the bounded native offline subset. The bounded Pixel 6a / Android 17 offline sequence has a user-reported pass. The [expanded Android trial](docs/verification/2026-10-10-android-copy-backup.md) passes selective copy, native external backup/picker restore and negative imports. iOS, physical-phone copy/picker and full readability remain untested. Hosted Supabase, verified canonical live import, handwriting and SPL retrieval checks remain unexecuted. Bounded Android live raw retrieval and the authenticated desktop discovery above have separate evidence. No paid plan, paid AI or release was activated.

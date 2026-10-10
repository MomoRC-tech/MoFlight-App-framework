# MoFlight-App-framework

A reusable Android/iOS platform for two independent products: an SPL learning app and a digital gliding logbook.

## Status and source of truth

As of 2026-10-10 (UTC), Manuel has approved Expo/React Native, strict TypeScript, pnpm and expo-sqlite as the single database writer for the initial native lab. Phone-local persistence precedes cloud integration, with a separate early Supabase Cloud Free feasibility trial (ADR 0004). The Expo lab now implements synthetic remembered source/paper/decision state, exact aircraft/person queries, fixed in-app writing instructions and backup/restore. Ten TypeScript/real-disk-SQLite checks plus 20 host reference checks pass; Android/iOS Hermes bundles and native configurations generate. Standalone Android APK compilation/upload and [21 native Android emulator checkpoints](docs/verification/2026-10-10-android-copy-backup.md) pass in GitHub Actions, including offline restart, selective copying, actual external backup, real document-picker restore, rejected invalid files, byte-for-byte re-export and preserved original database. Manuel reports the bounded offline restart/query/snapshot sequence working on Pixel 6a / Android 17; [manual evidence and limits](docs/verification/2026-10-09-android-offline.md#pixel-6a-manual-follow-up--2026-10-10) are recorded separately. iOS execution, full readability and physical-phone selective-copy/external-backup/picker checks remain open. Supabase remains blocked without test-project/two-user access. [Vereinsflieger browser login/own-flight UI and provider REST key/limit guidance](docs/verification/2026-10-10-vereinsflieger-access.md) are now verified; an isolated native WebView access probe is implemented and its standalone APK passed 23 functional synthetic emulator checkpoints (final diagnostic collection failed; see the evidence), while actual native login/retrieval and supported distribution conditions remain unresolved. No paid services or AI calls are authorized.

GitHub is the authoritative versioned project record. This README is the central documentation; supporting ADRs, source snapshots and evidence are linked here. Chats support discussion and do not replace this record. Documentation and communication use English; the original German source snapshot remains unchanged.

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
- [Later Vereinsflieger information discovery and instructor-roster story](docs/product/vereinsflieger-information-discovery.md), tracked in [#10](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/10).
- [Agent rules](AGENTS.md) and [ADR template](docs/adr/template.md).

- [Flight-logbook user stories and complete continuation workflow](docs/product/flight-logbook-user-stories.md).
- [Captured Flugbuch prototype sources and differences](docs/reference/flugbuch-prototype/README.md).

## Development tools and environment

[Tools and software overview](docs/development/tools-and-software.md) explains each tool's purpose and the Windows desktop workflow. [Windows setup/runbook](docs/development/windows-local-setup.md) and [actual desktop evidence](docs/verification/2026-10-10-windows-desktop.md) now verify local Windows shell/files, GitHub access, pinned dependencies, 20 TypeScript and 24 Python checks, fixture checks, bundles/prebuild, installed Android Studio, separate JDK 17 and usable emulator acceleration. SDK/ADB and a dedicated API 37 emulator are now verified; all 23 standalone native checks passed locally with complete diagnostics using the verified CI APK. Native authenticated login, session reuse, automatic capture of 20 visible personal-flight rows and offline force-stop/reopening now pass on the local API 37 emulator. Android origin-only bridge, hidden-heading and full-width-layout-row fixes are covered by synthetic regressions and native execution. Full field/reference comparison, verified account/time basis and complete history remain open. Local standalone Release compilation passed using the documented isolated Windows build workaround. The current standalone CI APK is downloaded and verified; its CI report records 23 passed native checkpoints followed by a Logcat collection failure, so that workflow failed. Diagnostic collection and Windows portability fixes are documented alongside their tests; follow-up CI run 38042331748 passed all six jobs.

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
- [Native Vereinsflieger access probe and test limits](docs/verification/2026-10-10-vereinsflieger-native-probe.md): original-page login, automatic personal-list navigation, bounded raw captures and separate SQLite storage; no verified live native retrieval yet.
- [Explicit synthetic fixture expectations](tests/fixtures/local-logbook/README.md): canonical prepared observations/CSV and generated mobile bundle, no OCR or live retrieval.

## Products and Phase 1 boundaries

The SPL app will support versioned questions, offline learning, personal progress and an evidence-based AI tutor. The logbook app will support authorized own-flight retrieval from Vereinsflieger, CSV import, handwritten-page observations, user confirmation, deterministic reconciliation and a readable writing template showing exactly what to copy into the paper book. PDF and other file exports are optional.

Phase 1 builds a technical test app first, then two product shells. It proves shared services with small synthetic examples. It does not deliver a complete exam mode/catalogue, shop, full historical logbook audit or production release. Digital-logbook acceptance/signatures and commercial release requirements remain later work.

Offline covers downloaded permitted content, learning events, flights, settings and file selection. Initial sign-in, password recovery, live retrieval, AI answers/photo analysis and cloud processing require connectivity. An offline AI request can remain a draft; paid execution is explicitly triggered later. Continuous background synchronization is not promised.

## Requirements and evidence

| ID | Requirement | Phase 1 evidence |
| --- | --- | --- |
| R01 | Android and iOS from one codebase | Installable native development builds; results per platform |
| R02 | Two independently released apps | Separate package/bundle IDs, builds, permissions and shell smoke tests |
| R03 | Shared account identity | Same account in both apps with separate secure sessions; cross-app SSO is optional later |
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
| Writing template | In-app row/field view from one resolved snapshot; optional file exports later | Exact values and paper placement, readable offline resume; inspect/test any prototype renderer before reuse |

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

The [canonical user stories](docs/product/flight-logbook-user-stories.md) define photo upload, authorized flight retrieval, visible-row comparison, persisted findings and user responses, and a format-neutral writing template from a resolved versioned snapshot. The first output is an in-app view; PDF is an optional export. The [presentation contract](docs/product/writing-template-presentation.md) defines exact values, page/row/field placement and readable offline continuation. Store the complete session and remember last confirmed paper entries, latest successful source import and reusable scoped decisions. Opening/querying the app needs no new photo or export; confirm remembered status or update it with new evidence for continuation. Displaying, generating or downloading a template never proves that entries were copied. Source snapshots and prototype rule differences are linked from that specification. Detailed stories are proposed acceptance criteria; no end-to-end implementation is claimed.

Persistent ignored/overridden findings and deterministic aircraft/person queries are specified in [remembered state and flight-history queries](docs/product/flight-logbook-state-and-queries.md). Counts/latest-flight answers show their data basis, coverage, freshness and supporting flights. Distinguish aircraft instances/models, person identities/roles and source/effective/paper views. Query implementation is tracked in [#9](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/9); the bounded TypeScript and host implementations pass exact synthetic checks; bounded Android query/offline checks pass; full native and cloud acceptance remain open.

## AI, RAG and logbook behavior

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

The [revised priority plan](docs/architecture/local-first-implementation-plan.md) supersedes the earlier Auth/cloud-first implementation order. Original P1–P8 requirements remain the scope reference, not a required chronological order.

| Priority | Work | Tracking / status |
| --- | --- | --- |
| 0 | Finalize necessary mobile tooling and minimal platform-lab/CI | #5/#6, approved/pinned workspace; push CI, standalone Android APK and 21 emulator checkpoints, Android/iOS bundles/config; Pixel 6a / Android 17 bounded manual pass reported; iOS/full device gates open |
| 1 | Actual phone-local SQLite/files, synthetic import/photo observations, remembered state and decisions | #4/#7, Expo SQLite/private-file implementation; real-disk rules tested; bounded Pixel 6a offline restart pass reported |
| 1, same early cycle | Independent Supabase Cloud Free Auth/recovery/RLS/private-file/server-command feasibility | #1/#5/#7, independent SQL/probe prepared; blocked on project/sessions; no hosted tests |
| 1, next priority | Authorized browser-based own-flight retrieval feasibility | #2, browser direction confirmed; native in-app login/session reuse/retrieval/reference comparison and access terms open; official API might work in the future only |
| 2 | Local continuation/statistics, readable in-app writing template and private backup/restore; validate handwriting separately | #7/#9 with #4, 10 TypeScript + 20 host checks pass; in-app view/backup wired; Pixel 6a restart/count/snapshot pass reported; 21 emulator checks pass including copy/picker/backup; full readability, physical-phone copy/picker, iOS and handwriting pending |
| 2, independent | SPL ingestion/retrieval/RAG evidence | #3, not tested; permitted corpus and budget gates retained |
| 3 | Explicit account linking, cloud data/files and offline synchronization | #1/#4/#7, after local/early-cloud evidence; two-device/isolation tests retained |
| 4 | Shared modules, two app shells and integrated Android/iOS acceptance/runbook | #8, not tested; full original framework requirements remain |
| Later | Broader Vereinsflieger information/club queries, including instructor roster | #10, discovery backlog; no API/capability claim |

No cloud login is required merely to start the initial local lab. A local dataset ID is not trusted cloud identity; later linking is explicit, ownership-checked and preserves data. Local storage needs backup/export and does not establish cross-device access. Supabase evaluation starts before broad local product implementation; do not postpone its risks until the end. Actual SQLite persistence, supported own-flight access, handwriting analysis and writing-template presentation each need separate evidence; optional PDF execution is tested only if adopted.

CSV/import fixtures do not prove live Vereinsflieger access. No stable supported flight or roster endpoint is claimed. Missing external access does not block independent local preparation.

## Security, testing and operating limits

Never commit secrets, real flight exports, photos or personal databases. Use synthetic fixtures. Keep provider/service-role keys server-side; public project configuration alone cannot authorize private operations. Test API, sync, storage, jobs and local isolation individually, including forged references and owner changes.

Separate environments, private files, short-lived download links and secure token storage are planned. Test actual token size/platform behavior, migrations and local encryption; do not assert encryption until verified. Source licensing and data processing across all chosen providers must be resolved before production.

CI follows direct-main commits: type/lint checks, focused domain/protocol tests, real SQL/RLS and SQLite/sync tests where available. Native Android/iOS E2E and structural/visual export checks follow relevant implementation. App rollback does not reverse database migration.

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

Next essential PoC (Manuel, 2026-10-10): prove in-app own-flight retrieval (#2) before broader feature expansion. The [bounded native access probe](apps/platform-lab/README.md#vereinsflieger-access-poc) is implemented; [probe evidence](docs/verification/2026-10-10-vereinsflieger-native-probe.md) separates synthetic checks/builds from the still-open phone-login/retrieval proof. Manuel selected browser-based access and parked the official API as “might work in the future.” The [investigation](docs/architecture/vereinsflieger-access-investigation.md) proposes a phone-local original-page WebView trial, preferring a verified export/structured response before a table adapter. The [user journey](docs/product/vereinsflieger-connection-and-retrieval.md) defines the required interactions and local-login options. [ADR 0006](docs/adr/0006-vereinsflieger-connector-proposal.md) records confirmed route priority and proposed implementation details; browser login success does not prove mobile retrieval. Continue physical-device acceptance (#6/#4/#7/#9) after the reported Pixel 6a offline restart pass: explicitly confirm only entry 70, check entry 71 stays pending, externally save/select/restore a synthetic backup and reopen the restored selection. Complete readability/dataset-switch checks and the iOS sequence. [The runbook](apps/platform-lab/README.md) gives the acceptance sequence. Independently run Supabase Cloud Free Auth/recovery/private-data/files/server-command gates (#1) once a disposable project and two synthetic sessions are available, and resolve browser/export distribution conditions and native provider-session/retrieval tests (#2); current REST specification and AppKey work are future-only. SPL retrieval-only/RAG feasibility (#3) remains part of the framework plan. Cloud persistence/account linking/sync follows those gates; PowerSync stays deferred. #10 remains later information discovery; no roster access is assumed.

Manuel requested more autonomous Android testing on 2026-10-10. The extended emulator harness now covers entry-level copy/restart, picker/share cancellation, externally saved JSON with checksum/original evidence, real picker restore/restart, rejected malformed/checksum/oversized files and unchanged full re-export. Android has an explicit native folder-save action using the already installed Expo file module; no new dependency or service. [Run 38025640272](https://github.com/MomoRC-tech/MoFlight-App-framework/actions/runs/38025640272) passed all 21 native checkpoints using the compiled source 596c110 APK. [Copy/backup evidence and local-PC handoff](docs/verification/2026-10-10-android-copy-backup.md) retains the complete result and all three preceding harness failures. Existing physical-phone APK predates the folder-save action; use the new tested APK for later device trials.

Open: detailed sync approval, idle-policy confirmation/multiweek trial, later PowerSync reconsideration, free cloud service configuration/test accounts, permitted Vereinsflieger transport and scope, content rights, API budget, available iOS/Android device environments, production privacy/deletion/encryption/migrations and release requirements. The approved lab schema/backup are experimental contracts.

Verification: [native evidence](docs/verification/2026-10-08-native-lab.md) records the current commands, outcomes, SDK metadata and CI compilation status; [host evidence](docs/verification/2026-10-08-host-local-slice.md) records earlier main publication and successful host CI. Earlier Linux sessions lacked Android SDK/adb and Xcode; SDK, Gradle and emulator evidence there came from GitHub Actions. The current Windows environment and pending/completed local checks are recorded in the desktop evidence linked above. [Android runtime evidence](docs/verification/2026-10-09-android-offline.md) passes the bounded native offline subset. The bounded Pixel 6a / Android 17 offline sequence has a user-reported pass. The [expanded Android trial](docs/verification/2026-10-10-android-copy-backup.md) passes selective copy, native external backup/picker restore and negative imports. iOS, physical-phone copy/picker and full readability remain untested. Hosted Supabase, live retrieval, handwriting and SPL retrieval checks remain unexecuted. No paid plan, paid AI or release was activated.

# MoFlight-App-framework

A reusable Android/iOS platform for two independent products: an SPL learning app and a digital gliding logbook.

## Status and source of truth

As of 2026-10-08, the initial repository documentation has been reconciled with the earlier Phase 1 architecture draft. Requirements, the focused technology review, the complete low-usage backend comparison and proposed test gates are documented; Supabase Cloud Free is selected for the initial backend trial, while mobile/workspace and detailed sync approvals remain pending. No app, live integration or device test has been implemented or passed.

GitHub is the authoritative versioned project record. This README is the central documentation; supporting ADRs, source snapshots and evidence are linked here. Chats support discussion and do not replace this record. Documentation and communication use English; the original German source snapshot remains unchanged.

Changes go directly to `main` with traceable commits and Issues; no pull requests (Manuel's instruction, 2026-10-08). Manuel owns product decisions and binding architecture approval. A recommendation in an earlier draft is not an approval.

- [Requirements reconciliation](docs/architecture/phase1-reconciliation.md)
- [Original Phase 1 draft snapshot](docs/reference/Segelflug_Plattform_Architektur_Phase1.md): draft 0.2, Library version 2, read on 2026-10-08; preserved as historical evidence, not current operating instructions.
- [ADR 0001: Repository and direct commit workflow](docs/adr/0001-project-workflow.md)
- [ADR 0002: Phase 1 PoC stack](docs/adr/0002-phase1-technology-proposal.md) — proposed, reviewed and awaiting explicit approval.
- [Technology comparison, current costs and executable test gates](docs/architecture/phase1-technology-review.md).
- [Complete backend comparison for weeks of non-use and no subscription](docs/architecture/low-usage-backend-comparison.md) — official-source review, quotas, recovery, trade-offs and approval choices.
- [ADR 0003: Low-usage backend and explicit offline sync](docs/adr/0003-low-usage-backend-proposal.md) — accepted for the Supabase Cloud Free first trial; detailed sync design remains proposed.
- [Agent rules](AGENTS.md) and [ADR template](docs/adr/template.md).

- [Flight-logbook user stories and complete photo-to-PDF workflow](docs/product/flight-logbook-user-stories.md).
- [Captured Flugbuch prototype sources and differences](docs/reference/flugbuch-prototype/README.md).

## Products and Phase 1 boundaries

The SPL app will support versioned questions, offline learning, personal progress and an evidence-based AI tutor. The logbook app will support authorized own-flight retrieval from Vereinsflieger, CSV import, handwritten-page observations, user confirmation, deterministic reconciliation and PDF/XLSX exports.

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

Manuel selected **Supabase Cloud Free for the first trial on 2026-10-08**, with a possible later move to self-hosted Supabase. This supersedes the earlier Convex/Firebase recommendation and the subsequent NUC-first suggestion. The [complete comparison](docs/architecture/low-usage-backend-comparison.md) retains alternatives and limitations. Mobile/workspace approval and exact offline-sync design remain open in [#5](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/5); PowerSync remains deferred.

| Area | Proposed baseline | Validation / decision gate |
| --- | --- | --- |
| Mobile | Expo, React Native, strict TypeScript | Native Android/iOS builds, deep links and SDK behavior; focused Flutter comparison |
| Workspace | pnpm monorepo; no additional build orchestrator initially | Reproducible lockfile/setup and fast CI |
| Backend | Supabase Cloud Free, shared by both apps per environment; selected initial trial | Auth/recovery, RLS, private Storage, server functions; external SMTP, quotas and best-effort pause monitoring |
| Local data | SQLite per app and account; local UI reads/writes | Persistence, migrations, account isolation and actual encryption capability |
| Sync | Bounded explicit push/pull sync through a narrow adapter | Durable SQLite outbox, transactional change sequence, retries, conflicts, tombstones/reset; PowerSync deferred |
| AI / RAG | Authenticated server function gateway; Postgres full text/pgvector candidate | Retrieval-only first; validated evidence, authorization and budget; paid provider execution separately approved |
| Document export | Existing Python PDF/XLSX generator through a bounded worker | Inspect current source before reuse; private jobs, versioned snapshots and fixture regression |

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
- Keep imports/source rows, observations, anchors, findings and versioned confirmed export snapshots traceable. Do not silently remove conflicting source rows.
- Deletions need tombstones or equivalent confirmed state so old clients cannot restore deleted data.

The draft's API names are proposed internal contracts, not deployed routes or claimed Vereinsflieger endpoints: `apply_mutations_v1`, upload create/complete, tutor answer, photo/export jobs, `fetch_own_flights_v1`, account export and account deletion. A common error includes code, message, retryability and request ID without secrets or foreign data. Write commands validate ownership, payload limits and schema versions.

Account switch stops the old sync, closes its database and selects account-scoped data/files/queues. Pending changes remain visible before logout/deletion and are never silently discarded or transferred. A permanently offline device can learn about remote deletion only on reconnection.

## Flight-logbook product workflow

The [canonical user stories](docs/product/flight-logbook-user-stories.md) define photo upload, authorized flight retrieval, visible-row comparison, persisted findings and user responses, and a PDF from a resolved versioned snapshot. Store the complete session, not just its PDF. The latest photographed paper row controls continuation numbering; generating/downloading a PDF never proves that entries were copied. Source snapshots and prototype rule differences are linked from that specification. Detailed stories are proposed acceptance criteria; no end-to-end implementation is claimed.

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

| Source step | Work | Tracking / status |
| --- | --- | --- |
| P1 | Reconcile architecture, requirements and trial contracts | Supabase Cloud Free trial selected; user stories captured; remaining mobile/sync decisions [#5](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/5) open |
| P2 | Minimal workspace, platform-lab and fast CI | [#6](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/6), open |
| P3 | Early auth, user data and sync-risk trial | [#1](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/1) with [#4](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/4), not tested |
| P4 | Authorized live own-flight retrieval | [#2](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/2), not tested |
| P5 | RAG ingestion/retrieval and AI gateway | [#3](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/3), not tested |
| P6 | Expand shared modules, two shells and offline behavior | [#4](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/4) with shell acceptance in [#8](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/8), not tested |
| P7 | Private files, bounded photo analysis and Python export | [#7](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/7), not tested |
| P8 | Integrated device acceptance and runbook | [#8](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/8), not tested |

Auth and sync risks are tested together early; broader abstraction follows the results. Provider-specific Issues are aligned with the selected Cloud Free trial; requirements and acceptance gates remain valid. Vereinsflieger research and synthetic RAG preparation can progress independently. A blocked external integration does not prevent unrelated preparation.

A CSV import or mock does not prove live Vereinsflieger access. Obtain supported documentation/access and an authorized test account before claiming success. The earlier draft's unofficial OpenAPI/AppKey research is a lead to verify, not an independently confirmed flight API here.

## Security, testing and operating limits

Never commit secrets, real flight exports, photos or personal databases. Use synthetic fixtures. Keep provider/service-role keys server-side; public project configuration alone cannot authorize private operations. Test API, sync, storage, jobs and local isolation individually, including forged references and owner changes.

Separate environments, private files, short-lived download links and secure token storage are planned. Test actual token size/platform behavior, migrations and local encryption; do not assert encryption until verified. Source licensing and data processing across all chosen providers must be resolved before production.

CI follows direct-main commits: type/lint checks, focused domain/protocol tests, real SQL/RLS and SQLite/sync tests where available. Native Android/iOS E2E and structural/visual export checks follow relevant implementation. App rollback does not reverse database migration.

Per test record commit, date, environment/device, synthetic inputs, command, expected/actual result, failures, latency/cost and limitations. platform-lab reports not tested, blocked, passed or failed with evidence. Full acceptance is in #8.

## Cost and effort status

The archived source contains an initial estimate of 18–28 person-days net, or 24–37 with integration reserve. It also contains supplier tariff assumptions and token-cost examples. These are inherited planning estimates, not a delivery commitment, fresh price verification or measured usage.

The [complete 2026-10-08 comparison](docs/architecture/low-usage-backend-comparison.md#quotas-and-charging-boundaries) verifies current official quotas and distinguishes free plans from $0-base metered plans. The selected first trial uses Supabase Cloud Free, requiring separately verified free SMTP and monitoring arrangements. It targets $0 infrastructure within quotas; it does not promise unlimited service, guaranteed pause prevention or free AI. Historical Supabase Pro + PowerSync Pro base fees of $74/month remain an alternative scenario, not our selected budget.

No cloud resources, monitoring schedules, subscriptions or AI calls have been created. Paid AI, embeddings, handwriting analysis and Python worker hosting remain separately gated.

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

Next: use the selected Supabase Cloud Free backend for the small #1 trial; finalize the remaining mobile/workspace and sync choices in #5 before platform-lab setup (#6). Prove recovery/private data and early offline behavior (#4), then the synthetic persisted photo-to-PDF session (#7/#8). Live Vereinsflieger access and paid handwriting analysis require their separate evidence/budget. No paid-plan or paid-AI approval is implied.

Open: mobile/workspace and detailed sync approval, idle-policy confirmation/multiweek trial, later PowerSync reconsideration, actual SDK versions, service configuration/test accounts, permitted Vereinsflieger transport and scope, content rights, API budget, document-worker hosting, available iOS/Android test environments, production privacy/deletion/backup and release requirements.

Verification so far: current README/agent rules/ADR and Issues read; full earlier source draft (version 2) read; requirements and test plan reconciled; official-source mobile/sync/backend/pricing review and complete low-usage backend comparison completed. The current Linux session lacks docker, adb and xcodebuild on PATH; #6 must establish an appropriate runner. No runtime, cloud or device checks have been executed.

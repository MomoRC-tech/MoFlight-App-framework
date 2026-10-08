# MoFlight-App-framework

A reusable Android/iOS platform for two independent products: an SPL learning app and a digital gliding logbook.

## Status and source of truth

As of 2026-10-08, the initial repository documentation has been reconciled with the earlier Phase 1 architecture draft. Requirements, the focused technology review and proposed test gates are documented; base PoC stack approval is pending. No app, live integration or device test has been implemented or passed.

GitHub is the authoritative versioned project record. This README is the central documentation; supporting ADRs, source snapshots and evidence are linked here. Chats support discussion and do not replace this record. Documentation and communication use English; the original German source snapshot remains unchanged.

Changes go directly to `main` with traceable commits and Issues; no pull requests (Manuel's instruction, 2026-10-08). Manuel owns product decisions and binding architecture approval. A recommendation in an earlier draft is not an approval.

- [Requirements reconciliation](docs/architecture/phase1-reconciliation.md)
- [Original Phase 1 draft snapshot](docs/reference/Segelflug_Plattform_Architektur_Phase1.md): draft 0.2, Library version 2, read on 2026-10-08; preserved as historical evidence, not current operating instructions.
- [ADR 0001: Repository and direct commit workflow](docs/adr/0001-project-workflow.md)
- [ADR 0002: Phase 1 PoC stack](docs/adr/0002-phase1-technology-proposal.md) — proposed, reviewed and awaiting explicit approval.
- [Technology comparison, current costs and executable test gates](docs/architecture/phase1-technology-review.md).
- [Agent rules](AGENTS.md) and [ADR template](docs/adr/template.md).

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

## Carried-forward architecture proposal

The earlier draft already recommends the following baseline. The [focused review](docs/architecture/phase1-technology-review.md) supports testing this baseline; preserve it as a proposal pending explicit approval in [#5](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/5), rather than restart the architecture from a blank slate.

| Area | Proposed baseline | Validation / decision gate |
| --- | --- | --- |
| Mobile | Expo, React Native, strict TypeScript | Native Android/iOS builds, deep links and SDK behavior; focused Flutter comparison |
| Workspace | pnpm monorepo; no additional build orchestrator initially | Reproducible lockfile/setup and fast CI |
| Backend | One shared Supabase project per environment | Auth, Postgres authorization, private Storage and server functions; separate dev/staging/prod |
| Local data | SQLite per app and account; local UI reads/writes | Persistence, migrations, account isolation and actual encryption capability |
| Sync | PowerSync through a narrow adapter | Trial of filters, driver, conflict queue, migrations and costs before adoption |
| AI / RAG | Server-side OpenAI gateway; Supabase pgvector candidate | Validated outputs, source evidence, authorization, usage and budget |
| Document export | Existing Python PDF/XLSX generator through a bounded worker | Inspect current source before reuse; private jobs, versioned snapshots and fixture regression |

Use one selected SQLite driver/write path. Avoid an independent general outbox competing with a sync SDK queue. Supabase RLS alone is not proof that a replication/sync stream is private; test its filters separately.

Shared technical modules handle contracts, auth, data, sync, files, settings, permissions, AI calls and UI as needed. Learning and logbook domain code uses pure contracts/helpers and contains no Expo, Supabase or OpenAI SDK dependencies. Neither domain imports the other. App composition wires these boundaries; no universal plugin runtime is planned.

## Proposed repository layout

| Path | Responsibility |
| --- | --- |
| `apps/platform-lab/` | Minimal Phase 1 test app, before full product shells |
| `apps/spl-learning/` | Independently released learning app |
| `apps/flight-logbook/` | Independently released logbook; canonical spelling here, replacing draft's `glider-logbook` |
| `packages/` | Contracts, auth, data, sync, files, AI client and pure domains, only as needed |
| `backend/` | Technology-neutral backend boundary |
| `supabase/migrations/`, `supabase/functions/` | Candidate-specific implementation paths if Supabase is approved |
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
| P1 | Reconcile architecture, requirements and trial contracts | Reconciliation and official-source technology review completed; approval [#5](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/5) open |
| P2 | Minimal workspace, platform-lab and fast CI | [#6](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/6), open |
| P3 | Early auth, user data and sync-risk trial | [#1](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/1) with [#4](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/4), not tested |
| P4 | Authorized live own-flight retrieval | [#2](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/2), not tested |
| P5 | RAG ingestion/retrieval and AI gateway | [#3](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/3), not tested |
| P6 | Expand shared modules, two shells and offline behavior | [#4](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/4) with shell acceptance in [#8](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/8), not tested |
| P7 | Private files, bounded photo analysis and Python export | [#7](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/7), not tested |
| P8 | Integrated device acceptance and runbook | [#8](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/8), not tested |

Auth and sync risks are tested together early; broader abstraction follows the results. Vereinsflieger research and synthetic RAG preparation can progress independently. A blocked external integration does not prevent unrelated preparation.

A CSV import or mock does not prove live Vereinsflieger access. Obtain supported documentation/access and an authorized test account before claiming success. The earlier draft's unofficial OpenAPI/AppKey research is a lead to verify, not an independently confirmed flight API here.

## Security, testing and operating limits

Never commit secrets, real flight exports, photos or personal databases. Use synthetic fixtures. Keep provider/service-role keys server-side; public project configuration alone cannot authorize private operations. Test API, sync, storage, jobs and local isolation individually, including forged references and owner changes.

Separate environments, private files, short-lived download links and secure token storage are planned. Test actual token size/platform behavior, migrations and local encryption; do not assert encryption until verified. Source licensing and data processing across all chosen providers must be resolved before production.

CI follows direct-main commits: type/lint checks, focused domain/protocol tests, real SQL/RLS and SQLite/sync tests where available. Native Android/iOS E2E and structural/visual export checks follow relevant implementation. App rollback does not reverse database migration.

Per test record commit, date, environment/device, synthetic inputs, command, expected/actual result, failures, latency/cost and limitations. platform-lab reports not tested, blocked, passed or failed with evidence. Full acceptance is in #8.

## Cost and effort status

The archived source contains an initial estimate of 18–28 person-days net, or 24–37 with integration reserve. It also contains supplier tariff assumptions and token-cost examples. These are inherited planning estimates, not a delivery commitment, fresh price verification or measured usage.

The [2026-10-08 review](docs/architecture/phase1-technology-review.md#cost-review) checks official Supabase, PowerSync and EAS tariffs. Initial trials can use local/free tiers. Listed paid base fees for one Supabase Pro/Micro project plus PowerSync Pro start at $74/month; optional EAS Starter makes $93/month, before AI, overages and other services. AI rates and model quality were not refreshed or measured. No cloud resources, subscriptions or AI calls were created; agree a bounded budget before paid API runs.

## Low-usage availability and cost constraint

Manuel clarified on 2026-10-08: the app may have few users and long idle periods; avoid inactivity pausing and avoid subscription costs. This reopens the hosted-backend availability assessment in #5 before stack approval.

[Supabase's pausing guide](https://supabase.com/docs/guides/platform/free-project-pausing), checked 2026-10-08, defines inactivity as insufficient database activity over seven days, not strictly zero use. It says a few daily database requests typically prevent pausing; paid plans are exempt. A scheduled real database health check is a possible best-effort approach, not a guaranteed exemption. No monitoring job has been configured.

Compare this approach with a serverless free-tier alternative and self-hosting. Assess authentication, private files, RAG, offline sync, quota behavior and recovery together; a free database alone is not a replacement backend. Self-hosting avoids the managed plan's inactivity rule but adds infrastructure and maintenance responsibilities. No alternative or acceptance of best-effort availability has been approved.

## Next action and unresolved decisions

Next: resolve the low-usage/no-subscription availability constraint in #5, then obtain Manuel's explicit approval of the PoC stack / ADR 0002. Then build the minimal platform-lab (#6) and run the auth/user-data plus initial sync trial (#1/#4).

Open: technology approval, PowerSync adoption, actual SDK versions, service configuration/test accounts, permitted Vereinsflieger transport and scope, content rights, API budget, document-worker hosting, available iOS/Android test environments, production privacy/deletion/backup and release requirements.

Verification so far: current README/agent rules/ADR and Issues read; full earlier source draft (version 2) read; requirements and test plan reconciled; official-source mobile/sync/backend/pricing review completed. The current Linux session lacks docker, adb and xcodebuild on PATH; #6 must establish an appropriate runner. No runtime, cloud or device checks have been executed.

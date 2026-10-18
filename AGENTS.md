# Agent rules for MoFlight

## Project map and sources of truth

- [README](README.md) is the central project documentation. Keep requirements, architecture, status and meaningful test evidence aligned with code.
- [Project plan](docs/project-plan.md) controls priorities, milestones and next actions. Read the relevant current source, documentation and ADRs before changing them. Update the roadmap for material status/decision changes; keep detailed results in verification reports.
- Communicate and maintain active documentation in English; preserve historical source snapshots in their original language.

| Location | Responsibility |
| --- | --- |
| `apps/platform-lab/` | Expo/React Native development lab, mobile UI and provider/platform adapters |
| `packages/flight-logbook/` | Pure flight/query/writing domain rules |
| `packages/local-data/` | Local persistence and book contracts |
| `tests/`, `pocs/`, `scripts/` | Synthetic fixtures, automated checks, bounded trials and tooling |
| `docs/product/`, `docs/architecture/`, `docs/adr/`, `docs/verification/` | Requirements, contracts, decisions and evidence |

## Scope, decisions and backlog

- Before implementation, identify the milestone, deliverable, dependencies and acceptance check. Prefer small executable PoCs before broad implementation; support Android/iOS and offline local data.
- Manuel owns product decisions and binding technology approval. Recommendations and recorded ideas are not approval; proposed ADRs remain proposed until an explicit decision.
- GitHub Issues are the authoritative backlog for every planned change, improvement, bug, deferred idea and open decision. Capture work before implementation; do not leave it only in chat, handovers or local TODOs. Check current Issues and extend a matching task; create an Issue for distinct work.
- Keep one short package contract in the matching Issue: scope, exclusions, status, dependencies/open questions and acceptance criteria. Link specifications, commits and evidence; maintain checklists and close only when scoped acceptance is met, with remaining work tracked. Issue creation does not approve implementation or change priority.
- If GitHub is unavailable, record the unsaved backlog item locally, tell Manuel and reconcile when access returns.

## Privacy evaluation guideline

- Manuel approved proportionate, risk-based GDPR/DSGVO evaluation on 18 October 2026: aim for the strongest practical compliance and meaningful protection of people; prioritize measures by their benefit relative to effort. Assess each requirement's applicability/legal position, affected people, plausible harm/likelihood, existing safeguards, residual risk, effort and simpler effective alternatives. Recommend fix, mitigate, defer with explicit risk acceptance, or exclude the feature; imperfect compliance alone does not automatically make every gap a release blocker.
- Manuel may accept a specific remaining risk, including a known compliance gap, when he considers the risk acceptable and further mitigation disproportionate. Record scope, rationale, safeguards, owner/date and revisit trigger in the matching Issue. Keep legal compliance, practical risk and owner acceptance separate; acceptance does not make a legal gap compliant or waive applicable duties. This guideline accepts no individual gap and authorizes no implementation, processing or spending. See [the review's evaluation method](docs/verification/2026-10-18-gdpr-readiness-review.md#approved-evaluation-method) and [#21](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/21).

## Architecture and data invariants

- Add modules/infrastructure only when needed. Keep domain code free of vendor SDKs and feature domains independent.
- Never commit credentials, keys, passwords, tokens, personal flight exports, photos or databases. Use synthetic fixtures. Provider/service-role secrets stay server-side; examples contain placeholders.
- Enforce authorization for APIs, sync, private storage, jobs and referenced objects. Keep MoFlight identity separate from Vereinsflieger authorization. Scope local databases/files/queues per account; preserve and surface pending changes at logout/switch.
- One pilot may own multiple books. Keep account identity, book identity and versioned format distinct; scope paper progress, totals, photos, decisions and writing snapshots to the book. Shared retrieval/account/persistence services must not hard-code gliding layout rules. [ADR 0007](docs/adr/0007-multiple-logbooks-and-formats.md) remains proposed: prove multi-book isolation and format extension before production schema expansion.
- Follow accepted [ADR 0008](docs/adr/0008-logbook-ai-and-deterministic-boundary.md): preserve raw provider/photo evidence. AI transcribes/explains and proposes validated interpretations/matches using task-relevant context; deterministic code computes flight minutes, roles and totals. Unreadable values remain unknown until confirmed.
- Prepare synthetic AI evaluation after the capture contract stabilizes; run budget-approved handwriting evaluation before completing the real photo-to-writing journey. Whole-history LLM analysis is an optional benchmark, not the default importer/calculation engine.
- Read current plugin/skill code before reusing export logic; preserve the existing plugin. Verify current official compatibility/pricing before provider selection; distinguish source estimates from measured results.

## Development and verification

- Follow the [development/verification workflow](docs/development/verification-workflow.md) for check selection, integration checkpoints and evidence reuse. Default to logic-first development: relevant automated tests and TypeScript; no routine screenshots, image analysis, visual audits or native rebuilds for logic-only edits.
- Use `pnpm check` for a complete local host check (types, TypeScript/SQLite tests, Python tests and fixture parity). Read its compact summary first; inspect detailed logs for failures or a specific unresolved question. The runner makes no model calls. Keep focused checks for smaller edits and documentation checks for documentation-only work.
- Use Node 24 and the pinned pnpm in [package.json](package.json). See the [Windows setup](docs/development/windows-local-setup.md) and [lab runbook](apps/platform-lab/README.md) for environment/native commands. Select checks for the affected behavior, not as an unconditional checklist:

| Change | Relevant commands/checks |
| --- | --- |
| TypeScript logic/state/persistence | `pnpm typecheck`; focused tests via `node --import tsx --test tests/mobile/<name>.test.ts`; `pnpm test` when broader regression coverage is needed |
| Python tooling or fixture contracts | Relevant Python tests; `python -m unittest discover -s tests -v` for broader coverage; `python scripts/mobile_fixtures.py --check` when fixtures change |
| Documentation | Links, traceability, consistency and unsupported success/approval claims only; no application tests/builds/devices |
| Platform integration checkpoint | `pnpm bundle`, committed-source Release and relevant native trials under ADR 0009 |

- Finish host-testable logic before planned Release/platform/native acceptance checks; batch small traceable commits. An earlier bounded native PoC is appropriate for concrete platform uncertainty. Repeat checks only for affected changes, failures or unresolved risks.
- No routine subagents for small tasks. Delegate only when independent parallel work warrants the extra cost; coordinate shared files and preserve unrelated edits. For justified simpler delegation, prefer `gpt-6-luna` with explicit reasoning effort `max`; report unavailable combinations without silently substituting another model/effort.
- Keep one concise verification summary per package, extending existing reports and linking logs. Record commit, environment, actual checks and limits; mark unavailable devices/services as not tested or blocked. Avoid duplicate specifications, repeated full audits and screenshot galleries without a specific acceptance question.
- When changing authorization/authentication, test two users and forged/foreign IDs, registration/confirmation/recovery, preserved identity, expired sessions and account switching.
- When changing sync, test real offline restart, retry/idempotency, conflicts, delete/reinitialization, migrations and independent stream filters.
- When changing RAG, check retrieval, factual evidence, contextual source IDs, missing evidence, isolation, latency and measured cost.

## Native, live-provider and release acceptance

- Follow accepted [ADR 0009 and its amendments](docs/adr/0009-local-android-development-and-checkpoint-ci.md): documented local checks, committed-source Release builds and relevant native trials are required before scoped acceptance/device handoff. Passing host tests/bundles does not prove native runtime; Android does not prove iOS. CSV/mocks do not prove authorized live Vereinsflieger retrieval. Pending acceptance stays explicit.
- For small UI edits, inspect the affected screen/state. For substantial layout/navigation/typography changes, apply the relevant visual matrix: MIN 360 dp checks overlap, keyboard overlays and scrolling; MAIN 390–412 dp targets visual fidelity; at 600+ dp, including landscape/tablets/foldables, center/cap individual forms/detail/card groups or use two-column/master-detail layouts to avoid excessive stretching. A 480 dp cap is illustrative, not mandatory. Record actual logical dp, density and font scale.
- The approved four-screen image remains authoritative for layout, boxes, buttons, spacing and colors; earlier approximate captures are not the target. Do not repeat the visual matrix for unrelated logic changes.
- Hosted CI is optional and manual-only. Unavailable hosted checks do not block acceptance supported by complete required local evidence. No paid CI, spending-limit increases, billing changes or paid runner/storage usage are authorized; do not dispatch hosted runs without confirmed free eligibility.

## Git and operational safeguards

- Work directly on `main` with traceable commits; no PRs required or wanted.
- Preserve unrelated changes, dirty build checkouts and provider sessions. Use only `MoFlight_Synthetic_API37` for destructive local smoke tests; keep provider-session emulators separate.
- Use an expected head SHA when updating refs through an API. If write access fails, state which changes are not saved.

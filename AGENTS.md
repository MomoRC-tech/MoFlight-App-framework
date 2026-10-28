# Agent rules for MoFlight

## Project map and sources of truth

- [README](README.md) is the central project documentation. Keep requirements, architecture, status and meaningful test evidence aligned with code.
- Use the [documentation map](docs/README.md) for maintained sources and the [archive](docs/archive/README.md) for superseded plans/rejected designs. Move obsolete next-action prose out of current entry points while preserving historical decisions and links; do not archive active requirements or evidence supporting open acceptance gates merely because it is old.
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
- The product owner approves product decisions and binding technology choices. Recommendations and recorded ideas are not approval; proposed ADRs remain proposed until an explicit decision.
- GitHub Issues are the authoritative backlog for every planned change, improvement, bug, deferred idea and open decision. Capture work before implementation; do not leave it only in chat, handovers or local TODOs. Check current Issues and extend a matching task; create an Issue for distinct work.
- Classify every Issue when creating or updating it. Start its title with exactly one `[Category]` prefix (at most eight letters inside the brackets) and apply the matching primary category label from the table below. Choose the primary deliverable; UI and cloud work have explicit categories. Preserve descriptive title text and unrelated labels; replace an old category/prefix when scope changes instead of stacking them. Category does not imply approval, priority, completion or release inclusion; a requested enhancement is not automatically a bug.

| Title prefix | GitHub label | Primary purpose |
| --- | --- | --- |
| `[Feature]` | `enhancement` | User-facing capability or improvement |
| `[Bug]` | `bug` | Existing behavior violates its intended contract |
| `[Platform]` | `platform` | Shared/local foundations, builds, CI and technical maintenance |
| `[UI]` | `ui` | Interface, design, navigation, interaction and accessibility |
| `[Cloud]` | `cloud` | Cloud Auth/data, account integration and synchronization |
| `[Research]` | `research` | Discovery, investigation and feasibility proof |
| `[Decision]` | `decision` | Product, architecture or commercial choice |
| `[Quality]` | `quality` | Verification, acceptance, audits and traceability |
| `[Privacy]` | `privacy` | Data protection, privacy policies and readiness |
| `[Docs]` | `documentation` | Documentation and maintained references |

- Keep one short package contract in the matching Issue: scope, exclusions, status, dependencies/open questions and acceptance criteria. Link specifications, commits and evidence; maintain checklists and close only when scoped acceptance is met, with remaining work tracked. Issue creation does not approve implementation or change priority.
- If GitHub is unavailable, record the unsaved backlog item locally, report it and reconcile when access returns.

## UI and design

- [UI design handbook](docs/product/design/README.md) is the current visual starting point. Read its authority, foundations, component/symbol and layout rules before appearance changes; preserve original references and distinguish approved intent from implemented values. Edit maintained chapters/catalogue and regenerate portable views with `python scripts/design_handbook.py`; use `--check` for source/output freshness and link coverage. Historical design records do not override its scoped current decisions.
- The approved dark [Compact Cockpit contract](docs/product/design/compact-cockpit.md) and handbook override conflicting historical appearance/layout instructions within their scope. Retain the original logo and preserve reference images.
- Preserve the current Start screen except for small, specific corrections. The Material redesign primarily concerns other pages, dialogs and navigation. Do not indirectly restyle/recompose Start through shared tokens. Keep the vivid navy/cyan character; the muted Glacial proposal is rejected.
- Dark is the default/master theme; light is an explicit optional switch, not automatic device-theme selection. Until beta preparation, verify affected UI in dark mode only and reuse valid evidence. Defer light-theme acceptance to the beta checkpoint.
- For layout/design requests, consult current [Google Material 3 guidance](https://m3.material.io) for examples and proposals. Use relevant component guidance alongside the approved MoFlight design contract, explain product-specific adaptations, and keep proposal selection separate from implementation approval.

## Architecture and data invariants

- Add modules/infrastructure only when needed. Keep domain code free of vendor SDKs and feature domains independent.
- Enforce authorization for APIs, sync, private storage, jobs and referenced objects. Keep MoFlight identity separate from Vereinsflieger authorization. Scope local databases/files/queues per account; preserve and surface pending changes at logout/switch.
- One pilot may own multiple books. Keep account identity, book identity and versioned format distinct; scope paper progress, totals, photos, decisions and writing snapshots to the book. Shared retrieval/account/persistence services must not hard-code gliding layout rules. [ADR 0007](docs/adr/0007-multiple-logbooks-and-formats.md) remains proposed: prove multi-book isolation and format extension before production schema expansion.
- Follow accepted [ADR 0008](docs/adr/0008-logbook-ai-and-deterministic-boundary.md): preserve raw provider/photo evidence. AI transcribes/explains and proposes validated interpretations/matches using task-relevant context; deterministic code computes flight minutes, roles and totals. Unreadable values remain unknown until confirmed.
- Prepare synthetic AI evaluation after the capture contract stabilizes; run budget-approved handwriting evaluation before completing the real photo-to-writing journey. Whole-history LLM analysis is an optional benchmark, not the default importer/calculation engine.
- Read current plugin/skill code before reusing export logic; preserve the existing plugin. Verify current official compatibility/pricing before provider selection; distinguish source estimates from measured results.

## Credentials and private development data

- Never commit credentials, keys, passwords, tokens, personal flight exports, photos or databases. Use synthetic fixtures. Provider/service-role secrets stay server-side; examples contain placeholders.
- **Desktop development login:** use the existing DPAPI-encrypted Vereinsflieger login for necessary local development/verification. Follow the [desktop login runbook](docs/development/windows-local-setup.md#encrypted-desktop-development-login) and [#102](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/102) for the store location and secure PowerShell consumption. Check credential status before requesting re-entry; replace only if missing/unreadable or requested. Never expose plaintext in chat, tool/command arguments or logs. Preserve provider sessions; MFA/CAPTCHA may require user interaction. Local credential retrieval is verified; provider login and secure UI-automation consumption remain separate integration checks. This authorization excludes unrelated services, external disclosure and spending.
- **Private flight data:** existing authorization permits necessary local use of the owner's private flight data for app development and verification. Do not request renewed permission solely because the data is private. Keep private inputs/results in ignored local storage, preserve originals and sessions, and keep committed fixtures/evidence synthetic or sanitized. This data-use permission does not itself accept production identity/schema/migration/activation, authorize paid services or external disclosure, or expand the separately selected Medical/billing/member-data scope. [Maintained authorization](docs/architecture/vereinsflieger-import-contract.md#standing-private-flight-data-authorization--19-october-2026), [#2](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/2).

## Privacy evaluation guideline

- Use proportionate, risk-based GDPR/DSGVO evaluation: aim for the strongest practical compliance and meaningful protection of people; prioritize measures by benefit relative to effort. Assess applicability/legal position, affected people, plausible harm/likelihood, safeguards, residual risk, effort and simpler effective alternatives. Recommend fix, mitigate, defer with explicit risk acceptance, or exclude; imperfect compliance alone does not make every gap a release blocker.
- The product owner may explicitly accept a specific remaining risk, including a known compliance gap, when further mitigation is considered disproportionate. Record scope, rationale, safeguards, owner/date and revisit trigger in the matching Issue. Keep legal compliance, practical risk and owner acceptance separate; acceptance does not make a legal gap compliant or waive duties. This guideline accepts no individual gap and authorizes no implementation, processing or spending. See the [evaluation method](docs/verification/2026-10-18-gdpr-readiness-review.md#approved-evaluation-method) and [#21](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/21).

## Development and verification

- Batch related implementation and UI corrections into a coherent package. Use focused checks during editing, then one broader host/native checkpoint when appropriate. Do not rebuild or repeat the visual matrix for wording adjustments; repeat affected checks only for changes, failures or unresolved risks, reusing valid evidence.
- Follow the [development/verification workflow](docs/development/verification-workflow.md) for check selection, integration checkpoints and evidence reuse. Default to logic-first development: relevant automated tests and TypeScript; no routine screenshots, image analysis, visual audits or native rebuilds for logic-only edits.
- For every implementation or bug fix, assess changed behavior, risk and existing coverage before coding. Add or update meaningful unit, contract or integration tests in the same package whenever they provide useful regression protection; prefer deterministic local execution without LLM calls. Reuse sufficient existing tests, and briefly record the rationale when new automated tests add little value. Do not add brittle tests that merely mirror implementation details or tests for documentation-only changes.
- Link affected requirements/stories and journey acceptance scenarios to tests, source-specific evidence and remaining gates in the [roadmap acceptance map](docs/project-plan.md#21-acceptance-traceability). Cover relevant first-use/returning, offline/failure/retry and account/book boundaries; unit-test success does not establish native, live-provider or actual model-quality acceptance.
- Use `pnpm check` for a complete local host check (types, lint, TypeScript/SQLite tests, Python tests and fixture parity). Read its compact summary first; inspect detailed logs for failures or a specific unresolved question. The runner makes no model calls. Keep focused checks for smaller edits and documentation checks for documentation-only work.
- Use Node 24 and the pinned pnpm in [package.json](package.json). See the [Windows setup](docs/development/windows-local-setup.md) and [lab runbook](apps/platform-lab/README.md) for environment/native commands. Select checks for the affected behavior, not as an unconditional checklist:

- Agents own implementation, test maintenance and fixing failures. GitHub Actions executes repository-owned checks/builds and publishes diagnostics. Reuse successful evidence for the same commit/environment and trigger manual native checks when needed. Follow the [portable commands, cost limits and local-only rollback](docs/development/portable-ci.md); do not create autonomous fix/commit loops. GitHub availability is never a prerequisite for local work.

| Change | Relevant commands/checks |
| --- | --- |
| TypeScript logic/state/persistence | `pnpm typecheck`; focused tests via `node --import tsx --test tests/mobile/<name>.test.ts`; `pnpm test` when broader regression coverage is needed |
| Python tooling or fixture contracts | Relevant Python tests; `python -m unittest discover -s tests -v` for broader coverage; `python scripts/mobile_fixtures.py --check` when fixtures change |
| Documentation | Links, traceability, consistency and unsupported success/approval claims only; no application tests/builds/devices |
| Platform integration checkpoint | `pnpm bundle`, committed-source Release and relevant native trials under ADR 0009 |

- Finish host-testable logic before planned Release/platform/native acceptance checks; batch small traceable commits. An earlier bounded native PoC is appropriate for concrete platform uncertainty.
- Keep one concise verification summary per package, extending existing reports and linking logs. Record commit, environment, actual checks and limits; mark unavailable devices/services as not tested or blocked. Avoid duplicate specifications, repeated full audits and screenshot galleries without a specific acceptance question.
- When changing authorization/authentication, test two users and forged/foreign IDs, registration/confirmation/recovery, preserved identity, expired sessions and account switching.
- When changing sync, test real offline restart, retry/idempotency, conflicts, delete/reinitialization, migrations and independent stream filters.
- When changing RAG, check retrieval, factual evidence, contextual source IDs, missing evidence, isolation, latency and measured cost.

## Delegation

- No routine subagents for small tasks. Delegate only when independent parallel work warrants the extra cost; coordinate shared files and preserve unrelated edits. For justified simpler delegation, prefer `gpt-6-luna` with explicit reasoning effort `max`; report unavailable combinations without silently substituting another model/effort.
- For explicitly requested or otherwise relevant **emulator UI-test delegation**, use **`gpt-6.1-sol` with explicit `reasoning_effort: low`, `fork_turns: none`**. Follow the [bounded UI-agent workflow](docs/development/ui-agent.md): start the controller, supply only its generated task to the worker, require all device actions through it, independently review evidence and confirm cleanup. This scoped selection overrides the generic simpler-task Luna preference for UI testing only; it does not trigger routine UI tests for logic-only changes or authorize extra API/CI spending.

## Native, live-provider and release acceptance

- Follow accepted [ADR 0009 and its amendments](docs/adr/0009-local-android-development-and-checkpoint-ci.md): documented local checks, committed-source Release builds and relevant native trials are required before scoped acceptance/device handoff. Passing host tests/bundles does not prove native runtime; Android does not prove iOS. CSV/mocks do not prove authorized live Vereinsflieger retrieval. Pending acceptance stays explicit.
- For small UI edits, inspect the affected screen/state. For substantial layout/navigation/typography changes, apply the relevant visual matrix: MIN 360 dp checks overlap, keyboard overlays and scrolling; MAIN 390–412 dp targets visual fidelity; at 600+ dp, including landscape/tablets/foldables, center/cap individual forms/detail/card groups or use two-column/master-detail layouts to avoid excessive stretching. A 480 dp cap is illustrative, not mandatory. Record actual logical dp, density and font scale.
- Hosted execution is optional. Fast Ubuntu checks run on main pushes and PRs under the existing CI authorization; Android builds/emulator checks remain manual. See [portable CI and rollback](docs/development/portable-ci.md). Unavailable hosted checks do not block acceptance supported by complete required local evidence. No paid CI, spending-limit increases, billing changes or paid runner/storage usage are authorized; do not dispatch hosted runs without confirmed free eligibility.
- Extended spoken accessibility trials are deferred behind core functionality, UI simplification and targeted regression checks. Do not run them routinely or treat them as a blocker for current packages; retain their untested status.

## Git and operational safeguards

- Work directly on `main` with traceable commits; no PRs required or wanted.
- Preserve unrelated changes, dirty build checkouts and provider sessions. Use only `MoFlight_Synthetic_API37` for destructive local smoke tests; keep provider-session emulators separate.
- Use an expected head SHA when updating refs through an API. If write access fails, state which changes are not saved.
- Commit and push completed work. APK deliveries must include a downloadable GitHub Release ZIP link containing only the intended APK and sanitized build metadata; local workspace links alone are insufficient. State the APK's actual source commit.

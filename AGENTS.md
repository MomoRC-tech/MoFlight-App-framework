# Agent rules for MoFlight

## Project and documentation
- README.md is the central project documentation. Update requirements, architecture, status and meaningful test evidence with code.
- docs/project-plan.md controls current priorities, milestones and next actions. Before implementation, identify the milestone, deliverable, dependencies and acceptance check; update the roadmap for material status/decision changes and keep detailed results in verification reports. Reuse existing Issues after checking their current state.
- Read current repository state, README and relevant ADRs before changing them.
- Communicate and maintain active documentation in English. Preserve historical source snapshots in their original language.
- Prefer small executable PoCs before broad implementation; support Android/iOS and offline local data.
- Use subagents for suitable independent project tasks (Manuel, 2026-10-12). For simpler tasks, prefer GPT-6 Luna (`gpt-6-luna`), explicitly requested by Manuel on 2026-10-13, replacing the earlier 6.1 Luna preference. If a requested model cannot be selected, report the actual limitation without silently substituting another Luna version. Coordinate shared files and preserve unrelated changes.
- Add modules/infrastructure only when needed. Keep domain code free of vendor SDKs and feature domains independent.
- Manuel owns product decisions and binding technology approval. An earlier recommendation is not approval; keep proposed ADRs proposed until an explicit decision.

## GitHub
- Work directly on main with traceable commits; no PRs required or wanted (Manuel, 2026-10-08).
- GitHub Issues are the authoritative backlog for every planned change, improvement, bug fix, deferred idea and open decision (Manuel, 2026-10-17). Capture work when identified, before implementation; never leave it only in chat, a handover or a local TODO. Check existing issues and extend the matching task; create a new issue for distinct work. Record scope, status, dependencies/open questions and acceptance criteria; link relevant specifications, commits and verification evidence. Keep issue status/checklists current and close only when the scoped acceptance is met, with remaining work explicitly tracked. Issue creation records intent, not implementation approval or a priority change. If GitHub is unavailable, record the unsaved backlog item locally, tell Manuel and reconcile it when access returns.
- Follow accepted ADR 0009 as amended by Manuel on 2026-10-12: documented local checks, committed-source Release builds and relevant native trials are required before scoped acceptance/device handoff. Hosted CI is optional and manual-only; unavailable hosted checks do not block acceptance supported by complete local evidence. No paid CI, spending-limit increases, billing changes or paid runner/storage usage are authorized. Do not dispatch hosted runs without confirmed free eligibility. Do not interpret a green host test/bundle as native runtime acceptance. Preserve dirty build checkouts and use only MoFlight_Synthetic_API37 for destructive local smoke tests; keep provider-session emulators separate.
- Do not overwrite unrelated changes. Use an expected head SHA when updating refs through an API.
- If write access fails, state which changes are not saved.

## Data, AI and secrets
- Never commit credentials, keys, passwords, tokens, personal flight exports, photos or databases. Use synthetic fixtures.
- Provider/service-role secrets stay server-side; examples contain placeholders.
- Enforce authorization for API, sync, private storage, jobs and referenced objects. Test with two users and forged IDs.
- Keep MoFlight identity and Vereinsflieger authorization separate.
- One pilot may own multiple logbooks. Keep account identity, book identity and versioned format distinct; scope paper progress, totals, photos, decisions and writing snapshots to the book. Do not hard-code gliding layout rules into shared retrieval/account/persistence services. ADR 0007 is proposed; prove multi-book isolation and format extension before production schema expansion.
- Scope local databases/files/queues per account; preserve and surface pending changes at logout/switch.
- AI transcribes/explains; deterministic code computes flight minutes, roles and totals. Unreadable values remain unknown until confirmed.
- Follow accepted ADR 0008: preserve raw provider/photo evidence; AI interpretation and match proposals remain validated suggestions, with task-relevant context. Prepare synthetic evaluation after the capture contract stabilizes; run budget-approved handwriting evaluation before completing the real photo-to-writing journey. Whole-history LLM analysis is an optional benchmark, not the default importer or calculation engine.
- Read current plugin/skill code before reusing export logic; preserve the existing plugin.

## Verification
- Screen-size matrix (Manuel, 2026-10-16): MIN 360 dp checks overlap, keyboard overlays and scrolling; MAIN 390–412 dp is the primary visual-fidelity target; At 600 dp and above (including landscape phones, tablets and foldables at 600–800+ dp), either center and cap individual forms/detail/card groups at a suitable maximum width or switch to a two-column/master-detail layout. Check that elements do not stretch excessively. These are alternative strategies; a particular 480 dp cap is illustrative, not mandatory. Record actual logical dp, density and font scale. Keep the approved four-screen image authoritative for layout, boxes, buttons, spacing and colors; do not treat earlier approximate captures as the target.
- Run appropriate meaningful tests for code changes. For documentation, check links, traceability, consistency and unsupported success/approval claims.
- Record commit, environment, actual checks and limits; mark unavailable devices/services as not tested or blocked.
- Auth: registration/confirmation/recovery, preserved identity, foreign data, expired session and account switching.
- Sync: real offline restart, retry/idempotency, conflicts, delete/reinitialization, migrations and independent stream filters.
- RAG: retrieval, factual evidence, contextual source IDs, missing evidence, isolation, latency and measured cost.
- CSV/mocks do not prove authorized live Vereinsflieger retrieval.
- Verify current official compatibility/pricing before provider selection; never promote source estimates to measured results.

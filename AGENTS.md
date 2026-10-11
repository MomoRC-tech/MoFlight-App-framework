# Agent rules for MoFlight

## Project and documentation
- README.md is the central project documentation. Update requirements, architecture, status and meaningful test evidence with code.
- Read current repository state, README and relevant ADRs before changing them.
- Communicate and maintain active documentation in English. Preserve historical source snapshots in their original language.
- Prefer small executable PoCs before broad implementation; support Android/iOS and offline local data.
- Add modules/infrastructure only when needed. Keep domain code free of vendor SDKs and feature domains independent.
- Manuel owns product decisions and binding technology approval. An earlier recommendation is not approval; keep proposed ADRs proposed until an explicit decision.

## GitHub
- Work directly on main with traceable commits; no PRs required or wanted (Manuel, 2026-10-08).
- Use Issues for tasks and open decisions; check existing tasks before creating duplicates.
- CI should support pushes to main.
- Follow accepted ADR 0009: use the local Windows Android helper/emulator for ordinary development when available. Fast CI runs on every push; dispatch an Android checkpoint before device handoff or declaring native feature acceptance. Do not interpret a green fast workflow as Android runtime acceptance. Preserve dirty build checkouts and use only MoFlight_Synthetic_API37 for destructive local smoke tests; keep provider-session emulators separate.
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
- Run appropriate meaningful tests for code changes. For documentation, check links, traceability, consistency and unsupported success/approval claims.
- Record commit, environment, actual checks and limits; mark unavailable devices/services as not tested or blocked.
- Auth: registration/confirmation/recovery, preserved identity, foreign data, expired session and account switching.
- Sync: real offline restart, retry/idempotency, conflicts, delete/reinitialization, migrations and independent stream filters.
- RAG: retrieval, factual evidence, contextual source IDs, missing evidence, isolation, latency and measured cost.
- CSV/mocks do not prove authorized live Vereinsflieger retrieval.
- Verify current official compatibility/pricing before provider selection; never promote source estimates to measured results.

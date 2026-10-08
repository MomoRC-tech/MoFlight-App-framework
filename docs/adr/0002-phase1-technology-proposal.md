# ADR 0002: Carried-forward Phase 1 technology proposal

- Date: 2026-10-08
- Status: Proposed — pending compatibility/cost review and Manuel's approval
- Decision owner: Manuel Singer
- Tracking: [#5](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/5)

## Context

The earlier Phase 1 draft already recommends a stack. The initial repository overview omitted several parts and appeared to reopen planning from scratch. [Reconciliation](../architecture/phase1-reconciliation.md) restores the proposal without treating it as approved or tested.

## Proposal

- Expo / React Native / strict TypeScript; pnpm monorepo.
- Minimal platform-lab first, followed by independent learning and logbook app identities/builds.
- Shared Supabase backend per environment; same account identity with independent app sessions.
- SQLite per app/account; PowerSync through a narrow adapter as an experiment.
- Server-side OpenAI gateway; Supabase pgvector as RAG candidate.
- Preserve the existing Python export generator in a bounded worker after inspecting its current code.
- Pure learning/logbook domains, versioned contracts and deterministic flight arithmetic.

## Alternatives and unresolved trade-offs

A focused Flutter comparison addresses native requirements, agent toolchain and integration effort. A limited explicit sync implementation is an alternative if PowerSync's driver/filter/conflict/migration/cost gates fail. A complete custom general sync system is outside the small baseline's scope.

Review current official SDK compatibility, secure storage/deep links, native driver capabilities, sync filters, migration behavior, prices/limits and worker hosting before selection. Historical source tables do not substitute for this review.

## Decision gates

1. Approve the base PoC technology choice after presenting the focused comparison.
2. Keep PowerSync adoption conditional on #1/#4: real builds, isolation, persistence, conflicts, reinitialization, migration and cost.
3. Choose Vereinsflieger transport after documented supported access and a real authorized trial (#2).
4. Accept RAG based on retrieval, citation/gap tests and measured usage (#3).
5. Agree paid test budget/service configuration before paid requests or provisioning.

This ADR records a proposal only. No approval, implementation, paid subscription or production deployment is implied.

## Consequences and validation

Start small, retain adapter boundaries and avoid premature scaffolding. The trials can reject parts of the proposal while independent work continues. Record measured results and revise this ADR when Manuel makes the technology decision.

# ADR 0002: Phase 1 PoC stack

- Date: 2026-10-08
- Status: Proposed — official-source review complete; awaiting Manuel's explicit approval
- Decision owner: Manuel Singer
- Tracking: [#5](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/5)
- Evidence: [Technology comparison, costs and test gates](../architecture/phase1-technology-review.md)

## Context

The archived Phase 1 draft recommends a shared mobile platform. The requirements reconciliation preserves that proposal. The focused review now supports testing it, but no dependency matrix, integration or native build has been demonstrated.

## Proposed decision for the PoC

1. Expo / React Native / strict TypeScript in a pnpm monorepo; native development builds for platform acceptance.
2. One Supabase backend per environment, shared by both apps: Auth, Postgres, private Storage and server functions. Start with local synthetic tests; hosted resources are configured at the relevant test step.
3. SQLite per app/account with one selected write path. Trial PowerSync's documented native OP-SQLite adapter and SDK queue; no parallel generic outbox.
4. Authenticated server-side AI gateway and pgvector retrieval. Model choice and paid test budget remain separate.
5. Preserve the existing Python export approach as a later bounded worker after inspecting current code. Worker hosting remains undecided.
6. Build platform-lab first; add independent product shells and packages only as needed. Domain code stays free of vendor SDKs and cross-domain imports.

Approval here authorizes the small PoC implementation and PowerSync experiment; it does not adopt PowerSync for production or authorize subscriptions, paid AI runs, production deployment, content reuse or a Vereinsflieger transport.

## Alternatives and consequences

Flutter supports the target platforms. Expo is preferred for this project's shared TypeScript tooling and existing proposal; no performance or agent-quality advantage has been measured. Revisit if native requirements fail.

PowerSync reduces synchronization plumbing while leaving write validation and conflicts to our backend. Its download filters require separate security tests from Supabase RLS. A limited explicit-sync implementation is the fallback if native compatibility, isolation, recovery or costs fail; it requires its own cursor, queue, conflict and deletion design. Supabase Realtime alone does not satisfy the offline contract.

SecureStore is the proposed session storage boundary, with actual payload/lifecycle tests. SQLite encryption remains unresolved for the selected driver. SDK-managed schema projection does not eliminate semantic migration or pending-write recovery tests.

Checked public base fees: Supabase Pro $25/month plus PowerSync Pro from $49/month = $74/month; optional EAS Starter adds $19/month. Free tiers can support initial trials. These derived base-fee scenarios exclude AI and other operating costs; full source-linked limits are in the review.

## Decision and test gates

- Manuel explicitly approves the base PoC stack before binding implementation.
- #6: locked compatible versions, reproducible workspace, push-to-main CI and actual native build evidence.
- #1/#4: two-user API and stream isolation, offline restart/reconnect, idempotency, conflicts, queue rejection, deletion/reset and schema evolution before PowerSync adoption.
- #2: supported own-flight retrieval and authorized live comparison before Vereinsflieger transport selection.
- #3: retrieval/citation/gap/usage evaluation before RAG acceptance.
- #7: current export code inspection and bounded private worker before reuse/deployment.
- Separate service/budget approval before subscriptions or paid requests.

The current Linux session has no docker, adb or xcodebuild on PATH. Local Supabase and native/device checks remain unavailable until a suitable runner is established; documentation review does not pass those gates.

## Validation and approval record

Official documentation/pricing and current repository requirements were reviewed on 2026-10-08. Details, sources, test sequence and limitations are recorded in the linked review. No runtime tests, paid calls or provisioning occurred. No approval has been recorded; keep this ADR Proposed until Manuel decides.

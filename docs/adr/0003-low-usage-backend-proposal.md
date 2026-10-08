# ADR 0003: Low-usage backend and explicit offline sync

- Date: 2026-10-08
- Status: Proposed — architecture approval pending
- Decision owner: Manuel Singer
- Tracking: [#5](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/5)
- Evidence: [Complete backend comparison and official sources](../architecture/low-usage-backend-comparison.md)

## Context

Few users and weeks without activity are expected. Avoid subscription costs and inactivity pauses requiring an owner to restore service. The Supabase/PowerSync proposal remains unapproved. Automatic request-driven wake-up is distinct from manual resumption. Free infrastructure is quota-bound and does not make AI usage free.

## Options

- Supabase Free + external transactional SMTP + monitored real database reads: fewest integrated SQL components; mitigation is best effort, not a pause exemption. Paused projects require owner restoration.
- Workers Free + D1 + Firebase Auth Spark + private R2, optionally Vectorize: request-driven SQL; custom authorization/sync; R2 requires metered subscription activation.
- Neon Free + Workers + Firebase Auth + R2: Postgres/pgvector and documented automatic wake; extra provider and compute quota; R2 gate remains.
- Convex Free + Firebase Auth Spark: data/files/functions/search bundled without billing-enabled storage; custom token-verification boundary and explicit mobile sync.
- Firebase Blaze: native offline database and managed identity; files/functions require billing-enabled service.
- Self-hosted Supabase or PocketBase: avoids managed idle rules; owner operates hardware, mail, security and private backup/restore. Appwrite Free fails the idle gate.

The linked review contains full component coverage, quotas and current official evidence.

## Proposed decision

Trial **Convex Free + Firebase Authentication Spark + SQLite per app/account with bounded explicit sync**, without PowerSync. This is our proposed composition, not a vendor-certified integration or final production selection.

Authenticate every client-facing Convex HTTP action using Firebase's documented ID-token verification. Keep corresponding data/search/job functions internal; derive ownership from verified issuer/UID. Firebase handles password verification/recovery through its default hosted email handler. No Clerk domain, R2 subscription, Firebase Storage/Functions, Starter or Blaze is required for this trial.

Private file bytes use authenticated HTTP routes and bounded files; do not expose permanent bearer URLs. Use server-side actions for approved future AI. Start retrieval-only with permitted synthetic/self-authored content; no paid model calls or embeddings.

One durable SQLite outbox and one transactional per-account server change sequence handle push/pull. Preserve receipts, conflicts, tombstones, stale-cursor reset and pending work across account switching. No automatic background-sync promise or broad CRDT design.

Keep provider-specific SDKs out of domains, maintain ordinary domain IDs and test data/file export/restore. Mobile/workspace choice remains separately proposed in [ADR 0002](0002-phase1-technology-proposal.md).

## Consequences

The trial minimizes service assembly and avoids a documented weekly-pause dependency. Convex/Firebase's checked documents do not publish a weekly inactivity rule, but do not establish an unconditional exemption or SLA. Confirm policy and run a multiweek idle trial before release; do not claim availability already proven.

We own the token verifier and offline protocol. Convex is a document backend with vendor-specific functions/search and modest shared free quotas; private file/backup egress may exhaust first. HTTP file responses have a 20 MiB cap; propose 5 MB lab files. Quota errors must preserve offline edits and fail closed.

Clerk has a simpler documented Convex/Expo integration but requires an owned production domain; do not assume one. Workers/D1 or Neon is the fallback if SQL portability is preferred and later metered file storage is accepted. Supabase is the fallback only with explicit acceptance of best-effort pause prevention.

PowerSync's free weekly deactivation and paid base fee do not presently justify another dependency. Reopen if measured synchronization complexity outweighs operating costs; do not assume D1/Convex source compatibility.

## Validation and approval

Approval requested: authorize this bounded unbilled trial and accept its document model/custom-auth/sync trade-offs, subject to existing #1/#4/#7 security and recovery gates plus idle/quotas/export tests in #8. Necessary free setup follows only after approval. No paid plans, billing-enabled services, paid AI or release are authorized by this proposal.

Desk review completed 2026-10-08; source links, repository consistency and traceability checked. No resources, tests, monitoring or user approval exist for the new composition. Keep Proposed. Record Manuel's choice and date here and in #5 before implementation.

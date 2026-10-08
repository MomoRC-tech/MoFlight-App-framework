# ADR 0003: Low-usage backend trial and offline synchronization

- Date: 2026-10-08
- Status: Accepted for initial backend provider/hosting only; detailed sync implementation remains proposed
- Decision owner: Manuel Singer
- Tracking: [#5](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/5)
- Evidence: [Complete backend comparison](../architecture/low-usage-backend-comparison.md), [logbook user stories](../product/flight-logbook-user-stories.md)

## Context and decision record

Few users and weeks without activity are expected. Avoid subscription costs; preserve local data and queued edits through outages. Automatic database wake-up is distinct from a provider pause requiring operator restoration.

The earlier evaluation recommended Convex Free plus Firebase Auth. A subsequent hardware discussion suggested a private self-hosted Supabase trial on the existing NUC. That assessment was prepared in commit 12af7989a357bd1e3e6e01b3d7b1efb0168c59b8 but was not added to main; it is not the project baseline.

Manuel then explicitly instructed on 2026-10-08: “i want the First Trial with supabase Cloud free, later we might move that to a local instance.” This selects the provider/hosting for the first trial and supersedes both earlier recommendations. It does not approve a production architecture, paid service, paid AI request or all pending mobile/sync details.

## Accepted provider/hosting decision

Use **Supabase Cloud Free** for the first bounded backend trial: Supabase Auth, Postgres with tested RLS, private Storage and authenticated server functions. Shared backend identity supports both apps, with separate app sessions. Keep schema, grants, RLS and functions versioned in this repository.

Self-hosted Supabase is a possible later migration, preferably assessed on the NUC. Do not deploy on the NUC or Home Assistant Pi now. No Supabase Pro subscription, PowerSync deployment or Convex/Firebase implementation is selected for the first trial.

Ordinary users' email verification/recovery needs external SMTP; the built-in sender is limited to project-team addresses and is not a general delivery service. Select/test a suitable free SMTP arrangement separately; preserve identity and data through recovery. No provider account, secret or mail service is configured by this ADR.

## Proposed implementation details and preserved contracts

- SQLite per app/account, local UI reads/writes and one durable outbox. Use bounded explicit command/delta synchronization on foreground/reconnect/refresh. PowerSync stays deferred; its operating benefit can be reconsidered after measurements.
- Authenticated server commands derive user identity from verified sessions. Test RLS reads/writes, ownership changes/references, sync, files and jobs separately. No privileged service key in a client.
- Immutable learning events, idempotent receipts, version-checked flight/anchor edits, per-account transactional change sequence, paged pull/high-water mark, deletion tombstones and stale-cursor reset. Preserve pending work through account switch, expiry and quota errors.
- Postgres full text/pgvector is the retrieval candidate. Start with permitted self-authored content and retrieval-only tests. Server-side AI boundary reserves budget and records outcomes; paid generation/embeddings/photo analysis remain disabled until separately approved.
- The logbook workflow persists inputs, observations, matches, findings, user decisions and resolved export snapshots. PDF generation does not advance actual paper state. Python worker hosting/code reuse is separately evaluated in #7.

These implementation details remain proposals, not capabilities claimed to work or an implicit approval of Expo/React Native/TypeScript. Mobile/workspace decision remains [ADR 0002](0002-phase1-technology-proposal.md).

## Availability and cost consequences

Cloud Free may pause for low database activity over seven days. The first returning app request is not the documented restoration path; owner Dashboard resume may be necessary. Best-effort monitored real database reads can reduce risk but do not guarantee prevention. Provider choice is accepted for this trial with that disclosed limitation; it is not a promise of weeks-idle availability.

Propose a small independently scheduled real DB probe, minimal permissions, expected-response verification, missed-run/failure alerts and an owner-resume runbook. Select scheduler/alert delivery at setup; none is installed. Test paused/unavailable behavior without losing offline edits. Do not silently upgrade a plan to avoid a failed trial.

Use free quotas with explicit file/usage bounds and private backup exports, including file bytes. Hosting can target $0 within allowances; email/worker/AI, store distribution and backup costs are separate decisions. No paid requests or billing-enabled plans are authorized.

## Possible later self-hosting

Keep app-domain IDs/contracts independent of managed endpoints and make environment URLs/configuration replaceable. Retain migrations, reproducible functions and schema/data/file export tooling. A later move must test Auth user IDs/password access/session changes, Storage bytes/policies, functions, SMTP/recovery redirects, secrets, local pending edits and restore behavior. It is not merely an endpoint change or guaranteed one-click migration.

The NUC shares capacity with Hermes; measure CPU/RAM/disk and operating readiness before selecting it. Keep Home Assistant's Pi dedicated initially. Public HTTPS, monitoring, upgrades, database/file backups and restoration become owner responsibilities when self-hosted.

## Validation and remaining decisions

Official pausing, SMTP and migration documents rechecked on 2026-10-08; source-linked alternatives remain in the comparison. Backend selection is recorded from Manuel's current instruction. No resources provisioned, monitoring configured, paid calls executed or app/integration/device tests passed.

Existing gates remain: #1 Auth/recovery/RLS; #2 supported own-flight access; #4 offline persistence/retries/conflicts; #7 private files, reconciliation/feedback/export; #8 outage/quota/export-restore and integrated device evidence. #5 stays open for mobile/workspace, exact sync, SMTP/monitoring and worker-hosting choices. Record actual setup/tests separately; this provider selection is not a passed test.

## Official sources

Checked 2026-10-08:

- [Supabase Cloud Free pausing and owner restoration](https://supabase.com/docs/guides/platform/free-project-pausing).
- [Supabase SMTP requirements and default restrictions](https://supabase.com/docs/guides/auth/auth-smtp).
- [Restore a managed project to self-hosted Supabase](https://supabase.com/docs/guides/self-hosting/restore-from-platform).
- [Self-hosting responsibilities](https://supabase.com/docs/guides/self-hosting).

Historical alternatives and quota/source details remain in the complete comparison; that review's earlier recommendation is superseded by this decision.

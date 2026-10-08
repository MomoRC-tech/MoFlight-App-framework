# Low-usage backend comparison

Date: 2026-10-08. Owner: Manuel Singer. Tracking: [Issue #5](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/5).
Status: official-source desk review; architecture approval pending. No resources provisioned, paid AI calls executed, app implemented or integration tests passed.
Baseline: main commit 303d3d81c408aebe3cc5f488ce9677d832753bab; README, AGENTS.md, ADR 0002, technology review and Issue #5 read first.

## Recommendation for approval

Trial **Convex Free + Firebase Authentication on Spark + account-scoped SQLite with bounded explicit synchronization**, without PowerSync. This is our architecture inference, not a vendor-provided turnkey combination.

It covers database, private file storage, server-side execution and text/vector retrieval without activating a metered file-storage plan. Firebase supplies email/password, verification and password recovery without our own SMTP service or purchased domain. Use Convex's supplied HTTP endpoint; Firebase's default hosted email action handler is available [F1–F4, C1–C7]. Neither provider's checked documentation publishes a Supabase-style weekly inactivity-pause rule for these services. That absence is **not an explicit permanent exemption or an uptime guarantee**: confirm the policy and run a multiweek idle trial before release. This is a proposed PoC choice, not production acceptance.

The cost is a small but security-critical Firebase-token verifier at the HTTP boundary, our own narrow sync protocol, two provider accounts, and a less portable document database. Compared with Workers/D1, Convex bundles files, search and transactions and avoids R2 billing activation. Compared with Supabase, it avoids a documented weekly pause dependency. Clerk is a simpler documented Convex SDK integration, but its production setup requires an owned domain/DNS; do not silently assume an existing domain or call a new domain free [C8, K1–K3].

**Fallback if SQL portability matters more and metered storage activation is acceptable:** Firebase Auth + Cloudflare Workers Free + D1 + private R2 Standard, with Vectorize only when semantic retrieval is needed. No fixed monthly infrastructure fee within the free allowances, but R2 requires checkout/subscription activation and bills overages [W1–W6]. This falls short of a strict “no billing-enabled services” requirement.

**Fallback if preserving the earlier stack matters more:** Supabase Free + free transactional SMTP + monitored database checks + the same explicit SQLite sync. It is the simplest integrated SQL backend, but requires explicit acceptance of best-effort pause avoidance. It cannot satisfy a firm requirement that weeks of non-use never require owner restoration [S1–S5].

“No monthly subscription” and “no possibility of a bill” are different approval choices. Free infrastructure does not make commercial AI APIs free. Generation, embeddings, handwriting analysis and a hosted Python export worker remain separate cost/hosting decisions. Keep paid AI execution disabled during this trial.

## Complete approaches

All rows include an identity service, private data, files, an execution boundary and a retrieval path. Local databases and files remain per app/account. These are proposed compositions, not tested integrations.

| Approach | Authentication and recovery | Private data and files | Offline synchronization | Server AI and RAG | Effort and constraint |
| --- | --- | --- | --- | --- | --- |
| A: Supabase Free + transactional SMTP + monitored checks | Supabase email/password; external SMTP for user verification/recovery | Postgres RLS; private Storage policies; authenticated download or short-lived signed URL | SQLite outbox + authenticated command/delta API; Realtime only an optional online hint | Edge Functions gateway; Postgres full text/pgvector with visibility filters | Fewest SQL backend pieces; email and external monitoring still operated; weekly pause risk [S1–S6, E1] |
| B: Workers Free + D1 + Firebase Auth Spark + R2 Standard | Firebase email/password and hosted recovery; Worker validates ID token | D1 behind Worker ownership checks; private R2 behind authorized Worker, no public bucket | Same explicit sync; no built-in mobile database replication | Worker proxies external AI; D1 FTS5 first, Vectorize for vectors | More assembly; 10 ms CPU gate; R2 billing-enabled even when bill is $0 [F1–F4, W1–W7] |
| C: Convex Free + Firebase Auth Spark | Same Firebase lifecycle; verifier in Convex HTTP actions | Convex internal queries/mutations; owned file metadata; authenticated HTTP file serving | SQLite + explicit sync; do not rely on Convex's online client queue for restart durability | Internal actions call AI; text/vector indexes; prefilter visibility and recheck documents | Recommended complete unbilled trial; custom auth boundary, sync and document-model portability are trade-offs [C1–C7, F1–F4] |
| D: Firebase Auth + Firestore + Storage + Functions on Blaze | Firebase lifecycle; one shared identity project | Firestore Security Rules, Storage Rules; privileged server SDK needs separate ownership checks | Native Firestore persistent offline cache; last-write-wins needs domain conflict rules; verify native RN integration | Functions server gateway; bounded corpus retrieval or separate vector service | Mature mobile stack, but Spark is incomplete: Storage and deployed Functions need billing-enabled Blaze [F4–F6] |
| E: Neon Free Postgres + Workers Free + Firebase Auth + R2 | Firebase lifecycle; alternatively evaluate Neon's managed auth separately | Worker ownership checks/DB privileges; private R2 | Same explicit SQLite sync | Worker AI proxy; Neon full text/pgvector | Automatic DB wake, SQL portability; extra provider/compute quota and R2 billing gate [N1–N3, W1–W5] |

Vereinsflieger authorization remains separate from MoFlight accounts. None of these choices grants supported Vereinsflieger API access or resolves #2. Native Expo/React Native/TypeScript also remains proposed; this comparison does not approve it.

## Idle and recovery behavior

An automatic cold start is acceptable for occasional use if the request succeeds within a bounded timeout. A provider pause requiring operator action is a different failure mode.

| Service / mode | Idle behavior documented or inferred | First returning user | Operator involvement |
| --- | --- | --- | --- |
| Supabase Free | Low database activity over seven days can trigger pause | A normal app request is not the documented restoration mechanism | Owner resumes in Dashboard; current restore window is one year [S1] |
| Workers + D1 | Request-driven serverless compute; D1 explicitly describes scale-to-zero pricing [W1, W2] | Request runs the Worker/query; no weekly manual-resume workflow found in checked docs | No routine idle restoration expected; this is not an SLA |
| Neon Free | Compute sleeps after five minutes; next query automatically reactivates [N2] | Automatic wake with added latency | None for ordinary idle; exhausted monthly compute/transfer is a separate suspension [N1] |
| Convex Free regular production deployment | No weekly idle-pause rule found in checked pricing, limits and pause docs [C1–C3, C9] | Expected to serve requests without owner resume; inference, not explicit always-on promise | Confirm policy and test after weeks idle. Manual pause requires resume; usage-limit disabling has separate recovery |
| Convex preview deployment | Automatically cleaned up after five days on Free [C3] | Deleted preview is not a permanent backend | Use a regular production deployment for durability; keep lab/prod environments isolated |
| Firebase Auth/Firestore | No weekly inactivity pause described in checked product/pricing docs [F1–F6] | Normal sign-in/query expected; expired sessions may require login | Quotas, disabled billing and abuse enforcement are separate from idleness |
| Appwrite Cloud Free | No development activity for seven days triggers pause; paused projects deleted after 90 days [A1, A2] | Reactivation documented through Console | Reject as a solution to this constraint |
| PowerSync Cloud Free | Deactivation after one week inactivity [P1] | Automatic client-triggered recovery was not established by checked sources | Do not assume auto-wake; clarify and test recovery if reconsidered |
| Self-hosted | Our chosen power/service policy | Works if machine, network and services are up | We restore failures, patch and recover backups |

No reviewed free plan establishes an unconditional forever-free availability guarantee. Provider policy changes, quota exhaustion and outages remain possible. Our decision should select normal idle behavior, not mistake a free tier for a service-level agreement.

### Supabase monitored-check option

If A is chosen, propose an independent daily scheduler (for example a separate free Worker Cron) issuing several small **real database reads** of a non-sensitive probe record, with a verified expected response and timeout. A website ping or Auth call alone does not demonstrate database activity. The scheduler must be outside the Supabase project being monitored.

Proposed monitoring: alert on failed database probes and missing scheduler executions; record last success, error and project state; route existing owner pause-warning emails to the operator; test alert delivery and restoration. Keep monitoring credentials minimally scoped and out of GitHub. Do not expose project-management tokens in clients or automatically upgrade a plan.

Supabase says a few daily database requests typically avoid pausing; it does not give a contractual threshold. Checks can fail or be too little activity. Detection does not restore service. If paused, show offline data and preserve queued writes while the owner resumes and verifies Auth, DB and file operations. Do not retry into an endless loop. No schedule or alert has been configured [S1].

## Quotas and charging boundaries

Checked 2026-10-08. USD before taxes; quotas can change. These are supplier limits, not measured MoFlight capacity. Shared account/team quotas include test environments and backups where specified.

| Service | Relevant free allowance | Exhaustion / financial boundary |
| --- | --- | --- |
| Supabase Free | Two active projects; 500 MB DB/project; 1 GB files; 50k MAU; 5 GB egress + 5 GB cached egress; 500k function invocations | Restrictions are metric-specific; do not assume unlimited API requests means unlimited resources. Free excludes automatic backups; operator exports needed [S2] |
| Free SMTP candidate: Brevo | 300 sends/day; transactional sending supported | Sender validation/deliverability/SMTP approval and current free-account rules must be checked at setup; no email delivery proven [E1] |
| Workers Free | 100k requests/day; 10 ms CPU/invocation | Daily requests reset 00:00 UTC; excess returns error. Fail closed on security routes. Waiting for network I/O is distinct from CPU; measure token verification, serialization and retrieval [W1, W7] |
| D1 Free | 5m rows read/day; 100k written/day; 5 GB total; 10 databases; **500 MB per database**; seven-day Time Travel | Daily query limits return errors until reset; storage blocks growth until cleanup/upgrade; indexes also cost row writes. No auto-paid upgrade [W2, W3] |
| R2 Standard allowance | 10 GB-month storage; 1m Class A and 10m Class B operations/month; free direct egress | Requires R2 checkout/subscription; metered overages, no fixed base fee stated. Infrequent Access has no free tier. App limits/alerts are not a provider-enforced $0 bill guarantee [W4, W5] |
| Vectorize Free | 5m stored vector dimensions; 30m queried dimensions/month | Optional extra index service; dimensions, not number of chunks, consume allowance. Embeddings are separate compute/API usage [W6] |
| Firebase Auth Spark | Non-phone Auth available; 1,000 verification emails/day, 150 password-reset emails/day; account-creation abuse limits | Avoid SMS and magic-link reliance (five sign-in emails/day on Spark). Identity Platform Spark additionally lists 3,000 Tier-1 DAU; verify exact project mode [F3, F4] |
| Convex Free | 0.5 GB DB; 1 GB files; 0.5 GB search; 1m function calls/month; 20 GB-hours actions; 1 GB/month each DB I/O and egress; 3,000 query-GBs search/month | Team totals; Free has caps and can return errors. Choose **Free**, not billing-enabled Starter ($0 base with overages). HTTP response cap 20 MiB; bound private files below it [C1, C2] |
| Neon Free | Current official source: 100 CU-hours/project/month; 1 GB DB/project (20 GB total); 5 GB transfer/project/month; six-hour restore history | Compute/transfer quota exhaustion suspends compute until renewal/upgrade; data retained. Free does not bill overages. October source differs from older 0.5 GB/50 CU-hour examples [N1] |
| Firestore Standard free allowance | 1 GiB storage; 50k reads/day; 20k writes/day; 20k deletes/day; 10 GiB outbound/month | Pure Spark lacks complete files/functions; Blaze charges beyond allowances. Billing budget alerts are not a hard cap [F4–F6] |
| PowerSync Cloud Free | 2 GB synced/month; 500 MB hosted; 50 peak clients; two instances | Soft usage limits plus weekly deactivation; Pro from $49/month. It adds a second idle dependency [P1] |

Illustrative capacity only: 100 compressed photos at 1 MB consume about 100 MB; downloading each ten times consumes about 1 GB before other traffic and backups. Convex's file/egress limits, not its identity capacity, could be the first constraint. Preserve originals locally and use explicit retention/download limits; do not present this estimate as measured usage or silently remove required files.

## Recommended architecture details and security gates

This narrows implementation to the existing requirements rather than adding a universal sync platform.

1. Both apps use the same Firebase Auth project per environment, separate native sessions, and a stable MoFlight user mapping keyed by verified issuer + UID. Start with email/password, verification and Firebase's default web recovery handler; returning to the app and preserved identity require device tests. No custom domain, Clerk account, Firebase Storage, Firestore or Firebase Functions is necessary for C [F1, F7].
2. All client-facing data/file/sync/AI routes are Convex HTTP actions. Verify Firebase ID tokens with a maintained JWT library using the official signing certificates, cache keys according to provider headers, check signature, algorithm, key ID, issuer, audience, expiry and required claims. Derive identity from the verified token, never a payload owner. Convex documents Web Crypto support in its default runtime; select a compatible maintained verifier and prove certificate parsing/key rotation. This uses Firebase's documented third-party verification method and Convex's HTTP/internal-function boundary; **it is a custom adapter to prove**, not a claimed native Firebase integration [F2, C4, C5, C11].
3. Internal queries/mutations/actions receive only that verified server context. Do not expose corresponding public RPCs that bypass the verifier, and do not assume Convex's ctx.auth automatically contains Firebase identity on this path. Check ownership of rows, file IDs, references, jobs, chunks and operation receipts. A valid token signature alone does not prove an account remains enabled: use application account status/revocation state and define provider-revocation checks, including password reset/deletion, before release.
4. Use authenticated HTTP uploads/downloads for private photos/exports, with owned pending/completed metadata, bounded bytes/type and replay-safe completion. Do not treat storage IDs or indefinitely accessible bearer download URLs as authorization. Bound the lab to 5 MB/file and allowlisted types, below the 20 MiB response limit. Resumable/repeatable transfer and orphan cleanup still need #7 evidence [C6].
5. For approved later AI execution, reserve per-user/global usage in an internal transaction, call the provider from an action, store measured usage and final/unknown outcomes. Provider keys remain server-side. No AI Gateway credit, billed embeddings or generative API execution is part of this approval. Start retrieval-only using self-authored content and local/precomputed test embeddings; synthetic vectors prove mechanics, not semantic quality [C7].
6. Use visibility-key filters before text/vector retrieval and recheck document permissions before adding context. Public training chunks and private records remain separate. Keep source IDs/version/rights metadata and the existing 20-query evidence/citation evaluation. No provider change weakens the README RAG targets.
7. Keep pure domain packages and contracts; use ordinary app IDs rather than exposing Convex document IDs as canonical domain identity. Include regular schema/data exports and files, plus restore rehearsal; Convex's export facility does not make free automatic backups appear. An export must not go into the public repository [C10].

### Explicit synchronization scope

One local SQLite database and one durable outbox per app/account, with local UI reads/writes. Sync on foreground, reconnect and explicit refresh, with a bounded backoff. No perpetual polling, background-sync promise, CRDT or PowerSync service initially.

- Push immutable learning events by stable ID; reject changed payload under the same operation ID. Mutable settings/flights/anchors carry a base version; persist both conflict variants.
- Each accepted mutation atomically writes state, an operation receipt and a per-account monotonic change sequence. Pull by sequence and a fixed high-water mark, applying each page plus cursor transactionally in SQLite. Do not use client clocks or creation timestamps as the sole cursor.
- Retain deletion tombstones; define a retention floor. Older cursors trigger an explicit snapshot/reset that preserves pending local edits before replay. Test stale devices after weeks offline, not just immediate reconnect.
- Isolate databases/files/outboxes on account switch. Expired tokens stop network operations and preserve queued work; previously authorized local use follows a deliberate device policy. Offline access cannot check remote account deletion immediately.
- Test duplicate push after lost response, concurrent changes, interrupted pagination, rejected commands, migration and account deletion. Build only settings + event + flight first.

This is less infrastructure, **not zero engineering effort**. If #1/#4 cannot demonstrate correct convergence and recovery, revisit the architecture before product expansion. There is no competing SDK-managed upload queue on this path.

## PowerSync judgment

Defer adoption and remove it from the default first trial. Its durable SQLite/replication tooling can reduce our synchronization implementation, but cannot supply authentication, files, AI or domain conflict semantics. Its listed source databases do not include D1 or Convex; do not assume a drop-in adapter. The Free service's weekly deactivation conflicts with the idle requirement; paid Pro starts at $49/month [P1].

Neon plus always-connected logical replication can keep compute awake, defeating scale-to-zero and consuming its compute budget [N2]. Supabase database health checks also do not prove a PowerSync instance is active. Reconsider PowerSync only if measured sync complexity justifies paid/self-hosted operation and independent isolation/recovery tests. Self-hosting the sync service is additional operations, not a free managed replacement.

## Self-hosting, considered separately

| Option | Complete service composition | Idle and cost | Operating effort / judgment |
| --- | --- | --- | --- |
| Supabase self-hosted | Auth/Postgres/Storage/functions; external SMTP; pgvector; explicit SQLite sync | No Supabase Cloud idle rule; hardware, power, public connectivity, offsite backups and mail still cost | Docker stack, security updates, TLS, monitoring, database/file backup and tested restore; preserve SQL portability. More operational work than needed now [H1] |
| PocketBase on existing hardware | Built-in auth/SQLite/files/realtime; SMTP recovery; custom server hooks/API for AI; lexical or separate vector retrieval; explicit mobile sync | No hosted-provider idle rule; machine must remain available | Smaller single-service footprint, but pre-1.0 compatibility and production-critical caution; owner patches, secures and restores it. Not selected for shared production identity [H2] |

Existing hardware can reduce cash spending, but its capacity, reachability and reliability have not been approved or measured. Do not assume the personal NUC is an available public backend. Free software does not supply free reliable hosting, offsite recovery or an operator. No self-hosted deployment performed.

## Approval choices and next executable gates

| Decision for Manuel | Consequence |
| --- | --- |
| Approve C for a bounded PoC (recommended) | Trial Convex Free + Firebase Auth Spark + explicit SQLite sync; tolerate free quotas and an uncontracted idle policy pending confirmation/test; accept document backend/custom auth boundary |
| Prefer B / E and permit metered storage activation later | SQL and explicit serverless wake; accept R2 billing risk and extra assembly; E adds Neon SQL/pgvector and compute quota |
| Prefer A and accept best-effort pause mitigation | Preserve integrated SQL stack; accept owner restoration risk and external SMTP/monitoring |
| Require guaranteed no pauses and guaranteed $0 forever | No checked managed option establishes that promise; reconsider service guarantee, costs or operator responsibility |

Approval of C would authorize only the small trial and necessary free resource setup at the relevant step; it would not authorize paid services, Starter/Blaze/R2 activation, paid AI, release or a final architecture. Exact mobile tooling approval remains ADR 0002; backend/offline proposal is [ADR 0003](../adr/0003-low-usage-backend-proposal.md).

After approval, keep existing Issues: #6 minimal lab/CI; #1 identity/recovery/data isolation; #4 offline protocol; #3 retrieval-only RAG; #7 private files; #2 Vereinsflieger access. Adapt provider-specific implementation wording at setup; do not duplicate the requirements work.

| Gate | Evidence required, not yet executed |
| --- | --- |
| Identity boundary (#1) | Two synthetic users; real confirmation/recovery preserves UID/data; forged issuer/audience/signature/owner/reference rejected; expiry/key rotation/revocation and no public RPC bypass |
| Data/files (#1/#7) | A/B cross-user negatives for every endpoint; private bytes unavailable without authorization; interrupted upload retry, orphan handling, quota refusal |
| Offline (#4) | Airplane mode + process restart + two sessions; duplicates, pagination races, conflicts, tombstones, stale-cursor reset and migrations |
| Idle / recovery (#5/#8) | Regular production deployment with synthetic data; pause no keep-alives for at least three weeks; first returning sign-in/data/file request; verify no owner action; capture any cold start. Confirm provider idle policy separately |
| Quotas / recovery (#8) | Local simulated exhaustion and safe queued-write preservation; provider usage measured during small free trials; no destructive quota-filling or paid upgrade |
| RAG (#3) | Existing independent retrieval/citation/missing-evidence gates; meaningful embeddings only through approved free/local method; generation remains disabled |
| Exit / operation (#8) | Private schema/data/file export and restore rehearsal; deletion/revocation across auth, cloud and local reconnect; verified alert delivery |

## Verification record

Documentation change only. Current official pages and supplier-owned source files were inspected; the repository baseline and open approval status were checked. Validation: five changed documentation files; 20 relative links resolved against the existing repository tree plus staged additions, including linked anchors; Markdown table column counts and whitespace checked; both ADR statuses remain Proposed. Source references, changed recommendation consistency and preservation of existing requirements were reviewed. No live inactivity trial, SDK compatibility, account recovery, isolation, synchronization or cost measurement has passed. No monitoring job was installed.

Neon's live documentation pages were unavailable through retrieval; its own current documentation repository supplies N1/N2, including update dates. Older retrieved Neon tariff examples were not substituted for the current source. PowerSync deactivation is verified; automatic recovery is not established. Absence of a published Convex/Firebase idle rule is recorded as uncertainty rather than a provider guarantee.

## Official sources

All checked 2026-10-08. Product capabilities are documented facts; composition, ranking, sync design and test gates are our inferences/proposals.

- S1: [Supabase project pausing and restore](https://supabase.com/docs/guides/platform/free-project-pausing).
- S2: [Supabase pricing and limits](https://supabase.com/pricing).
- S3: [Supabase SMTP restrictions](https://supabase.com/docs/guides/auth/auth-smtp).
- S4: [Supabase private storage access control](https://supabase.com/docs/guides/storage/security/access-control).
- S5: [Supabase functions limits](https://supabase.com/docs/guides/functions/limits).
- S6: [Supabase RAG with permissions](https://supabase.com/docs/guides/ai/rag-with-permissions).
- E1: [Brevo free plan limits](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan) and [transactional email eligibility](https://help.brevo.com/hc/en-us/articles/8292912279954-Add-or-remove-emails-from-your-plan).
- W1: [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/).
- W2: [D1 pricing, scale-to-zero and quota errors](https://developers.cloudflare.com/d1/platform/pricing/).
- W3: [D1 limits](https://developers.cloudflare.com/d1/platform/limits/).
- W4: [R2 pricing](https://developers.cloudflare.com/r2/pricing/).
- W5: [R2 subscription/checkout prerequisite](https://developers.cloudflare.com/r2/get-started/).
- W6: [Vectorize pricing](https://developers.cloudflare.com/vectorize/platform/pricing/).
- W7: [Workers runtime limits](https://developers.cloudflare.com/workers/platform/limits/) and [D1 SQL/FTS5](https://developers.cloudflare.com/d1/sql-api/sql-statements/).
- F1: [Firebase users, verification and password reset](https://firebase.google.com/docs/auth/web/manage-users).
- F2: [Firebase ID-token verification, including third-party libraries](https://firebase.google.com/docs/auth/admin/verify-id-tokens).
- F3: [Firebase Auth limits](https://firebase.google.com/docs/auth/limits).
- F4: [Firebase pricing](https://firebase.google.com/pricing).
- F5: [Firebase Storage billing requirement effective February 3, 2026](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024).
- F6: [Firestore offline behavior and last-write-wins](https://firebase.google.com/docs/firestore/manage-data/enable-offline).
- F7: [Firebase default/custom hosted email handlers](https://firebase.google.com/docs/auth/custom-email-handler) and [Expo Firebase options](https://docs.expo.dev/guides/using-firebase/).
- C1: [Convex plans](https://www.convex.dev/pricing).
- C2: [Convex limits](https://docs.convex.dev/production/state/limits).
- C3: [Convex deployment lifecycle](https://docs.convex.dev/production/multiple-deployments).
- C4: [Convex HTTP actions](https://docs.convex.dev/functions/http-actions).
- C5: [Convex internal functions](https://docs.convex.dev/functions/internal-functions).
- C6: [Convex private file serving](https://docs.convex.dev/file-storage/serve-files) and [upload methods](https://docs.convex.dev/file-storage/upload-files).
- C7: [Convex actions](https://docs.convex.dev/functions/actions) and [filtered vector search](https://docs.convex.dev/search/vector-search).
- C8: [Convex authentication options and beta status](https://docs.convex.dev/auth/overview) and [Clerk/Expo integration](https://docs.convex.dev/auth/clerk).
- C9: [Convex pricing FAQ](https://www.convex.dev/pricing/faq), [manual pause](https://docs.convex.dev/production/pause-deployment), [usage disable/reset](https://docs.convex.dev/production/usage-limits) and [offline limitation](https://www.convex.dev/sync).
- C10: [Convex export](https://docs.convex.dev/database/import-export/export).
- C11: [Convex runtime, Web Crypto support and no-cold-start behavior](https://docs.convex.dev/functions/runtimes).
- K1: [Clerk Hobby limits and seven-day sessions](https://clerk.com/pricing).
- K2: [Clerk production domain/DNS requirements](https://clerk.com/docs/guides/development/deployment/production).
- K3: [Clerk password recovery](https://clerk.com/docs/guides/development/custom-flows/authentication/forgot-password).
- N1: [Neon official Free quota source, updated 2026-10-01](https://github.com/neondatabase/website/blob/main/content/faqs/free-plan-limits-and-quotas.md).
- N2: [Neon official automatic-wake source](https://github.com/neondatabase/website/blob/main/content/docs/introduction/scale-to-zero.md).
- N3: [Neon pgvector](https://neon.com/ai).
- A1: [Appwrite Free inactivity pause](https://appwrite.io/changelog/entry/2026-02-20-1).
- A2: [Appwrite paused-project deletion](https://appwrite.io/changelog/entry/2026-06-29).
- P1: [PowerSync plans, source databases and deactivation](https://powersync.com/pricing).
- H1: [Supabase self-hosting responsibility](https://supabase.com/docs/guides/self-hosting).
- H2: [PocketBase features and pre-1.0 caution](https://pocketbase.io/docs/).

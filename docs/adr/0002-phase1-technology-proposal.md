# ADR 0002: Phase 1 PoC stack

- Date: 2026-10-08
- Status: Proposed — revised after low-usage review; awaiting Manuel's explicit approval
- Decision owner: Manuel Singer
- Tracking: [#5](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/5)
- Evidence: [Technology review](../architecture/phase1-technology-review.md), [complete backend comparison](../architecture/low-usage-backend-comparison.md), [ADR 0003](0003-low-usage-backend-proposal.md)

## Context

The archived Phase 1 draft and initial focused review proposed Expo/React Native, Supabase and a PowerSync experiment. Manuel subsequently required low costs and normal operation after weeks of non-use. The comparison retains existing mobile/modularity requirements and revises the recommended backend trial. Manuel selected Supabase Cloud Free for the first backend trial on 2026-10-08; mobile/workspace and detailed sync decisions remain proposed. No runtime test has passed.

## Proposed decision for the PoC

1. Expo / React Native / strict TypeScript in a pnpm monorepo; native development builds for platform acceptance.
2. Backend/offline choice follows ADR 0003: Supabase Cloud Free selected by Manuel for the first trial, using Supabase Auth, RLS-protected Postgres, private Storage and server functions. Self-hosting is a possible later migration, not the first deployment.
3. SQLite per app/account and one durable outbox for narrow explicit synchronization. PowerSync adoption and its earlier preferred experiment are deferred.
4. Authenticated server-side AI boundary; retrieval-only first using permitted self-authored content. Postgres full text/pgvector is the retrieval candidate for the selected Supabase trial. Paid generation/embeddings require separate budget approval.
5. Present the writing template in-app from a fixed resolved snapshot. PDF/other exports are optional later work; inspect current Python code and test hosting only if reuse is selected.
6. Build platform-lab first; implement phone-local storage/workflow before cloud integration, while an independent Supabase trial runs in the same early cycle ([ADR 0004](0004-local-first-sequencing.md)). Add shells/packages only when needed; domain code stays free of vendor SDKs and cross-domain imports.

Mobile/workspace approval and backend approval are separately reviewable in #5. Approval authorizes only the agreed PoC implementation and necessary free setup at the relevant step. It does not authorize subscriptions, billing-enabled plans, paid AI, release, content reuse or a Vereinsflieger transport. It no longer implicitly authorizes a PowerSync experiment.

## Alternatives and consequences

Flutter remains technically viable. Expo is preferred for shared TypeScript tooling and the carried-forward proposal; no performance or agent-quality advantage has been measured. Revisit if native requirements fail.

The backend comparison covers Supabase with monitored checks, Workers/D1, Neon, Convex, Firebase and separate self-hosting. ADR 0003 records the selected Cloud-first trial and its limitations; do not infer guaranteed idle availability from a free plan.

Use a tested secure session storage boundary for the selected Auth SDK, one SQLite driver and real Android/iOS builds. SQLite encryption remains unverified. Supabase recovery, RLS, Storage and sync isolation still require independent tests; SQL policies do not establish stream isolation automatically. Online realtime/optimistic queues alone do not prove durable offline writes.

Earlier listed Supabase Pro + PowerSync Pro fees start at $74/month; that is a historical alternative scenario, not a selected operating budget. The current proposed trial avoids paid or metered plan activation and has hard free-tier constraints.

## Decision and test gates

- Supabase Cloud Free provider choice is recorded in ADR 0003. Manuel still approves mobile/workspace here and detailed offline implementation before binding implementation.
- #6: locked compatible versions, reproducible workspace, push-to-main CI, actual native build evidence.
- #1/#4: recovery preserves identity; two-user token/API/data isolation; real offline restart/reconnect, retry receipts, transactional delta pagination, conflicts, rejection, deletion/reset and schema evolution.
- #3: retrieval/citation/gap/isolation evaluation; no paid generation in the initial test.
- #7: private file lifecycle and exact in-app writing instructions; inspect/test export code and runtime before optional reuse.
- #2: supported own-flight retrieval and authorized live comparison before transport selection.
- #8: quota refusal, multiweek idle return, private export/restore and integrated device evidence.
- Separate approval before billing-enabled services or paid requests.

Earlier runner inventory lacked docker, adb and xcodebuild; no runtime/device checks were executed in this evaluation. #6 must establish a suitable runner. Provider-specific wording in existing implementation Issues is aligned with the selected trial; mobile/workspace remains open.

## Validation and approval record

Official-source backend comparison and repository baseline reviewed on 2026-10-08. Documentation consistency/link checks accompany this revision. Supabase Cloud Free first-trial choice recorded from Manuel on 2026-10-08. No provisioning, monitoring, paid calls or runtime tests occurred. This ADR remains Proposed for mobile/workspace and other unresolved choices.

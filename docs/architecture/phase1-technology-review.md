# Phase 1 technology review

Date: 2026-10-08. Tracking: [#5](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/5).
Status: desk review complete; recommended PoC stack awaits Manuel's explicit approval. No runtime compatibility or integration test has passed.

## Recommendation and approval scope

Approve Expo / React Native / strict TypeScript, a pnpm workspace, Supabase Auth/Postgres/private Storage/functions, account-scoped SQLite, and server-side AI with pgvector for the small Phase 1 PoC. Permit a PowerSync experiment, without adopting it for production. Retain Python export as a later bounded worker, with hosting still undecided.

This decision permits the minimum platform-lab and local test setup. It does not authorize a subscription, paid API execution, production deployment, automatic reuse of copyrighted content, or a final Vereinsflieger transport. Exact dependency versions are selected and locked during setup after peer-dependency checks; documentation examples are not a tested dependency matrix.

## Focused mobile comparison

| Criterion | Expo / React Native | Flutter | Project judgment |
| --- | --- | --- | --- |
| Android and iOS | Native development-build workflow [S1] | Officially supported mobile targets [S4] | Both meet the platform goal in principle; devices still need tests |
| Shared implementation | TypeScript UI/contracts and server-function code can share schema tooling | Dart client requires a separate language/toolchain from the proposed TypeScript server functions | Prefer TypeScript to reduce our tooling and duplicated validation work; this is an architecture inference |
| Native libraries | Development builds allow native dependencies; native configuration changes require rebuilding [S1] | Platform-specific integration remains possible; plugin compatibility still needs verification | Neither removes native SDK risk |
| Workspace | Expo documents pnpm workspaces and automatic Metro configuration [S2] | A viable alternative, but not implemented or benchmarked here | Keep the carried-forward workspace choice |
| Existing constraints | No custom-rendering or performance requirement currently forces another UI stack | Could be reconsidered if required native features cannot pass the Expo trial | Do not maintain two implementations |

No claim is made that one framework produces more accurate agent-written code or is universally faster. Flutter is not rejected as technically incapable. Reopen the choice if actual native builds or essential integrations fail with supported versions.

Use development builds from the first native persistence trial. Expo Go is useful for quick UI feedback, but cannot prove our chosen native database, app-specific recovery links or release configuration. Local iOS compilation/simulation requires Xcode on macOS; EAS can compile iOS remotely, but a cloud artifact alone is not a device-test result [S1].

## Supabase and account lifecycle

One backend per environment provides the same account ID to both apps; each app maintains its own session. Use email/password with confirmation and recovery first, to exercise the original requirements without additional identity-provider setup.

Persist sessions through an explicitly tested SecureStore adapter. SecureStore documents native payload errors and different uninstall behavior on Android/iOS [S3]. Test realistic serialized sessions and fail visibly on write failure; do not silently fall back to unencrypted token storage. SecureStore protection does not prove SQLite encryption.

Restrict confirmation/recovery redirects to the actual lab/app callback URLs [S5]. A recovery link must continue the existing identity and preserve its data. Test link handling with the app stopped and running, expired links, session expiry, logout and account switching.

Use migrations for tables, grants, RLS and command functions. Reads and writes need independently verified ownership rules, including owner changes and referenced objects. Never allow a client-supplied owner to override the authenticated identity. Local Auth/DB tests and captured emails can precede hosted tests using the supported CLI workflow [S6]; they do not establish public email delivery.

## SQLite and PowerSync: trial before adoption

PowerSync documents React Native/Expo support with a native OP-SQLite dependency. Its native adapter does not run in Expo Go; a separate JavaScript adapter exists [S7]. Choose the documented native combination at implementation time and verify a clean Android/iOS build. Do not add expo-sqlite as a second writer to the same account database.

PowerSync provides a local SQLite/read synchronization path and an SDK upload queue; the application supplies its backend upload connector [S8]. Our server still owns authorization, immutable-event checks, version comparisons and idempotency.

Use separate app/account databases, stop the prior connection before switching and retain account-scoped pending changes. Test actual disk persistence with process restart, not an in-memory/mock database. Local conflict records are durable recovery state, not a second generic upload outbox.

PowerSync Sync Streams filter downloads, while Supabase RLS applies to operations reaching Postgres [S9]. Configure stream ownership from verified authentication, not a client-selected user ID. Negative API tests cannot substitute for a negative stream test.

The SDK documents view-based schema projection without ordinary client migrations for managed tables; raw tables need explicit migration [S7]. Still test semantic schema changes, old clients, local-only/conflict data and reinitialization with pending writes. Encryption is an unresolved capability test for the selected driver/build.

| Choice | Benefit | Cost / obligation | Trial outcome |
| --- | --- | --- | --- |
| PowerSync | Existing replication, local persistence and upload queue | Additional service/SDK; independent filters; custom write semantics | Preferred experiment; adopt only after #1/#4 |
| Limited explicit sync | No extra hosted sync subscription | We implement cursor correctness, retries, transactional local updates, tombstones and safe reset | Revisit if measured cost or native/filter gates fail |
| Supabase Realtime alone | Useful online change notification | Does not by itself implement our offline queue, replay and conflict contract | Not the proposed offline solution |
| Self-hosted sync service | Potential hosting flexibility | Deployment, upgrades, replication health and backups become our responsibility | Defer until there is an operating/cost reason |

Proposed command behavior:
- Learning events: stable event ID and immutable payload; identical retry returns the same receipt, changed payload under the same operation ID is rejected.
- Settings: explicit per-key version/order contract.
- Flights/anchors: compare base version and preserve the proposed edit in a conflict on mismatch.
- Permanent rejection: durably preserve the user's edit and reason before acknowledging/draining it; subsequent valid commands must continue.
- Deletion: tombstone/version rules reject an old client's resurrection attempt.

These are MoFlight design requirements, not features asserted to work automatically in a vendor SDK.

## AI and RAG boundary

Use pgvector within the selected Postgres backend before adding a separate vector service. Supabase documents retrieval with permissions [S10]. Retrieval functions must preserve the caller's visibility; a privileged server connection must not accidentally expose all chunks.

Keep shared demo knowledge separate from private progress/flights. AI requests go through the authenticated server boundary. Model, token limits, quota reservation and cost accounting remain server-controlled; no provider key is embedded in the app.

Test ingestion and retrieval before generation. Use the existing five-section self-authored corpus plan, ten synthetic quiz items and a separate predetermined evaluation set of at least twenty queries. Preserve README targets and denominators; check citation meaning as well as allowed IDs. No model quality or per-answer cost has been measured. A model/pricing selection and an agreed budget are required before paid calls. The historical token examples are not refreshed by this review.

Vereinsflieger supported authentication, own-flight endpoints and commercial access remain #2. It must not determine MoFlight account identity. Python export code inspection and worker deployment remain #7; no extra worker infrastructure is needed for the first Auth/Sync experiment.

## Cost review

Official public tariff pages were read on 2026-10-08 [S11–S13]. USD, before tax and currency conversion; these are listed plans, not invoices or fixed total-cost guarantees.

| Service | Initial experiment | Paid base plan | Relevant constraint |
| --- | --- | --- | --- |
| Supabase | Local CLI or hosted Free | Pro: $25/month; $10 compute credit covers one Micro instance | Free: 2 active projects, 500 MB database, 1 GB file storage; pause after one week inactive [S11] |
| PowerSync Cloud | Free | Pro from $49/month | Free: 2 GB synced/month, 500 MB hosted, 50 peak clients, 2 instances; deactivate after one week inactive [S12] |
| EAS | Free or local build | Starter $19/month plus usage | Free lists 15 Android and 15 iOS builds; limited low-priority queue [S13] |
| AI, email, Python worker | Defer paid execution/hosting | Unselected; usage-dependent | Separate budget and service decision |

Derived planning scenarios: one Supabase Pro organization with one Micro project plus PowerSync Pro starts at $74/month. Optional EAS Starter makes the listed base fees $93/month. A second Micro Supabase project adds approximately $10/month at the checked rate, subject to billing duration and plan rules. These exclude AI, overages, worker/SMTP, store accounts and other operating costs.

Free tiers are appropriate for a small trial; inactivity pauses need to be visible as an environment limitation. Do not buy paid tiers to make an idle PoC look reliable. Runtime code needs a server-enforced API budget, independent of supplier dashboard alerts.

## First executable slice after approval

| Gate / Issues | Implementation | Required evidence |
| --- | --- | --- |
| G0 / #6 | One platform-lab, pnpm lockfile, exact tool versions, push-to-main CI | Clean install, type/lint checks and native build preparation |
| G1 / #1 | Local Supabase, two synthetic accounts, one setting/event/flight, API negatives | Persist/reload; recovery preserves ID; B cannot read/change A; forged owner/reference rejected |
| G2 / #1 and #4 | PowerSync native adapter and authenticated server command upload | Offline write, process restart, reconnect, identical retry, second session; independent stream negatives |
| G3 / #4 | Conflicting edit, permanent rejection, delete/reset and schema change | Both edits retained; queue advances; no resurrection or cross-account data; migration preserves allowed pending work |
| G4 / #3 and #2 | Retrieval harness; authorized Vereinsflieger trial once access exists | RAG measured separately; live own-flights compared to reference; missing access recorded as blocked |

Prepare G2 immediately after G1; do not defer sync until full product shells. Hosted email, actual Android/iOS runtime and two-device acceptance remain separate checks. Shared packages emerge only when the slice needs them.

## Evidence and current environment

Repository state read: main commit 223306dd52a6bd75232af9c14fc5f73a82ad85ce; README, AGENTS.md, ADR 0002, reconciliation, archived source and Issues #1–#8. This review changes documentation only.

Tool inventory in this session: Linux; node, pnpm, npm and java found on PATH; docker, adb and xcodebuild absent. Version compatibility, Android SDK presence and services were not tested. The currently proposed Docker-based Supabase test path and native/device tests cannot be reported as passed in this environment. #6 must establish a suitable local or CI runner, record installed versions and keep unavailable tests blocked.

Validation for this change: source URLs reviewed, requirement/Issue mapping checked, relative documentation links and proposed/passed status wording checked. No app dependency installation, cloud resource, subscription, paid API request or live integration was performed.

## Primary sources

All accessed 2026-10-08. Provider documentation verifies documented capabilities, not MoFlight runtime behavior. Judgments and test gates above are our proposals.

- S1: [Expo development builds](https://docs.expo.dev/develop/development-builds/introduction/).
- S2: [Expo monorepos](https://docs.expo.dev/guides/monorepos/).
- S3: [Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/).
- S4: [Flutter supported platforms](https://docs.flutter.dev/reference/supported-platforms).
- S5: [Supabase native mobile deep linking](https://supabase.com/docs/guides/auth/native-mobile-deep-linking).
- S6: [Supabase local CLI workflow](https://supabase.com/docs/guides/local-development/cli-workflows).
- S7: [PowerSync React Native/Expo SDK](https://docs.powersync.com/client-sdks/reference/react-native-and-expo).
- S8: [PowerSync write architecture and conflict handling](https://powersync.com/blog/turnkey-backend-functionality-conflict-resolution-for-powersync).
- S9: [PowerSync RLS and Sync Streams](https://docs.powersync.com/integrations/supabase/rls-and-sync-streams).
- S10: [Supabase RAG with permissions](https://supabase.com/docs/guides/ai/rag-with-permissions).
- S11: [Supabase pricing](https://supabase.com/pricing).
- S12: [PowerSync pricing](https://powersync.com/pricing).
- S13: [Expo EAS pricing](https://expo.dev/pricing).

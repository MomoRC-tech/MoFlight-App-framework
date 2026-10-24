# AI04–AI06 local relay foundations

Tracking: #76, #72, #77. This folder has **no deployed HTTP entry point or enabled model dispatch**. It does not load credentials, provision Supabase/OpenRouter or persist model inputs/outputs. The app imports no SDK. Server SDK `openai@7.43.0` is independently pinned in `deno.json`/`deno.lock`; no Genkit or React Native dependency is added.

From this directory with Deno 2.9.6:

```sh
deno task check
deno task test
```

Tests run the actual SDK against injected synthetic `fetch`, without network or environment permissions. Dependency caching may download public npm packages first. No key is required; the committed test key string is synthetic. Do not run these tests with live credentials or replace their fake transport with network fetch.

`admitConfiguredAccount` validates the ID assertion against an injected protected configuration lookup and returns its server-configured opaque billing tag. Unknown/disabled/mismatched IDs reject. A caller forging a known enabled ID is intentionally indistinguishable under the selected pilot trust model; this is not authentication. There is no account enrollment, enumeration, status or operator HTTP surface here. AI05/AI06 supply local SQL/RPC foundations below; composition into a deployable route remains AI07.

`initialResponseBody` reconstructs only user/assistant history and the user question; instructions/model/tools/routes come from a validated server policy. The raw asserted provider ID is excluded from usage metadata and request structure. User text may still contain identifiers; this is no anonymization guarantee. The server SDK adapter uses one short Responses request, `store:false`, explicit Max, ZDR-only Azure routing with no fallback, bounded output, disabled truncation/background and zero SDK retries. SDK payload logging is explicitly disabled with a no-op logger, and ambient OpenAI organization/project headers are not inherited. OpenAI's [stateless Responses guidance](https://developers.openai.com/api/docs/guides/migrate-to-responses) explains why reasoning/output items must be preserved; it does not establish OpenRouter/upstream behavior.

`beforeDispatch` is a mandatory injected gate with no permissive default. Its input is **transient for token/cost admission only**: never persist/log question, history, flight/tool data or reasoning. The local ledger reserves non-content intent, but is deliberately not connected to SDK submission yet. AI07 must count the complete canonical request (instructions, tools, protocol items, reasoning/output bounds), reconcile the effective policy with the serialized body and dispatch only on a newly granted reservation. Existing/unknown reservations or RPC timeouts never grant another submission. Current SDK tests use a fake gate. No live or billable use is ready.

After durable intent, transport errors/timeouts/cancellation return a minimal unknown outcome. They never release a reservation or trigger inference again; reconciliation belongs to AI06. Raw output remains server-internal and ephemeral. AI07 still owns authenticated opaque continuity, complete item replay, pending call binding, duplicate-round/idempotency/status handles, tool/output validation and phone coordination. The adapter deliberately rejects continuation requests until that integration exists. It does not run a tool loop waiting on the phone.

## Protected policy and accounting

The [migration](../../migrations/202610240001_ai_policy_ledger.sql) starts with emergency disable on, operational readiness/funding off and no policy, price or accounts. It has not been applied to Supabase. Operator functions are unavailable to `anon`, `authenticated` and `service_role`; runtime credentials can execute only snapshot/usage/reserve/unknown/settle/finish RPCs. Tables are private, with RLS, no client policies or direct runtime grants. Definer search paths place `pg_temp` last. Do not grant mobile roles access or put service-role credentials in the app.

Immutable policy/prompt and price versions use a central compare-and-swap pointer, with append-only operator audit and explicit rollback. Policies enforce the frozen model/Max/ZDR route and limits; prompts have a conservative 16,000 UTF-8-byte SQL ceiling. Every new message needs the current policy; subsequent calls retain its prompt while current disable/revocations and lower bounds apply. `publicCapabilities` exposes a detached non-secret compatible-client projection, without prompt, raw account ID, billing tag or global usage. `snapshot` is internal and must never be returned wholesale to the phone.

All admission, policy/control changes, settlement and cleanup serialize on one singleton row. This favors simple global/account correctness for the small pilot; it is not a high-throughput design. Each round records a SHA-256 digest of its complete canonical server request and a dispatch intent before submission. Exact duplicates return `existing`; changed or foreign attempts reject. One unsettled/active attempt per account is allowed. Integer nanodollar prices and gross micro-EUR/USD conversion include explicit fees coverage and uncertainty margin. The bound conservatively adds input and both cache rates, bounded output including reasoning, and fixed request charge. Missing/stale/unapproved evidence blocks reservation; example values in tests are never funding or price evidence.

`ledger.ts` provides an injected server-only RPC adapter with strict result parsing and a minimal personal usage DTO. It loads no secret and performs no inference/provider lookup. `settleVerifiedReceipt` is exclusively for verified provider accounting, never phone/model-supplied costs. Reconciliation lookup/receipt binding, payload tokenization and HTTP integration remain open. Unknown outcomes keep all holds; cancellation/finish cannot refund them. Repeated verified receipts are idempotent, reused receipts reject, and any actual over-bound charge halts further dispatch. The month is database-clock Europe/Berlin; late charges settle the original admission month, and all unresolved holds continue reducing availability after rollover.

## Operator runbook — local implementation, live activation gated

Use only the protected backend dashboard SQL editor/operator session after service setup is explicitly authorized. There is no custom mobile administration route. Never paste keys or private datasets into policy JSON, reason codes, SQL logs or Issues. Reason codes are short non-content identifiers; dashboard operator access/log retention still requires live review.

1. Review runtime/Free eligibility, service logs/privacy, identity-spoof risk and explicit funding/input authorization. Keep emergency disable on throughout deployment and verification. Applying this migration alone does not authorize activation.
2. Read `select epoch, policy_id, price_id, kill, operational_ready, funding_approved, halted from moflight_ai.control;`. Publish a fully validated version through `public.moflight_ai_publish_policy(policy_json, expected_epoch, reason_code)`. A stale/missing epoch or invalid policy changes nothing. Roll back through `public.moflight_ai_activate_policy(existing_id, expected_epoch, reason_code)`; never mutate old rows.
3. Insert a reviewed immutable price record as the operator, covering the exact route/model/Max, complete per-token/request/cache charges, validity window, gross funding conversion including applicable fees/taxes and uncertainty margin. `approved`/`fees_covered` default false; record a non-secret evidence reference. Select its pointer only through CAS `public.moflight_ai_controls(expected_epoch, kill, operational_ready, funding_approved, price_id, reason_code)`. Do not use synthetic test prices.
4. Explicitly approved numeric provider IDs are configured with `public.moflight_ai_account(account_ref, enabled, funded, reason_code)`. It generates/preserves a random opaque billing tag and creates no provider credentials/account. Adding an ID needs the selected access/funding decision. This allowlist is still ID assertion, with known-ID spoofing possible.
5. Before every model call, integrate validated canonical token bounds, current controls and durable reservation. Only `disposition:new` allows one submission; an ambiguous commit/submission is held for reconciliation, never replayed. Verify upstream usage receipts against the recorded attempt/round before passing exact decimal USD to settlement. Never infer zero cost from an HTTP failure or absence of usage.
6. Emergency stop uses CAS controls with `kill=true`, preserving other settings. A failed bound sets `halted=true`; ordinary controls deliberately cannot clear it. Investigate/reconcile under the operator role, record evidence and review any repair before re-enabling. Never delete unresolved attempts or release unknown holds to make a test pass.
7. Operator-only `public.moflight_ai_cleanup()` removes terminal, fully settled attempt metadata once every round is at least 90 days past settlement. Unresolved attempts persist. Old unused monthly aggregates are removed separately. Cleanup needs no new scheduler. It retains unlinked SHA-256 attempt/usage replay fences without account/cost/payload fields; **their longer retention/purpose is an implementation proposal requiring privacy review before live activation**, not approval to retain production data indefinitely. Sealed expiring replay handles may replace that mechanism during AI07.

## Local SQL verification

With a separately installed PostgreSQL runtime containing `initdb`, `pg_ctl` and `libpq`, from the repository root in PowerShell:

```powershell
$env:MOFLIGHT_TEST_POSTGRES_BIN = 'C:\path\to\postgres\bin'
python -m unittest tests.test_ai_postgres -v
```

This explicitly selected suite initializes a fresh ignored `build/ai-postgres/<id>` cluster, binds only loopback, creates synthetic test databases, applies the real migration and stops the cluster. No external database URL or service installation is used. Artifacts and a stopped/runtime-version record remain for diagnosis; ordinary `pnpm check` skips these opt-in SQL cases. The Windows evidence uses PostgreSQL18.4 from a pinned local runtime package; it is not Supabase/PostgREST/runtime compatibility evidence.

Remaining gates: hosted owner protection and logging/privacy, complete token/pricing/fees/FX/route evidence, payload/rate bounds, sealed continuation and protected status, verified provider reconciliation, Supabase runtime/Free eligibility, actual Luna Max/ZDR/provider behavior, explicit permitted inputs/funding and integrated native acceptance. Host/local SQL/mock checks establish none of those live outcomes. See the [single implementation report](../../../docs/verification/2026-10-24-ai-chat-implementation.md).

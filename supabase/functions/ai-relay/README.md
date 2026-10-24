# AI04 local relay foundations

Tracking: #76, #72, #77. This folder has **no deployed HTTP entry point or enabled model dispatch**. It does not load credentials, provision Supabase/OpenRouter or persist model inputs/outputs. The app imports no SDK. Server SDK `openai@7.43.0` is independently pinned in `deno.json`/`deno.lock`; no Genkit or React Native dependency is added.

From this directory with Deno 2.9.6:

```sh
deno task check
deno task test
```

Tests run the actual SDK against injected synthetic `fetch`, without network or environment permissions. Dependency caching may download public npm packages first. No key is required; the committed test key string is synthetic. Do not run these tests with live credentials or replace their fake transport with network fetch.

`admitConfiguredAccount` validates the ID assertion against an injected protected configuration lookup and returns its server-configured opaque billing tag. Unknown/disabled/mismatched IDs reject. A caller forging a known enabled ID is intentionally indistinguishable under the selected pilot trust model; this is not authentication. There is no account enrollment, enumeration, status or operator HTTP surface here. AI05/AI06 must supply protected policy/account lookup and atomic admission before a deployable route exists.

`initialResponseBody` reconstructs only user/assistant history and the user question; instructions/model/tools/routes come from a validated server policy. The raw asserted provider ID is excluded from usage metadata and request structure. User text may still contain identifiers; this is no anonymization guarantee. The server SDK adapter uses one short Responses request, `store:false`, explicit Max, ZDR-only Azure routing with no fallback, bounded output, disabled truncation/background and zero SDK retries. OpenAI's [stateless Responses guidance](https://developers.openai.com/api/docs/guides/migrate-to-responses) explains why reasoning/output items must be preserved; it does not establish OpenRouter/upstream behavior.

`beforeDispatch` is a mandatory injected gate with no permissive default. Its input is **transient for token/cost admission only**: never persist/log question, history, flight/tool data or reasoning. Future AI06 must count the complete pinned request, establish finite safe bounds, durably reserve cost/persist non-content dispatch intent and check current emergency policy/account state. Current tests use a fake gate, not a working ledger. No live or billable use is ready.

After durable intent, transport errors/timeouts/cancellation return a minimal unknown outcome. They never release a reservation or trigger inference again; reconciliation belongs to AI06. Raw output remains server-internal and ephemeral. AI07 still owns authenticated opaque continuity, complete item replay, pending call binding, duplicate-round/idempotency/status handles, tool/output validation and phone coordination. The adapter deliberately rejects continuation requests until that integration exists. It does not run a tool loop waiting on the phone.

Remaining gates: policy publication/rollback/operator protection, durable ledger/concurrency/idempotency, token/pricing/fees/FX/route evidence, payload/rate bounds, sealed continuation and protected status, Supabase runtime/Free eligibility/logging review, actual Luna Max/ZDR/provider behavior, explicit permitted inputs/funding and integrated native acceptance. Host/Deno mocks establish none of those live outcomes. See the [single implementation report](../../../docs/verification/2026-10-24-ai-chat-implementation.md).

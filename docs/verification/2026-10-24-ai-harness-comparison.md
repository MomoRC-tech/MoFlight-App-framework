# AI harness comparison — 24 October 2026

Tracking: [#13](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/13), configuration [#72](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/72). Scope authorized by Manuel's “proceed”: public-source review and an isolated synthetic Genkit versus SDK feasibility comparison. M5 production implementation, credentials, service provisioning, paid inference and native delivery remain unapproved/unexecuted. Starting source: `44468c9`; the PoC/report are committed together, with publication evidence in #13.

## Recommendation and scope

**Recommend a narrow SDK-backed Responses adapter, reusing the SDK's existing runner/protocol helpers where the execution host permits.** Do not adopt Genkit's stock compatible adapter for the selected Luna Max/tool path without further protocol work. This recommendation is not Manuel's binding runtime selection, and it does not claim that a custom full harness is necessary.

The inspected OpenAI SDK includes `ResponsesToolRunner` for ordinary function tools as well as browser/computer helpers. Only ordinary synthetic read tools were registered here. This corrects the earlier transport-only characterization of the SDK: a reusable tool loop already exists. Genkit remains useful for broader orchestration, but its tested stock adapter emits Chat Completions. Its generic `maxOutputTokens` is omitted in the observed wire body; an explicit compatible wire token field is needed for that adapter. None of these findings authorizes reducing Luna reasoning.

Both approaches still need MoFlight-specific gateway admission, trusted prompt/config construction, phone-local tool dispatch, source/reference validation, durable attempt/cost handling and private owner reporting. These remain app responsibilities even when the model/tool loop is reused.

## Versions and evidence

Windows PowerShell; Node `v24.18.0`; pnpm `11.25.0`. The [isolated manifest](../../pocs/ai-harness-comparison/package.json), [lockfile](../../pocs/ai-harness-comparison/pnpm-lock.yaml) and [executable checks](../../pocs/ai-harness-comparison/comparison.test.mjs) preserve the tested artifacts. No app/root manifest or lockfile changed.

| Artifact | Version / inspected implementation |
| --- | --- |
| `genkit` | 1.43.0 |
| `@genkit-ai/compat-oai` | 1.43.0; `lib/model.mjs` uses `client.chat.completions.create` / the chat streaming helper |
| Plugin's OpenAI SDK | 4.104.0, resolved by its own dependency |
| Direct OpenAI SDK | 7.43.0; `helpers/responses-tool-runner.mjs`, ordinary Responses function execution and iterator boundaries |

SHA-256 of inspected package files: compatible `lib/model.mjs` = `204ac79c287b4ac198597badb74c4041e8e6b78b2c6446f15df9fd53617bcf57`; SDK runner = `f508abd21dd33be0230d1d5315658858ffe4496f8e84b30f7efe2e8cd625a7bc`.

The isolated installation reported an OpenTelemetry peer mismatch (`@opentelemetry/api` 1.10.0 against older transitive `<1.10.0` ranges) and deprecated transitive packages. This is an unresolved dependency-readiness observation, not an app regression or a reason to change the native workspace. No production dependency/security acceptance or relative bundle-size/performance measurement was performed.

## Measured synthetic results

**15/15 checks passed**, approximately 1.74 seconds total host test duration; this is test execution time, not model latency. `node --check`, offline frozen-lockfile reproduction, 15 local documentation links/anchors and whitespace checks passed. The test process forbids socket connections/global fetch; both real libraries receive an in-memory `fetch`, fake credentials and `synthetic.invalid` destinations. No model request, real identity, private flight, provider token or monetary charge was used. Recorded token/cost values are invented fixtures.

| Question | Observed result |
| --- | --- |
| Selected protocol and controls | Genkit's compatible adapter emitted `/chat/completions`, preserving explicit Max and nested routing fields. SDK emitted `/responses`, preserving `reasoning.effort: max`, strict tool schema, `store: false`, explicit output limit and provider controls. |
| Generic Genkit settings | `maxOutputTokens: 16384` produced no wire token limit in the tested generic adapter; `store: false` was omitted. A separate explicit `max_completion_tokens` test passed. Do not infer an actual provider retention policy from omission alone. |
| Device tool boundary | Genkit returned tool requests without executing a server callback. The SDK runner iterator accepted supplied results without executing its registered callback; its ordinary async callback also completed a two-request tool round trip. These simulate, rather than implement, device communication. |
| Stateless continuation | SDK runner replayed opaque synthetic reasoning and function-call/output items in order with no `previous_response_id` and `store: false`. A separate two-client serialized-state case also passed, supporting a short relay-request design without an always-running worker. |
| Central configuration | One SDK run retained its original model/prompt after the test changed a separate active-config object. This proves reusable runner mechanics with caller-pinned parameters, not a deployed config service or protection against a malicious client. |
| Per-call emergency/budget admission | Injected transport guards prevented the next actual mocked dispatch after tool execution changed permission. Both Genkit's automatic loop and the SDK runner permit a per-dispatch guard. The budget-refusal test uses a Boolean stand-in; it does not implement or prove atomic reservations/currency/month accounting. |
| Bounds and failure | SDK `maxSteps` stopped new tool execution at its final request; undeclared tool output was rejected; a pre-aborted run made no request. Both libraries made only one dispatch on a synthetic 503 with `maxRetries: 0`. This does not prove durable crash settlement or upstream idempotency. |

Commands and reproduction are in the [PoC README](../../pocs/ai-harness-comparison/README.md). The focused log is ignored local output at `build/ai-harness-comparison/tests.txt`. No app builds/device checks were relevant: production behavior and dependencies are unchanged.

## Official-source interpretation

[Luna documentation](https://developers.openai.com/api/docs/models/gpt-6-luna) requires Responses for tools with reasoning; its Chat Completions tool support is limited to effort `none`. The tested stock Genkit adapter therefore does not directly emit the documented Luna Max/tool protocol. **OpenRouter might translate a Chat Completions request internally; this was not tested, so do not claim Genkit can never work through OpenRouter.** A compatible custom Genkit model adapter is another possibility, with additional maintenance.

[OpenRouter Responses](https://openrouter.ai/docs/api_reference/responses/overview) is stateless and rejects `store: true` and non-null `previous_response_id`. [OpenRouter reasoning](https://openrouter.ai/docs/api_reference/responses/reasoning) documents the reasoning parameter. [OpenAI's SDK documentation](https://developers.openai.com/api/reference/typescript) documents Deno support and preserving complete replayable output items; [runner guidance](https://developers.openai.com/api/docs/guides/tools-computer-use-sdk-drivers) describes bounded execution, cancellation and diagnostic metadata. These official sources and mock bodies establish an integration candidate, not live route/Max/ZDR enforcement or model quality.

[Genkit tool calling](https://genkit.dev/docs/js/tool-calling/) documents managed loops and explicit tool-request handling; the observed compatible adapter matches that managed-loop purpose. [Genkit client-managed state](https://genkit.dev/docs/agents/state/) can avoid server persistence, but its higher-level Agents API is Beta. Selecting a framework does not automatically select its persistence, cloud telemetry or tracing defaults.

## Host placement and remaining gates

Supabase's [dependency guide](https://supabase.com/docs/guides/functions/dependencies) supports npm modules. Its [hosted limits](https://supabase.com/docs/guides/functions/limits) include Free 150-second worker wall clock, 2-second active CPU per request and 256 MB memory. A multi-round review waiting on a phone should not assume a worker can remain alive indefinitely. Prefer independently admitted bounded relay requests and app-owned tool/history state; a runner used on the server must fit that execution boundary. This PoC tests serialized protocol continuation but does not implement HTTP admission/state signing.

The official SDK runtime list does not support React Native. Keep credentials/SDK in the relay; do not simply import the full SDK runner into the native app. Reusing an in-process server runner may still need a tested transient device callback/iterator bridge. Sharing protocol-state handling with a small app-side coordinator is an alternative. Neither this experiment nor TypeScript language compatibility proves a deployable phone-local full harness.

Before runtime adoption/acceptance: choose the exact execution placement; prove Deno/Supabase import/bundle/CPU/wall-clock behavior (Deno is absent locally); implement verified provider-ID gateway admission and private owner/config access; establish source/reference isolation and authenticated device tool envelopes; disable content traces/logging and prove retention; implement durable atomic reservations/unknown settlement and versioned config; verify streaming, cancellation during dispatch, retries/crash/restore with preserved drafts; then run only a separately funded/permitted live OpenRouter Max/ZDR/provider-usage trial and relevant native checks. None of these gates is passed by the mock suite.

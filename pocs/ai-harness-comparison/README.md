# Isolated AI harness comparison

Tracking: [#13](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/13). This is an authorized synthetic feasibility experiment, outside the app workspace; it is not a production SDK/runtime selection or an AI gateway implementation.

Use Node 24 and the repository-pinned pnpm. From the repository root:

```powershell
pnpm --dir pocs/ai-harness-comparison --ignore-workspace install --frozen-lockfile --ignore-scripts
pnpm --dir pocs/ai-harness-comparison --ignore-workspace test
```

Installation downloads public packages; tests require no credentials or provider access. The separate manifest/lockfile pins Genkit and its compatible plugin at 1.43.0 and OpenAI SDK at 7.43.0. The plugin independently depends on SDK 4.104.0 in this lockfile. No app/root dependency or workspace configuration changes are needed. Do not install this PoC into the native app.

The test process blocks socket connections and global fetch, then injects in-memory transport callbacks into both actual libraries. All URLs, credentials, flight facts, provider replies, reasoning items and usage/cost numbers are synthetic. The SDK runner executes only the declared test function; no browser/computer tools or real database are exposed. No credentials are read from an env file. Library traces must not be interpreted as production privacy acceptance.

Fifteen tests characterize actual serialized requests, tools/opaque reasoning replay, independent relay calls, caller-supplied tool results, pinned per-message model/prompt, per-dispatch emergency/budget refusal, request bounds, unknown-tool rejection, cancellation and disabled retries. A passing mock does not prove model support, upstream ZDR, account access, spend settlement, atomic ledger behavior, a deployed device bridge, streaming or Deno/Supabase/Android acceptance.

The stock isolated install reports an OpenTelemetry peer-version warning and deprecated transitive packages; tests pass with that exact lockfile, but production adoption still needs a supported dependency review. This experiment does not fix or adopt those dependencies for the app.

Results and recommendation: [24 October verification report](../../docs/verification/2026-10-24-ai-harness-comparison.md).

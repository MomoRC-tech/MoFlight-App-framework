# Easy bounded UI tests with Sol 6.1 / Low

Manuel authorized this implementation on 18 October 2026 under [#6](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/6#issuecomment-6252034722), following the [two model trials](../verification/2026-10-18-ui-agent-experiment.md). It is a developer tool for scoped synthetic Android checks; no application/service change, paid API or dependency.

## Ask Codex

Say **“Run a UI test with Sol Low”**, optionally naming the screen/scenario. The parent follows the steps below and launches a fresh `gpt-6.1-sol` worker with explicit `reasoning_effort: low`, `fork_turns: none`. The local Python tool does not launch a model or call the OpenAI API. Do not substitute another model or effort if unavailable.

Only use UI tests when requested or relevant to the change, per the [verification workflow](verification-workflow.md). The controller defaults to a non-mutating eight-check baseline. A narrow task may mark unrelated baseline cases `not_tested`. Arbitrary text entry, app-data changes and provider operations are deliberately outside this tool.

## Parent workflow

1. Reuse/extend the matching Issue contract with scope and acceptance. Inspect only relevant source/design requirements. Select the matching **existing committed-source Release** and its `build.json`; do not mistake an installed old APK for the current source. Finish relevant host logic first; rebuild only when the app itself needs a new native acceptance checkpoint.
2. Use the dedicated **MoFlight_Synthetic_API37** AVD. If stopped, start it headless using the [Windows runbook](windows-local-setup.md#synthetic-emulator-isolation), on an unused port; record that you started it. Never start/clear/capture a private/provider-session AVD. If it is occupied by another task or has unrelated work/drafts, defer. Verify offline state and the intended synthetic library without reseeding or changing network flags.
3. Start the controller, supplying the explicit serial and matching build metadata:

```powershell
pnpm ui:agent start --serial emulator-5562 --build build/development-navigation/android/build.json
# Narrow optional scope:
pnpm ui:agent start --serial emulator-5562 --build PATH/build.json --scope "Inspect paper status and return navigation only"
```

That example's app is the historical `3ec0526` Release: choose a newer manifest only when it is actually built/installed and relevant. The tool independently verifies local/installed APK hashes, Release source commit, named emulator and offline radios. A mismatch fails before UI mutation; it never installs/clears/updates the app. No new build is needed to test this tooling against that unchanged app.

4. The command prints a unique session directory and `task.md`. Launch exactly one worker:

```json
{
  "task_name": "ui_sol_low",
  "model": "gpt-6.1-sol",
  "reasoning_effort": "low",
  "fork_turns": "none",
  "message": "Follow only <absolute-session-path>/task.md and applicable AGENTS.md. No other agents or direct device access."
}
```

Do not supply historical findings or expected values to a blind trial. The generated task contains provenance/session path and a compact command guide. The parent can monitor `pnpm ui:agent status --session SESSION` without spending UI actions. Keep normal user progress communication concise; no navigation rescue during a claimed independent test.

5. The worker submits valid `worker/result.json` and `.md`, then `finish`. The controller validates result structure/evidence paths, restores original size/density overrides/font and verifies offline/install identity. **`completed` is controller execution status, not a UI pass.** Independently inspect the PNGs supporting the relevant visual judgments, verify remaining gates and review action/cleanup errors. Do not inspect unrelated screenshots or rerun all navigation automatically.
6. On interruption, use `stop` when the controller is alive. If the worker vanishes between requests, the idle deadline still closes/restores the session. If the controller itself was killed, use `recover` only after it is dead; see below. Confirm report/cleanup before handing off. Stop only an AVD you started, after review, restoring the initially stopped lifecycle without clearing data. Keep one concise evidence report in the existing package/Issue; do not infer iOS/live/physical acceptance.

## Enforced controls and counting

The separate hidden local process owns **one exclusive synthetic-AVD lock**, an atomic original-display snapshot, elapsed deadline and UI-action/capture counters. Default maximums are **720 seconds, 40 controller UI actions and 8 captures**; CLI options can lower, never raise, these values. Each batch item counts separately; attempted/failed UI actions consume a slot. Status, finish and automatic cleanup are exempt so the worker cannot spend its cleanup reserve.

This is deliberately **not a limit on total LLM tool calls or tokens**. The prior wrapper/nested-call ambiguity is removed by counting exactly at the UI controller boundary. Parent/worker file/image/orchestration tools remain outside that counter; record actual runtime telemetry only if available. No token/cost saving is promised by this implementation.

Only typed operations are exposed: launch/restart, fresh hierarchy, PNG+XML capture, a fully visible/enabled navigation target, scroll, Back, bounded keyboard flags and three viewports. No raw shell, coordinates, text input, network controls, install/uninstall, data clear, seed or restore. Defaults permit ordinary tabs/profile/Development **hub only**/paper status and synthetic D-EX detail rows. Other navigation requires parent-reviewed `--allow-label` at start; never whitelist mutation/provider actions just to make a test pass. It is a cooperative tool boundary, not a sandbox against an agent deliberately bypassing instructions with its other tools.

**Known gesture limitation — 21 October, [#51](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/51):** a generic swipe can cross a visible gesture-enabled keyboard and enter an unsaved draft despite there being no explicit text-input command. Until a selected controller repair enforces safe IME-aware scrolling, use capture/keyboard/Back while the IME is visible and dismiss it before every swipe. The generated task records this mitigation; it is not an enforcement fix or proof that prior keyboard swipes preserved drafts. Scope tests against current screens rather than assuming an ordinary Settings name field or the earlier paper route still exists.

Display changes remain under the controller's `finally` for its whole lifetime. A partial viewport failure restores immediately. Deadline/budget rejection, an authorized client disappearing during a response, normal finish/stop or controller exceptions restore independently of the LLM. A worker disappearing between commands is detected by the deadline, not instantaneously. Requests/body reads and ADB operations have finite timeouts; in-flight commands/cleanup can finish after the deadline and their elapsed time is recorded. Cleanup failures are non-green and retain the ownership lock for explicit recovery.

The controller binds only to `127.0.0.1` on an ephemeral port with a random request token; no proxy or external service is used. **Never commit/share `session.json`**, which contains this local token. Safe reports omit it. A local same-user process already able to edit the session files/run ADB is not treated as a separate security principal.

## Stop, recovery and evidence

```powershell
pnpm ui:agent status --session SESSION
pnpm ui:agent stop --session SESSION
# Only for a dead controller and its matching stale lock:
pnpm ui:agent recover --session SESSION
```

Recovery re-verifies the named AVD and restores the persisted snapshot; an active controller or another owner is refused. The controller cannot run cleanup after forced termination of its own process, emulator loss or power failure. Its durable snapshot and stale lock make that limitation visible instead of silently replacing the baseline. Failed writes/cleanup are failures to report, never permission to bypass guards or clear app data.

Outputs are ignored under `build/ui-agent/<unique-run>/`: `task.md`, `report.json`, timestamped `actions.jsonl`, `worker/` PNG/XML/results, and local-only connection metadata. `report.json` records build/source/hash, original/restored display, network/install identity, exact action/capture counts, errors and execution timing. Keep only task-relevant synthetic evidence in versioned reports, never the connection token. Screenshot acquisition does not prove visual inspection; the worker lists actual inspected image names and the parent reviews relevant conclusions.

Useful deterministic regressions: `python -m unittest tests.test_ui_agent -v`. The tests use synthetic device responses and real local controller/HTTP paths; no Android, model or paid service calls. Native/tool and actual model-quality acceptance remain separate and source-specific in the [single report](../verification/2026-10-18-ui-agent-experiment.md).

# UI-agent experiment 1: Luna on the Android emulator

**Status: prepared, not executed.** Manuel authorized preparation on 18 October 2026. [M1 platform package contract, #6](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/6#issuecomment-6251570686). Execution, comparison and adoption are separate steps. No agent, emulator, build or hosted job was run for this preparation.

## Question and bounded deliverable

Can a fresh-context **GPT-6 Luna / Max** subagent navigate the existing synthetic Android app, inspect a few relevant screenshots and return trustworthy evidence with little supervision? First establish this capability. A single successful run does not establish general defect detection or token/time savings.

Reuse local ADB/Python/image tools; add no service or dependency. The worker owns the emulator exclusively during its run. The parent supplies the short [worker task](ui-agent-experiment-task.md), checks its evidence and handles escalation. Existing deterministic tests remain the default for repeatable assertions; launching a passing Maestro flow alone is not success for this experiment.

## Fixed application and prerequisites

| Item | Pinned value / preflight |
| --- | --- |
| Application source | `3ec05260999ccd8e1a9a2269d018226fad7b15ab`; this is the tested application, not necessarily the operator's current HEAD |
| Local Release APK | `build/development-navigation/android/app-release.apk`, 49,852,914 bytes |
| APK SHA-256 | `c3a7d17cec26cd4211f2d88c6cbc325ac768e45883b5cb2a72f60d6a1c51ab73` |
| App / permitted AVD | `de.momorc.moflight.lab` / **MoFlight_Synthetic_API37** only |
| Existing evidence | [Build metadata](../verification/assets/2026-10-18-development-navigation/build.json), [native reference and preservation limits](../verification/2026-10-18-development-navigation.md) |
| Preparation observation | Local APK exists and its SHA-256 matches the pinned value. Installed binary, current library, device readiness and child tool access have **not** been checked in this package |
| Local evidence | A fresh ignored `build/ui-agent-experiment/<UTC-run-id>/` directory, with separate `operator/` and `worker/` subdirectories; refuse reuse/overwrite |

After execution is authorized, the operator performs this preflight:

1. Record current repository HEAD/dirty state, UTC start time, model settings and local tool versions. Recheck the local APK hash. Do not rebuild merely because documentation HEAD differs from application source.
2. Discover ADB devices. Reuse only the running named synthetic AVD; if stopped, boot it with the documented [Windows setup](windows-local-setup.md#synthetic-emulator-isolation). Verify `adb -s SERIAL emu avd name` before app operations or captures. A serial alone proves no identity. Do not stop, install on, inspect or capture other devices. If the permitted AVD is occupied by another task, defer this trial.
3. Verify the installed base APK: use `adb -s SERIAL shell pm path de.momorc.moflight.lab`, pull that base APK into the fresh evidence directory, and compare its SHA-256 with the pinned value. Do not install/uninstall/update automatically on a mismatch. Stop and report the missing prerequisite.
4. Confirm airplane mode on, Wi-Fi off and mobile data off using read-only settings queries. If these differ, stop; this trial does not change network settings. Record actual Android/API/ABI, `wm size`, `wm density` and `settings get system font_scale`. Do not infer runtime API from build-tool metadata.
5. Launch without clearing data. Check the operator-only baseline below. If it differs, stop without reseeding, importing, restoring, editing or switching books. Force-stop/relaunch to discard only transient UI state, then leave the worker at the overview. A force-stop discards unsaved drafts: stop if unrelated work/drafts are present. Record whether the AVD was started for this trial.
6. Check that the child can use shell, local image inspection and evidence files. Supply the absolute workspace, verified ADB path/serial, APK hash, fresh `worker/` output directory and UTC deadline in the task placeholders. Save the exact supplied prompt and preflight observations under `operator/`; share only installed-APK identity, not the baseline answers. Do not include this operator document, historical screenshots/reports or expected library answers in the worker context. The operator must retain its own display-settings snapshot so it can restore settings if a child interruption prevents cleanup; record any such intervention.

These are readiness checks at execution time, not claims about current device state. Read-only preflight cost belongs to the experiment total.

## Agent launch and boundaries

For the first execution use the collaboration tool with **explicit** settings:

```json
{
  "task_name": "ui_luna_trial_1",
  "model": "gpt-6-luna",
  "reasoning_effort": "max",
  "fork_turns": "none",
  "message": "<completed worker task text>"
}
```

The worker reads the repository's applicable AGENTS.md, then only tool/helper source needed for its task. No whole-repository audit, historical result review, implementation, app fixes, commits or additional agents. Stop on unavailable model/Max/image tools; do not silently substitute settings. Do not call a paid API or dispatch CI. This uses the existing Codex subagent facility if execution is later authorized.

Bounds: one worker, **12 minutes of active worker time**, at most **40 tool calls**, at most **8 distinct inspected screenshots**, and one retry per failed navigation/selector. Count nested shell/image calls as calls. These are operating ceilings, not enforced infrastructure limits or duration estimates. Allow essential cleanup after reaching a ceiling; record the overrun. No parent rescue during the attempt except preservation/cleanup intervention, which makes independent completion fail.

The worker may use targeted helpers from `scripts/android_smoke.py` and `scripts/android_mobile_width_matrix.py`, but must inspect their side effects. In particular, **do not call `Smoke.execute()` or `Smoke.finish()`**: the former clears app data, the latter changes networking. Do not invoke clearing/seeding Maestro or old full suites. An agent-written disposable runner is allowed only inside its ignored evidence directory, with display restoration in `finally`.

## Operator-only reference and scoring

The selected synthetic library's reference facts are **Gliding volume A, four flights, known flight time 1:10**. The existing reference documents measured these at the pinned source; current-state preflight must confirm them. Keep this answer key away from the fresh worker.

| Check | Acceptance / independent review |
| --- | --- |
| U01 | Five ordinary tabs reached; labels and unknown/placeholder states reported as actually observed. No service request or fixture action |
| U02 | Worker independently records the selected-book facts above and one exact synthetic flight-row identity, opens that row's detail and retains it through nested return |
| U03 | Ordinary paper status reached; read-only saved-state explanation present; no seed/copy/proof controls on that ordinary route |
| U04 | From flight detail: Settings → Development → Back → Back returns to the same flight detail. Enter the hub only, not a tool. Expected accessible actions include `Profil & Einstellungen öffnen`, `Entwicklung öffnen` and `Zur vorherigen App-Ansicht` |
| U05 | At the recorded MAIN viewport, worker visually inspects Development and paper status for overlap, clipping, label readability and header/body separation. German dark product surfaces; old English proof bodies are documented exceptions |
| U06 | At 360×900 dp / font 1.6, profile field opens the real keyboard, remains reachable and permits scrolling/dismissal; Development entry remains reachable afterward. No input or save. Screenshot plus native keyboard-state evidence required |
| U07 | After exact display restoration and process restart, selected book/count/known time match U02. Installation identity is retained; no clear/seed/import/restore/save/provider operation |
| U08 | Worker reports `MOFLIGHT_EXPERIMENT_CONTROL_8F2C` absent from the **current visible Development viewport**, with the exact captured hierarchy as evidence; no whole-app absence claim. This is a fabricated-label control, not a seeded visual defect |

Use **passed / failed / blocked / not tested** for each check, with an observed fact and relative evidence path. A selector/tool failure is an experiment failure or blocker, not automatically an app defect. A screenshot not opened by the agent cannot support its visual judgment. XML supports labels/bounds/state, not colors or visual fidelity.

For the first attempt, the parent independently inspects each screenshot used for U05/U06 and the recorded before/after facts. Compare with the current [design authority](../product/design/README.md) and [responsive/keyboard patterns](../product/design/patterns.md). Do not require pixel identity with illustrative data or call known Development exceptions regressions. Count this review time and usage; do not silently redo the whole navigation trial. Reuse the [existing native harness](../../scripts/android_development_navigation_smoke.py) only to adjudicate a concrete unresolved question after the blind report, preserving source and run boundaries.

**Capability pass:** all U01–U08 completed correctly, evidence supports every result, no invented observation or preservation breach, settings restored, and no rescue. Correctly detecting a real app defect can pass the capability trial while its affected UI check fails. Missing prerequisites/tool access are blocked, never a model success. A single pass is only preliminary feasibility; a single infrastructure blocker does not demonstrate model inability.

**Still unproven:** sensitivity to actual visual defects, false-positive rate across varied screens, repeatability, iOS/physical/live-provider acceptance and overall savings. A later blind challenge needs known visual defects and clean controls, prepared separately without changing the shared app. Do not adopt routine Luna UI delegation from a clean-flow pass alone.

## Measurement, fallback and result record

Record timestamps for setup, worker start/end, parent review/cleanup and total elapsed time. Record calls, retries, screenshots, interventions and failures. Preparation is a separate one-time cost; show it separately if measurable. Compare both active and full elapsed time rather than hiding startup/orchestration.

Use per-run runtime telemetry for parent and child input/cached/output/reasoning tokens **only if exposed**, noting whether reasoning is already included in output to avoid double-counting. Record the source of those numbers. Do not inspect unrelated private session logs or infer token totals from response length, tool counts or account-wide usage percentages. With unavailable telemetry, write **token savings unmeasured**; time/call counts are only measured proxies. Codex allowance usage and API dollar pricing are different measures; no dollar-saving claim from API price tables.

If Luna's navigation or judgment is inadequate, the prepared fallback is a new fresh worker with **`model: gpt-6.1-sol`, `reasoning_effort: low`, `fork_turns: none`**, a different task/output name and the identical task. `minimal` is unsupported. Model/effort support is described in the official [Luna](https://developers.openai.com/api/docs/models/gpt-6-luna) and [Sol 6.1](https://developers.openai.com/api/docs/models/gpt-6.1-sol) documentation. Confirm availability at execution; fallback is not automatic permission to launch another run.

For a later comparison, predeclare both models/efforts and repeat the same APK, initial selected library/screen, viewport, offline state, task and evidence limits. Run sequentially on the same emulator, with fresh contexts and no access to the other's findings. Use at least three paired attempts and alternate order. Include parent overhead for each strategy. A savings result needs lower measured total usage/time with acceptable defect detection; report both metrics if only one improves. Do not claim savings when the comparator or token telemetry is missing.

Keep one eventual report at `docs/verification/2026-10-18-ui-agent-experiment.md` (or the actual execution date), extended for retries/comparison; link its evidence and #6. Until execution, the following is only a template:

```text
Status: not executed | preliminary capability pass | failed | blocked
Run/model/effort/context:
Task prompt / application commit / APK hash / installed hash:
Host / Android API / verified AVD+serial / viewport+density+font / offline state:
Checks U01–U08: status; observation; PNG/XML/log paths
Findings: observed app defects vs tool/selector limitations; reviewer disagreements
Preservation: before/after facts; installation identity; exact restored display settings
Timing: setup; worker; review/cleanup; total (seconds)
Usage: parent + child; telemetry source and counting rules, or unavailable
Calls / retries / screenshots inspected / interventions:
Comparator / repeated attempts: not run unless separately recorded
Conclusion: feasibility only; token/time savings measured or unmeasured
Remaining gates and next decision:
```

## Preparation verification — 18 October 2026

Read the existing workflow, current Issue #6, Maestro/native side effects, design patterns and source-specific Release evidence. Independently hashed the local pinned APK: match. Documentation review/check covered four changed/new documents and 158 local link destinations: none missing; U01–U08, explicit model/effort/context, nine task placeholders and withheld library answers are consistent. Linked setup anchor exists; Git whitespace check passed. No application tests/builds or device actions were appropriate for this documentation-only package. No worker trial, installed-source check, device readiness or new native/product acceptance is claimed.

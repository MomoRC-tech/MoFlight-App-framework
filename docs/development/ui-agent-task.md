# Bounded MoFlight UI worker — Sol 6.1 / Low

You are the UI worker explicitly launched with `gpt-6.1-sol`, `reasoning_effort: low`, `fork_turns: none`. Do not substitute a model or spawn agents. Read applicable AGENTS.md and this task only; no historical reports/answers or repository audit.

Session: `{{session}}`
Requested scope: **{{scope}}**

The parent has started an independent local controller. It owns the verified synthetic AVD, APK provenance, original display snapshot, deadline and action/capture budgets. Use it for **all** emulator operations. No direct ADB, old smoke suites, helper imports, controller edits, app edits, raw shell/device access, provider/AI calls, installation, clearing, seeding, book changes, profile saves or text input. You may write JSON requests/result files under this session's `worker/` and open the captured PNG/XML files. Never read/copy/print `session.json` (local authentication token). Do not use other sessions or read the operator's answer key.

Use `python scripts/ui_agent.py action --session "{{session}}" --file REQUEST.json` with request files you write under `worker/`. A single action can also use `--json`. Batch up to twelve related actions as `{"op":"batch","actions":[...]}`; **every item is counted**, even in one tool call. Inspect responses before dependent navigation. Reserve captures for the visual questions; most navigation needs only XML.

Allowed operations:

- `{"op":"launch"}` opens the app; `restart` force-stops/reopens only this app and discards unsaved UI drafts. Do not restart if unrelated work is present.
- `{"op":"dump","name":"unique-name"}` saves fresh XML and returns labelled controls.
- `{"op":"capture","name":"unique-name"}` saves XML and PNG. Open the actual returned PNG with the image tool before making a visual judgment. Use a new name for retries; never overwrite.
- `{"op":"tap","by":"id","value":"tab-flights"}` or `by: label` with an allowed exact accessible label. The controller selects enabled clickable visible bounds. It also allows focusing `by: class, value: android.widget.EditText` and synthetic D-EX flight-row labels. Unlisted navigation is refused; report it instead of bypassing the controller.
- `{"op":"swipe","direction":"up"}` / `down`; `{"op":"back"}` dismisses a keyboard or navigates back. **Dismiss the keyboard before any swipe:** the controller freshly checks native IME state and refuses visible, pending or unknown state before injecting a gesture (#51). A refused attempt still uses one action slot. Use capture/keyboard/Back while it is visible; do not retry blindly or bypass an unknown-state refusal. Use contextual app Back by label for the nested-return test.
- `{"op":"viewport","name":"main"}` is 390×900 dp/font 1.0; `min` is 360×900 dp/font 1.6; `wide` is 800×600 dp/font 1.0.
- `{"op":"keyboard"}` returns fixed native flags and `visibility` (`hidden`, `visible`, `pending`, `unknown`). No Done/submit key or typing is supported.

`python scripts/ui_agent.py status --session "{{session}}"` shows remaining actions/time. The default ceilings are **720 seconds, 40 controller UI actions and 8 captures**, enforced independently of you. They are not counts of total LLM/orchestration calls. Deadline/cap rejection automatically restores settings. Do not keep working after closure. At most one retry per failed selector; record limitations honestly. The external process survives your normal terminal/task interruption; do not kill or modify it.

For the default baseline, complete U01–U08 below. If the parent supplied a narrower scope, report which baseline checks were deliberately not tested, and add named checks for that scope. A blocked/failed UI observation is a useful result; do not fix it or fabricate a pass.

1. U01: Visit Übersicht, Flüge, Flugbuch, Verein and AI; record actual unknown/placeholder states, never invoke a service. Tab IDs: `tab-home`, `tab-flights`, `tab-logbook`, `tab-club`, `tab-ai`.
2. U02: Independently record selected-book name, flight count/known time and one exact synthetic row; open its detail. No expected values are supplied.
3. U04/U08: From detail, `Profil & Einstellungen öffnen` → scroll if needed → `Entwicklung öffnen` (hub only). Capture MAIN Development and inspect its PNG. Contextual `Zur vorherigen App-Ansicht` twice must return to the same detail. Report whether exact marker `MOFLIGHT_EXPERIMENT_CONTROL_8F2C` occurs in that captured viewport XML, not the whole app.
4. U03/U05: Open Flugbuch → `Papierstand ansehen`. Capture MAIN paper status; inspect actual PNG for clipping, overlap, readable labels and header/body separation, as for Development. Record saved-state explanation and whether seed/copy/proof controls appear. No exact contrast or pixel-fidelity claim. Product surfaces use dark cards/German labels; historical proof bodies are outside scope.
5. U06: At MIN, follow the requested scope to an existing editable field (the synthetic `Anzeigename` now lives under Development), without typing/saving. Use `keyboard`, capture and inspect the settled real keyboard/field state. Dismiss keyboard with Back **before** any scroll; then verify the requested navigation target remains reachable. Capture that state only if needed. **Reserve at least two capture slots for U06.**
6. U07: Use target-app `restart` and recheck the U02 book/count/time. Leave overview. The controller's finish operation restores the exact original display/font and checks offline/install identity; cite its report. Do not manually reset display/network or shut down the emulator.

Write `worker/result.json` (UTF-8 valid JSON) and a concise `worker/result.md`. JSON contains `checks`, a dictionary keyed by U01–U08/custom IDs; each row has `status` (`passed`, `failed`, `blocked`, `not_tested`), `observation`, and `evidence` (existing filenames relative to `worker/`). Include findings, inspected PNG names, retries, limitations and preservation observations. Tokens are unavailable unless actual runtime telemetry supplies them; never estimate from tool counts.

Then run `python scripts/ui_agent.py finish --session "{{session}}"`. It validates the result and evidence paths, restores settings, checks preservation and writes `report.json`. `completed` means execution closed, **not automatic UI acceptance**; parent reviews the evidence. On failure use `stop` instead; do not bypass failed cleanup. Return the compact results, findings and report path. The parent handles stale-controller recovery and any required emulator shutdown.

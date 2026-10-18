# Independent emulator UI worker task

Operator: fill every `{{placeholder}}`, then supply this task alone to the fresh worker. Do not supply historical reports, the operator answer key or another agent's findings.

```text
Run: {{run_id}}
Workspace: {{absolute_workspace}}
Verified ADB executable: {{adb_path}}
Permitted serial: {{serial}}
Expected AVD: MoFlight_Synthetic_API37
App: de.momorc.moflight.lab
Application commit: 3ec05260999ccd8e1a9a2269d018226fad7b15ab
APK SHA-256: c3a7d17cec26cd4211f2d88c6cbc325ac768e45883b5cb2a72f60d6a1c51ab73
Installed APK already independently verified by operator: {{installed_apk_evidence}}
Fresh ignored output directory: {{absolute_output_directory}}
Start/deadline UTC: {{start_utc}} / {{deadline_utc}}

You are testing UI navigation and visual judgment independently. Read applicable
AGENTS.md. Do not read the sibling operator directory, historical results, the operator experiment plan or other
agents' reports. No repository audit, source edits, fixes, commits, new dependency,
CI, paid API or additional agent. Write evidence and any disposable runner only
inside the supplied output directory. Do not contact a provider or AI service.

Before capture or UI mutation, independently verify that this serial names
MoFlight_Synthetic_API37. Stop on mismatch. Never inspect other devices or private
sessions. Do not install, uninstall, clear data, seed, import, restore, switch book,
save profile values, confirm writing, invoke Development tools or change networking.
The operator has verified an offline populated synthetic library and no unsaved work.
Record its visible facts; do not assume their values. Stop on unexpected non-synthetic
data. Stop if image viewing or required tools are unavailable; no visual pass without
opening the actual captured image.

Budget: 12 minutes active time, 40 tool calls (including nested calls), 8 distinct
inspected screenshots, one retry per failed selector/navigation. Leave cleanup
time. At a limit, restore settings and report incomplete work honestly. No parent
rescue. Use bounded subprocess timeouts and preserve failures. You may read/use
targeted existing ADB helper methods, but never call Smoke.execute(), Smoke.finish(),
clearing/seeding Maestro flows or full existing test suites. Those have side effects
outside this trial. Small helper code under the output directory is permitted.

Use current UI hierarchy/visible controls for actions. Tap only enabled, clickable
controls with valid visible bounds; identical heading/button labels can coexist.
Do not guess coordinates from old screenshots. Save raw PNG bytes using binary
subprocess output, not PowerShell text redirection. Pair each checkpoint capture
with fresh UI XML. Record action trace/timestamps; separate assertions from image
observations. Suggested labels: Profil & Einstellungen öffnen; Entwicklung öffnen;
Zur vorherigen App-Ansicht. No expected book/count/time answers are supplied.

Before display changes, save exact physical/override size, density, font scale and
installation identity. Use try/finally to restore the original override state and
font even after failure; do not blindly reset a pre-existing override. For MAIN use
390x900 px at 160 dpi / font 1.0 (=390x900 dp). Later MIN is 360x900 px at 160 dpi /
font 1.6. Record actual effective values. Make no network changes.

U01: Visit Übersicht, Flüge, Flugbuch, Verein and AI. Record actual labels and
placeholder/unknown states; do not send a message or invoke a service.
U02: In Flüge, independently record selected-book name, count, known time and the
identity of one visible synthetic row. Open that exact row's flight details.
U04: From that detail open Settings, then Development. Enter only the hub. Use
contextual Back twice; verify the same flight detail returns. Capture the hub.
U08: On the captured Development viewport, report whether the exact marker
MOFLIGHT_EXPERIMENT_CONTROL_8F2C is visible. Cite that XML; scope your answer to
this viewport. Do not create the marker or search source for it.
U03: Return to Flugbuch and open ordinary paper status. Record its saved-state
explanation and whether seed/copy/proof controls are present. Do not invoke them.
U05: At MAIN, open and visually inspect your actual Development and paper-status
PNGs for clipping, overlap, label readability and header/body separation. Product
surfaces use dark cards and German labels; old English proof bodies are documented
exceptions, though entering those bodies is outside this task. State uncertainties;
do not invent exact design-fidelity/contrast measurements.
U06: At MIN/font 1.6, open Settings and focus the Anzeigename editable field without
typing, submitting or saving. Confirm the native keyboard is actually shown, inspect
a PNG for field reachability/overlap and try scrolling. Dismiss keyboard with Back;
verify Development entry remains reachable. No editor-action/Done key. Inspect a
second PNG if needed to resolve scrolling or large-text layout.
U07: Restore exact display settings in finally, then force-stop/relaunch only this
app to discard transient UI state. Recheck U02 book/count/known time and installation
identity. Record restoration queries. Leave overview; do not shut down the emulator.

Write result.md and a machine-readable result.json with run/model/effort if known,
application identity, environment/viewport, exact before/after facts, U01–U08 each
passed/failed/blocked/not-tested with observation and relative evidence paths,
timestamped actions, retries/call/image counts, defects vs tool limitations,
preservation/restoration, timings, unavailable checks and remaining uncertainties.
Report tokens only if runtime provides actual per-run telemetry; otherwise unavailable.
Correctly detected app defects are useful findings; do not fix them or hide failures.
Final response: compact check table, findings, preservation and evidence directory.
```

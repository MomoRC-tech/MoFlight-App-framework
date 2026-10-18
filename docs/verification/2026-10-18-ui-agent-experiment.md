# UI-agent experiment 1 — Luna / Max

**Outcome: failed the bounded capability criteria.** Luna demonstrated independent navigation and supported MAIN screenshot judgments, but did not complete U06 (MIN/enlarged-text keyboard), exceeded the 40-tool-call ceiling and finished its result files about two seconds late. Seven other checks have supporting evidence. This does not establish that Luna cannot do emulator testing; it establishes that this first configuration did not deliver the complete task within its limits. Token/time savings and routine adoption are **not established**.

Tracking: [#6 preparation contract](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/6#issuecomment-6251570686), [explicitly authorized execution](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/6#issuecomment-6251629966). [Operator plan](../development/ui-agent-experiment.md) and [worker task](../development/ui-agent-experiment-task.md). Run `20261018T152237Z-luna-01` used the collaboration tool with explicit `model: gpt-6-luna`, `reasoning_effort: max`, `fork_turns: none`; launch accepted. The child could not independently introspect backend model settings. No other agent/model attempt was launched.

## Source, environment and evidence

Preparation/operator repository HEAD was `43aed5db8eb9367aa22eb6564d1e77f270ee4150`; preflight working tree was clean. Application source was the pinned **`3ec05260999ccd8e1a9a2269d018226fad7b15ab`** committed-source Release, not a build of documentation HEAD. Both local and independently pulled installed APK matched SHA-256 **`c3a7d17cec26cd4211f2d88c6cbc325ac768e45883b5cb2a72f60d6a1c51ab73`**. No build, installation/update, dependency or hosted job was requested for this experiment.

Windows 10.0.26200, Python 3.12.10, ADB 1.0.41/platform-tools 37.0.1-15733141. Only **MoFlight_Synthetic_API37 / emulator-5562**, Android 17/API37/x86_64, was started or accessed. Baseline/restored display: physical 1080×1920 px at 420 dpi, no overrides, font 1.0 (approximately 411.43×731.43 dp). MAIN: 390×900 px at 160 dpi/font 1.0, hence 390×900 dp. MIN: 360×900 px at 160 dpi/font 1.6 was applied briefly but **not tested**. Airplane mode 1, Wi-Fi 0 and mobile data 0 matched before/after.

One [evidence manifest](assets/2026-10-18-ui-agent-experiment/summary.json) links the retained subset and measurement limits. [Original worker report](assets/2026-10-18-ui-agent-experiment/worker/result.md) / [result JSON](assets/2026-10-18-ui-agent-experiment/worker/result.json), [operator review](assets/2026-10-18-ui-agent-experiment/operator/review.json), [preflight](assets/2026-10-18-ui-agent-experiment/operator/preflight.json) and [actual supplied prompt](assets/2026-10-18-ui-agent-experiment/operator/supplied-prompt.txt) remain separate records. All XML checkpoints, action/display traces and only the two relevant MAIN PNGs are retained; the original worker reports name additional PNGs that remain in ignored `build/ui-agent-experiment/20261018T152237Z-luna-01/worker/`. No screenshot gallery or private data is committed.

## Check results and independent review

| Check | Result | Scope / evidence |
| --- | --- | --- |
| U01 | Passed | Five ordinary tabs reached; synthetic facts and disconnected/unavailable Club/AI states recorded; no message/service action |
| U02 | Passed | Independently observed Gliding volume A, four flights, known time 1:10; opened D-EX02 / ASK 21 / 01 June 2026 / 11:00–11:30 UTC |
| U03 | Passed | Ordinary paper status explains three flights without saved paper evidence and the unfinished writing/reconciliation journey; no seed/copy/proof control |
| U04 | Passed | From that flight detail, Settings → Development → contextual Back twice returned to the same D-EX02 detail |
| U05 | Passed, bounded | Parent independently opened [MAIN Development](assets/2026-10-18-ui-agent-experiment/worker/development_main_390.png) and [MAIN paper status](assets/2026-10-18-ui-agent-experiment/worker/paper_status_main_390.png): readable German labels, dark product cards and clear header/body separation; no clipping/overlap observed in these two captured states. No exact contrast/pixel-fidelity claim |
| U06 | Incomplete | Worker marked blocked by its eight-image inspection cap. It did not focus the profile field, show/inspect the keyboard, test MIN scrolling or complete large-text visual inspection. This is a trial-coverage/budget failure, not an app defect |
| U07 | Passed with artifact limitation | Same book/count/known time after target-app restart; installation timestamps/identity and display restoration supported by raw XML and independently queried postflight. Two worker JSON sidecars are malformed; see below |
| U08 | Passed, scoped | Fabricated marker absent from the captured MAIN Development viewport hierarchy only; not an app-wide absence or seeded visual-defect test |

Parent review agreed with the worker's MAIN visual observations. No app defect was established. Three helper-attempt failures are self-reported; one visible trace sequence shows a long upward swipe reaching Android Home, app resumption through its visible launcher icon and a corrected shorter scroll. Tool/navigation errors are distinct from app failures. No parent navigation rescue occurred. The parent sent one administrative deadline reminder; no extension or new UI instruction was supplied.

The original `identity_after.json` and `u07_recheck.json` have trailing literal newline-escape text after the JSON object. Parsing them fails with **Extra data**. The raw bytes are preserved under the worker evidence directory and explicitly listed as invalid in the manifest; they were not silently repaired. `result.json` and operator review parse normally. The parent validated before/after book facts from XML, installation timestamps through its own ADB query and exact display/network settings independently, rather than relying on these malformed sidecars. Full database-byte equality was not tested.

## Timing and usage

| Phase | UTC / elapsed |
| --- | --- |
| Setup start, including cold AVD boot | 15:22:37.000 |
| Worker start | 15:24:45.637; setup **128.64 s** |
| Result files finished | 15:36:47.140; worker **721.50 s** (12 min 1.5 s) |
| Planned worker deadline | 15:36:45.637; approximately **1.50 s late** |
| Independent review and native cleanup end | 15:38:48.424; after-worker phase **121.28 s** |
| Total through native cleanup | **971.42 s** (16 min 11.4 s), including setup, worker, independent review and shutdown |

The manifest separately records the later report/evidence checkpoint and elapsed time through that checkpoint. Documentation/commit/Issue publication after it is not part of the native-cleanup figure. Earlier experiment preparation is a separate one-time package, not hidden inside worker time. No comparator exists, so none of these durations establishes time savings.

The evidence directory contains **27 PNG captures, 28 XML files and 54 timestamped UI-action records**. The worker self-reported **eight images inspected**, approximately **99 top-level orchestration calls**, and that the **40-call ceiling was exceeded**. Exact aggregate nested-tool counts were unavailable; the approximate call count and image-inspection count are worker self-reports, not independently instrumented telemetry. Captures alone do not prove image inspection.

Parent and child token telemetry was not exposed by the collaboration responses. **Token savings unmeasured.** Tool counts, durations and account-wide usage percentages cannot substitute for token measurements. No API-dollar estimate is presented. The parent also incurred setup, progress monitoring, review and recording overhead; there is no claim of cheaper operation based only on the selected model.

## Preservation, limitations and next decision

Parent postflight confirmed the original display/overrides/font, offline flags, installation identity and selected overview. Raw before/after flight XML supports the unchanged selected book, four flights and 1:10 known time. No app data clear, fixture seed/import/restore, selected-book switch, profile save, paper confirmation or provider/AI service action was performed. The AVD was initially stopped; after review the parent gracefully shut down only the verified trial AVD. Private/provider-session AVDs were untouched. A concurrent unrelated edit to `apps/platform-lab/src/vereinsflieger/reconciliation.ts` appeared during the run and was left untouched; it was not built or used by the pinned APK.

This run supplies M1/R01 bounded Android UI observations and existing E11 synthetic restart aspects only. It does not close product/native release gates. Real visual-defect sensitivity, repeatability, first-use/empty states, account/book-switch boundaries, native iOS, physical devices, live provider and actual AI-service/model quality remain untested here.

**Recommendation, not approval:** do not adopt this open-ended worker as the default UI tester. The prepared **Sol 6.1 / Low** fallback can run the same task for comparison when requested. A future Luna retry should explicitly reserve the keyboard images and reduce unnecessary captures/tool round trips, with any task changes disclosed rather than compared as an identical trial. No fallback, retry or new harness implementation is authorized or run by this report.

Verification for this package: no application code was changed by the experiment. Native checks are the executed worker/operator observations above, not a host-test suite pass. Five-document link check covered 280 local destinations with none missing; 31 XML files parse, both retained PNG signatures/dimensions match 390×900 and JSONL lines parse. Nine provenance/result JSON files plus the manifest parse; the two explicitly listed malformed sidecars remain invalid and unmodified. Scoped Git attributes preserve this archive's bytes; recorded SHA-256 values are checked against the staged Git blobs. Staged whitespace check passed. No unrelated app/host tests were appropriate for recording the experiment. Detailed validation belongs to the manifest and #6 update.

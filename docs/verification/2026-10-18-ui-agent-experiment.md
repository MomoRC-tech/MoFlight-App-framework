# UI-agent experiment 1 — Luna / Max and Sol 6.1 / Low

**Comparison outcome: Sol 6.1/Low supported all eight scoped UI checks in 257.73 s versus Luna/Max's seven in 721.50 s.** Sol's worker time was 64.28% shorter in this single pair. Both attempts have operating-contract limitations; neither establishes token savings or a standing delegation policy. [Comparison, safety limits and evidence](#sol-61--low-comparison--18-october-2026).

**Luna/Max first-run outcome: failed the bounded capability criteria.** Luna demonstrated independent navigation and supported MAIN screenshot judgments, but did not complete U06 (MIN/enlarged-text keyboard), exceeded the 40-tool-call ceiling and finished its result files about two seconds late. Seven other checks have supporting evidence. This does not establish that Luna cannot do emulator testing; it establishes that this first configuration did not deliver the complete task within its limits. At this first-run cutoff, token/time savings and routine adoption were not established.

Tracking: [#6 preparation contract](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/6#issuecomment-6251570686), [explicitly authorized first execution](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/6#issuecomment-6251629966). [Operator plan](../development/ui-agent-experiment.md) and [worker task](../development/ui-agent-experiment-task.md). Run `20261018T152237Z-luna-01` used the collaboration tool with explicit `model: gpt-6-luna`, `reasoning_effort: max`, `fork_turns: none`; launch accepted. The child could not independently introspect backend model settings. The later comparison was separately authorized and is recorded below.

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

The first manifest separately records the later report/evidence checkpoint and elapsed time through that checkpoint. Documentation/commit/Issue publication after it is not part of the native-cleanup figure. Earlier experiment preparation is a separate one-time package, not hidden inside worker time. No comparator existed at the first-run cutoff; the later single-pair comparison below remains preliminary.

The evidence directory contains **27 PNG captures, 28 XML files and 54 timestamped UI-action records**. The worker self-reported **eight images inspected**, approximately **99 top-level orchestration calls**, and that the **40-call ceiling was exceeded**. Exact aggregate nested-tool counts were unavailable; the approximate call count and image-inspection count are worker self-reports, not independently instrumented telemetry. Captures alone do not prove image inspection.

Parent and child token telemetry was not exposed by the collaboration responses. **Token savings unmeasured.** Tool counts, durations and account-wide usage percentages cannot substitute for token measurements. No API-dollar estimate is presented. The parent also incurred setup, progress monitoring, review and recording overhead; there is no claim of cheaper operation based only on the selected model.

## Preservation, limitations and next decision

Parent postflight confirmed the original display/overrides/font, offline flags, installation identity and selected overview. Raw before/after flight XML supports the unchanged selected book, four flights and 1:10 known time. No app data clear, fixture seed/import/restore, selected-book switch, profile save, paper confirmation or provider/AI service action was performed. The AVD was initially stopped; after review the parent gracefully shut down only the verified trial AVD. Private/provider-session AVDs were untouched. A concurrent unrelated edit to `apps/platform-lab/src/vereinsflieger/reconciliation.ts` appeared during the run and was left untouched; it was not built or used by the pinned APK.

This run supplies M1/R01 bounded Android UI observations and existing E11 synthetic restart aspects only. It does not close product/native release gates. Real visual-defect sensitivity, repeatability, first-use/empty states, account/book-switch boundaries, native iOS, physical devices, live provider and actual AI-service/model quality remain untested here.

**First-run recommendation, not approval:** do not adopt this open-ended Luna worker as the default UI tester. A future Luna retry should explicitly reserve the keyboard images and reduce unnecessary captures/tool round trips, with any task changes disclosed rather than compared as an identical trial. The subsequent Sol comparison below was separately authorized; no further retry or harness implementation is implied.

Verification for this package: no application code was changed by the experiment. Native checks are the executed worker/operator observations above, not a host-test suite pass. Five-document link check covered 280 local destinations with none missing; 31 XML files parse, both retained PNG signatures/dimensions match 390×900 and JSONL lines parse. Nine provenance/result JSON files plus the manifest parse; the two explicitly listed malformed sidecars remain invalid and unmodified. Scoped Git attributes preserve this archive's bytes; recorded SHA-256 values are checked against the staged Git blobs. Staged whitespace check passed. No unrelated app/host tests were appropriate for recording the experiment. Detailed validation belongs to the manifest and #6 update.

## Sol 6.1 / Low comparison — 18 October 2026

Manuel requested execution of the fallback and a comparison. [#6 comparison authorization/scope](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/6#issuecomment-6251858169). Fresh run **`20261018T154504Z-sol-low-01`** used accepted explicit `gpt-6.1-sol`, `reasoning_effort: low`, `fork_turns: none`. The worker received the unchanged task, with only model/run/time/output substitutions in its launch message and no Luna findings or operator answer key. Task text was checked against preparation commit `43aed5d`: identical. No model, API, infrastructure or app implementation was added.

The same pinned `3ec0526` Release, installed APK checksum, synthetic selected library, offline state, original display, overview starting route, host/runtime and twelve-minute / forty-call / eight-inspected-image limits were used. The parent cold-booted only the same synthetic AVD and repeated preflight; matching installed APK was verified again after the worker. Repository HEAD at preflight was `4ce693f` with unrelated concurrent app/design edits; those later advanced separately and were not built/installed for this trial. New APK/source acceptance is not inferred.

| Measure | Luna / Max | Sol 6.1 / Low |
| --- | --- | --- |
| UI checks supported | 7/8; U06 incomplete | 8/8, including MIN keyboard/scroll/reachable Development entry |
| Worker time, including result writing | **721.50 s (12m01.5s)** | **257.73 s (4m17.7s)** |
| Setup | 128.64 s | 99.12 s |
| Independent review/native cleanup | 121.28 s | 91.48 s |
| Total through native cleanup | **971.42 s (16m11.4s)** | **448.33 s (7m28.3s)** |
| PNG captures, verified from files | 27 | 8 |
| Distinct image inspections, worker self-report | 8 | 6 |
| Tool-call accounting, worker self-report | Approximately 99 top-level calls; nested total unavailable | 19 orchestration wrappers + 26 nested purpose-built calls = 45 conservatively |
| Forty-call limit | Exceeded | Exceeded under conservative wrapper-inclusive counting; nested-only count is 26 |
| Artifact JSON | Two malformed sidecars, preserved | All worker JSON parse |
| Display cleanup | Long-lived finally guard, exact state restored | Exact state restored, but initial mutations lacked a continuous finally guard |
| Parent navigation rescue | None; one administrative deadline reminder | None |
| Parent/child token counts | Unavailable | Unavailable |

**Measured result:** Sol's worker elapsed time was **64.28% shorter** (Luna/Sol time ratio 2.80) while covering the missing UI scenario. This is an observed result for one fixed-order pair, not a general speed/cost guarantee. End-to-end native-cleanup timings include model-independent cold boot, operator reuse, image review and shutdown; these phases must not be attributed solely to model selection. Report/evidence-writing time after native cleanup is recorded separately in the Sol manifest. Earlier shared experiment preparation is a separate one-time cost. Subsequent commit/Issue publication lies after the recorded report checkpoint.

**Independent quality review:** the parent opened Sol's actual [MAIN Development](assets/2026-10-18-ui-agent-experiment/sol-low/worker/04-development.png), [MAIN paper](assets/2026-10-18-ui-agent-experiment/sol-low/worker/07-paper.png), [settled MIN keyboard](assets/2026-10-18-ui-agent-experiment/sol-low/worker/12-min-keyboard-settled.png) and [post-dismissal Development entry](assets/2026-10-18-ui-agent-experiment/sol-low/worker/13-min-development-entry.png). The MAIN judgments agree with Luna's supported observations. At 360×900 dp/font 1.6, the keyboard is visible and the empty editable field is fully above it; scrolling/dismissal and the later enabled Development entry have XML/image support. Native input-method evidence includes `mInputShown=true` and `mIsInputViewShown=true`. No app defect was established. This clean-flow result does not measure detection of seeded visual faults.

**Operating-contract result: not an unqualified pass.** Sol completed the eight UI checks, finished within time and inspected fewer than eight images, but conservatively counted 45 calls and did not keep the initial display edits inside a long-lived `finally` guard. Its later restoration script uses `finally` around cleanup and independently verified exact original settings, but this does not retroactively protect the earlier interval against interruption. The parent needed no cleanup intervention. The ambiguous call bases also prevent a valid tool-call reduction percentage: Luna's approximately 99 top-level count must not be compared directly with Sol's nested-only 26. The final worker reports disclose these limits.

Sol's first overview PNG was captured during the size transition and was excluded from MAIN assessment. One cp1252 console-output error was corrected using UTF-8; the original files had already been saved. One keyboard capture was too early for the animation; a settled retry supplies the actual visual evidence. These are tool/observation limitations, not app defects. Original raw results are preserved rather than recast as an entirely clean execution.

Parent postflight independently verified the same APK checksum, installation identity, selected book/four flights/1:10, original display/font, all offline flags and final selected overview. The initially stopped synthetic AVD was gracefully shut down at **15:52:32 UTC**. No private-session AVD, profile/data mutation, provider/AI service or unrelated source change was made by the trial.

The [Sol evidence manifest](assets/2026-10-18-ui-agent-experiment/sol-low/summary.json), [original result](assets/2026-10-18-ui-agent-experiment/sol-low/worker/result.json), [operator review](assets/2026-10-18-ui-agent-experiment/sol-low/operator/review.json), [supplied prompt](assets/2026-10-18-ui-agent-experiment/sol-low/operator/supplied-prompt.txt) and raw action/XML records retain provenance. Only four relevant PNGs are archived. The large native input-method dump remains in the ignored run directory; its relevant flags and original SHA-256 are retained in the operator review/extract. All worker JSON parse; byte-exact attributes apply to this subdirectory too.

**Recommendation, not standing approval:** Sol 6.1/Low is the stronger candidate from this pair for focused emulator UI inspection. Before routine adoption, use an external continuous display-restoration guard and an unambiguous call counter; those changes are not implemented here. Repeat comparable trials and add known-defect/clean controls before claiming reliable defect detection or general savings. The originally proposed alternating three-pair comparison remains unexecuted. **Token savings remain unmeasured**; neither tool counts nor API token price ratios establish actual Codex usage savings. No additional model run is implied by this recommendation.

Comparison recording checks: six documents / 320 local destinations, none missing; 11 JSON files including the Sol manifest, 18 XML files and 39 JSONL action records parse; two MAIN 390×900 and two MIN 360×900 PNGs have valid signatures/dimensions. Original retained-file hashes match and staged Git bytes/whitespace are verified with the inherited source-specific byte-preservation attributes. No app source/build/host-test change by this comparison package.

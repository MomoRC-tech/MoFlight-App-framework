# Login guidance — package 1a

18 October 2026 · [#17](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/17), coordinated with #16/#5/#8/#20. Manuel's **“go”** authorizes the [bounded login presentation contract](../product/2026-10-18-header-status-review.md#smallest-next-package--1a-login-guidance). It does not authorize package 1b artwork/header/Medical changes or production policies.

## Implementation and source

Application checkpoint **`dcce6e253c96a0ee20db5377ad22086221488e35`**. The connection panel now has concise German session guidance, a state-dependent primary action, separate saved-raw-capture information, and collapsed session options/raw-capture tools. Required account confirmation, mismatch explanation, recovery comparisons and active capture/cancellation feedback remain outside optional disclosures. Opening a disclosure starts no operation; closing the panel collapses its optional content. The original browser parent, controller, association checks, action guards and storage are unchanged. The indicator's accessible wording shares the panel's evidence-based status; artwork is unchanged.

Initial/invalidated state says **Sitzung ungeprüft**, never inferred logout. Only a matching confirmed observation gets **Zuletzt bestätigt** with its check time. Historical sign-out/clearing evidence stays in details and cannot replace current session status. A page-load failure uses its fixed page-specific message rather than claiming a flight retrieval was attempted. The status has a polite accessibility announcement; this is not proof of spoken TalkBack behavior.

## Verification

Environment: Windows, Node **24.18.0**, pnpm **11.25.0**, Python **3.12**; existing SDK/JDK 17 and clean matching `mf-ui-build` checkout. An unrelated build checkout was rejected by the build helper's origin guard and left unchanged. Concurrent documentation work on `main` was preserved; application-source trees were compared before reusing host evidence.

| Check | Result / scope |
| --- | --- |
| `pnpm test` | **203 passed**, including six real-component presentation tests for disclosures/no side effects, retained browser, stale/foreign identity, visible safety decisions, busy/recovery guards and original-page loading/provenance. Native leaf rendering is mocked in those six tests. [Host log](evidence/android-2026-10-18-login-guidance/host-tests.txt) |
| `pnpm typecheck` | Passed |
| `pnpm bundle` | Android and iOS exports passed on the final application tree; no iOS runtime claim |
| `python -m unittest tests.test_android_login_guidance -v` | **2 passed**: existing AVDs and physical devices refused before mutation; host safety checks only |
| Committed-source Android Release/lint | Passed: **622 tasks**, 14 executed / 608 up-to-date; **51.71 s Gradle / 52.54 s overall**; no native regeneration |
| APK validation | **48,738,899 bytes**, embedded JavaScript, ARM64 and x86_64; SHA-256 `f2293ba83d06013412c2d57ccef62f0a3753d15f8ce8e5268978430f8ad4eee9` |
| Final-source native UI | **10 scoped checks passed across three runs** on the same final APK, with two harness corrections described below. [Source/build/native checkpoint](evidence/android-2026-10-18-login-guidance/checkpoint.json) |

Native environment: fresh **MoFlight_LoginUX_API37**, Android 17/API 37 x86_64. Actual logical viewports: **360×900**, **390×900**, **600×1100**, **360×900 at font 1.4**, **840×412 landscape**; all trial overrides at **160 dpi**, other fonts **1.0**. The 600 dp primary action was **496 dp wide and centered**, inside the capped form. The final-source [360 dp enlarged-text panel](evidence/android-2026-10-18-login-guidance/panel-360-large-text.png) and keyboard screenshot were visually inspected for fit/overlap. Other screenshots were not routinely reviewed.

The initial final-APK run retained four valid viewport checks, then stopped on a harness comparison of stale coordinates from different scroll positions. Same-frame landscape bounds showed no overlap (main action bottom 190, details top 258). Harness `bbe82f6` corrected this and retained landscape, optional-control reachability and close/reopen-collapse passes. Its keyboard scroll began inside the IME and could not find a lower control; harness `9da9b17` switched to scrolling the remaining app surface and resumed only keyboard/error checks. No application change or rebuild followed these harness corrections. The three runs contribute **4 + 3 + 3** passes; neither earlier run is represented as an overall pass.

Final keyboard evidence independently measured the IME top at **601 px**: the focused first field ended at 601 before scrolling, and the second date field was reachable above it (bottom 415 after scrolling). Raw retrieval stayed disabled. The fresh offline browser's page-load failure and an explicit failed session check showed distinct page-error/session-error feedback and a usable retry action. Opening optional controls did not invoke saved-login, logout, clearing or capture actions. Full synthetic XML/screens/build/export logs remain ignored under `local-data/login-guidance-2026-10-18/`; the linked checkpoint retains the source-specific results and limitations.

Documentation verification passed: 193 local-link occurrences and 31 heading anchors resolve within the four affected Markdown files; source/status/approval consistency and `git diff --check` passed. No application checks were repeated for the final documentation-only summary.

An earlier `653ce02` Release/exploratory 360 dp enlarged-text capture is separate development evidence; it is not the final-APK acceptance run. Final source includes neutral profile-observation wording, page-specific failure feedback and the status announcement. No live retrieval evidence was repeated.

## Preservation and acceptance limits

Created **MoFlight_LoginUX_API37**, a fresh dedicated AVD, for non-destructive UI checks. The harness verifies emulator/AVD identity before changing display/radios or opening the app; it rejects both existing AVDs. No app reset, provider sign-in, credentials, source capture, clearing, database/private-evidence read or historical-data adoption. Existing **MoFlight_API37** and **MoFlight_Synthetic_API37** remained off and untouched. The fresh trial used radios off; no provider network request could complete. Its app was stopped, original **1080×2400 px / 420 dpi / font 1.0** display settings restored, then only this fresh emulator was shut down. Its synthetic AVD files are retained.

User review of the wording, live original-provider page/keyboard behavior, spoken TalkBack traversal, iOS runtime and the deferred physical-phone gate remain open. Synthetic component/native UI evidence does not prove live authentication or broader #16/#2 acceptance. #17 remains open. Package 1b and the synthetic import/book planner remain separate proposals.

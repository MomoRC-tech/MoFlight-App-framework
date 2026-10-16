# Two compact season rings — 2026-10-16

Milestone: M1 design discovery. Base commit `b16eda9`; resulting commit available through this report's Git history. Environment: Windows/PowerShell, Python 3.12, Codex in-app browser over temporary loopback HTTP. Existing scope #5/#9/#11. Manuel rejected v0.27's large single ring and requested two smaller rings side by side, no aircraft descriptions in the overview, and aircraft details on tapping each ring.

## Deliverable

[Fragment v0.28](../product/prototypes/2026-10-16-clickable-v028.html) and [standalone download](../product/prototypes/exports/moflight-design-v0.28.html) show flight-count and known-time rings simultaneously. Each uses a 108 px canvas with a 94 px outer ring diameter; no toggle, external aircraft labels, connectors or separate aircraft-list expander. Current/prior totals remain inside; personal goals and the missing-duration note remain compactly beneath. The complete ring control is a native button.

Tapping a ring opens one inline details panel below both rings, with a heading for the chosen measure, short aircraft names/color keys, count, known time, missing-value markers, row links to contributing flights and a corresponding yearly-comparison action. Tapping the other ring changes the open context; tapping the same ring again or the close control hides details. Both remain visible. The initial panel is hidden; monthly distribution stays separate and initially collapsed. Work hours, goals, medical reminder, paper books, weather placeholder and navigation retain their prior behavior. No native application/provider changes.

Fixtures and aircraft color identities unchanged: 2026 = 6 flights, 272 known minutes, 2 unknown durations; 2025 = 5 flights, 240 known minutes. Time-ring proportions use known minutes only. Unknown-only ASK21 · 22 contributes a flight-count segment but no invented time; the details table shows its duration as unknown. The source handles all-unknown center values as a dash, but that dataset was not browser-tested.

## Actual checks

- Generated standalone export with existing wrapper and pinned embedded runtime assets; embedding reports zero external script tags. Export size 1,004,683 bytes. Earlier versions preserved.
- Opened export through loopback HTTP and inspected at 320 × 900. Both rings sit side by side without aircraft names or horizontal clipping in the inspected overview. Current values 6 and 4:32, prior values 5 and 4:00, both goals and the two-missing-times notice are visible together. The collapsed view is materially shallower than v0.27 and leaves the paper overview visible in this viewport.
- Flight-count ring opens “Flüge nach Flugzeug,” with four aircraft rows. Selecting the time ring changes the heading to “Flugzeit nach Flugzeug” and identifies known-only time; only that ring has expanded state. Both rings remain visible. The close button hides the panel and returns focus to its ring; the time ring reopens it.
- From the time details, ASK21 · 22 opens only D-5822 on 16 July 2026, one flight with unknown duration. No zero duration is displayed. Browser captured no error-level app console entries.
- Independent GPT-6 Luna documentation pass; source review of ring event handling, shared fixture/color mapping and native-button disclosure state. Local documentation links and staged whitespace checked. No new tests or app test suite, native build/device trial, provider calls or hosted CI.

## Limits

Manuel's visual review remains pending. No actual phone/file-viewer, larger-text, empty/all-unknown dataset or production account-persistence acceptance. The details panels use fixed synthetic fixtures and do not establish live source completeness. Weather remains a placeholder and medical retrieval unconnected. No M1 completion or technology/provider approval. Unrelated product-index, research and attachment changes remain outside this commit.

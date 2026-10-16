# Lighter scrolling canvas — 2026-10-16

Milestone: M1 design discovery. Base commit `1473b86`; resulting commit is recorded by this report's Git history. Environment: Windows/PowerShell, Python 3.12, Codex in-app browser over temporary loopback HTTP. Existing design scope #5/#9/#11; no Issue mutation.

## Deliverable and decision

Manuel clarified that the scrolling area's background should be lighter so the boxes inside are easier to distinguish. [Fragment v0.29](../product/prototypes/2026-10-16-clickable-v029.html) and [standalone export](../product/prototypes/exports/moflight-design-v0.29.html) change the shared scrolling-canvas token from `#0d1627` to `#34445d`. Header, navigation, card colors, content and interactions retain v0.28 behavior. Aircraft colors still identify individual aircraft in both rings. Previous versions are preserved.

Content placement is unchanged, so the inventory remains v0.6. This is a visual revision only; no native feature, provider connection, weather service or milestone completion.

## Actual checks

- Compared v0.28/v0.29 fragment source: only the version badge and scrolling-canvas token differ; JavaScript is unchanged.
- Generated the standalone export using the existing renderer and pinned asset embedding helper: 1,004,683 bytes, zero external script tags.
- Inspected Start and Flüge at 320 × 900. The scrolling canvas is visibly lighter than the season, paper and flight cards; header and bottom navigation remain dark. Both aircraft rings remain side by side. No horizontal clipping was observed in these views; the content element reports client width and scroll width both 276 px and background `rgb(52, 68, 93)`.
- Navigated Start → Flüge → Start and inspected Start again after restoring the default viewport. No captured error-level app console entries at the narrow-width checkpoint. A browser locator failed immediately after the viewport reset; refreshing the accessibility snapshot and using its Start button completed navigation.
- Checked scoped documentation links and staged whitespace before committing. No application test suite, native build, new automated tests, provider calls or hosted CI.

## Limits

These are bounded browser observations, not an actual phone/file-viewer or Android/iOS runtime trial. Larger text, other destination states and broader datasets were not rechecked for this color-only revision. Manuel's visual review remains open. Unrelated product-index, research and attachment changes are preserved outside the commit.

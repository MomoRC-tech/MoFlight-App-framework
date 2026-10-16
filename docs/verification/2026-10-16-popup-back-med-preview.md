# Pop-up contrast, Back and Med label — 2026-10-16

Milestone: M1 design discovery. Base commit `4ffc1fd`; resulting commit is available through this report's Git history. Environment: Windows/PowerShell, Python 3.12, Codex in-app browser over temporary loopback HTTP. Existing design scope #5/#9/#11; no Issue mutation.

## Deliverable and selected changes

Manuel requested more obvious pop-up boxes, more visible top-left Back navigation, and a neatly arranged “Med” label without increasing header height. [Fragment v0.30](../product/prototypes/2026-10-16-clickable-v030.html) and [standalone HTML](../product/prototypes/exports/moflight-design-v0.30.html) preserve previous versions and synthetic data.

- The filter dialog has a pale blue-gray surface (`#dce5f5`) with dark text, a bright border, shadow, 8 px inset, and a strongly dimmed/blurred backdrop. The inline aircraft disclosure also gains a distinct raised background and border; it remains inline rather than becoming a modal.
- Back uses a bright indigo rounded button with a larger dark arrow. The logo hides when Back is visible, leaving room for the title without changing header height.
- The medical control has pulse, “Med,” one total-count badge and status icon in its first row; expiry remains in the second row. The existing 48 px control/season-heading height and 66 px app-header height are retained. Medical records and reminder semantics are unchanged.

## Actual checks

- Generated the standalone HTML with the existing renderer and pinned runtime embedding helper: 1,005,502 bytes, zero external script tags.
- At 320 × 900, inspected Start: Med, count, icons and expiry fit without wrapping the heading or clipping. Measured app header 66 px, season heading 48 px and medical control 48 px. Compared to the v0.29 export in the same browser viewport: all three heights are identical. Start content client/scroll widths both 276 px.
- Medical tap opened Profile's synthetic medical details. The bright Back button was visible at top left and returned to Start. Opened Flüge, its filter dialog, closed the dialog and opened the D-0412 flight detail. Inspected both Profile and flight-detail Back presentation and returned to the flight list.
- Filter dialog visibly separates from the dimmed main screen, with readable heading, labels, fields and close/apply/reset controls. Its measured client/scroll widths were both 266 px; background `rgb(220, 229, 245)`. No horizontal clipping observed.
- Opened and closed the flight-count ring's aircraft panel. Inspected the raised panel, color keys, unknown-duration marker and four aircraft rows; panel client/scroll widths both 238 px. No captured error-level app console entries at this checkpoint.
- Restored the default viewport and inspected Start again. App-header/season-heading/medical heights remained 66/48/48 px.
- Checked scoped relative documentation links and staged whitespace before committing. No new automated tests, app suite, native build, provider access or hosted CI.

## Limits

No actual phone/file-viewer, larger-text, Android/iOS runtime or broader data-state acceptance. Browser evidence is scoped to the inspected views; Manuel's visual review remains open. This does not complete M1 or connect medical/weather/provider data. The standalone file is saved in the repository; this Windows session exposes local file links rather than a phone-downloadable chat attachment. Unrelated product-index, research and attachment changes are outside this commit.

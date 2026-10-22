# Alternative UI — 22 October 2026

[Handbook](README.md) · [#55](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/55) · branch `ui/alternative-flight-experience`.

Manuel authorized an alternative native implementation and verification. Choosing it as the main product design remains a separate decision. M4 presentation reuses existing M2/M3 saved-data and provider boundaries. No new services, dependencies, migrations, provider operations or real-book activation.

## Review and design response

The baseline makes too many elements equally prominent: tiny header title beside three status controls, gradient cards around every group, dense flight metadata before results, and charts mixed with everyday tasks. The alternative establishes a reading order: destination → essential actions → flight information → optional detail.

- **Foundation:** matte navy canvas `#0b141c`, opaque panels `#14232f`, raised controls `#1d3242`, high-contrast off-white text, muted blue-grey labels and mint action color `#76dfc6`. Preserve the selected duotone art and Thermik logo. No external fonts or image generation.
- **Typography and spacing:** 15/22 body, 19/26 section headings, 28/34 header title, 36/44 season values. Cards use 18-unit padding and 22-unit corners; page spacing is 18. Primary actions are at least 52 units, labelled icon targets at least 48. Text follows system scaling.
- **Header (C05/C06):** opaque background, no decorative photo. On phones, give the destination its own row and place Data, Medical and Profile below. Wide layouts share one row. Enlarged text wraps controls. Header-only update/login admission remains unchanged.
- **Start:** two season metrics lead; unknown time remains unknown. Recent flights form a separate, tappable list. Each row opens the exact saved flight identity. Aircraft breakdown and monthly comparison are behind “Saison im Detail”; expanding performs no provider work. Source coverage remains explicit inside the comparison.
- **Flüge (C04/C09):** prominent search, year chips, aircraft filter, concise saved-row count, optional coverage disclosure. Clear search without clearing the year, or reset all filters with one action. The list shows date, reported time, registration, model and route. Details lead with aircraft and duration, with complete original evidence below. No inferred route, track, role or flight time.
- **Navigation (C07):** five preserved destinations, selected filled tile and heavier mint label. Enlarged text uses wrapped rows. The development footer names this as an alternative.
- **Empty/deferred states:** explain the next supported step. Paper setup stays “In Vorbereitung”; AI explains its synthetic example scope. Connection status now reflects the selected real library rather than incorrectly describing every record as synthetic.
- **Responsive composition:** bounded single groups through phone/tablet widths; at 840+ a two-column Start. Flight rows use two columns at 600+ with standard font scale. Monthly chart uses six months per row, three with enlarged text; both series retain year-labelled legends and unknown/partial markers.

## Synthetic design preview

Profile → Development → Designvorschau opens the real Dashboard/OwnFlights components with eight fictional in-memory observations and a fixed 22 October 2026 clock. Start-footer actions show empty and read-failure states; retry and the Flights preview tab restore the populated projection. No provider call, database mutation or account activation occurs. This is a repeatable visual aid, not native storage acceptance.

## Acceptance boundary

Native screen matrix, keyboard, offline restart and host behavior evidence belong in the [package report](../../verification/2026-10-22-alternative-ui.md). Source exports are not iOS runtime proof. Provider login, physical-device experience and spoken accessibility retain their existing independent gates. Main stays unchanged and no PR is requested.

# Alternative native UI — 22 October 2026

Tracking: [#55](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/55). [Design contract](../product/design/alternative-ui.md). Branch `ui/alternative-flight-experience`, isolated from main and its unrelated timing/summary work. Base `3a16c30`.

## Package and risk

Presentation alternative across shared components, header/navigation, dashboard, ordinary flights, paper and AI empty states. Exact-identity recent-flight navigation, search clear and one-step filter reset are the changed interactions. Existing tests protect reader/owner isolation, cancellation, provider admission, raw evidence pagination, list scroll and offline storage; new regressions cover the new controls and disclosure. No database/schema/provider changes.

## Verification checkpoint

Windows, Node 24.18.0, pnpm 11.25.0, Python 3.12. Full host checks pass on the working tree committed in the following checkpoint: `build/host-checks/20261022T184236Z-7a410b33/`. Android/iOS exports passed for the initial alternative; final preview/navigation exports and committed-source Android matrix are in progress. Initial focused checks identified three outdated copy expectations, updated for the branch; no failures were suppressed.

## Remaining platform boundaries

No physical phone, iOS runtime, live Google/provider credential handoff or extended spoken accessibility acceptance is implied. Synthetic offline checks cannot prove live retrieval. This UI alternative is not merged into main or approved as its replacement.

## Independent review

Astra with Medium reasoning independently reviewed navigation and layout source. Two concrete defects were fixed: latest recent-flight request now waits for an active local detail read, and “Alle ansehen” sends a fresh list request instead of retaining a previous detail. A real-hook/reader delayed-promise test plus presentation and shell regressions pass. A separate Astra/Medium agent aligned the handbook and its portable outputs (10 handbook tests); another implemented the explicit synthetic Development preview (3 fixture tests). No model API service or paid CI was used.

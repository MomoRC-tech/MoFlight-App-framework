# Four-screen native implementation

Manuel explicitly requested implementation of the supplied four-screen image on 16 October 2026. This authorization supersedes the earlier design-only task boundary for this slice. The four destinations are Übersicht, Flüge, Verein and AI. Earlier five-tab HTML proposals remain historical previews, not the target of this implementation.

- Milestone: M1, bounded native UI and application contracts; not completion of M2–M5.
- Deliverable: responsive native shell matching the supplied reference, persistent tab state, saved-book flight queries/details, paper-workflow access, and honest unavailable states for unconnected services.
- Dependencies: accepted Expo/React Native/SQLite baseline; existing `PilotBooks`, book selection and domain `effective` flight facts. Existing issues #5 and #9 checked open on 16 October; reuse them, no duplicate task created.
- Acceptance: TypeScript and meaningful query tests, platform bundles, committed-source Android Release build and feature trials where available; actual screenshots compared with the reference. iOS runtime and unavailable providers remain explicit gaps.

## Application contract

The shell opens the existing remembered synthetic pilot library. It never seeds fixtures automatically or relabels synthetic data as a real pilot account. Book selection scopes dashboard totals, queries, paper count and details; changes are remembered through the existing SQLite selection. Native lab and provider capture tools remain accessible from the header. Leaving tools reloads the library so restored selections and confirmed paper entries are reflected.

Flight search and year filters operate on effective saved facts, with distinct unknown duration/date states. Training uses explicit Dual/FI roles. Distance, track and circuit classifications have no saved contract: no invented metrics, maps or classification. Paper outstanding count compares selected-book source identities to its saved paper evidence; it is not a claim about complete provider history or assumed writing progress.

Club sections are interactive but no club events, duties or notices service exists. Weather has no timestamped source. AI has no authenticated assistant gateway: the composer reports unavailability, preserves the draft and offers retry; no fabricated answer, voice control or persisted conversation is presented. Four executable quick questions use bounded deterministic local calculations (yearly known time, longest recorded durations, most frequent known registrations and explicit Dual/FI roles), labeled as local results without AI generation. Unsupported costs/maps/training-progress suggestions are omitted. Results reset when the selected book or data changes. No API, account, schema, billing or paid-service change is included.

## Visual reference

The user-supplied composite has sunset aviation headers, dark navy surfaces, blue outlines, orange paper action, asymmetric season/AI and flight/club cards, blue tab selection and purple assistant accents. Build components, not screenshot-backed screens. Reference examples are illustrative. Sparse genuine/empty data necessarily differs from the reference's populated examples. Local photograph provenance and any visual substitutions are recorded with the assets and verification report.

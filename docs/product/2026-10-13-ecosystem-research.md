# Vereinsflieger and WeGlide ecosystem research

Research date: 13 October 2026, Europe/Berlin. Discovery evidence for MoFlight; recommendations below are proposals, not selected features or a roadmap change.

## Main finding

Existing products already cover Vereinsflieger import, personal electronic logbooks, statistics, exports, signatures and licence reminders. MoFlight cannot reasonably claim those capabilities as unique. B4Takeoff is the strongest direct benchmark; cloudlog.aero and NinerLog are particularly relevant to logbook and analytics discovery.

The more distinctive proposed MoFlight journey is: photograph the current paper book, compare visible entries with provider evidence, distinguish discrepancies from unwritten flights, remember decisions about discrepancies, prepare book-specific instructions with carryovers, and confirm actual copying in resumable batches. No reviewed source documented that entire combination. This is a search finding, not proof of exclusivity or validated demand.

WeGlide is both an inspiration and a possible enrichment source. Its flight-performance features generally need a recorded track, whereas MoFlight's current provider capture primarily concerns flight records. Its public API and account integration also have significant access conditions.

## Scope and evidence quality

Compared against the current [discovery brief](user-journey-ui-discovery.md): understand flying, keep paper books current, examine Vereinsflieger billing, and serve students, instructors and pilots across aircraft categories.

Methods: public web searches in English and German; direct provider documentation, product pages and release notes; GitHub repository search API for `vereinsflieger` and `weglide`; selected README/code-contract inspection; repository activity and licence metadata. The GitHub queries returned 32 and 22 repositories respectively. These counts describe that search, not the whole ecosystem: repositories that mention integrations only in code or documentation can be missed.

No accounts were connected, products installed, private flights accessed or competitors' runtime behavior tested. Feature descriptions below are documented offerings. Vendor compliance, security, adoption and accuracy claims are not independently certified by this research. Latest-push dates are activity signals, not evidence of working releases, current compatibility or human maintenance. No source code was copied.

## Closest apps and software

| Product | Documented overlap | Implication for MoFlight |
| --- | --- | --- |
| [B4Takeoff](https://www.b4takeoff.net/vflanding) | Personal logbooks across pilot categories; exchange with Vereinsflieger/FlightcenterPlus; IGC/GPX/CSV; digital instructor signatures, history of changes, read-only sharing, licence monitoring and GPS recording | Closest direct comparison. Personal history independent of continued club membership is already an explicit benefit. Multiple books and provider import are established offerings |
| [cloudlog.aero](https://cloudlog.aero/) and [integration details](https://cloudlog.aero/en/integrations/) | Personal electronic logbook and prints; automatic Vereinsflieger import currently labelled beta; instructor signature requests and comments | Compare import visibility, instructor workflows and printed output; printing a digital book differs from assisting ongoing handwriting |
| [NinerLog](https://github.com/fjaeckel/ninerlog) / [feature reference](https://ninerlog.com/de/funktionen) | Open-source/self-hosted; recognises Vereinsflieger CSV; import preview and likely-duplicate warnings; carry-forward prior experience; reports by role, aircraft, crew, period and flight-duration patterns; backup and exports | Especially strong analytics and import-review reference. A CSV importer is not live Vereinsflieger sync. Prior-experience totals are not a reconciliation of individual paper entries |
| [Skyminator](https://skyminator.com/) / [data-flow statement](https://skyminator.com/datenschutz) | Automatic flight recording, electronic logbook and Vereinsflieger integration; selected-flight publication to WeGlide described by its privacy policy | Relevant example of combining both ecosystems. Provider claims require hands-on checking, especially conflict handling and direction of sync |
| [EuroPilot Connect](https://www.europilotconnect.com/blog/piloten-app.html) | Provider describes Vereinsflieger flights/reservations/member integration, GPS and manual flight records, statistics, weather and pilot tools | Broad all-in-one alternative; a current provider description does not establish maturity, user numbers or integration reliability |
| [Flugbuch Digital für UL/PPL](https://apps.apple.com/de/app/flugbuch-digital-f%C3%BCr-ul-ppl/id6761736027) | Vereinsflieger/FlightCenterPlus file import; flight/block times, statistics, PDF and offline Apple-device workflows | Relevant because MoFlight's audience extends beyond pure gliding; check field/role mapping and duplicate handling rather than assuming category equivalence |
| [SkyCoach](https://skycoach.io/) | Glider training app with Vereinsflieger flight integration, student/instructor feedback and progress workflows | Important adjacent competitor if training becomes a feature. Flight-performance coaching, instructor feedback and formal syllabus completion are different concepts |
| [Official Flugerfassung app](https://www.flugerfassung-app.de/) | GPS-based flight entry into Vereinsflieger/FlightcenterPlus; requires flight-entry permission; provider explicitly describes copying personal/aircraft-book entries from the app | Club-source capture and an adjacent writing aid. Copying entries from a phone alone is therefore not unique; the reviewed description does not establish photo reconciliation or retained backlog decisions |

B4Takeoff's [release history](https://www.b4takeoff.net/help/hid26) includes June 2026 changes for Vereinsflieger 2FA and immediate departure transfer. Its [Google Play listing](https://play.google.com/store/apps/details?id=net.b4takeoff.app) shows 1,000+ downloads. These are stronger evidence of a maintained distributed product than an undated feature list, but are not measures of active users or successful syncs. The provider lists EUR 20 for 12 months / EUR 35 for 24 months on its Vereinsflieger landing page at research time; verify again before any purchase decision.

### Photo import is already a product category

[FLYLOG.io](https://www.flylog.io/help/paper-logbook-scanner), [TopLog](https://www.pilotlogbookai.com/) and [FlyFren](https://flyfren.com/products/logbook) document photographing paper pages, reviewing extracted entries and importing them into a digital logbook. Therefore, AI handwriting recognition alone is not a differentiator. Their publicly described flow concentrates on paper-to-digital migration; the reviewed pages did not establish MoFlight's provider-to-current-paper-book reconciliation and continued copying workflow. Any advertised accuracy applies to the vendor's own test conditions, not Manuel's book or MoFlight.

## GitHub projects worth examining

Dates below are latest pushes reported by GitHub on the research date. Licence labels come from repository metadata or explicit README licence statements; check actual files before reuse.

| Repository | What it does | State / relevance |
| --- | --- | --- |
| [julianschick/flugbuch](https://github.com/julianschick/flugbuch) | Julia CLI specifically for glider logbooks; Vereinsflieger CSV into SQLite, filters and grouped instructor flights | Archived; last push 2021-10-16; MIT. Closest small historical implementation. README describes grouping by same PIC/aircraft and <=30-minute gaps; this is an implementation idea, not an independently verified current regulatory rule |
| [benjaminmjta/Vereinsflieger-Toolbox](https://github.com/benjaminmjta/Vereinsflieger-Toolbox) | Aircraft-book accounting time/landing calculator | 2026-09-19; MIT. Narrow related utility; its README says Bordbuch support, not a full personal paper-logbook assistant |
| [Akaflieg/startkladde](https://github.com/Akaflieg/startkladde) | Club launch/flight recording, FLARM automation and Vereinsflieger upload | 2026-07-07. Relevant to source generation, not primarily personal analytics; licence needs file inspection |
| [nwmx/TeleFly](https://github.com/nwmx/TeleFly) | Vereinsflieger club chatbot | 2022-08-31; GPL-3.0. Adjacent conversational-access precedent; does not by its existence prove MoFlight's intended natural-language analytics |
| [Turbo87/vereinsflieger-openapi](https://github.com/Turbo87/vereinsflieger-openapi) | Unofficial OpenAPI description; README covers 44 operations from provider specification dated 2026-09-11 | 2026-09-28. Useful for conditional REST discovery; explicitly distinguishes documented, inferred and live-observed response shapes |
| [unicornlines/pyvereinsflieger](https://github.com/unicornlines/pyvereinsflieger) | Python REST client with personal flights, changed/date-range flight queries, calendars, accounting and other endpoints | 2026-05-29; MIT; based on 2025-07-29 specification. Strong contract reference, untested here; application key and permissions still required |
| [termigrator/vereinsflieger_nodejs_api](https://github.com/termigrator/vereinsflieger_nodejs_api) | Node.js classes for documented REST interface | 2026-08-21; MIT. Language-adjacent reference, not established React Native compatibility |
| [Turbo87/vereinsflieger-rs](https://github.com/Turbo87/vereinsflieger-rs) | Rust API client | 2026-03-01; README says work in progress, dual MIT/Apache-2.0 |
| [muerzi/Vereinsflieger-n8n](https://github.com/muerzi/Vereinsflieger-n8n) | Workflow-automation integration | 2026-09-01; MIT. Integration precedent, not a personal logbook product |
| [diginize/vereinsflieger-api](https://github.com/diginize/vereinsflieger-api) | Older OpenAPI/PHP generator project | 2020-08-13; GPL-3.0; README warns against generated PHP in its current state. Lower reuse priority than current contracts |
| [llauner/weglide-statistics](https://github.com/llauner/weglide-statistics) | Imports WeGlide data for statistics; description mentions BigQuery | Archived in 2025; last push 2023-11-17; MIT. Direct analytics precedent, but no maintained ready-to-use MoFlight equivalent established |
| [ryanwoodie/WeGlide-API](https://github.com/ryanwoodie/WeGlide-API) | Canadian gliding leaderboard with season data refresh, flight hours and profiles | 2026-10-12; no licence identified in metadata. Relevant current analytics application; frequent/generated commits do not establish a large maintainer community |
| [develmusa/WeGlide-Python-Client](https://github.com/develmusa/WeGlide-Python-Client) | Generated Python SDK | 2025-03-28; MIT. Its Bearer-token example differs from current official individual `X-API-Key` instructions; revalidate rather than copy |
| [OpenSoaring/WeGlideIGCDownload](https://github.com/OpenSoaring/WeGlideIGCDownload) | IGC download utility | 2026-06-12; MIT. File retrieval reference, not evidence that current rules permit downloading everybody's tracks |
| [jurrian/olc2weglide](https://github.com/jurrian/olc2weglide) | Migration from OLC to WeGlide | 2026-09-18; MIT. Useful history-migration precedent |
| [HotteLight/Weglide_Evaluations](https://github.com/HotteLight/Weglide_Evaluations) | Published activity-evaluation HTML pages | 2026-07-23; no licence identified. An additional analysis example; no product or reliable reusable engine established |

Other search results predominantly covered website login/SSO, club displays, calendar conversion, accounting and flight uploads. Those demonstrate a broader ecosystem without matching the primary personal workflow. General open-source [web-logbook](https://github.com/vsimakhin/web-logbook) offers local SQLite, CSV, statistics, attachments and PDF, but its reviewed README did not document a native Vereinsflieger connector.

## What WeGlide demonstrates

The relevant official service is [weglide.org](https://www.weglide.org/), with documentation at docs.weglide.org. The investigation used these official destinations rather than assuming that the user-supplied `.com` address defines a separate provider.

Its [FAQ](https://docs.weglide.org/intro/faq.html) positions it around sharing and analysing glider flights, including novices, and documents its relationship with DAeC to host DMSt. That is evidence of an established institutional use case. It does not prove that every feature helps every pilot or that the product contains a complete personal flight history.

The [December 2020 philosophy](https://docs.weglide.org/intro/philosophy.html), [April 2022 product update](https://magazine.weglide.org/taking-the-next-step/) and [September 2023 premium introduction](https://magazine.weglide.org/weglide-premium-features-introduction/) provide a dated history. More convincingly than longevity alone, [DAeC's own DMSt page](https://www.daec.de/sportarten/segelflug/streckensegelflug-dmst/) confirms use for championship/Bundesliga submissions and results. This supports relevance of the core competition workflow; it is not a feature-by-feature usability study. WeGlide's [2023 newsletter](https://magazine.weglide.org/newsletter-11/) reports thousands of monthly flight-list users and feedback-driven search/calendar improvements; that usage is vendor-reported.

| Feature family | Documented behavior | Useful lesson for MoFlight |
| --- | --- | --- |
| [Flight statistics](https://docs.weglide.org/how_to/statistics.html) | Leg, thermal and glide analysis with connected map/barogram selection | Let users select a result and inspect the evidence behind it |
| [Statistics list](https://docs.weglide.org/premium/statistics_list.html) | Statistics over filtered flight lists, comparisons and aggregate values; selected scoring interval changes the measures | Preserve a shared period/filter context between summary, chart, list and detail; define what is being measured |
| [Coach](https://docs.weglide.org/premium/coach.html) | Speed-to-fly, weight and thermal analysis with selectable intervals and physical-model assumptions | Explain what a measure means, its assumptions and the question it answers. This does not establish a generative AI chat capability |
| [Flight collections](https://docs.weglide.org/premium/flight_collections.html) | Curated groups of flights with descriptions and sharing options | Saved selections could support a trip, instructor session or writing batch; distinguish collections from separate physical books |
| [Copilot](https://docs.weglide.org/copilot/features.html) | Live/historical flying information plus native recording, local flights, IGC export and selected upload | Keep private records and explicit publishing actions separate |
| [Local competitions](https://docs.weglide.org/premium/local_competitions.html) | Compare pilots on tasks and filter groups | A later club/community option; personal progress need not start with rankings |
| [Search](https://docs.weglide.org/how_to/search.html) and [calendar redesign](https://magazine.weglide.org/newsletter-11/) | Combined filters, favourites and date-based activity exploration | A season calendar and saved personal views are candidates alongside the confirmed duration chart |
| [Badges](https://docs.weglide.org/badges/badges_motivation.html) | Graduated goals encourage participation beyond elite long-distance flying | Consider optional milestones meaningful to students and casual pilots; achievement counters do not establish competence |
| [Task/hardware integrations](https://docs.weglide.org/tasks/integrations.html) | Task-file and flight-computer workflows | Prefer interoperable files and specialist-service links before building another navigation platform |

Performance analytics depend on positional/altitude time series and sometimes aircraft polars and actual weight. A Vereinsflieger row with start, landing and duration cannot reconstruct thermal strength, bank angle or speed-to-fly. Comparisons also depend on aircraft, conditions, task and selected interval; a longer flight alone is not evidence of improved skill.

The native private Copilot logbook/logger was announced on [6 May 2026](https://magazine.weglide.org/weglide-copilot-logger-news-2026-en/). It automatically detects takeoff/landing and saves flights privately before upload. This feature is recent even though the platform is established. A local record, a published WeGlide flight, a club flight and an entry in a physical book should remain distinguishable.

[Copilot troubleshooting](https://docs.weglide.org/copilot/troubleshooting.html) distinguishes upload failure from a flight successfully uploaded but subsequent registration/sync failure, and provides IGC export as a fallback. This is a useful concrete precedent for showing partial success and preserving completed work. Public API access to the private local Copilot logbook was not established.

Current [subscription documentation](https://docs.weglide.org/premium/subscriptions.html) names Supporter, Premium and Patron. The [Free contest](https://docs.weglide.org/contests/international/free.html) is a scoring discipline, not the name of a subscription plan. No separate current product named "WeGlide Progress" was established; progress is also discussed through statistics and badges.

## Source integration implications

### Vereinsflieger

The current MoFlight roadmap already treats REST as a conditional second path, with a shared downstream evidence contract. The newer public clients/contracts strengthen the case for investigating that route once provider permission is available; they do not grant that permission or prove that fields, role scope and pagination match the browser capture.

The Python client's README describes 500 calls/day/appkey and noncommercial-use restrictions. These are secondary reports of the provider's terms; MoFlight's existing authenticated documentation evidence records similar restrictions. Obtain the current official specification/approval before treating either as a binding integration contract. Accounting endpoints in a client do not prove that they expose an ordinary member's exact "Meine Abrechnungen" view or correctly attributed personal costs.

### WeGlide

Current [official developer documentation](https://docs.weglide.org/creators/developers.html) states: individual keys use `X-API-Key`, allow 60 requests/day and at most two keys; own-flight IGC downloading is supported. Public-facing applications using account-specific functionality need OAuth; access is currently limited to applications with at least 1,000 users. Mobile logger approvals have a separate 500-user condition. These are distinct access routes, not a blanket ban on every small personal experiment.

The [API terms](https://docs.weglide.org/legal/api_terms_of_use.html) require written approval to derive commercial revenue from API use, restrict bulk/systematic extraction and require deletion of transferred cached/stored content on termination. This last provision needs explicit resolution before relying on API-derived records for a durable independent logbook. Current terms were read directly; no blanket prohibition on duplicating WeGlide features was found. Recheck before implementation because these conditions can change.

Recommended progression: link to the original WeGlide flight; evaluate user-supplied IGC files as a separate import path; investigate a bounded personal API proof; obtain an appropriate agreement before promising public automatic account sync. User-supplied files also need clear ownership and data handling, but should not be conflated with API access.

### Combine sources without multiplying flights

Proposed rule: a club record, track, WeGlide analysis and paper entry can be evidence about the same real-world flight. They should not automatically become four flights in statistics. Match candidates by stable source identifiers where available, pilot/aircraft/date/time with explicit UTC/local conversion and tolerances. Close training flights and instructor/student records need special care. Preserve disagreements and original values; a scoring distance and a paper-book distance may describe different measures. Do not use whichever value is largest or most convenient.

WeGlide welcomes all flights, including circuits, but uploaded flights are still a selected dataset. Absence there does not establish absence of a flight. Distinguish complete provider windows, selected uploads, historical carryovers and unknown coverage in every year comparison.

## Recommended ideas for concept review

| Proposed priority | Idea | Reason and dependency |
| --- | --- | --- |
| First concepts | Shared filters with summary → contributing flights → evidence | Fits the confirmed analytics journey; inspired by WeGlide and NinerLog; no WeGlide access needed |
| First concepts | Seasonal comparisons, duration distribution, aircraft and person breakdowns | Directly matches Manuel's questions. Explain coverage, unknown values and flight/block duration basis |
| First concepts | Prominent paper catch-up card with unwritten flights, discrepancies and resume | Strongest distinctive workflow found; actual page recognition and format-specific totals still require proof |
| First concepts | Review imported changes and likely duplicates before accepting them | Established pattern in existing logbooks; useful when refreshing sources and reconciling paper |
| Later, modest scope | Personal milestones, saved collections and short post-flight notes | Potential value for students and recreational pilots; select through user review rather than copying public rankings |
| Conditional later | Open a matched flight in WeGlide and attach a user-owned track | Adds context while avoiding a new performance-analysis engine; matching and access need validation |
| Later, separate discovery | Instructor feedback / training progress | Benchmark SkyCoach and cloudlog. Requires syllabus semantics and explicit permissions beyond own-flight history |
| Defer | Thermal coaching, 3D replay, live navigation, weather layers, competitions and social network | Substantial new data, algorithms and product surface; existing specialist services already cover them |

Suggested shared-start-screen concept for review: recent flights and data freshness; this season's flying with inspectable charts; paper-book catch-up status; costs only after billing discovery; optional personal milestone. Advanced WeGlide detail could be an enrichment section within an individual flight. These are proposals, not final navigation or approved implementation.

## Most useful next comparisons

1. Walk through B4Takeoff's import, filtering, statistics and output against MoFlight's two selected outcomes. It is the practical baseline to beat.
2. Review NinerLog's seven report chapters and import preview to choose a compact first analytics slice, including duration patterns.
3. Review WeGlide's filtered list/detail interactions and distinguish whole-flight from task/interval measures.
4. Test MoFlight's proposed paper catch-up concept with a student, instructor and ordinary pilot before broadening scope. Ask whether they intend to retain paper and whether existing digital exports already solve their problem.
5. Review current source permissions and retention conditions before selecting a WeGlide connector or promising lifetime history.

Verification: public source review, selected GitHub README/metadata comparison and internal link/whitespace checks. Runtime compatibility, provider integration permissions, user demand and handwriting accuracy remain untested. Research does not reorder M1–M5 or approve feature implementation.

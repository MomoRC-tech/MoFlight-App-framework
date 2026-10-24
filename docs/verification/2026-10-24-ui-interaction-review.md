# App interaction and design consistency review

**Implementation completed within the recorded scope:** non-AI UI source f223390, with AI dispositions implemented separately under #78. [Current behavior and verification](#implementation-follow-up) include the source-specific host/native evidence and remaining platform/provider limits. The original tree and findings below preserve their earlier review source.

Review requested by Manuel on 24 October 2026; tracking [#81](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/81). M1 interaction review, with M3 flight browsing and M4 analytics dependencies. Original reviewed application source: **99900c2513d0a02b9deabefffbef4b0a3b618a81**. The original review below records that source without changing behavior. Manuel subsequently selected implementation; see the [implementation follow-up](#implementation-follow-up) for changed behavior, source and acceptance.

Follow-ups: [secondary interactions #82](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/82), [backup #29](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/29#issuecomment-6389219948), [session administration #16](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/16#issuecomment-6389220167), [AI #78](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/78#issuecomment-6389220404), [Statistics #9](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/9#issuecomment-6389220613). #82 initially held proposals. Manuel subsequently selected the dispositions with “implement all”; AI screen work is coordinated separately under #78. The original findings remain a historical source snapshot.

**Original review conclusion (source99900c2):** the shared dark palette, outlined icons and header largely carry through the product UI. The compact information hierarchy and predictable routing do not yet carry through consistently. The largest gaps are backup/settings routing, unreachable session administration, the unfinished AI/book destinations, generic nested headers and a second, taller flight presentation inside Statistics. Pale English lab screens remain deliberately reachable under Development; they are not ordinary product screens.

## Scope and evidence

The interaction tree below covers app-owned reachable actions at the reviewed source, parameterizing repeated flights, years, source fields and books rather than enumerating their data-dependent combinations. Navigation contains cycles, so references to earlier branches describe the same destination. Conditional states are listed separately to avoid pretending a simple static tree covers asynchronous behavior. External provider pages and OS pickers have their own interaction graphs; only app entry/return boundaries are covered here.

Authority: [Compact Cockpit and Flights contract](../product/design/compact-cockpit.md), [foundations](../product/design/foundations.md), [components](../product/design/components.md) and [patterns](../product/design/patterns.md), with later approved amendments taking precedence over older descriptions. [The project plan](../project-plan.md) retains milestone/acceptance authority.

Source tracing starts at [index.ts](../../apps/platform-lab/index.ts), which registers [MobileApp](../../apps/platform-lab/src/mobile/MobileApp.tsx), then follows its rendered children, handlers and root provider coordinator. Relevant implementations are linked in each branch and finding. Existing screenshots inspected during this review:

- [Overview after photography/header refinement](assets/2026-10-24-compact-cockpit/phone-overview.png), source 8eb300f: earlier duty layout, so it does not establish the later duty-name/date refinement.
- [Compact Flights preview](assets/2026-10-24-flight-list/main-390.png), source 7b3c594: real Flights component with fictional in-memory records; its preview toolbar is not product navigation.
- [Statistics](assets/2026-10-24-compact-cockpit/statistics.png) and [Profile](assets/2026-10-24-compact-cockpit/profile.png), original c643d9d package: useful composition evidence; their older boxed Sync treatment is superseded in current source.

Source-specific original verification: [cockpit report](2026-10-24-compact-cockpit.md) and [Flights report](2026-10-24-flight-list.md). This review did not start an emulator, rebuild/install an APK, operate private sessions or establish fresh physical-phone/iOS/native accessibility acceptance. Layout risks inferred from code are identified as such.

## Complete reachable interaction tree

### Root shell and global actions

```text
Launch → Übersicht (always the initial tab)
├─ Local selected-account reads → loading / ready / missing / failed
├─ Header Sync (on ordinary pages and most app sheets)
│  └─ Root combined synchronization → see Sync tree
├─ Header Profile (ordinary pages and most app sheets)
│  └─ Profil & Einstellungen → see Profile tree
├─ Saved-age/status strip, when idle with a saved age/read failure/activity hint
│  └─ Verbindung & Datenstatus → see Status tree
├─ Active sync roll-down
│  ├─ Last completed/current stage
│  └─ Cancel, when admitted; disabled across protected save/readback
├─ Failed/partial sync strip
│  ├─ Details → Status
│  └─ Retry → whole combined Sync
├─ Five bottom destinations → Übersicht / Flüge / Flugbuch / Verein / AI
│  └─ Mounted pages retain their local state on ordinary tab switches
└─ Android Back
   ├─ App sheet → its nested history; Statistics delegates internal Back first
   ├─ Flights filter/status/detail → Flights list
   ├─ Any other non-home tab → Übersicht
   └─ Übersicht without overlay → platform default Back
```

App sheets replace the main canvas and hide bottom navigation. Their history and scroll offsets are held in the shell. Busy tool/backup operations guard shell Back and Profile. Statistics uses a centered framed scrim; other shell sheets use full-screen dark presentation. Provider/options use a separate root frame; see below. Source: [MobileApp](../../apps/platform-lab/src/mobile/MobileApp.tsx), [AppHeader](../../apps/platform-lab/src/mobile/AppHeader.tsx), [SyncProgress](../../apps/platform-lab/src/mobile/SyncProgress.tsx).

### Übersicht

```text
Übersicht
├─ Meine Saison title → toggle inline year selector
│  ├─ Previous year (bounded at 1901)
│  └─ Next year (disabled at current year)
├─ Statistik → framed Statistics, initialized with selected season
├─ Arbeitsstunden metric → toggle inline provisional annual-target editor
│  ├─ Decimal hours input
│  ├─ Save locally for account/store/year → success closes editor
│  ├─ Invalid/read/write error → explanation, retain editor for correction/retry
│  └─ Close → dismiss editor (save/close disabled while saving)
├─ Latest flight → Flüge, reset filters to all, open exact flight
│  └─ Back → all-flight list, then Android Back → Übersicht
├─ Alle Flüge → Flüge with all filters cleared
├─ Medical tile → read-only Medical sheet → Back to originating page
├─ Papierflugbuch tile → In Vorbereitung sheet
│  ├─ Flüge ansehen → close sheet/history, switch to Flüge
│  └─ Back → originating page
└─ Compact club/duty card
   ├─ Club heading → Verein / Dienste
   └─ Alle Dienste ansehen → Verein / Dienste
```

Season count/time values are facts, not controls; only the annual work metric edits a preference. Medical shows source expiry/unknown, not fitness. The provisional target is explicitly excluded from manual backups. Year/target editors are inline controls rather than entries in shell Back history. Source: [Dashboard](../../apps/platform-lab/src/mobile/Dashboard.tsx), [DutyTarget](../../apps/platform-lab/src/mobile/DutyTarget.tsx), [OverviewTiles](../../apps/platform-lab/src/mobile/OverviewTiles.tsx), [DutyRoster](../../apps/platform-lab/src/mobile/DutyRoster.tsx).

### Flüge

```text
Flüge
├─ Fixed Zeitraum control ─┐
├─ Fixed Flugzeug control ┴→ same combined Flugfilter screen
│  ├─ All years / each saved year / retained requested year
│  ├─ Existing custom date range shown if supplied by a request
│  ├─ All registrations / each registration / unknown registration if present
│  ├─ Zurücksetzen → clear all filters, remain in chooser
│  └─ Anzeigen or header/Android Back → list with current selections
├─ Search icon → toggle inline text editor
│  ├─ Type → immediate combined filtering
│  ├─ Clear × → clear search only
│  └─ Submit → dismiss keyboard; collapsing editor retains query/tag
├─ Each active value tag × → remove that filter, retain other filters
├─ Reset (only with active tags) → clear all filters
├─ Information icon → Abdeckung & Datenstand screen
│  ├─ Coverage/gaps/age and interpretation caveats
│  ├─ Lokal neu laden → guarded local reread
│  └─ Zurück / header/Android Back → list, filters and scroll retained
├─ Scroll dense list / wide two-column list
│  └─ Each flight card → guarded local exact-flight detail read
│     ├─ Loading → detail spinner
│     ├─ Success → source facts, full raw names and unknowns
│     │  ├─ Original provider fields: eight per page, Previous / Next
│     │  └─ Zur gefilterten Flugliste / header/Android Back → retained list
│     └─ Failure / changed selection → failed local-list state + reload action
├─ No filtered matches → adjust filters/search using retained fixed controls
├─ Ready, no saved flights → passive header-Sync guidance
└─ Missing / failed selection → local reload action + passive header-Sync guidance
```

There is no manual custom-date editor in ordinary Flights at this source; Statistics has one. Filters apply immediately even when leaving the chooser with Back: there is no separate pending/apply model. List/filter position survives detail return; owner/store changes reset it. Source: [OwnFlights](../../apps/platform-lab/src/mobile/OwnFlights.tsx), [reader hook](../../apps/platform-lab/src/mobile/use-own-flights.ts).

### Statistics

```text
Übersicht → Statistik frame (bottom navigation hidden)
├─ Header Sync; header Back delegates nested route Back, then closes frame
├─ Section root
│  ├─ Year chips / Alle Jahre → change period
│  ├─ Eigener Zeitraum → toggle two YYYY-MM-DD fields
│  │  └─ Zeitraum übernehmen, only for a valid range
│  └─ Sections: Überblick / Flugzeuge / Flugdauer / Startarten
├─ Überblick
│  ├─ Beitragende Flüge ansehen → period contributor list
│  ├─ Current-year / prior-year flights → exact contributor list
│  └─ Each month with contributors → that month's exact flights
├─ Flugzeuge → each registration group → exact contributor list
├─ Flugdauer → each duration band / unknown-or-disputed group → contributors
├─ Startarten → unavailable explanation; no verified mapping/count action
├─ Contributor list → each flight → separate Statistics detail presentation
│  ├─ Local loading / unavailable error / confirmed detail
│  └─ All original provider fields rendered in one scrolling card
├─ Nested Back → contributors → originating section/period → close frame
└─ Missing / empty / incomplete / failed source states
   └─ Local reload when failed; unknown/coverage explanations otherwise
```

The section/period route stack preserves contributor context and scroll. Account/store/account-reference key changes remount the frame. This is not the normal Flights list/detail component. Source: [StatisticsOverlay](../../apps/platform-lab/src/mobile/StatisticsOverlay.tsx).

### Flugbuch and Medical

```text
Flugbuch bottom tab → In Vorbereitung card
├─ Flüge ansehen → switch to existing Flüge tab state
└─ Android Back → Übersicht

Medical sheet
├─ Recorded earliest expiry, status/partial/refresh/read warnings
├─ Selectable original captured fields and retrieval provenance
└─ Header/Android Back → prior sheet/page
```

No real book setup, book assignment, paper-copy workflow or Medical editing is available. Development synthetic book tools are separate below. Source: [MobileApp](../../apps/platform-lab/src/mobile/MobileApp.tsx), [MedicalStatus](../../apps/platform-lab/src/mobile/MedicalStatus.tsx).

### Verein

```text
Verein → retained selected subsection (initially Übersicht)
├─ Horizontal chips: Übersicht / Termine / Dienste / Dokumente /
│                     Arbeitsstunden / Aufgaben
├─ Übersicht → expanded duties + compact two-item summaries of other sections
│  └─ Each summary's Ansehen → matching subsection
├─ Dienste → full captured roster; rows are read-only
├─ Termine → captured calendar excerpt; rows are read-only
├─ Dokumente → title/date notices; selectable text, no file-open/download action
├─ Arbeitsstunden → annual EUR/hour source rows + individual work entries
├─ Aufgaben → captured own open tasks; read-only, no completion/edit action
├─ Verbindung & Datenstatus → Status sheet
└─ Android Back from any subsection → Übersicht bottom tab
```

Each source distinguishes unknown/validated empty/partial/truncated/read failure and displays provenance. No event registration, document file opening, task completion or duty signup is implemented. The section chip bar scrolls horizontally; all sections share one vertical ScrollView. Source: [ClubInformation](../../apps/platform-lab/src/mobile/ClubInformation.tsx), [DutyRoster](../../apps/platform-lab/src/mobile/DutyRoster.tsx), [MobileApp](../../apps/platform-lab/src/mobile/MobileApp.tsx).

### AI

```text
AI tab
├─ Each example question → deterministic synthetic-book calculation
│  ├─ Copy question into composer; show local result
│  └─ Flugbuch öffnen → unfinished Flugbuch bottom tab
├─ Composer → multiline draft (maximum 4,000 characters)
│  ├─ Send disabled for blank/busy draft
│  ├─ Send nonblank → immediate service-unavailable message; retain draft
│  └─ Erneut versuchen → repeat same unavailable path
├─ Letzte Anfragen → static empty notice; no stored history action
├─ Gespeicherte Flüge ansehen → existing Flüge tab state
└─ Keyboard → hide bottom navigation; dismiss/tab switch retains draft
```

The main AI screen has not integrated the newer AI storage/tool foundations present elsewhere in the repository. It neither sends requests nor reads real flights for its example answers. Planned [#78](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/78)/[#79](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/79) must not be presented as delivered. Source: [MobileApp](../../apps/platform-lab/src/mobile/MobileApp.tsx), [local-insights](../../apps/platform-lab/src/mobile/local-insights.ts).

### Profile and Status

```text
Profil & Einstellungen
├─ Read-only connection/saved-data summary
├─ Vereinsflieger-Einstellungen → root options frame
├─ Daten sichern & wiederherstellen → SAME root options frame
├─ Diagnose öffnen → Diagnostics sheet
├─ Bildnachweise & Lizenzen → Credits sheet
│  └─ Each image: Original & Urheber / license → external URL
└─ Entwicklung öffnen → Development sheet

Verbindung & Datenstatus
├─ Last scoped sync result, if available; separate per-source outcomes
├─ Saved-data summary and feature/source caveats
├─ Sicherung & Wiederherstellung → synthetic LibraryBackup sheet
└─ Header/Android Back → prior sheet/page
```

Profile has no production account editor or ordinary book selector. Its synthetic profile edit controls are under Development. The Status backup button differs materially from Profile's similarly named backup button. Source: [ProfileSettings](../../apps/platform-lab/src/mobile/ProfileSettings.tsx), [ConnectionSummary](../../apps/platform-lab/src/mobile/ConnectionSummary.tsx), [MobileApp](../../apps/platform-lab/src/mobile/MobileApp.tsx).

### Root Sync, options and recovery

```text
Header Sync → root-owned combined job
├─ Prepare local selection/recovery → confirm matching provider identity
├─ Login required → framed original-provider WebView
│  ├─ Provider-host label; Close; provider-history Back when available
│  ├─ Credential/autofill flows owned by provider/Android
│  └─ Matching verification → automatically hide login; job continues
├─ Retrieve flights → validate/save/readback
├─ Separate Medical / duties / events / document notices /
│  annual work summary / work entries / own tasks jobs
├─ Success → remove routine progress; reload selected local views
├─ Partial / failure / interrupted → persistent status + Details / whole-sync Retry
├─ Cancel → retain saved data; save/readback cannot be interrupted
└─ Recovery gate → actionable failure; options/recovery actions below

Profile settings OR Profile backup OR Development own-flight library
└─ Root options frame (maximum 720 wide, 420 high, viewport bounded)
   ├─ Deine Flüge heading; stored count/age and sync guidance
   ├─ Connection settings
   │  ├─ Manage saved credentials → username/password inputs / save / close edit
   │  └─ Forget saved credentials → result; provider session remains independent
   ├─ Zur App zurück / Android Back → underlying existing page/sheet
   ├─ Details & weitere Optionen → toggle advanced area
   │  ├─ Account/coverage explanation and age/gaps
   │  ├─ Second saved-flight list, five per page → raw detail → close detail
   │  ├─ Datensicherung → selected-folder save / file restore / resume restore
   │  └─ Ältere Flugbibliothek-Sicherung → older flight-only save / restore
   └─ Conditional recovery/error cards (also outside advanced disclosure)
      ├─ Local unreadable → retry reading; eligible backup restore
      ├─ Prepared restore → explicitly resume / check stale predecessor
      ├─ Pending command → check receipt / retry original uncommitted command
      └─ Read-only/newer/ambiguous state → preserve files and show blocking reason
```

System directory/file selection can be cancelled, fail validation/readback, succeed or leave an explicitly resumable restore. Cancelling preserves current data; sharing/picker dismissal alone is not proof of an external backup. Busy and recovery guards remain necessary. The options frame has no backdrop dismissal; explicit return/Android Back closes it when allowed. Source: [CoreFlightFoundation](../../apps/platform-lab/src/mobile/CoreFlightFoundation.tsx), [ConnectionSettings](../../apps/platform-lab/src/mobile/ConnectionSettings.tsx), [UpdateDialog](../../apps/platform-lab/src/mobile/UpdateDialog.tsx).

**Reachability boundary:** the root normalizes every non-update request to `options`; `providerEntryAllowed` is true only for `update`. Update uses `ProviderConnection minimal={true}`; options do not open that provider panel. Consequently the older full ProviderConnection tools (manual capture, information history, session sign-out/browser clearing) and Core's manual provider-period/review controls are implemented branches but not reachable ordinary routes through this registered shell. Development enables recovery checkpoints, not an unrestricted provider entry. Do not count those old panels as available user actions merely because their TSX remains.

### Diagnostics and Development

```text
Diagnostics sheet
├─ Share full diagnosis file → system share UI
├─ Share/copy short report → system UI; selectable report also shown
├─ Clear local journal/export → immediate clear + result
├─ Technical operations / observed user paths / protected failures
├─ Newer / older page (ten records); selectable entries
└─ Header/Android Back → prior sheet

Development hub
├─ Design preview → preview tree below
├─ Own flight library → same root options frame, recovery checkpoints enabled
├─ Synthetic import preview
│  ├─ Start fictional comparison
│  ├─ Recheck comparison / inject incomplete test batch
│  ├─ Each row → review source variant and book suggestion
│  │  ├─ Pick variant / candidate book / assign later
│  │  ├─ Confirm test choice / discard unconfirmed edit
│  │  └─ Return to comparison (shell Back leaves preview, not edit-only Back)
│  └─ Accept test workspace → recompare; stale/conflict failures retain choices
├─ Dataset/flight lab (pale English UI)
│  ├─ Open dataset A / B; import prepared synthetic CSV/page
│  ├─ Findings → ignore / paper override / reverse decision
│  ├─ Fixed flight filters; effective / source / paper query basis
│  ├─ Prepare / select immutable writing snapshot
│  ├─ Each new-copy row → confirm only that row copied (guarded)
│  └─ Share/save synthetic backup / restore into new database
├─ Local demo profile → edit name / save / local retry; explicit saved/error state
├─ Synthetic paper status
│  ├─ Select synthetic book → choices / synthetic backup
│  ├─ Saved flights → real Flüge tab (separate data scope)
│  └─ Synthetic backup
├─ Synthetic book selector → choose book and close all shell-sheet history
├─ Synthetic LibraryBackup (also reachable from ordinary Status)
│  ├─ Android folder save / share backup / pick restore file
│  └─ Loading / retry / busy / cancelled / failed / confirmed-new-library result
└─ Multiple-book lab (pale English UI)
   ├─ Close / load four synthetic books / toggle EU-FCL format preview
   ├─ Select each book; review paper override / retain source / reverse
   ├─ Prepare selected-book writing snapshot / confirm each new-copy row
   ├─ Selected-book / combined-book totals
   └─ Folder save / share pilot backup / restore into new library
```

Sources: [Diagnostics](../../apps/platform-lab/src/mobile/Diagnostics.tsx), [DevelopmentHub](../../apps/platform-lab/src/mobile/DevelopmentHub.tsx), [ImportPreview](../../apps/platform-lab/src/mobile/ImportPreview.tsx), [LibraryBackup](../../apps/platform-lab/src/mobile/LibraryBackup.tsx), [PaperStatus](../../apps/platform-lab/src/mobile/PaperStatus.tsx), [legacy dataset lab](../../apps/platform-lab/src/App.tsx), [BookLab](../../apps/platform-lab/src/BookLab.tsx).

```text
Design preview (fictional in-memory state)
├─ Preview Start / Flights / Club / Sync
│  ├─ Shared Overview/Flights/Statistics actions with synthetic read ports
│  ├─ Flights: empty/error examples; nested filter/info/detail Back
│  ├─ Club: expand roster / return
│  └─ Sync: fetching / saving / login-required / failed / completed simulations
└─ Cockpit preview
   ├─ Preview bottom tabs / Flights and Statistics handoffs
   │  └─ Latest-flight tap opens preview Flights, not an exact requested detail
   ├─ Inline season / target edits (memory only)
   ├─ Undated / same-day-order scenarios
   ├─ Configured-paper / Medical toggles
   ├─ Loading / unknown / read-failure / sync-failure / finished toggles
   └─ Preview close controls → preview or prior Development context
```

Sources: [DesignPreview](../../apps/platform-lab/src/mobile/DesignPreview.tsx), [CockpitPreview](../../apps/platform-lab/src/mobile/CockpitPreview.tsx). Preview clicks are not proof of the same root coordination or persisted account data as ordinary navigation.

### Non-routes and shared state branches

`unsupported`, the old shell synthetic flight-detail body, full AccessProbe/CaptureRun/WindowCapture tools and dormant full-provider tools are not separate reachable product destinations in the registered shell. The shell still declares or renders some of these branches, but no active user action selects them. The embedded dataset lab receives `providerOwned={true}`, blocking a second access-probe entry; `embedded` also removes its standalone book-lab link.

For every applicable branch above, assess this state vector rather than assuming only the populated happy path: selected owner/store/account; local loading/ready/missing/failed; cached age and partial coverage; sync idle/active/waiting/partial/failed; local pending-save/restore/read-only gates; foreground/background; keyboard; ordinary/enlarged text and phone/wide width. The state tree preserves source uncertainty, separates local reread from provider retrieval and does not permit switching identities by displaying a different cached record. This review traces those guards but adds no new isolation acceptance.

## Findings and proposed follow-ups

P2 means meaningful task/routing friction or unavailable expected behavior; P3 means secondary clarity/consistency work. These are UI review priorities, not automatic release blockers. Source locations refer to the reviewed commit.

| ID | Priority | Evidence and user impact | Proposed disposition |
| --- | --- | --- | --- |
| F01 | P2 | `MobileApp.tsx:283`: Profile backup calls `openFlightFlow('options')`, exactly like provider settings. Actual backup requires another Details disclosure and scrolling past credential/flight material (`CoreFlightFoundation.tsx:735–820`). | Give backup a direct dedicated destination with save/restore visible immediately. Preserve existing guarded operations. Track under #29. |
| F02 | P2 | `MobileApp.tsx:296`: ordinary Status → Sicherung opens `LibraryBackup`, which explicitly backs up only the synthetic library and excludes real own flights/Medical (`LibraryBackup.tsx:43–59`). Profile's similar label opens the whole-user path. | Route ordinary Status to whole-user backup; retain explicitly named synthetic backup only under Development. Current destination discloses its scope, but the ordinary entry is misleading. Track under #29. |
| F03 | P2 | Root `MobileApp.tsx:79` normalizes requests to update/options; `CoreFlightFoundation.tsx:825` passes minimal mode for update, and options cannot open ProviderConnection. Sign-out/browser-clear controls live only in the bypassed full panel (`ProviderConnection.tsx:164–180`). ConnectionSettings offers credential forgetting only. | Restore explicit session administration in normal connection settings, preserving independent credential/session/data meanings and recovery guards. Existing #16 owns behavior and acceptance. |
| F04 | P2 | AI result action `MobileApp.tsx:262` switches to `logbook`; that tab at line239 contains only In Vorbereitung. Example answer uses synthetic library data while the destination cannot inspect that library. | Under #78, replace with a real relevant source/result destination or clearly labelled demo inspection route. Do not imply production book activation. |
| F05 | P2 | `MobileApp.tsx:194–202,263–265`: Send always sets service-unavailable; Retry invokes the same path, and Letzte Anfragen is permanently empty. | Before the planned #78 integration, present unavailable capability honestly and avoid a retry that cannot change the outcome. Do not equate planned AI foundations with integrated UI. |
| F06 | P3 | `OwnFlights.tsx:57–60,108–117`: Zeitraum and Flugzeug invoke identical chooser; aircraft users first see period controls. Anzeigen closes rather than commits; Back also retains edits. | Open/anchor the requested section or make the combined-sheet identity explicit. Choose immediate changes consistently; avoid suggesting Back cancels a pending selection. |
| F07 | P3 | `MobileApp.tsx:282`: selectBook, credits and status fall through to header title MoFlight. Statistics omits Profile while other sheets retain it; contributors/details keep a generic outer statistics heading. | Explicit route titles and a documented header-control policy. Keep provider-native toolbar exceptions. |
| F08 | P3 | `StatisticsOverlay.tsx:110–135,210–260,271`: min142 hero, large period/explanation panel, larger contributor cards and an all-fields detail card; ordinary Flights uses dense rows and eight-field raw paging. Existing Statistics screenshot shows most first-screen space consumed before useful metrics. | Align compact hierarchy and reusable flight/detail presentation while retaining period/contributor Back context. Preserve necessary source caveats behind clear information actions. Extend #9. |
| F09 | P3 | `MobileApp.tsx:239,290`: same In Vorbereitung paper content exists as a full tab and a tile sheet, with no book workflow. | Product decision: retain five tabs as approved, but consider making the tile open the existing tab. Hiding/removing a destination needs Manuel's selection. |
| F10 | P3 | `MobileApp.tsx:245–253,183–187`: club chips share a vertical scroll container; Ansehen switches section without saving a section return path. Android Back goes straight to Übersicht bottom tab. | Give subsection expansion contextual return to Verein overview and explicit scroll behavior. Exact viewport jump needs native confirmation. |
| F11 | P3 | `ClubInformation.tsx:17–19,31–123`: source filters, timestamps and partial-coverage paragraphs repeat on compact summaries; documents/tasks remain read-only. | Compact summaries should prioritize relevant rows and one short source qualification, with fuller provenance behind information. Keep labels such as Dokumentenhinweise; do not fabricate document-opening/task-edit actions. |
| F12 | P3 | `CoreFlightFoundation.tsx:746–749`: advanced copy says Keine ... Statistik although ordinary saved-flight statistics exist. Generic Deine Flüge options contains a second raw flight list, whole-user backup and legacy backup format. | Rewrite stale scope wording and move technical/source diagnostics and older-format export out of the everyday backup task. Retain compatible restore and user data. |
| F13 | P3 | `BookLab.tsx:56`, `App.tsx:181`: pale backgrounds/white cards and English controls bypass shared theme. | Intentional Development exception already accepted by #26. Preserve tools; no blanket restyling needed unless promoted to a product route. |
| F14 | P3 | `Dashboard.tsx:40–52`: year and target edit affordances have no obvious chevron/pencil; year changes require repeated taps. Inline editors are outside shell Back history. | Add discoverable cues and choose bounded year picking/inline Back handling. Retain target scope, provisional wording and save-race safeguards. |
| F15 | P3 | `MobileApp.tsx:218`: idle saved-age strip appears across main tabs including Flüge, which also has its own count/info; Profile and Status repeat source guidance. It consumes a minimum48 dp. | Assess consolidating passive status in the established header/info path. Failed/partial/actionable states must remain visible. This is a proposal, not a defect in the approved status contract. |

Do not remove uncertainty labels, partial-coverage notices, owner/account confirmation, recovery gates, backup readback, protected save boundaries or attribution as “unnecessary.” The opportunity is placement and progressive disclosure, not weaker data contracts. Likewise, provider-login and OS picker styling are controlled by their owners; preserve trustworthy origin/Back/Close chrome rather than imitating a dark native form inside external content.

## Consistency assessment

| Surface | Navy/teal and symbols | Compact hierarchy and routing | Assessment |
| --- | --- | --- | --- |
| Übersicht | Shared tokens, amended photo/header treatment | Clear main flight/duty/Medical routes; hidden inline editors | Strong baseline; F14/F15 are refinements. |
| Ordinary Flights | Shared colors; selected/removable teal tags | Dense fixed filters, retained list/detail position | Strong baseline; combined chooser ambiguity F06. |
| Statistics and its flight details | Same palette/icon family | Tall hero/copy; separate list/detail rendering and header policy | Partly consistent; F07/F08. |
| Verein | Shared cards/outlined icons; compact duties updated | Other summaries retain heavier repeated metadata; subsection return differs | Partly consistent; F10/F11. |
| Medical | Shared bounded dark card, explicit source-date states | Read-only source disclosure, sensible scope | Consistent purpose-specific detail; no fresh runtime matrix here. |
| Paper tab/tile | Shared visual language | Duplicate placeholder destination | Visually consistent, limited value until workflow exists; F09. |
| Profile/Status | Shared cards/actions/header | Generic nested titles, repeat copy, conflicting backup destinations | Visual consistency exceeds behavioral consistency; F01/F02/F07/F12. |
| Options/backup popup | Shared colors; radius22 frame | Fixed max420 height even for long maintenance forms; generic flight heading | Needs task-specific hierarchy. Keyboard/enlarged-text usability is a runtime risk, not a reproduced clipping defect. |
| Original-provider login | Dark app chrome around original page | Minimal host/Close/history controls; root-owned continuation | Appropriate deliberate exception; full dormant panel is not an available session route. |
| Diagnostics | Shared bounded cards/actions | Specialist paged views and explicit sharing | Reasonable support exception to flight-row density. |
| Development hub/import/synthetic backup | Shared cards/actions; explicit synthetic scope | Deeper tools intentionally separated | Consistent container; legacy child labs are intentional exceptions. |
| AI | Shared cards/icon/composer | Demo calculations, unavailable Send/Retry/history and wrong book destination | Visually related but not a finished everyday journey; F04/F05. |

There is no basis for claiming that the latest Start/Flights behavior is already applied to every popup. A common color palette alone does not establish common navigation, title, density, disclosure or return behavior. Conversely, a Medical source card or a system picker need not resemble a flight row to be consistent.

## Suggested work order and acceptance

1. Fix ordinary backup entry/scope under #29 and restore session-administration reachability under #16. These affect finding and safely operating existing capabilities.
2. Resolve the AI dead-end/retry presentation within #78, coordinated with its already planned integration. This review does not reprioritize the AI plan or authorize model spending.
3. Select a bounded compact-interaction package: explicit nested titles, targeted filter entry, club subsection Back/scroll and consistent task destinations. Product choices about tab removal or new features remain decisions.
4. Refine Statistics hierarchy under #9, reusing contributor identity and return-state safeguards. Preserve all calculations/coverage/unknown meanings.
5. Consider further duplicate-copy/status reductions only after the affected native screens can be compared. Leave development-only legacy restyling low priority.

Implementation packages should add useful navigation/component regressions for changed routing/Back/backup scope and reuse existing identity/storage tests. Native acceptance should cover actual task entry, nested Back, keyboard and cancellation at MIN360, MAIN390–412 and capped600+/wide, plus enlarged text where affected. Include missing/failed/offline/recovery states; host success alone is insufficient. No extended spoken-accessibility trial is required for this review.

## Verification summary

Review-only package: traced registered root and reachable handlers, compared approved current contracts and inspected four existing synthetic screenshots and their source-specific reports. Documentation checks pass: 48 local references across the report and its three entry-point additions, balanced tree fences, the complete 15-finding inventory and whitespace. Follow-ups were saved to #82 and the four matching existing Issues linked above. No application tests/builds were run because no application behavior changed. Earlier runtime evidence is reused only for the specific sources/states named above. Current-source all-screen visuals, exact keyboard/scroll risks, physical phone, iOS and spoken accessibility remain untested by this review. Unrelated concurrent AI files were preserved and excluded from this package.


## Implementation follow-up

Manuel authorized all review dispositions on 24 October 2026, then identified concurrent work on the AI screen and explicitly authorized direct task coordination. This package owns the non-AI shell, settings, backup, club, dashboard and shared flight presentation. The AI task owns its screen/runtime, AI shell integration and findings F04/F05 under #78, implemented separately in source1c9bdc8. Shared-file changes were staged independently; no private data, session or concurrent source was overwritten. F13 remains the intentional Development-only styling exception, as recommended.

Application source **255e209d0649633b33a4ca4ecc86f739008fff8c**, M1/#82 with #29/#16/#9. The [maintained design amendment](../product/design/compact-cockpit.md#secondary-interaction-refinement-approved-24-october-2026) governs the resulting behavior. The original tree/findings above describe the earlier review source; this disposition table describes the implemented delta.

| Findings | Implemented disposition |
| --- | --- |
| F01/F02 | Profile and ordinary Status both request the direct whole-user backup destination. Save/restore no longer requires opening technical Details. Synthetic LibraryBackup remains confined to Development. Missing-owner state stays explicit; no implicit replacement owner. |
| F03 | Connection settings separately expose guarded provider sign-out, native browser-session clearing and saved credentials. Explicit sign-out opens minimal original-provider chrome plus a verification action; it cannot start flight retrieval. Local saves/restore and provider recovery remain protected. |
| F04/F05 | Concurrent #78/source1c9bdc8 replaces synthetic questions with owner-local conversations, capability-gated Send and exact saved-flight evidence routes. AI service/native acceptance stays in its own package; our f223390 native build deliberately excludes this later integration. No inference was enabled or executed by this package. |
| F06 | Period/aircraft controls open their respective choosers. Changes apply immediately; Back retains them and the return action says Zur Flugliste. Combined filtering and removable values remain intact. |
| F07 | Status, credits, synthetic book selection and synthetic backup have explicit header titles. Profile omits its redundant Profile action. Statistics deliberately retains Back/Sync and its section/contributor titles. |
| F08 | Ordinary Flights and Statistics contributors share FlightCard and FlightDetails; originals page eight fields at a time in both. Tall Statistics heroes are removed; period choices wrap and full coverage commentary is behind Datenstand. Blocked comparison/unknown meanings remain visible. |
| F09 | Paper tile opens the existing Flugbuch tab; duplicate paperInfo sheet is removed. Five tabs remain and real-paper setup stays deferred. |
| F10 | Club subsections have header/Android Back to Verein overview and per-section vertical scroll restoration. |
| F11 | Compact club summaries keep partial/truncated/read-failure qualification; Quellendetails reveals filters/retrieval age. Full sections retain provenance. |
| F12 | Everyday backup omits credentials, raw-flight list and legacy export. Older flight-library restore remains behind a named disclosure; raw diagnostics/export stay under Development. Stale no-Statistics copy is corrected. |
| F13 | Pale English labs retained as clearly scoped Development proofs; no promotion or unnecessary broad restyle. |
| F14 | Season dropdown cue, direct saved-year choices and bounded prior/next controls; Soll anpassen identifies the provisional editor. Inline editor Back consumes navigation and respects pending saves. |
| F15 | Passive saved-age/activity status stays accessible in the Sync control and Profile/Status. Local-read failure, active progress and failed/partial synchronization retain visible actionable rows. |

### Verification summary for implementation

**Final UI source f223390178460fe0073454c8e0108be3ec96c759.** In the clean matching Windows builder, all five host stages pass: strict TypeScript, lint, **1,168 mobile/SQLite passes / two skips**, **133 Python cases / 16 skips**, and fixture parity. Node24.18.0/pnpm11.25.0/Python3.12.10. Runner source records a clean tree at that commit; logs are in the builder's ignored `build/host-checks/20261024T211638Z-d64621f8/` and `local-data/ui-final-source-host.log`. Earlier255e209 host5/5 and Android/iOS Hermes exports remain useful for unchanged platform integrations; final Android was rebuilt. Focused presentation/navigation tests cover direct backup scope, session entry/guards/verification, filter selection, raw paging/return, exact contributors, source disclosure and nested Back; ten dashboard tests additionally protect inline editor Back during a pending save.

The initial shared-workspace host run caught a lifecycle fixture missing the new shared-flight module and an independently evolving AI glyph; both were corrected before the clean-source checkpoint. A label assertion initially assumed adjacent JSX tokens and was corrected to allow rendered whitespace. These were test/harness issues, not evidence that the earlier run passed. Generated handbook/symbol freshness, ten handbook tests, local references/anchors and whitespace were checked for the final documentation package.

**Final internal Android Release:** development-signed, embedded Hermes, ARM64/x86_64, **53,990,390 bytes**, APK SHA256 `e60229a510660c0f76d97a5ec5d56b5bd4a7f7354b3f62953e9be77ff2b4da02`. Final build59.26 s / Gradle58.18 s; installed bytes were independently pulled and hash-matched. The initial255e209 build154.20 s / Gradle151.12 s remains scoped to its first matrix. No APK/release publication was selected; internal binaries and detailed helpers/logs remain ignored in `build/ui-review-implementation/` and `build/ui-*-native*.log`.

**29 accepted Android checkpoints:** 18 at255e209 and 11 atf223390. Task-owned read-only **MoFlight_Synthetic_API37**, observed AndroidAPI37, density160; actual logical390×900,360×900,600×1100 and840×600, font1 and narrow font1.6. Checks cover both direct whole-user backup routes, actual save-folder/restore-file picker cancellation, session controls and credential-field keyboard reachability without typing/saving credentials, paper tile to existing tab, club subsection/header/Android Back, targeted combined flight filters, retained search/detail return, shared source fields, compact Statistics, enlarged-text reflow, explicit credits title and force-stop/offline reopening. Visual review caught internal missing-field names and a one-letter wrap in enlarged Statistics; de0fb9e/ba447a5/f223390 correct them, and final-source images establish readable labels/metrics. Existing list/account calculations and underlying persistence were not changed.

The first native helper used a shortened exact paper label and stopped before its first real assertion; the corrected label completed the18-point matrix. The final helper needed a fresh Profile entry because it searched forward for settings above the preserved scroll position. Its seven valid final-source checkpoints were retained, then it stopped when it incorrectly expected a configured annual-target editor on an unbound account. Four remaining targeted checks were rerun against the same installed source, verifying the correct missing-account target message/Back, German field labels, wide Statistics and offline reopening. The failed attempt is not reported as a full pass. Configured-account native target-save/busy Back remains host-covered here, with earlier persistence evidence retaining its original scope.

All recorded display/font/motion/radio values were restored and compared after each attempt. The owned emulator was stopped and independently absent from ADB; the build checkout was left clean before release to the AI task. No private/provider-session AVD, credential save, actual sign-out, session deletion, provider retrieval, data clear, paid/model/hosted run or production signing. Physical phone, iOS runtime and spoken accessibility remain untested. AI source1c9bdc8 and subsequent refinements have their own #78 native checkpoint; this UI binary intentionally predates them.

[Direct backup](assets/2026-10-24-ui-review/backup.png) · [session settings](assets/2026-10-24-ui-review/settings.png) · [combined targeted filters](assets/2026-10-24-ui-review/filters.png) · [readable enlarged Statistics](assets/2026-10-24-ui-review/statistics-large.png) · [wide Statistics](assets/2026-10-24-ui-review/statistics-wide.png) · [German source labels](assets/2026-10-24-ui-review/flight-source-fields.png) · [sanitized source/hash/checkpoint provenance](assets/2026-10-24-ui-review/summary.json). Public screenshots contain fictional preview data or synthetic maintenance screens; credential-editor screenshots remain ignored.

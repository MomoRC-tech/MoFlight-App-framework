# MoFlight

MoFlight is an offline-first mobile app for student pilots, instructors and pilots who fly in multiple roles. It brings personal flight history, club information and paper logbook tasks together in one app. Gliding is the first logbook format. Ultralight and powered-aircraft formats are planned for later.

## Current delivery

[Download the latest Android test APK (ZIP)](https://github.com/MomoRC-tech/MoFlight-App-framework/releases/download/lab-financial-batches-2026-11-03-9718291/MoFlight-Financial-Batches-9718291.zip). Extract the ZIP and open `app-release.apk` on your Android device. The standalone build uses source commit `971829131d370305d7c9553a10e86f3eb887b6b6`.

[Release notes and earlier APKs](https://github.com/MomoRC-tech/MoFlight-App-framework/releases) · [Release verification](docs/verification/2026-11-03-financial-batches-release.json)

## Product scope

- **Flights and Statistics.** Pilots explicitly sync their own Vereinsflieger flights and can browse saved flights and statistics offline. Totals reflect the available records, and gaps or unknown durations stay visible.
- **Club information and costs.** Saved views bring together duties, work hours, tasks, events and notices. Costs summarize captured billed records with coverage limits.
- **Paper logbooks.** The planned workflow picks up from the last written entry, reviews new flights and prepares the next batch for phone or print. A pilot can have multiple books with independent progress. Real photo-to-writing is still in development.
- **Assistant.** Local chats and offline drafts are available. Live AI is a beta requirement and is currently disabled.

The project targets Android and iOS. The download above is an Android development build. The [project plan](docs/project-plan.md) tracks beta scope, next work and device acceptance.

## Technical approach

The development lab uses Expo, React Native and TypeScript, with SQLite for local persistence. App identity and provider authorization are separate. Local data is scoped to its owner, and paper evidence and progress are scoped to the book. Original source evidence is preserved. AI may propose transcriptions and matches. Deterministic rules calculate flight minutes, roles and totals.

| Location | Purpose |
| --- | --- |
| [apps/platform-lab](apps/platform-lab/README.md) | Mobile lab, interface and platform/provider adapters |
| [packages/flight-logbook](packages/flight-logbook) | Flight, query and writing rules |
| [packages/local-data](packages/local-data) | Local persistence and book contracts |
| [docs](docs/README.md) | Product requirements, architecture, decisions and verification |

## Development

Use Node 24 and the pnpm version pinned in [package.json](package.json).

```bash
npm install --global pnpm@11.25.0
pnpm install --frozen-lockfile
pnpm check
pnpm lab
```

Use synthetic fixtures and keep credentials and private flight data out of Git. See the [lab runbook](apps/platform-lab/README.md) for native setup and the [verification workflow](docs/development/verification-workflow.md) for check selection.

## Project references

| Need | Maintained source |
| --- | --- |
| Priorities, milestones and backlog | [Project plan](docs/project-plan.md), [GitHub Issues](https://github.com/MomoRC-tech/MoFlight-App-framework/issues) |
| Product behavior and design | [Product documentation](docs/product/README.md), [UI design handbook](docs/product/design/README.md) |
| Technical decisions | [Lab stack](docs/adr/0002-phase1-technology-proposal.md), [book and format proposal](docs/adr/0007-multiple-logbooks-and-formats.md), [AI boundary](docs/adr/0008-logbook-ai-and-deterministic-boundary.md) |
| What has been checked | [Acceptance map](docs/project-plan.md#21-acceptance-traceability), [performance ledger](docs/verification/performance/README.md) |
| Dated reports and historical decisions | [Documentation index](docs/README.md), [archive](docs/archive/README.md) |

<details>
<summary>Project requirements</summary>

## Requirements and evidence

The table lists the evidence each requirement calls for. See the [acceptance map](docs/project-plan.md#21-acceptance-traceability) for current coverage.

| ID | Requirement | Evidence needed |
| --- | --- | --- |
| R01 | Android and iOS | Platform-specific native runtime evidence |
| R02 | Multiple flight-related features | Reviewed scope and release packaging |
| R03 | Shared account identity | Verified ownership/session behavior across selected features |
| R04 | Offline reads and writes | Airplane-mode restart/recovery without data loss |
| R05 | Cross-device data | Two-device convergence and conflict handling |
| R06 | User isolation | Negative API, sync, storage, job and account-switch checks |
| R07 | Reusable modules | Domain independence from vendor/platform SDKs |
| R08 | Server-side AI | Authenticated validation, budget and measured usage |
| R09 | Private file processing | Retryable lifecycle, ownership and output verification |
| R10 | Agent-assisted development | Reproducible setup and actual check evidence |
| R11 | Commercial extensibility | Source rights, export/deletion and release requirements |
| R12 | Own Vereinsflieger flights | Authorized retrieval, source comparison and session/repeat behavior |
| R13 | Measurable RAG | Separate retrieval, citations, missing-evidence, latency/cost evaluation |
| R14 | Further aircraft-category logbooks | Format/field/rule evidence before activation |
| R15 | Multiple books and extensible formats | Independent state, migrations and format-extension proof |

</details>

## License

MoFlight's original code, documentation and artwork are proprietary. All rights reserved. Third-party components retain their own licenses. See [LICENSE](LICENSE).

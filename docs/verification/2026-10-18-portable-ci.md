# Portable CI/testing implementation — 18 October 2026

Tracking: [#6 package contract](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/6#issuecomment-6247224733). Scope and operating procedures: [portable CI runbook](../development/portable-ci.md).

## Scope and environment

Authorized handover: automatic fast Ubuntu CI, manual APK and Maestro workflows, portable commands, synthetic smoke and full local independence. No signing/deployment, paid services, account/security/billing changes, production data or iOS work. Existing header/navigation changes were preserved; another task published its evidence as `16bf99b` during this work.

Inspected existing Expo 57.0.27 / RN 0.86.3 workspace, pnpm lockfile, strict TypeScript, node:test/SQLite/Python harnesses, generated Android project, accepted ADR 0009, Windows isolated build workaround and prior Actions. No formatter, ESLint or Maestro previously existed. Existing Release build and native Python harnesses were reused. New correctness lint and a small Maestro navigation/fixture/restart flow extend them.

Host: Windows, Node 24.18.0, pnpm 11.25.0, Python 3.12.10; Android Studio installed, JDK 17.0.20.1+1, local SDK/AVDs available. Dedicated synthetic testing only; active LoginUX and other private-session AVDs are excluded by the new guard.

## Executed verification

- Initial aggregate host check passed all five checks (types 3.54s, lint 2.60s, mobile 2.29s, Python 5.06s, fixtures 0.10s), working implementation on base `16bf99b` (base advanced during the work). Full report/logs: ignored `build/host-checks/20261018T074307Z-dcb3f986/`.
- Maestro 2.11.0 ZIP downloaded and SHA-256 checked against GitHub release digest `5384593cb4e7a106489e75a821d157dd43f4e438df6bc308b72e82c685e1283a`; native Windows CLI reported 2.11.0.
- Final committed-source build, native smoke and final static verification: pending below.

New regression protection checks device rejection before mutation, physical/malformed serial rejection, valid synthetic device selection, real failure verdict/diagnostics, dirty-build refusal, exact/nonexpired artifact identity, workflow trigger policy and immutable action references. Existing domain/storage/native harness coverage remains available. New test IDs are behavior-neutral; full visual matrix is unnecessary for this change. The smoke supplies native selector/navigation evidence, not visual fidelity acceptance.

## Hosted status and remaining gates

Repository visibility was read as PUBLIC, Actions enabled; no rulesets/branch protection observed. Existing run [38264272158](https://github.com/MomoRC-tech/MoFlight-App-framework/actions/runs/38264272158), check 114862343111, reports jobs **not started** due to recent account payment failure or spending-limit restriction. No billing change, spending increase or additional expensive dispatch is permitted. Public runner pricing eligibility does not bypass that account restriction.

No hosted success is claimed. Linux SDK/build execution, hosted artifact generation/download, emulator startup and hosted Maestro remain unverified until GitHub permits execution. Local Windows evidence cannot establish Linux execution. No live accounts, actual AI responses, iOS or physical-device acceptance is provided. Cost ranges in the runbook are estimates, not measured hosted runtimes.

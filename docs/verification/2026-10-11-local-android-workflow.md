# Local Android workflow rollout — 2026-10-11

Tracking: #6. Decision: [ADR 0009](../adr/0009-local-android-development-and-checkpoint-ci.md). The commit containing this initial report identifies the implementation; follow-up evidence identifies the exact source tested.

## Initial validation

- Windows Python 3.12: 31 host tests passed, including seven new trigger/cache/provenance/device-selection regression checks.
- actionlint 1.7.12, shellcheck disabled: both workflow files passed.
- PowerShell parser: local build helper passed; git diff --check passed.
- Trigger cases: docs and ordinary app/domain TypeScript excluded; package manifests, lockfile, app config/plugins, Android helpers/tests and checkpoint workflow included.
- Planner tests: changed app source and expired artifacts prevent reuse; force-fresh avoids artifact lookup; docs-only reuse records both compiled and requested source and uses no-renames comparison.
- Device tests: a different AVD is rejected before reset/install; explicit serial scopes adb calls.

## Rollout gates

Fresh local build, incremental build, dedicated synthetic emulator smoke, development-client update without compilation, hosted checkpoint and automatic concurrency execution remain pending at initial publication. Existing private provider emulator is not used for destructive synthetic testing. No new live-provider, cloud, physical-phone or iOS acceptance is claimed.

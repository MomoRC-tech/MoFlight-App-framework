# Android release — 25 October 2026

Manuel explicitly requested this release after the UI and parallel AI implementation packages. Tracking: [UI #82](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/82), [integrated AI acceptance #79](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/79). Publication does not close the remaining AI operational/model gates.

## Artifact and provenance

- Actual APK source: `bc9d2ffdadb21bff63ae15c36e8e93bdaf2efdf2`.
- [Download APK ZIP](https://github.com/MomoRC-tech/MoFlight-App-framework/releases/download/ui-ai-2026-10-25-bc9d2ff/MoFlight-Android-bc9d2ff.zip).
- ZIP entries: exactly `app-release.apk` and sanitized `build-info.json`; no private inputs, raw build logs or workspace paths.
- APK: 54,059,594 bytes; SHA-256 `13597954b87d9d0f34caad3937f399907dafe1e6d84531ffb4ede014d9c162ce`.
- ZIP: 27,991,580 bytes; SHA-256 `81219766600f4524f1967dbc00c880217eacc01bd716e3c4b8e9e3c39cc021f8`.

Standalone Android lab Release with development signing, embedded JavaScript/Hermes and ARM64/x86_64 libraries; Metro is unnecessary. AI service activation, deployment and inference remain closed pending the separately documented setup/funding gates.

## Verification and evidence reuse

Fresh isolated committed-source Windows build: Node24.18.0, pnpm11.25.0, Python3.12.10, JDK17 and SDK36. Gradle took 122.42 seconds; native regeneration was unnecessary. Build wrapper verifies embedded JavaScript and both ABIs; the embedded bundle's Hermes magic is also checked. Android `apksigner verify --verbose` passes APK v2 signing. ZIP CRC, exact entry set, source metadata and enclosed APK hash pass. An anonymous HTTPS download of the published asset matches the local ZIP SHA-256; its enclosed APK/source metadata also match. The release tag resolves to the exact APK source commit. Local ignored evidence: `build/release-2026-10-25-build.log` and `build/release-2026-10-25/`.

Existing behavior evidence is reused, without rerunning unchanged application code:

- [Secondary UI package](2026-10-24-ui-interaction-review.md#implementation-follow-up): full host verification and 29 accepted source-specific synthetic Android checkpoints, including phone/wide/enlarged-text states and secondary routing.
- [AI host and Android evidence](2026-10-24-ai-chat-implementation.md#ai07-local-coordination-ai08-chat-integration-and-ai09-offline-scorer): full host5/5, both platform exports, focused subsequent checks, local Deno/SQL checks and the final isolated keyboard/draft/signed-update/offline trial at `a5a50b4`.
- `git diff a5a50b4 bc9d2ff` contains only README/documentation changes. The isolated AI fixture does not prove the ordinary provider/owner/model integration.

This packaging increment adds no logic and therefore adds no implementation-mirroring tests. No new emulator trial was run. Existing native evidence remains source-specific, rather than being represented as a new trial of this binary. Physical-phone/iOS, live AI, new live-provider/session actions and extended spoken accessibility remain untested here. Earlier failed AI fixture trials and isolated synthetic residue remain recorded in their source report.

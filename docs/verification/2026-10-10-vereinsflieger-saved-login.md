# Optional device-local saved login for development

Date: 2026-10-10. Tracking: [#2](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/2), [ADR 0006](../adr/0006-vereinsflieger-connector-proposal.md), [user journey](../product/vereinsflieger-connection-and-retrieval.md). Baseline: `b852b9f`. This file's publishing commit identifies the implementation.

## Authorization and implementation

Manuel explicitly authorized saving and using his login on the emulator for the development phase, explaining that repeated desktop sign-in handoffs prevent remote work from his phone. Optional app-owned password saving is approved for this scope. The password is not present in source, fixtures, documentation or commit messages.

- Separate opt-in MoFlight credential-entry screen with masked password and Save/Cancel; values are cleared from React form state after successful save/cancel. The user supplies credentials once; prior provider sign-in did not collect them.
- Pinned `expo-secure-store` 57.0.4 matches the installed Expo 57 `bundledNativeModules.json`; no framework upgrade. Native storage uses a separate service/key, device-only unlocked accessibility on iOS and no per-use biometric prompt. This supports remote development while the device/app is available.
- A nonsecret installation marker in the app sandbox prevents automatically reusing iOS Keychain credentials that survive an uninstall. SecureStore availability is checked; storage failures are reported generically without supplied values.
- Android `allowBackup=false` remains configured and the SecureStore plugin adds exclusions for legacy backup, cloud backup and device transfer. Logbook JSON backups only contain the logbook records and do not access SecureStore. Browser-cookie backup/logout is a separate open check.
- Use saved login is an explicit one-attempt foreground action. It opens the exact observed `https://vereinsflieger.de/` login page, writes app-supplied credentials into the original uniquely identified form and clicks its original submit control. It does not read existing page credential values, hidden salts, cookies or password managers, and does not add a data-extraction bridge to login pages. Changed/ambiguous forms, frames, unrelated pages and external actions receive no credentials.
- No success is inferred merely from a navigation. The provider response remains visible for account/verification checks; retrieval is a separate action. A 30-second timeout ends the attempt without a retry loop. Challenges/2FA/rejection can still need direct provider interaction.
- Forget saved login removes the protected username/password; existing browser cookies and captures are preserved. It is not provider logout. Disconnect/account-switch lifecycle remains open.

Technical references: [Expo SecureStore documentation](https://docs.expo.dev/versions/v58.0.0/sdk/securestore/) and [official source](https://github.com/expo/expo/blob/main/docs/pages/versions/unversioned/sdk/securestore.mdx), plus the installed pinned package's API/plugin source. The SDK 57 documentation URL was inaccessible through web lookup; pinned compatibility was verified locally rather than inferred from the latest docs.

## Checks at implementation publication

All 28 mobile tests pass and strict TypeScript passes. Three new synthetic checks execute the login script with a DOM whose credential getters throw, preserving exact supplied password bytes while testing original submit behavior; reject unrelated origins, non-login paths, frames, ambiguous forms, GET/external actions; and validate bounded device values. They use dummy data only and never submit to the live provider.

Native rebuild/install, protected storage persistence/forget and actual saved-login success are pending at this implementation publication. The current emulator was visually confirmed signed in again after the user handoff. Manuel subsequently confirmed that he enabled the provider’s “stay signed in” option before this last emulator login; this is user-reported option selection, not a measured cookie lifetime. Reusing that session remains the primary approach; saved login is an explicit fallback when the provider asks again. The Chrome tab still rendered a login form when the observed personal-flight path was requested, so no export bytes have been inspected in that browser session. Actual provider source identity/time basis/export/complete history/canonical import and iOS remain unverified. No personal capture is promoted or cleared.

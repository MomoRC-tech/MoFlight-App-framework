# MoFlight platform launcher exports

Source: the [approved square Thermik AI icon](../../../../../docs/assets/branding/moflight-app-icon-ai.png), archived unchanged. These are deterministic platform exports, not a new brand design. The full dark wordmark remains the native header asset.

- `icon.png`: opaque RGB, 1024 × 1024, Lanczos resize of the complete original for iOS and Android legacy/round icons; no baked corner mask.
- `adaptive-foreground.png`: white original silhouette separated from teal by a red-channel key (32..240), centered and proportionally scaled inside a 62 dp circle on Android's 108 dp layer. The same alpha silhouette supplies monochrome/themed icons. `#009bad` supplies the opaque teal background.
- `manifest.json`: source and export SHA-256 fingerprints; source originals are never overwritten.

Regenerate from the repository root with `python scripts/launcher_icons.py` using the already available Pillow (generation only). `python scripts/launcher_icons.py --check` and `tests/test_launcher_icons.py` use only the standard library, checking opacity, visibility, actual alpha bounds, provenance and platform configuration. No app/CI dependency or model call is added. Android's guaranteed safe region is the central [66 dp circle on a 108 dp layer](https://developer.android.com/develop/ui/compose/system/icon_design_adaptive); the inset leaves room for resampling fringes. Expo's pinned prebuild plugin resizes the foreground to 108 dp per density without adding its own padding.

Configuration is in [app.json](../../../app.json). Regenerate native resources after changing exports; the current Windows builder fingerprints app config but does not yet track all image-only changes (#6). Inspect the actual packaged launcher resources after prebuild/build. iOS prebuild/assets do not establish Xcode, simulator, physical-device or App Store acceptance. [Package contract #25](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/25).

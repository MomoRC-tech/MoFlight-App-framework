"""Portable standalone lab build. Windows delegates to the established isolated builder."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time

try:
    from scripts.dependency_layout import inspect_layout
except ModuleNotFoundError:
    from dependency_layout import inspect_layout

ROOT = Path(__file__).resolve().parents[1]
TOOLCHAIN = json.loads((ROOT / 'scripts/android-toolchain.json').read_text())


def run(command, *, cwd=ROOT, capture=False):
    return subprocess.run([str(part) for part in command], cwd=cwd, check=True,
                          text=True, stdout=subprocess.PIPE if capture else None,
                          stderr=subprocess.STDOUT if capture else None,
                          env=dict(os.environ, EXPO_OFFLINE='1', NODE_ENV='production', CI='1'))


def identity():
    commit = run(['git', 'rev-parse', 'HEAD'], capture=True).stdout.strip()
    dirty = run(['git', 'status', '--porcelain'], capture=True).stdout.strip()
    if dirty:
        raise RuntimeError('Commit build inputs first (or use --source-ref HEAD on Windows to exclude drafts).')
    return commit


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-ref', help='Windows: explicitly build a committed ref, preserving source drafts.')
    parser.add_argument('--build-directory', help='Windows: separate short-path checkout; dirty checkouts are refused.')
    parser.add_argument('--output', type=Path, default=ROOT / 'build/android')
    parser.add_argument('--install-sdk', action='store_true', help='Install pinned SDK packages after accepting Android SDK licenses separately.')
    args = parser.parse_args(argv)
    started = time.monotonic()
    node = run(['node', '--version'], capture=True).stdout.strip()
    pnpm = run([shutil.which('pnpm') or 'pnpm', '--version'], capture=True).stdout.strip()
    java = run(['java', '-version'], capture=True).stdout.strip()
    if node != 'v' + (ROOT / '.node-version').read_text().strip() or pnpm != '11.25.0':
        raise RuntimeError('Use Node from .node-version and pnpm 11.25.0 before building.')
    if 'version "17.' not in java:
        raise RuntimeError('Use JDK 17 before building; Android Studio may keep its bundled Java.')
    if os.name == 'nt':
        if args.install_sdk:
            raise RuntimeError('Install the documented SDK packages in Android Studio before the Windows build.')
        command = [shutil.which('pwsh') or 'powershell', '-NoProfile', '-File', ROOT / 'scripts/build-android-local.ps1',
                   '-JavaHome', os.environ.get('JAVA_HOME', '')]
        if not os.environ.get('JAVA_HOME'):
            raise RuntimeError('Dot-source scripts/windows-android-env.ps1 first (JDK 17 and Android SDK).')
        if args.source_ref:
            command += ['-SourceRef', args.source_ref]
        if args.build_directory:
            command += ['-BuildDirectory', args.build_directory]
        sdk = os.environ.get('ANDROID_HOME')
        if sdk:
            command += ['-SdkRoot', sdk]
        run(command)
        checkout = Path(args.build_directory) if args.build_directory else Path.home() / 'mf-build'
        manifest = json.loads((checkout / 'local-data/build-release.json').read_text(encoding='utf-8-sig'))
        apk = Path(manifest['apk'])
    else:
        if args.source_ref or args.build_directory:
            raise RuntimeError('On Linux/macOS check out the desired commit in a clean checkout before building.')
        commit = identity()
        inspect_layout(ROOT, native=True)
        os.environ['EXPO_PUBLIC_MOFLIGHT_SOURCE'] = commit
        sdk = os.environ.get('ANDROID_HOME') or os.environ.get('ANDROID_SDK_ROOT')
        if not sdk or not Path(sdk).is_dir():
            raise RuntimeError('Set ANDROID_HOME to an installed Android SDK and accept its licenses.')
        if args.install_sdk:
            manager = Path(sdk) / 'cmdline-tools/latest/bin/sdkmanager'
            run([manager, *TOOLCHAIN['sdkPackages']])
        pnpm_executable = shutil.which('pnpm') or 'pnpm'
        run([pnpm_executable, '--filter', '@moflight/platform-lab', 'exec', 'expo', 'prebuild', '--no-install', '--platform', 'android'])
        android = ROOT / 'apps/platform-lab/android'
        gradle = android / 'gradlew'
        gradle.chmod(0o755)
        run([gradle, ':app:assembleRelease', ':app:lintVitalRelease',
             f'-PreactNativeArchitectures={TOOLCHAIN["architectures"]}', '--no-daemon', '--max-workers=2',
             '--init-script', ROOT / 'scripts/android-source-input.gradle'], cwd=android)
        apk = android / 'app/build/outputs/apk/release/app-release.apk'
        manifest = {'source_commit': commit, 'configuration': 'Release'}
    # Reuse the existing inspector: embedded Hermes/JS plus both device ABIs.
    run([sys.executable, ROOT / 'scripts/android_smoke.py', '--check-apk', apk])
    args.output.mkdir(parents=True, exist_ok=True)
    target = args.output / 'app-release.apk'
    shutil.copy2(apk, target)
    manifest.update(apk='app-release.apk', apk_sha256=hashlib.sha256(target.read_bytes()).hexdigest(),
                    built_at_utc=datetime.now(timezone.utc).isoformat(), total_seconds=round(time.monotonic() - started, 3),
                    toolchain=TOOLCHAIN, node=node, pnpm=pnpm, java=java,
                    platform=sys.platform, metro_required=False)
    (args.output / 'build.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    print(f'Standalone lab APK: {target}\nSHA-256: {manifest["apk_sha256"]}')
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (RuntimeError, OSError, subprocess.CalledProcessError) as error:
        print(f'Android build failed: {error}', file=sys.stderr)
        raise SystemExit(1)

"""Guarded offline Maestro smoke on the dedicated synthetic emulator only."""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import uuid

if __package__:
    from .android_smoke import check_apk
else:
    from android_smoke import check_apk

ROOT = Path(__file__).resolve().parents[1]
CONFIG = json.loads((ROOT / 'scripts/android-toolchain.json').read_text())
APP = 'de.momorc.moflight.lab'


def run(command, *, binary=False, timeout=60, **kwargs):
    return subprocess.run([str(part) for part in command], check=True, capture_output=True,
                          text=not binary, timeout=timeout, **kwargs).stdout


def require_synthetic(adb, serial):
    if not re.fullmatch(r'emulator-\d+', serial):
        raise RuntimeError('An explicit emulator serial is required; physical devices are refused.')
    if run([adb, '-s', serial, 'shell', 'getprop', 'ro.kernel.qemu']).strip() != '1':
        raise RuntimeError('Physical devices are refused.')
    actual = run([adb, '-s', serial, 'emu', 'avd', 'name']).splitlines()[0].strip()
    if actual != CONFIG['syntheticAvd']:
        raise RuntimeError(f'Refusing other AVD: {actual}. Use {CONFIG["syntheticAvd"]}.')


def maestro_path():
    suffix = 'maestro.bat' if os.name == 'nt' else 'maestro'
    bundled = ROOT / 'build/tools' / f'maestro-{CONFIG["maestroVersion"]}'
    matches = list(bundled.glob(f'**/bin/{suffix}'))
    executable = str(matches[0]) if matches else shutil.which('maestro')
    if not executable:
        raise RuntimeError('Maestro is missing. Run pnpm maestro:install (checksum-pinned, local CLI).')
    version = run([executable, '--version'], timeout=90).strip()
    if not re.search(rf'(?<!\d){re.escape(CONFIG["maestroVersion"])}(?!\d)', version):
        raise RuntimeError(f'Maestro {CONFIG["maestroVersion"]} is required; found {version}.')
    return executable


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--serial', required=True, help='Explicit serial from adb devices; named synthetic AVD only.')
    parser.add_argument('--apk', type=Path, default=ROOT / 'build/android/app-release.apk')
    parser.add_argument('--output', type=Path)
    args = parser.parse_args(argv)
    adb = shutil.which('adb')
    if not adb:
        raise RuntimeError('ADB is missing; configure Android Platform Tools on PATH.')
    # Nothing is installed, cleared or captured on a rejected device.
    require_synthetic(adb, args.serial)
    check_apk(args.apk)
    env = dict(os.environ, MAESTRO_CLI_NO_ANALYTICS='1')
    os.environ['MAESTRO_CLI_NO_ANALYTICS'] = '1'
    maestro = maestro_path()
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    output = args.output or ROOT / 'build/e2e' / f'{stamp}-{uuid.uuid4().hex[:8]}'
    output.mkdir(parents=True, exist_ok=False)
    report = {'status': 'running', 'serial': args.serial, 'avd': CONFIG['syntheticAvd'],
              'maestro': CONFIG['maestroVersion'], 'apk': str(args.apk), 'diagnostic_errors': []}
    network = {}
    def shell(*command):
        return run([adb, '-s', args.serial, 'shell', *command])
    try:
        for name, scope, key in [('airplane', 'global', 'airplane_mode_on'), ('wifi', 'global', 'wifi_on'), ('data', 'global', 'mobile_data')]:
            network[name] = shell('settings', 'get', scope, key).strip() == '1'
        run([adb, '-s', args.serial, 'install', '-r', args.apk], timeout=180)
        shell('am', 'force-stop', APP)
        shell('pm', 'clear', APP)
        shell('logcat', '-c')
        shell('cmd', 'connectivity', 'airplane-mode', 'enable')
        shell('svc', 'wifi', 'disable')
        shell('svc', 'data', 'disable')
        command = [maestro, '--device', args.serial, 'test', '--format', 'JUNIT',
                   '--output', str(output.resolve() / 'junit.xml'),
                   '--debug-output', str(output.resolve()), '--test-output-dir', str(output.resolve()),
                   str(ROOT / '.maestro/smoke.yaml')]
        with (output / 'maestro-console.log').open('w', encoding='utf-8') as log:
            result = subprocess.run(command, cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT, timeout=600)
        if result.returncode:
            raise RuntimeError(f'Maestro exited {result.returncode}; see {output / "maestro-console.log"}.')
        report['status'] = 'passed'
    except Exception as error:
        report.update(status='failed', error=str(error))
    finally:
        # Bounded diagnostics only from the verified synthetic AVD. Diagnostic or
        # cleanup failures must not become a false green result.
        commands = [('logcat.txt', [adb, '-s', args.serial, 'logcat', '-d', '-t', '2000'], False)]
        if report['status'] == 'failed':
            commands.append(('failure.png', [adb, '-s', args.serial, 'exec-out', 'screencap', '-p'], True))
        for name, command, binary in commands:
            try:
                content = run(command, binary=binary)
                if binary:
                    (output / name).write_bytes(content)
                else:
                    (output / name).write_text(content, encoding='utf-8')
            except Exception as error:
                report['diagnostic_errors'].append(f'{name}: {type(error).__name__}')
        for name, command in [('airplane', ['cmd', 'connectivity', 'airplane-mode']), ('wifi', ['svc', 'wifi']), ('data', ['svc', 'data'])]:
            if name in network:
                try:
                    shell(*command, 'enable' if network[name] else 'disable')
                except Exception as error:
                    report['diagnostic_errors'].append(f'restore-{name}: {type(error).__name__}')
        if report['diagnostic_errors']:
            report['status'] = 'failed'
        (output / 'report.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(f'{report["status"].upper()} Maestro smoke. Evidence: {output}')
    if report.get('error'):
        print(report['error'], file=sys.stderr)
    return 0 if report['status'] == 'passed' else 1


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (RuntimeError, OSError, subprocess.SubprocessError) as error:
        print(f'Maestro smoke failed: {error}', file=sys.stderr)
        raise SystemExit(1)

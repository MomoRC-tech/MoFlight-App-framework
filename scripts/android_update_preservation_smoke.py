"""Bounded signed in-place populated update on the named synthetic AVD; never clears data."""
import argparse
import hashlib
import json
import re
import time
from pathlib import Path

from android_smoke import PACKAGE, Smoke, check_apk
from android_core_recovery_smoke import require_synthetic


def run(old_apk, new_apk, serial, output):
    require_synthetic(serial, 'MoFlight_Synthetic_API37')
    if output.exists():
        raise ValueError('Use a fresh evidence directory; previous results are preserved')
    digest = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
    if digest(old_apk) == digest(new_apk):
        raise ValueError('Historical and current proof APKs must be distinct')
    old_info, new_info = check_apk(old_apk), check_apk(new_apk)
    smoke = Smoke(output, serial, 'MoFlight_Synthetic_API37')
    report = {'status': 'running', 'old_apk': old_info, 'new_apk': new_info,
              'boundary': 'Synthetic entry overrides; production storage modules, not ordinary app selection/provider/physical/iOS acceptance'}

    def guard():
        name = smoke.adb('emu', 'avd', 'name').stdout.splitlines()[0].strip()
        require_synthetic(serial, name)
        if smoke.shell('getprop', 'ro.kernel.qemu') != '1':
            raise ValueError('Synthetic emulator required')

    def installed_digest(name):
        remote = smoke.shell('pm', 'path', PACKAGE).splitlines()[0].removeprefix('package:')
        if not remote.startswith('/data/app/') or not remote.endswith('/base.apk'):
            raise ValueError('Existing package must be preserved before replacement')
        target = output / name
        smoke.adb('pull', remote, str(target.resolve()))
        return digest(target)

    def first_install():
        value = re.search(r'firstInstallTime=(.+)', smoke.shell('dumpsys', 'package', PACKAGE))
        if not value:
            raise ValueError('Missing first-install witness')
        return value[1].strip()

    def launch():
        guard(); smoke.shell('am', 'force-stop', PACKAGE)
        smoke.shell('am', 'start', '-W', '-n', PACKAGE + '/.MainActivity')

    def wait_for(prefix):
        deadline = time.monotonic() + 90
        while time.monotonic() < deadline:
            labels = [v for n in smoke.dump() for v in smoke.labels(n)]
            failure = next((v for v in labels if v.startswith('UPDATE_PROOF_FAILED')), None)
            if failure:
                raise AssertionError(failure)
            found = next((v for v in labels if v.startswith(prefix)), None)
            if found:
                return found
            time.sleep(.3)
        raise AssertionError('Missing native update checkpoint: ' + prefix)

    guard()
    original_hash = installed_digest('original.apk')
    original_time = first_install()
    running = bool(smoke.shell('pidof', PACKAGE, check=False))
    radio_commands = {'wifi': ('settings', 'get', 'global', 'wifi_on'),
                      'data': ('settings', 'get', 'global', 'mobile_data')}
    radios = {key: smoke.shell(*command) for key, command in radio_commands.items()}
    if any(value not in ('0', '1') for value in radios.values()):
        raise ValueError('Unsupported radio baseline; device was not changed')
    changed = False
    try:
        smoke.shell('am', 'force-stop', PACKAGE)
        smoke.shell('svc', 'wifi', 'disable'); smoke.shell('svc', 'data', 'disable')
        guard(); changed = True
        smoke.adb('install', '-r', str(old_apk.resolve()))
        assert installed_digest('installed-old.apk') == digest(old_apk)
        launch(); report['seed'] = wait_for('UPDATE_PROOF_SEEDED')
        smoke.shell('am', 'force-stop', PACKAGE)
        guard(); smoke.adb('install', '-r', str(new_apk.resolve()))
        assert first_install() == original_time, 'In-place update changed installation identity'
        assert installed_digest('installed-new.apk') == digest(new_apk)
        launch(); report['verify'] = wait_for('UPDATE_PROOF_PASSED')
        old_pid = smoke.shell('pidof', PACKAGE)
        launch(); report['offline_restart'] = wait_for('UPDATE_PROOF_REOPENED')
        assert old_pid != smoke.shell('pidof', PACKAGE), 'Offline reopen needs a new process'
        report['same_installation'] = True
        report['status'] = 'passed'
        print('PASS populated signed update, late-phase recovery and offline restart', flush=True)
    except BaseException:
        report['status'] = 'failed'
        raise
    finally:
        try:
            if changed:
                guard(); smoke.shell('am', 'force-stop', PACKAGE)
                smoke.adb('install', '-r', str((output / 'original.apk').resolve()))
                assert installed_digest('restored.apk') == original_hash
                assert first_install() == original_time
            for key, value in radios.items():
                if value not in ('0', '1'):
                    raise ValueError('Unsupported radio baseline; manual restoration required')
                smoke.shell('svc', key, 'enable' if value == '1' else 'disable')
            report['radios_restored'] = all(smoke.shell(*command) == radios[key] for key, command in radio_commands.items())
            assert report['radios_restored']
            report['original_apk_restored'] = True
            if running:
                smoke.shell('am', 'start', '-W', '-n', PACKAGE + '/.MainActivity')
        except BaseException:
            report['status'] = 'failed'; report['cleanup_failed'] = True
            raise
        finally:
            (output / 'report.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--old-apk', type=Path, required=True)
    parser.add_argument('--new-apk', type=Path, required=True)
    parser.add_argument('--serial', required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    run(args.old_apk, args.new_apk, args.serial, args.output)

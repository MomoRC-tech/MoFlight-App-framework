"""Preserved synthetic financial file proof and offline process-restart readback.

Requires an installed committed-source Release. Never clears/seeds app data,
opens provider pages, replaces owner selections or tests a physical/provider AVD.
"""
import argparse
import hashlib
import json
import re
import time
from pathlib import Path

from android_smoke import Smoke, PACKAGE
from android_mobile_ui_smoke import launch
from android_development_navigation_smoke import development

AVD = 'MoFlight_Synthetic_API37'


def snapshot(smoke):
    return {key: smoke.shell(*command) for key, command in [
        ('size', ('wm', 'size')), ('density', ('wm', 'density')),
        ('font_scale', ('settings', 'get', 'system', 'font_scale')),
        *[(key, ('settings', 'get', 'global', key)) for key in ('airplane_mode_on', 'wifi_on', 'mobile_data')]]}


def offline(smoke):
    smoke.shell('cmd', 'connectivity', 'airplane-mode', 'enable')
    smoke.shell('svc', 'wifi', 'disable')
    smoke.shell('svc', 'data', 'disable')
    for _ in range(15):
        current = snapshot(smoke)
        if all(current[key] == value for key, value in {'airplane_mode_on': '1', 'wifi_on': '0', 'mobile_data': '0'}.items()):
            return
        time.sleep(.25)
    raise AssertionError('Synthetic offline radio state not established')


def restore_radios(smoke, before):
    smoke.shell('cmd', 'connectivity', 'airplane-mode', 'enable' if before['airplane_mode_on'] == '1' else 'disable')
    smoke.shell('svc', 'wifi', 'enable' if before['wifi_on'] == '1' else 'disable')
    smoke.shell('svc', 'data', 'enable' if before['mobile_data'] == '1' else 'disable')
    for _ in range(15):
        if snapshot(smoke) == before:
            return
        time.sleep(.25)
    raise AssertionError('Original radio/display state was not restored')


def open_proof(smoke):
    development(smoke)
    node = smoke.find('Finanzdatei-Nachweis', scroll=True, attempts=12)
    # A disclosure row includes its summary in Android's accessible name.
    if node.get('clickable') != 'true':
        node = next(n for n in smoke.dump() if n.get('clickable') == 'true' and any('Finanzdatei-Nachweis' in label for label in smoke.labels(n)))
    smoke.tap_node(node)


def proof_records(smoke):
    raw = smoke.adb('logcat', '-d', '-v', 'brief', '-s', 'ReactNativeJS:I').stdout
    (smoke.output / 'native-proof-log.txt').write_text('\n'.join(line for line in raw.splitlines() if 'MOFLIGHT_FINANCIAL_PROOF_' in line), encoding='utf-8')
    result = []
    for line in raw.splitlines():
        match = re.search(r'MOFLIGHT_FINANCIAL_PROOF_(SUMMARY|SAMPLE)\s+(\{.*)', line)
        if match:
            data, _ = json.JSONDecoder().raw_decode(match[2])
            result.append({'record': match[1].lower(), **data})
    return result


def execute(smoke, source, apk_sha256):
    # Guard before force-stop, radio change, UI action or app write.
    assert smoke.shell('getprop', 'ro.kernel.qemu') == '1', 'Emulator required'
    assert smoke.adb('emu', 'avd', 'name').stdout.splitlines()[0].strip() == AVD, 'Named synthetic AVD required'
    assert re.fullmatch(r'[0-9a-f]{40}', source) and re.fullmatch(r'[0-9a-f]{64}', apk_sha256)
    installed = smoke.shell('pm', 'path', PACKAGE).splitlines()[0].removeprefix('package:')
    smoke.adb('pull', installed, str(smoke.output / 'installed.apk'))
    assert hashlib.sha256((smoke.output / 'installed.apk').read_bytes()).hexdigest() == apk_sha256, 'Installed APK differs from committed artifact'
    smoke.report.update({'source_commit': source, 'apk_sha256': apk_sha256,
                         'boundary': 'Synthetic namespaced native financial files only; injected owner registry/non-financial restore ports. No provider/WebView/SAF/full-user/update/phone/iOS acceptance.'})
    before = snapshot(smoke)
    smoke.report['before'] = before
    smoke.report['device'] = {key: smoke.shell('getprop', key) for key in ['ro.build.version.sdk', 'ro.product.model', 'ro.product.cpu.abi']}
    try:
        offline(smoke)
        launch(smoke)
        open_proof(smoke)
        smoke.tap('Finanzdatei-Nachweis starten', scroll=True)
        smoke.find('Finanzdatei-Nachweis bestanden (8).', scroll=True, attempts=35)
        first = proof_records(smoke)
        summary = next(row for row in reversed(first) if row['record'] == 'summary' and row['kind'] == 'run')
        assert summary['state'] == 'passed' and summary['checks'] == 8
        run_id = summary['id']
        smoke.report['checks'].append({'name': 'native-files-v4-interrupted-retry-and-preserved-originals', 'status': 'passed'})
        (smoke.output / 'proof-screen.png').write_bytes(smoke.adb('exec-out', 'screencap', '-p', binary=True).stdout)
        prior_pid = smoke.shell('pidof', PACKAGE)
        smoke.shell('am', 'force-stop', PACKAGE)
        assert not smoke.shell('pidof', PACKAGE, check=False)
        launch(smoke)
        assert smoke.shell('pidof', PACKAGE) != prior_pid, 'Fresh app process required'
        open_proof(smoke)
        smoke.tap('Finanznachweis offline wieder öffnen', scroll=True)
        smoke.find('Finanzdatei-Nachweis bestanden (1).', scroll=True, attempts=35)
        records = proof_records(smoke)
        reopened = next(row for row in reversed(records) if row['record'] == 'summary' and row['kind'] == 'reopen')
        assert reopened['state'] == 'passed' and reopened['id'] == run_id
        smoke.report['checks'].append({'name': 'offline-new-process-reopens-identical-candidate-archive-journal', 'status': 'passed'})
        smoke.report['records'] = [row for row in records if row['id'] == run_id]
        samples = [row for row in smoke.report['records'] if row['record'] == 'sample']
        assert len(samples) == 11 and all(row['outcome'] == 'passed' and row['elapsedMs'] >= 0 for row in samples)
        smoke.report['outcome'] = 'passed'
    finally:
        # Preserve available failed/interrupted measurements as well as passes.
        smoke.report['all_available_records'] = proof_records(smoke)
        restore_radios(smoke, before)
        smoke.report['after'] = snapshot(smoke)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--serial', required=True)
    parser.add_argument('--source-commit', required=True)
    parser.add_argument('--apk-sha256', required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    assert not args.output.exists(), 'Use a fresh evidence directory'
    smoke = Smoke(args.output, args.serial, AVD)
    try:
        execute(smoke, args.source_commit, args.apk_sha256)
    except Exception as error:
        smoke.report.update({'outcome': 'failed', 'error': str(error)})
        raise
    finally:
        (args.output / 'report.json').write_text(json.dumps(smoke.report, indent=2), encoding='utf-8')


if __name__ == '__main__':
    main()

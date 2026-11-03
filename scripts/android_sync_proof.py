"""Bounded synthetic-AVD Sync benchmark/render/cache proof; preserves app data and restores settings."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import time
import xml.etree.ElementTree as ET
import zipfile

PACKAGE = 'de.momorc.moflight.lab'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--serial', required=True)
    parser.add_argument('--proof', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--mode', choices=['benchmark', 'progress', 'detail', 'review', 'start-cache'], required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)

    def adb(*command, binary=False):
        result = subprocess.run(['adb', '-s', args.serial, *command], check=True,
                                capture_output=True, timeout=90)
        return result.stdout if binary else result.stdout.decode('utf-8', errors='replace').strip()

    assert adb('emu', 'avd', 'name').splitlines()[0] == 'MoFlight_Synthetic_API37', 'Only designated synthetic AVD'
    provenance = json.loads((args.proof / 'provenance.json').read_text(encoding='utf-8-sig'))
    apk = args.proof / {'benchmark': 'sync-benchmark-poc.apk', 'progress': 'sync-progress-poc.apk', 'detail': 'flight-responsiveness-poc.apk', 'review': 'flight-review-poc.apk', 'start-cache': 'start-cache-poc.apk'}[args.mode]
    assert hashlib.sha256(apk.read_bytes()).hexdigest() == provenance['proof_apk_sha256']
    normal = args.proof / 'normal-app.apk'
    assert hashlib.sha256(normal.read_bytes()).hexdigest() == provenance['normal_apk_sha256']
    if args.mode in ('review', 'start-cache'):
        with zipfile.ZipFile(apk) as archive:
            assert provenance['source_commit'].encode() in archive.read('assets/index.android.bundle')
    original = {key: adb('shell', 'settings', 'get', 'global', key)
                for key in ['airplane_mode_on', 'wifi_on', 'mobile_data']}
    original.update(size=adb('shell', 'wm', 'size'), density=adb('shell', 'wm', 'density'),
                    font=adb('shell', 'settings', 'get', 'system', 'font_scale'))
    report = {'status': 'running', 'provenance': provenance, 'mode': args.mode,
              'scope': 'Synthetic Android native runtime only; no live provider or physical phone', 'original': original}
    restore_hash = provenance['normal_apk_sha256']
    if args.mode == 'start-cache':
        # Preserve the APK already installed, even when it predates this proof.
        installed = 'package:' + PACKAGE in adb('shell', 'pm', 'list', 'packages', PACKAGE).splitlines()
        report['originalAppInstalled'] = installed
        if installed:
            installed_path = adb('shell', 'pm', 'path', PACKAGE).removeprefix('package:')
            normal = args.output / 'original-app.apk'
            adb('pull', installed_path, str(normal))
            restore_hash = hashlib.sha256(normal.read_bytes()).hexdigest()
            report['originalApkSha256'] = restore_hash
        else:
            assert 'package:' + PACKAGE not in adb('shell', 'pm', 'list', 'packages', '-u', PACKAGE).splitlines(), 'Preserve retained uninstalled application data'
    log = None
    log_file = None

    def hierarchy(name):
        adb('shell', 'uiautomator', 'dump', '/sdcard/moflight-sync-proof.xml')
        xml = adb('shell', 'cat', '/sdcard/moflight-sync-proof.xml')
        (args.output / (name + '.xml')).write_text(xml, encoding='utf-8')
        return list(ET.fromstring(xml).iter('node'))

    def wait_marker(marker, seconds=90):
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            nodes = hierarchy('last-screen')
            labels = [n.get(k, '') for n in nodes for k in ['text', 'content-desc']]
            assert not any('CACHE_FAILED' in value for value in labels), labels
            if any(marker in value and 'CACHE_CHECKING' not in value for value in labels):
                return nodes
            time.sleep(1)
        raise AssertionError('Native marker missing: ' + marker)

    def launch():
        adb('shell', 'am', 'force-stop', PACKAGE)
        adb('shell', 'am', 'start', '-W', '-n', PACKAGE + '/.MainActivity')

    tooling_started = time.monotonic()
    try:
        adb('shell', 'cmd', 'connectivity', 'airplane-mode', 'enable')
        adb('shell', 'svc', 'wifi', 'disable')
        adb('shell', 'svc', 'data', 'disable')
        adb('install', '-r', str(apk))
        if args.mode == 'review':
            installed = args.output / 'installed-proof.apk'
            installed_path = adb('shell', 'pm', 'path', PACKAGE).removeprefix('package:')
            adb('pull', installed_path, str(installed))
            assert hashlib.sha256(installed.read_bytes()).hexdigest() == provenance['proof_apk_sha256']
            report['installedProofHashVerified'] = True
            report['device'] = {'api': adb('shell', 'getprop', 'ro.build.version.sdk'), 'abi': adb('shell', 'getprop', 'ro.product.cpu.abi')}
            log_file = (args.output / 'native.log').open('wb')
            log = subprocess.Popen(['adb', '-s', args.serial, 'logcat', '-v', 'brief', '-T', '1', 'ReactNativeJS:I', '*:S'], stdout=log_file, stderr=subprocess.STDOUT)
            report['reviewRuns'] = []
            pids = []
            for expected in ['seeded', 'passed']:
                launch()
                pid = adb('shell', 'pidof', PACKAGE)
                assert pid and pid not in pids, 'Proof must restart in a distinct process'
                pids.append(pid)
                deadline = time.monotonic() + 60
                while time.monotonic() < deadline:
                    lines = [line for line in (args.output / 'native.log').read_text(encoding='utf-8', errors='replace').splitlines()
                             if re.search(r'\(\s*' + re.escape(pid) + r'\)', line)]
                    assert not any('MOFLIGHT_FLIGHT_REVIEW_FAILED' in line for line in lines), 'Native review proof failed'
                    completed = [line for line in lines if 'MOFLIGHT_FLIGHT_REVIEW_RESULT ' in line]
                    if completed:
                        result = json.loads(completed[-1].split('MOFLIGHT_FLIGHT_REVIEW_RESULT ', 1)[1])
                        assert result['phase'] == expected and result['sourceCommit'] == provenance['source_commit']
                        assert len(result['checks']) == 2 and 0 <= result['milliseconds'] < 60_000
                        report['reviewRuns'].append(result)
                        break
                    time.sleep(1)
                else:
                    raise AssertionError('Native review proof timeout: ' + expected)
            report['distinctProcesses'] = len(pids)
            report['scope'] = 'Production native review metadata helpers; two synthetic scoped targets and real process restart. No ordinary account/owner-registry UI, provider, paper or iOS acceptance.'
        elif args.mode == 'detail':
            log_file = (args.output / 'native.log').open('wb')
            log = subprocess.Popen(['adb', '-s', args.serial, 'logcat', '-v', 'brief', '-T', '1',
                                    'ReactNativeJS:I', '*:S'], stdout=log_file, stderr=subprocess.STDOUT)
            report['detailRuns'] = []
            for phase in ['initial', 'offline-reopen']:
                launch()
                pid = adb('shell', 'pidof', PACKAGE)
                deadline = time.monotonic() + 600
                while time.monotonic() < deadline:
                    text = (args.output / 'native.log').read_text(encoding='utf-8', errors='replace')
                    lines = [line for line in text.splitlines() if re.search(r'\(\s*' + re.escape(pid) + r'\)', line)]
                    failures = [line for line in lines if 'MOFLIGHT_PROBE_FAILED' in line]
                    assert not failures, failures[-1:]
                    completed = [line for line in lines if 'MOFLIGHT_PROBE_RESULT ' in line]
                    if completed:
                        result = json.loads(completed[-1].split('MOFLIGHT_PROBE_RESULT ', 1)[1])
                        samples = [json.loads(line.split('MOFLIGHT_PROBE_SAMPLE ', 1)[1]) for line in lines if 'MOFLIGHT_PROBE_SAMPLE ' in line]
                        assert result['sampleCount'] == len(samples) == 5
                        assert all(sample['fullDetailEqual'] and sample['retained']['guardChecks'] == 2 for sample in samples)
                        assert result['changedSelectionRejected'] and result['refreshedListChanged']
                        assert result['changedOwnerSelectionRejected'] and result['distinctReadLeases'] >= 10
                        assert result['mode'] == 'seed' or result['persistedReadback'] is True
                        if report['detailRuns']:
                            assert result['mode'] == 'reopen'
                            assert result['initialGeneration'] == report['detailRuns'][-1]['result']['finalGeneration']
                        report['detailRuns'].append({'phase': phase, 'result': result, 'samples': samples})
                        break
                    time.sleep(2)
                else:
                    raise AssertionError('Detail proof timeout: ' + phase)
                wait_marker('PROBE_PASSED')
                (args.output / (phase + '.png')).write_bytes(adb('exec-out', 'screencap', '-p', binary=True))
                (args.output / (phase + '-memory.txt')).write_text(adb('shell', 'dumpsys', 'meminfo', PACKAGE), encoding='utf-8')
            report['renderSamples'] = [json.loads(line.split('MOFLIGHT_PROBE_RENDER ', 1)[1])
                                       for line in (args.output / 'native.log').read_text(encoding='utf-8', errors='replace').splitlines()
                                       if 'MOFLIGHT_PROBE_RENDER ' in line]
            report['memoryBoundary'] = 'Single process snapshots after proof completion, not isolated detail heap cost or leak evidence'
        elif args.mode == 'start-cache':
            report['device'] = {'api': adb('shell', 'getprop', 'ro.build.version.sdk'),
                                'abi': adb('shell', 'getprop', 'ro.product.cpu.abi'),
                                'model': adb('shell', 'getprop', 'ro.product.model')}
            log_file = (args.output / 'native.log').open('wb')
            log = subprocess.Popen(['adb', '-s', args.serial, 'logcat', '-v', 'brief', '-T', '1', 'ReactNativeJS:I', '*:S'], stdout=log_file, stderr=subprocess.STDOUT)
            launch()
            pid = adb('shell', 'pidof', PACKAGE)
            assert pid, 'Native cache proof process missing'
            deadline = time.monotonic() + 60
            while time.monotonic() < deadline:
                lines = [line for line in (args.output / 'native.log').read_text(encoding='utf-8', errors='replace').splitlines()
                         if re.search(r'\(\s*' + re.escape(pid) + r'\)', line)]
                assert not any('MOFLIGHT_START_CACHE_FAILED' in line for line in lines), 'Native cache proof failed'
                completed = [line for line in lines if 'MOFLIGHT_START_CACHE_RESULT ' in line]
                if completed:
                    result = json.loads(completed[-1].split('MOFLIGHT_START_CACHE_RESULT ', 1)[1])
                    report['cacheProof'] = result
                    assert result['status'] == 'passed', 'Native cache scenario failed'
                    assert result['sourceCommit'] == provenance['source_commit']
                    assert result['cleaned'] and len(result['checks']) == 10 and len(result['samples']) == 5
                    assert all(sample['milliseconds'] >= 0 for sample in result['samples'])
                    break
                time.sleep(0.5)
            else:
                raise AssertionError('Native cache proof timeout')
        elif args.mode == 'benchmark':
            log_file = (args.output / 'native.log').open('wb')
            log = subprocess.Popen(['adb', '-s', args.serial, 'logcat', '-v', 'brief', '-T', '1',
                                    'ReactNativeJS:I', '*:S'], stdout=log_file, stderr=subprocess.STDOUT)
            launch()
            pid = adb('shell', 'pidof', PACKAGE)
            deadline = time.monotonic() + 900
            samples = []
            while time.monotonic() < deadline:
                text = (args.output / 'native.log').read_text(encoding='utf-8', errors='replace')
                lines = [line for line in text.splitlines() if re.search(r'\(\s*' + re.escape(pid) + r'\)', line)]
                assert not any('MOFLIGHT_SYNC_BENCHMARK_FAILED' in line for line in lines), lines[-5:]
                samples = [json.loads(line.split('MOFLIGHT_SYNC_SAMPLE ', 1)[1]) for line in lines if 'MOFLIGHT_SYNC_SAMPLE ' in line]
                completed = [line for line in lines if 'MOFLIGHT_SYNC_BENCHMARK ' in line]
                if completed:
                    result = json.loads(completed[-1].split('MOFLIGHT_SYNC_BENCHMARK ', 1)[1])
                    assert result['samples'] == len(samples) == 20
                    report.update(benchmark=result, samples=samples)
                    break
                time.sleep(3)
            else:
                raise AssertionError(f'Benchmark timeout after {len(samples)} samples')
        else:
            adb('shell', 'wm', 'size', '390x844')
            adb('shell', 'wm', 'density', '160')
            adb('shell', 'settings', 'put', 'system', 'font_scale', '1.0')
            launch()
            wait_marker('CACHE_')
            launch()
            nodes = wait_marker('CACHE_REOPEN_PASSED')
            labels = [n.get('text', '') for n in nodes]
            for percent in [0, 25, 50, 75, 99]:
                assert f'{percent}% · paused estimate' in labels
            assert any('Dauert länger als erwartet' in value for n in nodes for value in [n.get('text', ''), n.get('content-desc', '')])
            (args.output / 'progress.png').write_bytes(adb('exec-out', 'screencap', '-p', binary=True))
            button = next(n for n in nodes if n.get('content-desc') == 'Synchronisierung abbrechen' and n.get('enabled') == 'true')
            left, top, right, bottom = map(int, re.findall(r'\d+', button.get('bounds')))
            adb('shell', 'input', 'tap', str((left + right) // 2), str((top + bottom) // 2))
            wait_marker('Synchronisierung fehlgeschlagen')
            report.update(cacheRestart=True, incompatibleContextAndForeignScope=True,
                          cancel=True, overrun=True, viewport={'width': 390, 'height': 844, 'density': 160, 'font': 1.0},
                          visualReview='Screenshot captured; requires independent inspection')
        report['status'] = 'passed'
    except BaseException as error:
        report.update(status='failed', error=str(error))
        raise
    finally:
        if log:
            log.terminate()
            log.wait(timeout=10)
        if log_file:
            log_file.close()
        adb('shell', 'am', 'force-stop', PACKAGE)
        if args.mode == 'start-cache' and not report['originalAppInstalled']:
            adb('uninstall', PACKAGE)  # Only this task's fresh synthetic installation.
        else:
            adb('install', '-r', str(normal))
        for key in ['size', 'density']:
            match = re.search(r'Override \w+:\s*(\S+)', original[key])
            adb('shell', 'wm', key, match.group(1) if match else 'reset')
        if original['font'] == 'null':
            adb('shell', 'settings', 'delete', 'system', 'font_scale')
        else:
            adb('shell', 'settings', 'put', 'system', 'font_scale', original['font'])
        adb('shell', 'cmd', 'connectivity', 'airplane-mode', 'enable' if original['airplane_mode_on'] == '1' else 'disable')
        adb('shell', 'svc', 'wifi', 'enable' if original['wifi_on'] == '1' else 'disable')
        adb('shell', 'svc', 'data', 'enable' if original['mobile_data'] == '1' else 'disable')
        report['restored'] = {key: adb('shell', 'settings', 'get', 'global', key)
                              for key in ['airplane_mode_on', 'wifi_on', 'mobile_data']}
        report['normalApkRestored'] = not (args.mode == 'start-cache' and not report['originalAppInstalled'])
        if args.mode in ('review', 'start-cache'):
            report['restored'].update(size=adb('shell', 'wm', 'size'), density=adb('shell', 'wm', 'density'),
                                      font=adb('shell', 'settings', 'get', 'system', 'font_scale'))
            if args.mode == 'start-cache' and not report['originalAppInstalled']:
                report['normalApkHashVerified'] = None
                report['originalAppStateRestored'] = 'package:' + PACKAGE not in adb('shell', 'pm', 'list', 'packages', '-u', PACKAGE).splitlines()
            else:
                restored_path = adb('shell', 'pm', 'path', PACKAGE).removeprefix('package:')
                restored_apk = args.output / 'restored-normal.apk'
                adb('pull', restored_path, str(restored_apk))
                report['normalApkHashVerified'] = hashlib.sha256(restored_apk.read_bytes()).hexdigest() == restore_hash
                report['originalAppStateRestored'] = report['normalApkHashVerified']
            report['cleanupMatchesOriginal'] = report['restored'] == original
            report['toolingMilliseconds'] = round((time.monotonic() - tooling_started) * 1000, 3)
            if not report['originalAppStateRestored'] or not report['cleanupMatchesOriginal']:
                report.update(status='failed', cleanup_error='Proof cleanup verification failed')
        (args.output / 'report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
        print(json.dumps({'status': report['status'], 'output': str(args.output)}))
        if args.mode in ('review', 'start-cache') and report.get('cleanup_error'):
            raise AssertionError(report['cleanup_error'])


if __name__ == '__main__':
    main()

"""Bounded synthetic-AVD Sync benchmark/render/cache proof; preserves app data and restores settings."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import time
import xml.etree.ElementTree as ET

PACKAGE = 'de.momorc.moflight.lab'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--serial', required=True)
    parser.add_argument('--proof', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--mode', choices=['benchmark', 'progress', 'detail'], required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)

    def adb(*command, binary=False):
        result = subprocess.run(['adb', '-s', args.serial, *command], check=True,
                                capture_output=True, timeout=90)
        return result.stdout if binary else result.stdout.decode('utf-8', errors='replace').strip()

    assert adb('emu', 'avd', 'name').splitlines()[0] == 'MoFlight_Synthetic_API37', 'Only designated synthetic AVD'
    provenance = json.loads((args.proof / 'provenance.json').read_text(encoding='utf-8-sig'))
    apk = args.proof / {'benchmark': 'sync-benchmark-poc.apk', 'progress': 'sync-progress-poc.apk', 'detail': 'flight-responsiveness-poc.apk'}[args.mode]
    assert hashlib.sha256(apk.read_bytes()).hexdigest() == provenance['proof_apk_sha256']
    normal = args.proof / 'normal-app.apk'
    assert hashlib.sha256(normal.read_bytes()).hexdigest() == provenance['normal_apk_sha256']
    original = {key: adb('shell', 'settings', 'get', 'global', key)
                for key in ['airplane_mode_on', 'wifi_on', 'mobile_data']}
    original.update(size=adb('shell', 'wm', 'size'), density=adb('shell', 'wm', 'density'),
                    font=adb('shell', 'settings', 'get', 'system', 'font_scale'))
    report = {'status': 'running', 'provenance': provenance, 'mode': args.mode,
              'scope': 'Synthetic Android native runtime only; no live provider or physical phone', 'original': original}
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

    try:
        adb('shell', 'cmd', 'connectivity', 'airplane-mode', 'enable')
        adb('shell', 'svc', 'wifi', 'disable')
        adb('shell', 'svc', 'data', 'disable')
        adb('install', '-r', str(apk))
        if args.mode == 'detail':
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
        report['normalApkRestored'] = True
        (args.output / 'report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
        print(json.dumps({'status': report['status'], 'output': str(args.output)}))


if __name__ == '__main__':
    main()

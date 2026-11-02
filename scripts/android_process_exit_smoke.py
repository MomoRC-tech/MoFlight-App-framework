"""Bounded process-death proof on the exact synthetic AVD, using ordinary support UI.

No data reset, journal clearing, provider access, report sending or display/network
changes. The caller snapshots the AVD before update-only installation. Raw system
exit descriptions/traces are never read; assertions use the app's sanitized report.
"""
import argparse
import json
import os
from pathlib import Path
import re
import time

from android_smoke import Smoke, PACKAGE

AVD = 'MoFlight_Synthetic_API37'
ACTION = PACKAGE + '.SUPPORT_DIAGNOSTIC_TEST'


def save(smoke):
    (smoke.output / 'report.json').write_text(json.dumps(smoke.report, indent=2) + '\n', encoding='utf-8')


def support_report(smoke, *, open_app=True):
    if open_app:
        smoke.shell('am', 'start', '-W', '-n', PACKAGE + '/.MainActivity')
    smoke.tap_node(smoke.find('Profil & Einstellungen öffnen', attempts=40))
    for attempt in range(3):
        tap_content(smoke, 'Diagnose', resource='diagnostics-entry')
        try:
            # This sheet preserves scroll position. Its share action may be
            # offscreen; confirm the fixed page header without resetting scroll.
            nodes = smoke.dump()
            titles = [n.get('text') for n in nodes if n.get('text') in {'Diagnose', 'Profil & Einstellungen'}]
            assert 'Diagnose' in titles and 'Profil & Einstellungen' not in titles
            break
        except AssertionError:
            if attempt == 2:
                raise
    tap_content(smoke, 'Kurzbericht zum Kopieren')
    node = smoke.find('MoFlight support diagnostics', scroll=True)
    report = json.loads(next(label for label in smoke.labels(node) if 'MoFlight support diagnostics' in label))
    assert report['context']['buildSource'] == os.environ['APK_SOURCE_COMMIT']
    assert not report['diagnosticStorage']['failed'], 'Diagnostic storage failed'
    text = json.dumps(report)
    assert 'processExitMarker' not in text and 'moflight-exit-v1:' not in text
    assert 'processExitReason' not in report['context'], 'A prior exit must not describe the current session'
    (smoke.output / f'support-session-{current_session(report)}.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    return report


def tap_content(smoke, text, resource=None):
    # Accessibility may expose an entire row while only its top edge is visible.
    # Keep its center clear of the fixed header/navigation before tapping.
    height = int(re.findall(r'\d+x(\d+)', smoke.shell('wm', 'size'))[-1])
    for _ in range(5):
        node = smoke.find(text, resource=resource, scroll=True)
        _, top, _, bottom = map(int, re.findall(r'\d+', node.get('bounds', '')))
        if top >= height * .15 and bottom <= height * .94:
            smoke.tap_node(node)
            return
        smoke.swipe(up=bottom > height * .94)
    raise AssertionError('No unobscured target: ' + text)


def current_session(report):
    return max([s['session'] for s in report['sessions']] + [e['session'] for e in report['events']])


def broadcast(smoke, trigger):
    return smoke.shell('am', 'broadcast', '-f', '0x10000000', '-p', PACKAGE, '-a', ACTION, '--es', 'trigger', trigger)


def execute(smoke):
    assert smoke.shell('getprop', 'ro.kernel.qemu') == '1'
    assert smoke.adb('emu', 'avd', 'name').stdout.splitlines()[0].strip() == AVD
    assert smoke.shell('getprop', 'ro.boot.qemu.avd_name') == AVD
    smoke.emulator = True
    smoke.report['boundary'] = 'Synthetic API37 process-death and ordinary sanitized support-report proof only; no provider/physical/iOS or low-memory-kill acceptance.'
    smoke.report['device'] = {'avd': AVD, 'api': smoke.shell('getprop', 'ro.build.version.sdk'), 'abi': smoke.shell('getprop', 'ro.product.cpu.abi')}
    original = {key: smoke.shell(*command) for key, command in {
        'size': ('wm', 'size'), 'density': ('wm', 'density'),
        'font': ('settings', 'get', 'system', 'font_scale'),
        'airplane': ('settings', 'get', 'global', 'airplane_mode_on'),
        'wifi': ('settings', 'get', 'global', 'wifi_on'),
    }.items()}
    smoke.report['samples'] = []
    try:
        smoke.shell('am', 'force-stop', PACKAGE)
        before = support_report(smoke)
        # A fixed absent marker and a malformed marker exercise the real native
        # history reader; the synthetic-only log contains fixed categories only.
        prior_probes = smoke.shell('logcat', '-d', '-s', 'MoFlightExitProof:I', '*:S').count('unavailable=unknown invalid=unknown')
        broadcast(smoke, 'unavailable-history')
        probe = smoke.shell('logcat', '-d', '-s', 'MoFlightExitProof:I', '*:S')
        assert probe.count('unavailable=unknown invalid=unknown') > prior_probes
        smoke.report['checks'].append({'name': 'native-unavailable-and-invalid-history', 'status': 'passed'})
        save(smoke)
        for trigger, expected in [('self-exit', 'other'), ('java-crash', 'crash'), ('native-crash', 'native-crash'), ('anr', 'anr')]:
            prior = current_session(before)
            old_entries = {(e['session'], e['sequence']): (e['outcome'], e['code']) for e in before['entries']}
            smoke.shell('input', 'keyevent', 'KEYCODE_HOME')
            started = time.monotonic()
            smoke.active_exit_probe = (trigger, started)
            broadcast(smoke, trigger)
            deadline = time.monotonic() + 45
            while smoke.shell('pidof', PACKAGE, check=False):
                if time.monotonic() >= deadline:
                    raise AssertionError('Synthetic trigger did not terminate the app: ' + trigger)
                time.sleep(.5)
            time.sleep(2)  # Allow Android's exit-history record to become available.
            after = support_report(smoke)
            elapsed = (time.monotonic() - started) * 1000
            observation = next(s['context'].get('processExitReason') for s in after['sessions'] if s['session'] == prior)
            assert observation == expected, f'{trigger}: expected {expected}, observed {observation}'
            assert current_session(after) > prior
            compared = 0
            for entry in after['entries']:
                old = old_entries.get((entry['session'], entry['sequence']))
                if old:
                    assert (entry['outcome'], entry['code']) == (('interrupted', 'interrupted') if old[0] == 'running' else old), 'Exit category changed an operation outcome'
                    compared += 1
            smoke.report['checks'].append({'name': trigger, 'status': 'passed', 'category': observation, 'prior_session_only': True, 'compared_retained_operation_outcomes': compared})
            smoke.report['samples'].append({'trigger': trigger, 'milliseconds': round(elapsed, 3), 'outcome': 'success', 'metric': 'process-exit-proof-tooling'})
            smoke.active_exit_probe = None
            save(smoke)
            before = after
    finally:
        restored = {key: smoke.shell(*command) for key, command in {
            'size': ('wm', 'size'), 'density': ('wm', 'density'),
            'font': ('settings', 'get', 'system', 'font_scale'),
            'airplane': ('settings', 'get', 'global', 'airplane_mode_on'),
            'wifi': ('settings', 'get', 'global', 'wifi_on'),
        }.items()}
        smoke.report['cleanup'] = {'settings_unchanged': original == restored, 'data_reset': False, 'journal_cleared': False, 'provider_sessions': 'untouched'}
        assert original == restored


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--serial', required=True)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    if args.output.exists():
        raise ValueError('Use a new output directory to preserve earlier evidence')
    smoke = Smoke(args.output, args.serial, AVD)
    started = time.monotonic()
    try:
        execute(smoke)
        smoke.report['status'] = 'passed'
    except Exception as error:
        smoke.report['status'] = 'failed'
        smoke.report['error'] = str(error)
        raise
    finally:
        active = getattr(smoke, 'active_exit_probe', None)
        if active:
            trigger, probe_started = active
            smoke.report['samples'].append({'trigger': trigger, 'milliseconds': round((time.monotonic() - probe_started) * 1000, 3), 'outcome': 'failed', 'metric': 'process-exit-proof-tooling'})
        smoke.report['tooling_milliseconds'] = round((time.monotonic() - started) * 1000, 3)
        save(smoke)


if __name__ == '__main__':
    main()

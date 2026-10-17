"""Focused recovery-only checkpoint. Provider metadata stays in an ignored directory.

Update-only install; no clear/reset, export, saved-login use, backup replacement or
legacy deletion. Stops at any private view difference; never chooses replay there.
"""
import argparse
import json
import re
import time
from pathlib import Path
from android_smoke import Smoke, check_apk, effective_enabled
from android_mobile_ui_smoke import launch
from android_connection_smoke import panel, panel_control, panel_tap
from android_mobile_shell_smoke import viewport


def labels(smoke):
    return [label for node in smoke.dump() for label in smoke.labels(node) if label]


def private_choice_visible(visible):
    # A long settings comparison can push its heading outside the viewport.
    # Both value labels exist only in the explicit legacy-choice state.
    return ('Aktuelle Ansicht weicht ab' in visible or
            (any(x.startswith('Aktuell:') for x in visible) and any(x.startswith('Ziel:') for x in visible)) or
            any(x.startswith('Sortierung aktuell:') and 'Ziel:' in x for x in visible))


def recovery_control(smoke, text, *, exact=True, enabled=None):
    """Return from a long private comparison without a fixed eight-swipe limit."""
    try:
        return smoke.find(text, exact=exact, enabled=enabled, attempts=1)
    except AssertionError:
        return smoke.find(text, exact=exact, enabled=enabled, scroll=True, up=False, attempts=64)


def review(smoke, expected):
    panel_tap(smoke, 'Alte Wiederherstellung prüfen')
    node = panel_control(smoke, 'Journal-Prüfsumme:', exact=False)
    match = re.search(r'[a-f0-9]{64}', node.get('text', '') or node.get('content-desc', ''))
    assert match and match[0] == expected, 'Reviewed fingerprint changed; recovery refused'


def execute(args):
    output = args.output.resolve()
    # All hierarchy/private settings must remain outside tracked evidence.
    private_root = (Path(__file__).resolve().parents[1] / 'local-data').resolve()
    assert output.is_relative_to(private_root), 'Ignored local-data output required'
    avd = 'MoFlight_Synthetic_API37' if args.synthetic else 'MoFlight_API37'
    smoke = Smoke(output, args.serial, avd)
    report = {'status': 'running', 'checks': [], 'source_commit': args.source,
              'boundary': 'Recovery-only checkpoint; no historical raw adoption, clearing, deletion or canonical import.'}
    def passed(name):
        report['checks'].append({'name': name, 'status': 'passed'})
    try:
        assert smoke.shell('getprop', 'ro.kernel.qemu') == '1'
        assert smoke.adb('emu', 'avd', 'name').stdout.splitlines()[0].strip() == avd
        report['avd'] = avd
        before = viewport(smoke)
        passed('named-avd-reverified')
        expected = None
        if not args.synthetic:
            assert args.review_file, 'Private reviewed fingerprint file required'
            expected = json.loads(args.review_file.read_text(encoding='utf-8-sig'))['journal_fingerprint']
            assert re.fullmatch('[a-f0-9]{64}', expected)
            launch(smoke); panel(smoke); review(smoke, expected)
            passed('pre-install-journal-matches-private-reviewed-fingerprint')
        report['apk'] = check_apk(args.apk)
        manifest = json.loads(args.manifest.read_text(encoding='utf-8-sig'))
        assert manifest['source_commit'] == args.source and manifest['apk_sha256'] == report['apk']['apk_sha256'], 'Committed-source build manifest mismatch'
        smoke.adb('install', '-r', str(args.apk))
        passed('update-only-install')
        launch(smoke); panel(smoke)
        panel_control(smoke, 'Mit Vereinsflieger verbinden', enabled=True)
        if args.synthetic:
            passed('native-state-reader-ready-without-legacy-adoption')
            launch(smoke); panel(smoke)
            panel_control(smoke, 'Mit Vereinsflieger verbinden', enabled=True)
            passed('native-restart-state-reader-ready')
            report['status'] = 'passed'
        else:
            review(smoke, expected)
            passed('post-install-journal-unchanged')
            # Fresh original-page authentication check; never reads saved credentials.
            panel_tap(smoke, 'Mit Vereinsflieger verbinden')
            smoke.tap_node(smoke.find('Anmeldung prüfen', exact=True, enabled=True, attempts=35))
            panel_control(smoke, 'Letzte Sitzungsprüfung:', exact=False)
            panel_control(smoke, 'Rohdaten abrufen', enabled=False)
            review(smoke, expected)
            panel_tap(smoke, 'Geprüfte Wiederherstellung vorbereiten')
            # Either no mutation is needed and full readback completes, or a
            # private difference requires a separate human choice. Never click it.
            outcome = None
            for _ in range(18):
                visible = labels(smoke)
                if private_choice_visible(visible):
                    outcome = 'private-choice-required'; break
                if any('Rohbelege gespeichert.' in x for x in visible):
                    raise AssertionError('Unexpected capture result')
                enabled = effective_enabled(smoke.screen)
                if any(n.get('text') == 'Rohdaten abrufen' and enabled.get(n, False) for n in smoke.screen.iter('node')):
                    outcome = 'restored-and-verified'; break
                smoke.swipe(up=True, duration=180); time.sleep(.5)
            assert outcome, 'Recovery did not reach a verified result or private choice'
            report['outcome'] = outcome
            if outcome == 'private-choice-required':
                details = []
                for prefix in ['Aktuell:', 'Ziel:', 'Spalten aktuell:', 'Filter aktuell:', 'Sortierung aktuell:']:
                    node = panel_control(smoke, prefix, exact=False)
                    details.append(node.get('text', '') or node.get('content-desc', ''))
                (output / 'choice-private.md').write_text(
                    '# Private recovery choice\n\nThe current view differs from the reviewed target. '
                    'Its supported settings were saved locally before replay. No replay was chosen.\n\n' +
                    '\n\n'.join(details) + '\n\nChoose whether to restore the reviewed target while retaining the current-view safety evidence.\n', encoding='utf-8')
                recovery_control(smoke, 'Rohdaten abrufen', enabled=False)
                recovery_control(smoke, 'Lokale Anbietersitzung löschen', enabled=False)
                passed('private-difference-pauses-before-replay-with-quarantine')
            else:
                passed('full-supported-readback-and-resolution')
            # Re-read the original legacy row, even after any receipt resolution.
            if outcome == 'private-choice-required':
                review(smoke, expected)
                passed('legacy-source-fingerprint-preserved-after-trial')
            launch(smoke); panel(smoke)
            if outcome == 'private-choice-required':
                panel_control(smoke, 'Rohdaten abrufen', enabled=False)
                panel_control(smoke, 'Lokale Anbietersitzung löschen', enabled=False)
                review(smoke, expected)
                passed('restart-retains-quarantine-and-immutable-source')
            passed('no-credential-action-export-clearing-or-backup-save-invoked')
            report['status'] = 'passed-with-pending-choice' if outcome == 'private-choice-required' else 'passed'
        assert viewport(smoke) == before, 'Unexpected viewport change'
        report['viewport'] = before
    except Exception:
        report['status'] = 'failed'
        # Never propagate native provider labels or private payloads into logs.
        report['error'] = 'Focused checkpoint failed; inspect ignored private hierarchy locally.'
        raise
    finally:
        (output / 'sanitized.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--serial', required=True)
    parser.add_argument('--apk', type=Path, required=True)
    parser.add_argument('--source', required=True)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--review-file', type=Path)
    parser.add_argument('--synthetic', action='store_true')
    execute(parser.parse_args())

"""Local deterministic UI-controller regressions; no Android/model calls."""
import hashlib
from http.server import HTTPServer
import json
import os
from pathlib import Path
import subprocess
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET

from scripts import ui_agent as ui
REAL_RESTORE = ui.Device.restore


class FakeDevice:
    serial = 'emulator-5562'

    def __init__(self):
        self.current = {'size': 'Physical size: 1080x1920', 'density': 'Physical density: 420', 'font': 'null'}
        self.calls = []
        self.fail_density_once = False
        self.keyboard_dump = 'mInputShown=false\nmIsInputViewShown=false\nmShowRequested=false'

    def verify(self):
        self.calls.append(('verify',))

    def run(self, *args, binary=False):
        self.calls.append(args)
        if args == ('exec-out', 'cat', '/synthetic/base.apk'):
            return b'synthetic APK'
        return 'MoFlight_Synthetic_API37\nOK'

    def shell(self, *args):
        self.calls.append(args)
        if args == ('dumpsys', 'input_method'):
            return self.keyboard_dump
        if args == ('pm', 'path', ui.APP):
            return 'package:/synthetic/base.apk'
        if args == ('wm', 'size'):
            return self.current['size']
        if args[:2] == ('wm', 'size'):
            self.current['size'] = 'Physical size: 1080x1920' + ('' if args[2] == 'reset' else '\nOverride size: ' + args[2])
        if args[:2] == ('wm', 'density'):
            if self.fail_density_once:
                self.fail_density_once = False
                raise RuntimeError('synthetic density failure')
            self.current['density'] = 'Physical density: 420' + ('' if args[2] == 'reset' else '\nOverride density: ' + args[2])
        if args[:4] == ('settings', 'put', 'system', 'font_scale'):
            self.current['font'] = args[4]
        if args == ('settings', 'delete', 'system', 'font_scale'):
            self.current['font'] = 'null'
        return ''

    def display(self):
        return dict(self.current)

    def network(self):
        return {'airplane_mode_on': '1', 'wifi_on': '0', 'mobile_data': '0'}

    def identity(self):
        return ['versionName=synthetic', 'firstInstallTime=unchanged']

    def restore(self, original):
        # Exercise the actual shared restoration logic with a synthetic shell.
        return REAL_RESTORE(self, original)

    def tree(self, remote):
        return ET.fromstring('<hierarchy><node text="" content-desc="Flüge" resource-id="tab-flights" '
                             'class="android.widget.Button" enabled="true" clickable="true" '
                             'bounds="[0,20][50,70]" /></hierarchy>')


class ControllerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'worker').mkdir()
        (self.root / 'app.apk').write_bytes(b'synthetic APK')
        source = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ui.ROOT, text=True).strip()
        ui.write(self.root / 'build.json', {'configuration': 'Release', 'source_commit': source,
                 'apk': 'app.apk', 'apk_sha256': hashlib.sha256(b'synthetic APK').hexdigest()})
        self.options = {'build': str(self.root / 'build.json'), 'seconds': 20,
                        'actions': 3, 'captures': 1, 'allow_labels': []}
        self.device = FakeDevice()
        self.now = 10
        self.session = ui.Session(self.root, self.device, self.options, clock=lambda: self.now)
        self.session.open()

    def test_snapshot_durable_before_first_mutation_and_partial_failure_restores(self):
        original = ui.read(self.root / 'report.json')['original_display']
        self.device.fail_density_once = True
        with self.assertRaisesRegex(RuntimeError, 'density'):
            self.session.action({'op': 'viewport', 'name': 'main'})
        self.assertEqual(self.device.current, original)
        self.assertEqual(self.session.report['status'], 'action_failed')
        self.assertEqual(self.session.report['actions_used'], 1)
        self.assertEqual(len(self.session.report['action_errors']), 1)

    def test_deadline_denies_action_before_ui_mutation_and_restores(self):
        self.session.action({'op': 'viewport', 'name': 'main'})
        self.now = 31
        with self.assertRaisesRegex(ValueError, 'Deadline'):
            self.session.action({'op': 'back'})
        self.assertNotIn(('input', 'keyevent', 'KEYCODE_BACK'), self.device.calls)
        self.assertEqual(self.session.report['status'], 'timed_out')
        self.assertEqual(self.device.current, self.session.original)

    def test_action_limit_blocks_next_action_and_cleanup_is_not_charged(self):
        for _ in range(3):
            self.session.action({'op': 'back'})
        with self.assertRaisesRegex(ValueError, 'limit'):
            self.session.action({'op': 'back'})
        self.assertEqual(self.device.calls.count(('input', 'keyevent', 'KEYCODE_BACK')), 3)
        self.assertEqual(self.session.report['actions_used'], 3)
        self.assertEqual(self.session.report['status'], 'action_limit')

    def test_capture_limit_prevents_further_capture_and_restores(self):
        self.session.report['captures_used'] = 1
        with self.assertRaisesRegex(ValueError, 'Capture limit'):
            self.session.action({'op': 'capture', 'name': 'second'})
        self.assertEqual(self.session.report['status'], 'capture_limit')
        self.assertEqual(self.session.report['captures_used'], 1)

    def test_raw_commands_and_unlisted_mutating_target_are_refused(self):
        for command in [{'op': 'shell', 'args': ['pm', 'clear', ui.APP]},
                        {'op': 'tap', 'by': 'label', 'value': 'Anzeigename speichern'}]:
            with self.assertRaises(ValueError):
                self.session.action(command)
        self.assertFalse(any('clear' in args for args in self.device.calls))
        self.assertFalse(any(args[:2] == ('input', 'tap') for args in self.device.calls))

    def test_visible_enabled_selector_is_resolved_from_fresh_tree(self):
        result = self.session.action({'op': 'tap', 'by': 'id', 'value': 'tab-flights'})
        self.assertEqual(result['tap'], [25, 45])
        self.assertIn(('input', 'tap', '25', '45'), self.device.calls)

    def test_visible_or_opening_keyboard_refuses_both_swipe_directions(self):
        for raw in [
                'mInputShown=true\nmIsInputViewShown=true',
                'mInputShown=false\nmIsInputViewShown=true',
                'mInputShown=true\nmIsInputViewShown=false',
                'mInputShown=false\nmIsInputViewShown=false\nmShowRequested=true']:
            for direction in ['up', 'down']:
                with self.subTest(raw=raw, direction=direction):
                    self.device.keyboard_dump = raw
                    with self.assertRaisesRegex(ValueError, 'keyboard'):
                        self.session.perform({'op': 'swipe', 'direction': direction})
        self.assertFalse(any(args[:2] == ('input', 'swipe') for args in self.device.calls))

    def test_missing_malformed_or_incomplete_keyboard_state_refuses_swipe(self):
        for raw in ['', 'unsupported keyboard report', 'mInputShown=false',
                    'mIsInputViewShown=false',
                    'mInputShown=false\nmIsInputViewShown=unknown',
                    'mInputShown=maybe\nmIsInputViewShown=false',
                    'mInputShown=false\nmIsInputViewShown=false\nmShowRequested=unknown']:
            with self.subTest(raw=raw):
                self.device.keyboard_dump = raw
                with self.assertRaisesRegex(ValueError, 'keyboard'):
                    self.session.perform({'op': 'swipe', 'direction': 'up'})
        self.assertFalse(any(args[:2] == ('input', 'swipe') for args in self.device.calls))

    def test_swipe_reads_fresh_hidden_state_and_preserves_bounded_coordinates(self):
        self.session.action({'op': 'swipe', 'direction': 'up'})
        self.session.action({'op': 'swipe', 'direction': 'down'})
        swipes = [args for args in self.device.calls if args[:2] == ('input', 'swipe')]
        self.assertEqual(swipes, [('input', 'swipe', '540', '1382', '540', '614', '400'),
                                  ('input', 'swipe', '540', '614', '540', '1382', '400')])
        for index, call in enumerate(self.device.calls):
            if call[:2] == ('input', 'swipe'):
                self.assertEqual(self.device.calls[index - 1], ('dumpsys', 'input_method'))
        self.assertEqual(self.session.report['actions_used'], 2)

    def test_dismissed_gboard_cached_input_view_uses_confirmed_hidden_window(self):
        self.device.keyboard_dump = ('mInputShown=false\nmIsInputViewShown=true\n'
                                     'mDecorViewVisible=false mWindowVisible=false\n'
                                     'mShowInputRequested=false\nmImeWindowVis=0')
        self.assertEqual(self.session.action({'op': 'keyboard'})['visibility'], 'hidden')
        self.session.action({'op': 'swipe', 'direction': 'up'})
        self.assertEqual(self.device.calls.count(('input', 'swipe', '540', '1382', '540', '614', '400')), 1)

    def test_window_evidence_cannot_override_visible_pending_or_incomplete_state(self):
        for raw in [
                'mInputShown=false mIsInputViewShown=false mDecorViewVisible=true mWindowVisible=false mImeWindowVis=0',
                'mInputShown=false mIsInputViewShown=false mDecorViewVisible=false mWindowVisible=true mImeWindowVis=0',
                'mInputShown=false mIsInputViewShown=false mDecorViewVisible=false mWindowVisible=false mImeWindowVis=2',
                'mInputShown=false mIsInputViewShown=false mDecorViewVisible=false mWindowVisible=false mImeWindowVis=unknown',
                'mInputShown=false mIsInputViewShown=false mDecorViewVisible=false mImeWindowVis=0',
                'mInputShown=false mIsInputViewShown=false mWindowVisible=false',
                'mInputShown=false mIsInputViewShown=false mShowInputRequested=true',
                'mInputShown=false mIsInputViewShown=false mShowInputRequested=unknown',
                'mInputShown=false mInputShown=true mIsInputViewShown=false mDecorViewVisible=false mWindowVisible=false mImeWindowVis=0']:
            with self.subTest(raw=raw):
                self.device.keyboard_dump = raw
                with self.assertRaisesRegex(ValueError, 'keyboard'):
                    self.session.perform({'op': 'swipe', 'direction': 'up'})
        self.assertFalse(any(args[:2] == ('input', 'swipe') for args in self.device.calls))

    def test_keyboard_probe_failure_never_injects_a_swipe_and_can_clean_up(self):
        original = self.device.shell
        def failed_probe(*args):
            if args == ('dumpsys', 'input_method'):
                raise RuntimeError('synthetic keyboard probe unavailable')
            return original(*args)
        self.device.shell = failed_probe
        with self.assertRaisesRegex(RuntimeError, 'probe unavailable'):
            self.session.action({'op': 'swipe', 'direction': 'up'})
        self.assertFalse(any(args[:2] == ('input', 'swipe') for args in self.device.calls))
        self.assertEqual(self.session.report['actions_used'], 1)
        self.session.close('stopped')
        self.assertEqual(self.session.report['status'], 'stopped')
        self.assertEqual(self.session.report['restored_display'], self.session.original)

    def test_keyboard_inspection_contains_only_allowlisted_state_flags(self):
        self.device.keyboard_dump = 'mInputShown=false private-sentinel\nmIsInputViewShown=false'
        result = self.session.action({'op': 'keyboard'})
        self.assertEqual(result['visibility'], 'hidden')
        self.assertEqual(result['flags'], ['mInputShown=false', 'mIsInputViewShown=false'])
        self.assertNotIn('private-sentinel', json.dumps(result))

    def test_http_keyboard_rejection_then_dismissed_scroll_keeps_budget_and_cleanup(self):
        self.options['actions'] = 2
        server = self.http()
        self.device.keyboard_dump = 'mInputShown=true\nmIsInputViewShown=true'
        with self.assertRaises(HTTPError):
            self.post(server, {'op': 'swipe', 'direction': 'up'})
        self.assertEqual(self.session.report['actions_used'], 1)
        self.assertFalse(any(args[:2] == ('input', 'swipe') for args in self.device.calls))
        self.device.keyboard_dump = 'mInputShown=false\nmIsInputViewShown=false'
        self.post(server, {'op': 'swipe', 'direction': 'up'})
        self.assertEqual(self.device.calls.count(('input', 'swipe', '540', '1382', '540', '614', '400')), 1)
        with self.assertRaises(HTTPError):
            self.post(server, {'op': 'back'})
        self.assertEqual(self.session.report['status'], 'action_limit')
        self.assertEqual(self.session.report['restored_display'], self.session.original)

    def test_disabled_parent_clipped_or_ambiguous_targets_are_not_tapped(self):
        node = '<node content-desc="Flüge" enabled="true" clickable="true" bounds="{}" />'
        cases = ['<hierarchy><node enabled="false">' + node.format('[0,20][50,70]') + '</node></hierarchy>',
                 '<hierarchy>' + node.format('[0,100][50,70]') + '</hierarchy>',
                 '<hierarchy>' + node.format('[0,20][50,70]') * 2 + '</hierarchy>']
        for xml in cases:
            self.device.tree = lambda remote: ET.fromstring(xml)
            with self.assertRaisesRegex(ValueError, 'exactly one'):
                self.session.action({'op': 'tap', 'by': 'label', 'value': 'Flüge'})
        self.assertFalse(any(args[:2] == ('input', 'tap') for args in self.device.calls))

    def test_original_overrides_and_null_font_restored_even_after_another_restore_failure(self):
        original = {'size': 'Physical size: 1080x1920\nOverride size: 800x600',
                    'density': 'Physical density: 420\nOverride density: 160', 'font': 'null'}
        self.device.current = {'size': 'Physical size: 1080x1920', 'density': 'Physical density: 420', 'font': '1.6'}
        self.device.fail_density_once = True
        with self.assertRaisesRegex(RuntimeError, 'density'):
            self.device.restore(original)
        self.assertEqual(self.device.current['size'], original['size'])
        self.assertEqual(self.device.current['font'], 'null')

    def test_network_or_identity_change_is_not_silently_green(self):
        self.device.network = lambda: {'airplane_mode_on': '0'}
        self.session.close('completed')
        self.assertEqual(self.session.report['status'], 'cleanup_failed')
        self.assertTrue(any('network changed' in item for item in self.session.report['cleanup_errors']))

    def test_provenance_mismatch_is_rejected_before_any_ui_mutation(self):
        build = ui.read(self.root / 'build.json')
        for update in [{'configuration': 'Debug'}, {'apk_sha256': '0' * 64}]:
            ui.write(self.root / 'build.json', {**build, **update})
            device = FakeDevice()
            session = ui.Session(self.root, device, self.options)
            with self.assertRaises(ValueError):
                session.open()
            self.assertIsNone(session.original)
            self.assertFalse(any(args[:1] in [('input',), ('am',)] for args in device.calls))
        ui.write(self.root / 'build.json', build)
        device = FakeDevice()
        original_run = device.run
        def mismatch(*args, **kwargs):
            return b'different installed APK' if args[:2] == ('exec-out', 'cat') else original_run(*args, **kwargs)
        device.run = mismatch
        with self.assertRaisesRegex(ValueError, 'Installed APK differs'):
            ui.Session(self.root, device, self.options).open()
        self.assertFalse(any(args[:1] in [('input',), ('am',)] for args in device.calls))

    def http(self):
        server = HTTPServer(('127.0.0.1', 0), ui.Handler)
        server.session, server.token = self.session, 'synthetic-token'
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        return server

    def post(self, server, command, token='synthetic-token'):
        req = Request(f'http://127.0.0.1:{server.server_port}/command', json.dumps(command).encode(),
                      {'Authorization': 'Bearer ' + token})
        with urlopen(req, timeout=3) as response:
            return json.loads(response.read())

    def test_http_batch_counts_each_item_and_cannot_bypass_budget(self):
        server = self.http()
        with self.assertRaises(HTTPError):
            self.post(server, {'op': 'batch', 'actions': [{'op': 'back'}] * 4})
        self.assertEqual(self.session.report['actions_used'], 3)
        self.assertEqual(self.session.report['status'], 'action_limit')

    def test_unauthorized_http_request_has_no_action_or_cleanup_side_effect(self):
        server = self.http()
        with self.assertRaises(HTTPError) as caught:
            self.post(server, {'op': 'back'}, token='wrong')
        self.assertEqual(caught.exception.code, 403)
        self.assertEqual(self.session.report['actions_used'], 0)
        self.assertFalse(self.session.closed)

    def test_finish_rejects_invalid_result_and_foreign_evidence_then_closes_valid_result(self):
        server = self.http()
        result = self.root / 'worker/result.json'
        result.write_text('{bad', encoding='utf-8')
        with self.assertRaises(HTTPError):
            self.post(server, {'op': 'finish'})
        self.assertFalse(self.session.closed)
        ui.write(result, {'checks': {'U01': {'status': 'passed', 'observation': 'synthetic', 'evidence': ['../build.json']}}})
        with self.assertRaises(HTTPError):
            self.post(server, {'op': 'finish'})
        ui.write(result, {'checks': {'U01': {'status': 'not_tested', 'observation': 'bounded synthetic test', 'evidence': []}}})
        report = self.post(server, {'op': 'finish'})
        self.assertEqual(report['status'], 'completed')
        self.assertEqual(report['actions_used'], 0)
        self.assertEqual(report['restored_display'], self.session.original)

    def test_real_controller_idle_deadline_restores_after_worker_abandons_session(self):
        options = {**self.options, 'adb': 'synthetic', 'serial': 'emulator-5562',
                   'scope': 'synthetic idle trial', 'seconds': .8}
        ui.write(self.root / 'options.json', options)
        with patch.object(ui, 'RUNS', self.root), patch.object(ui, 'Device', return_value=self.device):
            thread = threading.Thread(target=ui.serve, args=(self.root,), daemon=True)
            thread.start()
            until = time.monotonic() + 3
            while not (self.root / 'task.md').exists():
                if time.monotonic() > until:
                    self.fail('Controller did not become ready')
                time.sleep(.01)
            ui.request(self.root, {'op': 'viewport', 'name': 'main'})
            # No finish/stop/client remains: a worker can disappear between requests.
            thread.join(3)
            self.assertFalse(thread.is_alive())
        report = ui.read(self.root / 'report.json')
        self.assertEqual(report['status'], 'timed_out')
        self.assertEqual(report['restored_display'], report['original_display'])
        self.assertFalse((self.root / 'synthetic.lock').exists())

    def test_stale_recovery_refuses_live_owner_then_restores_dead_owner(self):
        options = {**self.options, 'adb': 'synthetic', 'serial': 'emulator-5562'}
        ui.write(self.root / 'options.json', options)
        ui.write(self.root / 'session.json', {'pid': 123, 'port': 0, 'token': 'synthetic'})
        runs = self.root.parent
        lock = runs / 'synthetic.lock'
        ui.write(lock, {'pid': 123, 'output': str(self.root)})
        self.device.current['font'] = '1.6'
        with patch.object(ui, 'RUNS', runs), patch.object(ui, 'alive', return_value=True), \
             patch.object(ui, 'Device', return_value=self.device):
            with self.assertRaisesRegex(ValueError, 'still alive'):
                ui.main(['recover', '--session', str(self.root)])
        self.assertTrue(lock.exists())
        self.assertEqual(self.device.current['font'], '1.6')
        with patch.object(ui, 'RUNS', runs), patch.object(ui, 'alive', return_value=False), \
             patch.object(ui, 'Device', return_value=self.device):
            self.assertEqual(ui.main(['recover', '--session', str(self.root)]), 0)
        self.assertFalse(lock.exists())
        self.assertEqual(self.device.current, self.session.original)
        self.assertEqual(ui.read(self.root / 'report.json')['status'], 'recovered')

    def test_controller_cleanup_failure_retains_lock_for_explicit_recovery(self):
        options = {**self.options, 'adb': 'synthetic', 'serial': 'emulator-5562',
                   'scope': 'synthetic cleanup failure', 'seconds': .4}
        ui.write(self.root / 'options.json', options)
        with patch.object(ui, 'RUNS', self.root), patch.object(ui, 'Device', return_value=self.device):
            thread = threading.Thread(target=ui.serve, args=(self.root,), daemon=True)
            thread.start()
            until = time.monotonic() + 3
            while not (self.root / 'task.md').exists():
                if time.monotonic() > until:
                    self.fail('Controller did not become ready')
                time.sleep(.01)
            self.device.network = lambda: {'airplane_mode_on': '0'}
            thread.join(3)
            self.assertFalse(thread.is_alive())
        self.assertEqual(ui.read(self.root / 'report.json')['status'], 'cleanup_failed')
        self.assertTrue((self.root / 'synthetic.lock').exists())

    def test_failed_recovery_keeps_lock_and_records_error(self):
        options = {**self.options, 'adb': 'synthetic', 'serial': 'emulator-5562'}
        ui.write(self.root / 'options.json', options)
        lock = self.root.parent / 'synthetic.lock'
        ui.write(lock, {'pid': 123, 'output': str(self.root)})
        with patch.object(ui, 'RUNS', self.root.parent), patch.object(ui, 'alive', return_value=False), \
             patch.object(ui, 'Device', return_value=self.device), \
             patch.object(self.device, 'restore', side_effect=RuntimeError('synthetic missing device')):
            with self.assertRaisesRegex(RuntimeError, 'missing device'):
                ui.main(['recover', '--session', str(self.root)])
        self.assertTrue(lock.exists())
        report = ui.read(self.root / 'report.json')
        self.assertEqual(report['status'], 'cleanup_failed')
        self.assertIn('missing device', report['recovery_error'])

    def test_disconnected_authorized_client_triggers_cleanup_but_unknown_client_does_not(self):
        handler = object.__new__(ui.Handler)
        handler.server = unittest.mock.Mock(session=self.session)
        handler.send_response = unittest.mock.Mock()
        handler.send_header = unittest.mock.Mock()
        handler.end_headers = unittest.mock.Mock()
        handler.wfile = unittest.mock.Mock()
        handler.wfile.write.side_effect = BrokenPipeError
        handler.authorized = False
        handler.reply(403, {})
        self.assertFalse(self.session.closed)
        handler.authorized = True
        handler.reply(200, {})
        self.assertTrue(self.session.closed)
        self.assertEqual(self.session.report['status'], 'client_disconnected')


class ProcessBoundaryTests(unittest.TestCase):
    def test_wrong_or_physical_device_rejected_before_capture_or_mutation(self):
        for serial in ['', 'USB-private', 'emulator-5562;anything']:
            with self.assertRaises(ValueError), patch.object(ui.subprocess, 'run') as run:
                ui.Device('synthetic-adb', serial)
            run.assert_not_called()
        device = ui.Device('synthetic-adb', 'emulator-5562')
        with patch.object(device, 'shell', return_value='1') as shell, \
             patch.object(device, 'run', return_value='MoFlight_API37\nOK') as run:
            with self.assertRaisesRegex(RuntimeError, 'Only'):
                device.verify()
            shell.assert_called_once_with('getprop', 'ro.kernel.qemu')
            run.assert_called_once_with('emu', 'avd', 'name')

    def test_paths_cannot_escape_session_root(self):
        for path in [ui.RUNS, ui.ROOT, ui.RUNS / '../private']:
            with self.assertRaises(ValueError):
                ui.session_path(path)

    def test_occupied_lock_refuses_new_session_without_touching_device(self):
        with tempfile.TemporaryDirectory() as folder:
            runs = Path(folder); output = runs / 'attempt'; output.mkdir()
            ui.write(output / 'options.json', {})
            lock = runs / 'synthetic.lock'; lock.write_text('{"pid":123,"output":"other"}', encoding='utf-8')
            with patch.object(ui, 'RUNS', runs), patch.object(ui, 'Device') as device:
                ui.serve(output)
            device.assert_not_called()
            self.assertTrue(lock.exists())
            self.assertEqual(ui.read(output / 'report.json')['status'], 'blocked')

    def test_current_controller_process_is_detected_as_alive(self):
        self.assertTrue(ui.alive(os.getpid()))


if __name__ == '__main__':
    unittest.main()

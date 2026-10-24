"""Safety boundaries and artifact identity, without Android or network access."""
import json
from pathlib import Path
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from scripts import android_build, maestro_smoke
from scripts.find_android_artifact import select_artifact


class DeviceSafetyTests(unittest.TestCase):
    def test_provider_emulator_rejected_after_read_only_identity_checks(self):
        with patch.object(maestro_smoke, 'run', side_effect=['1\n', 'MoFlight_API37\nOK\n']) as run:
            with self.assertRaisesRegex(RuntimeError, 'Refusing other AVD'):
                maestro_smoke.require_synthetic('adb', 'emulator-5554')
            self.assertEqual([call.args[0][3:] for call in run.call_args_list],
                             [['shell', 'getprop', 'ro.kernel.qemu'], ['emu', 'avd', 'name']])

    def test_physical_or_unspecified_device_is_never_contacted(self):
        for serial in ['', 'USB-123', 'emulator-5554;unsafe']:
            with self.subTest(serial=serial), patch.object(maestro_smoke, 'run') as run:
                with self.assertRaisesRegex(RuntimeError, 'explicit emulator'):
                    maestro_smoke.require_synthetic('adb', serial)
                run.assert_not_called()

    def test_verified_synthetic_emulator_allowed(self):
        with patch.object(maestro_smoke, 'run', side_effect=['1\n', 'MoFlight_Synthetic_API37\nOK\n']):
            maestro_smoke.require_synthetic('adb', 'emulator-5554')

    def test_maestro_failure_keeps_diagnostics_and_nonzero_verdict(self):
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / 'evidence'
            with patch.object(maestro_smoke, 'require_synthetic'), \
                 patch.object(maestro_smoke, 'check_apk'), \
                 patch.object(maestro_smoke, 'maestro_path', return_value='synthetic-maestro'), \
                 patch.object(maestro_smoke.shutil, 'which', return_value='synthetic-adb'), \
                 patch.object(maestro_smoke, 'run', return_value='0\n'), \
                 patch.object(maestro_smoke.subprocess, 'run', return_value=subprocess.CompletedProcess([], 7)):
                result = maestro_smoke.main(['--serial', 'emulator-5554', '--output', str(output)])
            self.assertEqual(result, 1)
            report = json.loads((output / 'report.json').read_text())
            self.assertEqual(report['status'], 'failed')
            self.assertIn('Maestro exited 7', report['error'])
            self.assertTrue((output / 'logcat.txt').exists())


class BuildAndArtifactTests(unittest.TestCase):
    def test_linux_build_records_version_rather_than_pnpm_executable(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / '.node-version').write_text('24.18.0\n')
            android = root / 'apps/platform-lab/android'
            apk = android / 'app/build/outputs/apk/release/app-release.apk'
            apk.parent.mkdir(parents=True)
            apk.write_bytes(b'synthetic packaging result')
            (android / 'gradlew').write_text('synthetic gradle placeholder')
            sdk = root / 'sdk'
            sdk.mkdir()
            def result(command, **kwargs):
                value = {'node': 'v24.18.0', '/tool/pnpm': '11.25.0', 'java': 'openjdk version "17.0.20.1"'}
                return subprocess.CompletedProcess(command, 0, value.get(command[0], ''))
            with patch.object(android_build, 'ROOT', root), \
                 patch.object(android_build, 'os', SimpleNamespace(name='posix', environ={'ANDROID_HOME': str(sdk)})), \
                 patch.object(android_build.shutil, 'which', return_value='/tool/pnpm'), \
                 patch.object(android_build, 'identity', return_value='synthetic-source'), \
                 patch.object(android_build, 'inspect_layout'), \
                 patch.object(android_build, 'run', side_effect=result):
                self.assertEqual(android_build.main(['--output', str(root / 'output')]), 0)
            manifest = json.loads((root / 'output/build.json').read_text())
            self.assertEqual(manifest['pnpm'], '11.25.0')
            self.assertEqual(manifest['source_commit'], 'synthetic-source')
            self.assertFalse(manifest['metro_required'])

    def test_dirty_linux_checkout_refused_before_prebuild(self):
        with patch.object(android_build, 'run', side_effect=[subprocess.CompletedProcess([], 0, 'sha'),
                                                            subprocess.CompletedProcess([], 0, ' M app.ts')]) as run:
            with self.assertRaisesRegex(RuntimeError, 'Commit build inputs'):
                android_build.identity()
            self.assertEqual(run.call_count, 2)

    def test_expired_wrong_commit_or_wrong_name_artifact_never_selected(self):
        good = {'name': 'moflight-apk-exact', 'expired': False, 'workflow_run': {'head_sha': 'exact', 'id': 42}}
        for bad in [dict(good, expired=True), dict(good, name='other'),
                    dict(good, workflow_run={'head_sha': 'older', 'id': 41})]:
            self.assertIsNone(select_artifact([bad], 'exact'))
        self.assertEqual(select_artifact([good], 'exact')['workflow_run']['id'], 42)


if __name__ == '__main__':
    unittest.main()

"""Build provenance, cache isolation and checkpoint trigger regression checks."""
import fnmatch
import json
import os
import re
import tempfile
import shutil
import subprocess
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch, MagicMock

from scripts import android_build_plan as plan
from scripts.android_smoke import Smoke

ROOT = Path(__file__).resolve().parents[1]


class TriggerTests(unittest.TestCase):
    def test_checkpoint_scope(self):
        workflow = (ROOT / '.github/workflows/android-checkpoint.yml').read_text()
        block = workflow.split('    paths:\n', 1)[1].split('  workflow_dispatch:', 1)[0]
        patterns = re.findall(r"- '([^']+)'", block)
        cases = {
            'README.md': False, 'docs/product/example.md': False,
            'apps/platform-lab/src/App.tsx': False,
            'packages/local-data/src/repository.ts': False,
            'package.json': True, 'apps/platform-lab/package.json': True,
            'pnpm-lock.yaml': True, 'pnpm-workspace.yaml': True, '.npmrc': True,
            'apps/platform-lab/app.config.ts': True, 'apps/platform-lab/app.json': True,
            'apps/platform-lab/plugins/native.js': True,
            'scripts/android_smoke.py': True, 'scripts/build-android-local.ps1': True,
            'scripts/configure-windows-native-build.ps1': True,
            'tests/test_android_build_policy.py': True,
            '.github/workflows/android-checkpoint.yml': True,
        }
        for path, expected in cases.items():
            with self.subTest(path=path):
                self.assertEqual(any(fnmatch.fnmatchcase(path, p) for p in patterns), expected)
        fast = (ROOT / '.github/workflows/host-lab.yml').read_text()
        self.assertNotIn('assembleRelease', fast)
        self.assertNotIn('android-smoke:', fast)


class PlannerTests(unittest.TestCase):
    def test_historical_source_without_planner_is_pinned_and_force_fresh_honored(self):
        with tempfile.TemporaryDirectory() as folder:
            repo = Path(folder) / 'historical'
            subprocess.run(['git', 'init', str(repo)], check=True, capture_output=True)
            subprocess.run(['git', '-C', str(repo), '-c', 'user.name=Synthetic Test',
                            '-c', 'user.email=synthetic@example.invalid', 'commit', '--allow-empty', '-m', 'synthetic'],
                           check=True, capture_output=True)
            sha = subprocess.check_output(['git', '-C', str(repo), 'rev-parse', 'HEAD'], text=True).strip()
            output = Path(folder) / 'output'
            env = dict(os.environ, GITHUB_REPOSITORY='example/repo', GH_TOKEN='synthetic-token',
                       GITHUB_OUTPUT=str(output), FORCE_FRESH='true')
            env.pop('GITHUB_STEP_SUMMARY', None)
            result = subprocess.run([shutil.which('python') or 'python', str(ROOT / 'scripts/android_build_plan.py')],
                                    cwd=repo, env=env, capture_output=True, text=True, timeout=30)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn(f'checkout_commit={sha}\n', output.read_text())
            self.assertIn('run_id=\n', output.read_text())

    def run_plan(self, changed='', force=False, expired=False):
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / 'output'
            summary = Path(folder) / 'summary'
            response = MagicMock()
            response.__enter__.return_value.read.return_value = json.dumps({'artifacts': [{
                'name': 'moflight-synthetic-android-offline', 'expired': expired,
                'workflow_run': {'head_sha': 'compiled-sha', 'id': 123},
            }]}).encode()
            env = {'GITHUB_REPOSITORY': 'example/repo', 'GH_TOKEN': 'synthetic-token',
                   'GITHUB_OUTPUT': str(output), 'GITHUB_STEP_SUMMARY': str(summary),
                   'FORCE_FRESH': str(force).lower()}
            with patch.dict(os.environ, env), patch.object(plan.subprocess, 'check_output', return_value='requested-sha\n'), \
                 patch.object(plan.urllib.request, 'urlopen', return_value=response) as request, \
                 patch.object(plan.subprocess, 'run', return_value=SimpleNamespace(stdout=changed)) as diff:
                plan.main()
                return output.read_text(), summary.read_text(), request.call_count, diff.call_args

    def test_docs_only_reuses_with_both_source_identities(self):
        output, summary, _, diff = self.run_plan('docs/example.md\nREADME.md\n')
        self.assertIn('run_id=123\n', output)
        self.assertIn('checkout_commit=requested-sha\n', output)
        self.assertIn('compiled-sha', summary)
        self.assertIn('--no-renames', diff.args[0])

    def test_application_change_never_reuses(self):
        output, _, _, _ = self.run_plan('apps/platform-lab/src/App.tsx\n')
        self.assertIn('run_id=\n', output)

    def test_android_harness_regression_tests_do_not_invalidate_the_app_binary(self):
        output, _, _, _ = self.run_plan('tests/test_android_build_policy.py\n')
        self.assertIn('run_id=123\n', output)

    def test_windows_only_helper_does_not_invalidate_hosted_linux_apk(self):
        output, _, _, _ = self.run_plan('scripts/build-android-local.ps1\n')
        self.assertIn('run_id=123\n', output)

    def test_isolated_project_audit_does_not_invalidate_android_binary(self):
        output, _, _, _ = self.run_plan('pocs/project-audit/reproduce.ts\n')
        self.assertIn('run_id=123\n', output)

    def test_agent_documentation_does_not_invalidate_android_binary(self):
        output, _, _, _ = self.run_plan('AGENTS.md\napps/platform-lab/AGENTS.md\n')
        self.assertIn('run_id=123\n', output)

    def test_forced_build_skips_artifact_lookup(self):
        output, _, requests, _ = self.run_plan(force=True)
        self.assertIn('run_id=\n', output)
        self.assertEqual(requests, 0)

    def test_expired_artifact_never_reused(self):
        output, _, _, diff = self.run_plan(expired=True)
        self.assertIn('run_id=\n', output)
        self.assertIsNone(diff)


class DeviceSelectionTests(unittest.TestCase):
    def test_wrong_emulator_rejected_before_mutation(self):
        with tempfile.TemporaryDirectory() as folder:
            smoke = Smoke(Path(folder), 'emulator-5554', 'MoFlight_Synthetic_API37')
            with patch.object(smoke, 'shell', return_value='1') as shell, \
                 patch.object(smoke, 'adb', return_value=SimpleNamespace(stdout='MoFlight_API37\nOK\n')) as adb:
                with self.assertRaisesRegex(AssertionError, 'different emulator'):
                    smoke.execute(Path('unused.apk'))
                smoke.finish('failed', AssertionError('Device selection rejected'))
                shell.assert_called_once_with('getprop', 'ro.kernel.qemu')
                adb.assert_called_once_with('emu', 'avd', 'name')
                self.assertEqual(smoke.report['diagnostics']['status'], 'not collected')

    def test_explicit_serial_applies_to_all_adb_calls(self):
        with tempfile.TemporaryDirectory() as folder:
            smoke = Smoke(Path(folder), 'emulator-5558')
            with patch('scripts.android_smoke.subprocess.run') as run:
                smoke.adb('shell', 'getprop', 'ro.kernel.qemu')
                self.assertEqual(run.call_args.args[0][:3], ['adb', '-s', 'emulator-5558'])


@unittest.skipUnless(os.name == 'nt' and shutil.which('pwsh'), 'Windows helper execution')
class LocalCheckoutTests(unittest.TestCase):
    def test_explicit_commit_does_not_require_discarding_source_drafts(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / 'source'
            subprocess.run(['git', 'init', str(source)], check=True, capture_output=True)
            subprocess.run(['git', '-C', str(source), '-c', 'user.name=Synthetic Test',
                            '-c', 'user.email=synthetic@example.invalid', 'commit', '--allow-empty', '-m', 'synthetic'],
                           check=True, capture_output=True)
            (source / 'draft.txt').write_text('synthetic draft')
            result = subprocess.run(['pwsh', '-NoProfile', '-File', str(ROOT / 'scripts/build-android-local.ps1'),
                                     '-SourceRepository', str(source), '-BuildDirectory', str(Path(folder) / 'build'),
                                     '-SourceRef', 'HEAD', '-JavaHome', 'missing-synthetic-jdk'],
                                    capture_output=True, text=True, timeout=30)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('JDK 17 is missing', result.stderr)
            self.assertNotIn('Commit source changes first', result.stderr)
            self.assertEqual((source / 'draft.txt').read_text(), 'synthetic draft')
    def test_uncommitted_source_is_refused_without_creating_build_target(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / 'source'
            source.mkdir()
            subprocess.run(['git', 'init', str(source)], check=True, capture_output=True)
            (source / 'uncommitted.txt').write_text('synthetic draft')
            build = Path(folder) / 'build'
            result = subprocess.run(['pwsh', '-NoProfile', '-File', str(ROOT / 'scripts/build-android-local.ps1'),
                                     '-SourceRepository', str(source), '-BuildDirectory', str(build),
                                     '-JavaHome', 'unused'], capture_output=True, text=True, timeout=30)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('Commit source changes first', result.stderr)
            self.assertFalse(build.exists())

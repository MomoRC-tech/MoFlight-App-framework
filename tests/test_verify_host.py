"""Runner failures must reach callers while preserving full diagnostics."""
from contextlib import redirect_stderr, redirect_stdout
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from scripts import verify_host


def command(code):
    return [sys.executable, '-c', code]


class HostCheckTests(unittest.TestCase):
    def test_legacy_console_preserves_unicode_evidence_and_completes_checks(self):
        diagnostic = 'Synthetic failure \u2716 \u822a'
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / 'logs-\u822a'
            console_bytes = io.BytesIO()
            with io.TextIOWrapper(console_bytes, encoding='cp1252', errors='strict') as terminal:
                checks = [('broken', command(f'print({diagnostic!r}); raise SystemExit(7)')),
                          ('last-\u822a', command("print('still executed')"))]
                with redirect_stdout(terminal):
                    report = verify_host.run_checks(checks, output)
                self.assertEqual(terminal.encoding, 'cp1252')
                self.assertEqual(terminal.errors, 'strict')
                console = console_bytes.getvalue().decode('cp1252')
            self.assertEqual(report['status'], 'failed')
            self.assertEqual([check['exit_code'] for check in report['checks']], [7, 0])
            self.assertEqual(json.loads((output / 'report.json').read_text(encoding='utf-8')), report)
            self.assertIn(diagnostic, (output / '01.log').read_text(encoding='utf-8'))
            self.assertIn('still executed', (output / '02.log').read_text(encoding='utf-8'))
            self.assertIn('Synthetic failure \\u2716 \\u822a', console)
            self.assertIn('PASS last-\\u822a', console)
            self.assertIn('1/2 host checks passed.', console)
            self.assertIn('logs-\\u822a', console)

    def test_legacy_console_reports_layout_refusal_with_failure_exit(self):
        console_bytes = io.BytesIO()
        with io.TextIOWrapper(console_bytes, encoding='cp1252', errors='strict') as terminal:
            with patch('scripts.dependency_layout.inspect_layout',
                       side_effect=RuntimeError('missing-\u822a')), redirect_stderr(terminal):
                exit_code = verify_host.main([])
            self.assertEqual(exit_code, 1)
            self.assertIn('Host checks refused: missing-\\u822a',
                          console_bytes.getvalue().decode('cp1252'))

    def test_failure_is_preserved_after_later_success_and_output_is_bounded(self):
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / 'logs'
            terminal = io.StringIO()
            checks = [('first', command("print('quiet passing output')")),
                      ('broken', command("import sys; print('full failure evidence'); print('detail\\n' * 30); sys.exit(7)")),
                      ('last', command("print('still executed')"))]
            with redirect_stdout(terminal):
                report = verify_host.run_checks(checks, output)
            self.assertEqual(report['status'], 'failed')
            self.assertEqual([check['exit_code'] for check in report['checks']], [0, 7, 0])
            self.assertEqual(json.loads((output / 'report.json').read_text()), report)
            self.assertIn('full failure evidence', (output / '02.log').read_text())
            self.assertIn('still executed', (output / '03.log').read_text())
            self.assertNotIn('quiet passing output', terminal.getvalue())
            self.assertLess(len(terminal.getvalue().splitlines()), 20)

    def test_missing_command_fails_with_saved_diagnostic(self):
        with tempfile.TemporaryDirectory() as folder, redirect_stdout(io.StringIO()):
            output = Path(folder) / 'logs'
            report = verify_host.run_checks([('missing', [str(Path(folder) / 'missing-executable')])], output)
            self.assertEqual(report['status'], 'failed')
            self.assertNotEqual(report['checks'][0]['exit_code'], 0)
            self.assertIn('Could not start check', (output / '01.log').read_text())

    def test_timeout_fails_with_diagnostic(self):
        with tempfile.TemporaryDirectory() as folder, redirect_stdout(io.StringIO()):
            output = Path(folder) / 'logs'
            report = verify_host.run_checks([('stuck', command('import time; time.sleep(30)'))],
                                            output, timeout=0.3)
            self.assertEqual(report['status'], 'failed')
            self.assertIn('exceeded', (output / '01.log').read_text())

    def test_entry_point_returns_failure_or_success_to_shell(self):
        with tempfile.TemporaryDirectory() as folder:
            for exit_code in (0, 9):
                with self.subTest(exit_code=exit_code):
                    checks = [('synthetic', command(f'raise SystemExit({exit_code})'))]
                    args = ['--output', str(Path(folder) / str(exit_code))]
                    script = ('from scripts import verify_host\n'
                              f'verify_host.default_checks = lambda: {checks!r}\n'
                              f'raise SystemExit(verify_host.main({args!r}))\n')
                    result = subprocess.run(command(script), cwd=verify_host.ROOT,
                                            capture_output=True, text=True, timeout=10)
                    self.assertEqual(result.returncode, 0 if exit_code == 0 else 1, result.stderr)

    def test_existing_log_directory_is_preserved(self):
        with tempfile.TemporaryDirectory() as folder:
            evidence = Path(folder) / 'evidence.log'
            evidence.write_text('existing evidence')
            with self.assertRaises(FileExistsError):
                verify_host.run_checks([], Path(folder))
            self.assertEqual(evidence.read_text(), 'existing evidence')

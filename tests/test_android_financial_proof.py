import hashlib
import importlib.util
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
spec = importlib.util.spec_from_file_location('financial_smoke_tested', ROOT / 'scripts/android_financial_proof.py')
trial = importlib.util.module_from_spec(spec)
spec.loader.exec_module(trial)


class FinancialNativeScriptTests(unittest.TestCase):
    def test_phone_is_rejected_before_any_mutation(self):
        smoke = mock.Mock()
        smoke.shell.return_value = '0'
        with self.assertRaisesRegex(AssertionError, 'Emulator required'):
            trial.execute(smoke, 'a' * 40, 'b' * 64)
        smoke.shell.assert_called_once_with('getprop', 'ro.kernel.qemu')
        smoke.adb.assert_not_called()

    def test_provider_avd_is_rejected_before_any_mutation(self):
        smoke = mock.Mock()
        smoke.shell.return_value = '1'
        smoke.adb.return_value.stdout = 'MoFlight_API37\nOK'
        with self.assertRaisesRegex(AssertionError, 'Named synthetic AVD'):
            trial.execute(smoke, 'a' * 40, 'b' * 64)
        smoke.adb.assert_called_once_with('emu', 'avd', 'name')
        smoke.shell.assert_called_once_with('getprop', 'ro.kernel.qemu')

    def test_truncated_log_record_preserves_other_records(self):
        with tempfile.TemporaryDirectory() as directory:
            smoke = mock.Mock(output=Path(directory))
            smoke.adb.return_value.stdout = '\n'.join([
                'I/ReactNativeJS: unrelated output',
                'I/ReactNativeJS: MOFLIGHT_FINANCIAL_PROOF_SAMPLE {"kind":"run",',
                'I/ReactNativeJS: MOFLIGHT_FINANCIAL_PROOF_SUMMARY {"kind":"run","id":"synthetic","state":"passed","checks":8}',
                'I/ReactNativeJS: \'MOFLIGHT_FINANCIAL_PROOF_SAMPLE\', \'{"kind":"run","id":"synthetic","stage":"total","elapsedMs":12.5,"outcome":"passed"}\'',
            ])
            result = trial.proof_records(smoke)
            self.assertEqual(result[0]['record'], 'parse-error')
            self.assertEqual(result[1]['state'], 'passed')
            self.assertEqual(result[2]['elapsedMs'], 12.5)
            self.assertNotIn('unrelated output', (Path(directory) / 'native-proof-log.txt').read_text())

    def test_failed_diagnostics_cannot_skip_radio_restoration(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            smoke = mock.Mock(output=output, report={'checks': []})
            smoke.shell.return_value = '1'
            def adb(*args):
                if args[:3] == ('emu', 'avd', 'name'):
                    return types.SimpleNamespace(stdout=trial.AVD + '\nOK')
                if args[0] == 'pull':
                    Path(args[2]).write_bytes(b'synthetic apk')
                return types.SimpleNamespace(stdout='')
            smoke.adb.side_effect = adb
            before = dict(size='1080x1920', density='420', font_scale='1.0', airplane_mode_on='1', wifi_on='0', mobile_data='0')
            with mock.patch.object(trial, 'snapshot', return_value=before), mock.patch.object(trial, 'offline'), \
                    mock.patch.object(trial, 'launch', side_effect=RuntimeError('synthetic UI failure')), \
                    mock.patch.object(trial, 'proof_records', side_effect=RuntimeError('synthetic log failure')), \
                    mock.patch.object(trial, 'restore_radios') as restore:
                with self.assertRaisesRegex(RuntimeError, 'log failure'):
                    trial.execute(smoke, 'a' * 40, hashlib.sha256(b'synthetic apk').hexdigest())
                restore.assert_called_once_with(smoke, before)


if __name__ == '__main__':
    unittest.main()

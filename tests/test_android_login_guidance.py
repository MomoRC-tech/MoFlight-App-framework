"""Host safety checks; these do not prove native UI behavior."""
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import android_login_guidance_smoke as trial


class LoginTrialSafetyTests(unittest.TestCase):
    def test_existing_avds_are_rejected_before_mutation(self):
        for name in ('MoFlight_API37', 'MoFlight_Synthetic_API37', 'Medium_Phone_API_37.0'):
            with self.subTest(avd=name):
                smoke = Mock()
                smoke.shell.return_value = '1'
                smoke.adb.return_value = SimpleNamespace(stdout=f'{name}\nOK\n')
                with self.assertRaisesRegex(AssertionError, 'Fresh dedicated AVD required'):
                    trial.execute(smoke)
                self.assertEqual(smoke.shell.call_args_list, [(('getprop', 'ro.kernel.qemu'), {})])
                smoke.adb.assert_called_once_with('emu', 'avd', 'name')

    def test_physical_device_is_rejected_before_avd_lookup_or_mutation(self):
        smoke = Mock()
        smoke.shell.return_value = '0'
        with self.assertRaisesRegex(AssertionError, 'Emulator required'):
            trial.execute(smoke)
        smoke.shell.assert_called_once_with('getprop', 'ro.kernel.qemu')
        smoke.adb.assert_not_called()


if __name__ == '__main__':
    unittest.main()

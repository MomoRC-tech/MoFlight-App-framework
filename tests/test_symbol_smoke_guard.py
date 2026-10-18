"""The optional symbol callback never runs before the existing device guards."""
import sys
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import Mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from android_mobile_width_matrix import execute


class SymbolSmokeGuardTests(unittest.TestCase):
    def test_physical_device_rejection_precedes_callback_and_display_mutation(self):
        callback = Mock()
        smoke = SimpleNamespace(serial='emulator-5562', shell=Mock(return_value='0'))
        with self.assertRaisesRegex(AssertionError, 'physical'):
            execute(smoke, on_screen=callback, viewports=[(390, 900, 1.0)], keyboard=False)
        callback.assert_not_called()
        smoke.shell.assert_called_once_with('getprop', 'ro.kernel.qemu')

    def test_foreign_avd_rejection_precedes_callback_and_display_mutation(self):
        callback = Mock()
        smoke = SimpleNamespace(serial='emulator-5562', shell=Mock(return_value='1'), adb=Mock(return_value=SimpleNamespace(stdout='MoFlight_API37\nOK\n')))
        with self.assertRaisesRegex(AssertionError, 'other AVD'):
            execute(smoke, on_screen=callback)
        callback.assert_not_called()
        smoke.shell.assert_called_once_with('getprop', 'ro.kernel.qemu')


if __name__ == '__main__':
    unittest.main()

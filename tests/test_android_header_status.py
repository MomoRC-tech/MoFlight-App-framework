"""Host safety checks for the bounded header trial; no device acceptance."""
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

with patch.object(sys, 'path', [*sys.path, str(Path(__file__).resolve().parents[1] / 'scripts')]):
    import android_header_status_smoke as trial


class HeaderTrialSafetyTests(unittest.TestCase):
    def test_other_avds_are_rejected_before_mutation(self):
        for name in ('MoFlight_API37', 'MoFlight_Synthetic_API37', 'Medium_Phone_API_37.0'):
            for online in (False, True):
                with self.subTest(avd=name, public_toolbar=online):
                    smoke = Mock()
                    smoke.shell.return_value = '1'
                    smoke.adb.return_value = SimpleNamespace(stdout=f'{name}\nOK\n')
                    with self.assertRaisesRegex(AssertionError, 'Dedicated LoginUX AVD required'):
                        trial.execute(smoke, public_only=online)
                    smoke.shell.assert_called_once_with('getprop', 'ro.kernel.qemu')
                    smoke.adb.assert_called_once_with('emu', 'avd', 'name')

    def test_physical_devices_are_rejected_before_mutation(self):
        smoke = Mock()
        smoke.shell.return_value = '0'
        with self.assertRaisesRegex(AssertionError, 'Emulator required'):
            trial.execute(smoke)
        smoke.shell.assert_called_once_with('getprop', 'ro.kernel.qemu')
        smoke.adb.assert_not_called()

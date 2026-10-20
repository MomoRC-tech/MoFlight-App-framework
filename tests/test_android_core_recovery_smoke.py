"""Device selection is checked before any process termination or installation."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from android_core_recovery_smoke import require_synthetic


class SyntheticRecoveryBoundaryTests(unittest.TestCase):
    def test_accepts_only_the_named_synthetic_emulator(self):
        require_synthetic("emulator-5556", "MoFlight_Synthetic_API37")

    def test_rejects_private_emulator_physical_devices_and_missing_identity(self):
        for serial, avd in [("emulator-5554", "MoFlight_API37"),
                            ("phone-serial", "MoFlight_Synthetic_API37"),
                            ("", "MoFlight_Synthetic_API37"),
                            ("emulator-5556", ""),
                            ("emulator-5556", "Unknown")]:
            with self.subTest(serial=serial, avd=avd), self.assertRaises(ValueError):
                require_synthetic(serial, avd)

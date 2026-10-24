"""Update proofs must reject unsafe device/artifact input before changing a package."""
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

SCRIPTS = Path(__file__).resolve().parents[1] / 'scripts'
sys.path.insert(0, str(SCRIPTS))
import android_update_preservation_smoke as proof


class UpdateProofSafetyTests(unittest.TestCase):
    def test_physical_or_unspecified_device_is_rejected_before_contact(self):
        for serial in ('', 'physical-phone', '192.0.2.1:5555'):
            with self.subTest(serial=serial), patch.object(proof, 'Smoke') as smoke:
                with self.assertRaisesRegex(ValueError, 'MoFlight_Synthetic_API37'):
                    proof.run(Path('unused'), Path('unused'), serial, Path('unused'))
                smoke.assert_not_called()

    def test_prior_evidence_is_preserved_before_device_contact(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(proof, 'Smoke') as smoke:
            marker = Path(folder) / 'preserved.txt'; marker.write_text('prior evidence')
            with self.assertRaisesRegex(ValueError, 'fresh evidence'):
                proof.run(Path('unused'), Path('unused'), 'emulator-5574', Path(folder))
            self.assertEqual(marker.read_text(), 'prior evidence')
            smoke.assert_not_called()

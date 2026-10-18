"""Launcher delivery contracts; standard-library execution, no image/model SDK."""
import json
from pathlib import Path
import shutil
import tempfile
import unittest

from scripts import launcher_icons as icons


class LauncherIconTests(unittest.TestCase):
    def test_approved_exports_are_opaque_or_mask_safe_and_configured(self):
        self.assertEqual(icons.check()['exports'], 2)
        config = json.loads((icons.ROOT / 'apps/platform-lab/app.json').read_text())['expo']
        self.assertEqual(config['android']['package'], 'de.momorc.moflight.lab')
        self.assertEqual(config['ios']['bundleIdentifier'], 'de.momorc.moflight.lab')
        self.assertFalse(config['android']['allowBackup'])

    def test_missing_config_corrupt_export_and_source_drift_are_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for relative in [icons.SOURCE, Path('apps/platform-lab/app.json')]:
                (root / relative).parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(icons.ROOT / relative, root / relative)
            shutil.copytree(icons.ROOT / icons.DEST, root / icons.DEST)
            config_path = root / 'apps/platform-lab/app.json'
            config = config_path.read_text()
            missing = json.loads(config)
            del missing['expo']['android']['adaptiveIcon']
            config_path.write_text(json.dumps(missing))
            with self.assertRaisesRegex(ValueError, 'adaptive/themed'):
                icons.check(root)
            config_path.write_text(config)
            asset = root / icons.DEST / 'icon.png'
            original = asset.read_bytes()
            asset.write_bytes(original[:-8])
            with self.assertRaisesRegex(ValueError, 'export changed'):
                icons.check(root)
            asset.write_bytes(original)
            (root / icons.SOURCE).write_bytes(b'changed synthetic source')
            with self.assertRaisesRegex(ValueError, 'source changed'):
                icons.check(root)


if __name__ == '__main__':
    unittest.main()

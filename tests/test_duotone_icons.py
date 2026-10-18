"""Native asset integrity without a CairoSVG/PNG library dependency in CI."""
import json
from pathlib import Path
import shutil
import tempfile
import unittest
import struct
import zlib

from scripts import duotone_icons as icons


class DuotoneAssetTests(unittest.TestCase):
    def test_visibility_requires_alpha_instead_of_nonzero_invisible_color(self):
        def png(alpha):
            def chunk(name, data):
                return struct.pack('>I', len(data)) + name + data + struct.pack('>I', zlib.crc32(name + data))
            header = struct.pack('>IIBBBBB', 2, 2, 8, 6, 0, 0, 0)
            raw = (b'\0' + bytes([255, 32, 4, alpha]) * 2) * 2
            return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', header) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b'')
        self.assertFalse(icons.has_visible_alpha(png(0), 2))
        self.assertTrue(icons.has_visible_alpha(png(128), 2))

    def test_complete_native_family_matches_sources_registry_and_rgba_assets(self):
        self.assertEqual(icons.check()['assets'], len(icons.GLYPHS) * len(icons.TONES))
        manifest = json.loads((icons.ROOT / icons.DEST / 'manifest.json').read_text())
        self.assertEqual(manifest['config']['selection'], {'H04': 'medical-card', 'N02': 'flight-paper-plane'})
        self.assertNotEqual(manifest['assets']['home-default.png']['sha256'], manifest['assets']['home-muted.png']['sha256'])

    def test_modified_or_missing_assets_fail_the_offline_freshness_gate(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for rel in [icons.MASTER, icons.REGISTRY]:
                (root / rel).parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(icons.ROOT / rel, root / rel)
            shutil.copytree(icons.ROOT / icons.DEST, root / icons.DEST)
            (root / icons.DEST / 'home-default.png').write_bytes(b'corrupt')
            with self.assertRaisesRegex(ValueError, 'RGBA PNG'):
                icons.check(root)
            (root / icons.DEST / 'home-default.png').unlink()
            with self.assertRaises(FileNotFoundError):
                icons.check(root)


if __name__ == '__main__':
    unittest.main()

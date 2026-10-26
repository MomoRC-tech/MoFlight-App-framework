"""Asset contract checks for the offline design generator; no app/model calls."""
from html.parser import HTMLParser
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from scripts import symbol_library as library


class Audit(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = []
        self.uses = []
        self.links = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if 'id' in attrs:
            self.ids.append(attrs['id'])
        if tag == 'use':
            self.uses.append(attrs['href'][1:])
        if tag == 'a':
            self.links.append(attrs['href'])


class SymbolLibraryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.outputs, cls.report = library.build()
        cls.page = cls.outputs[library.BASE / 'index.html']

    def test_every_semantic_id_is_explicit_and_selected_artwork_stays_preserved(self):
        manifest = json.loads(self.outputs[library.BASE / 'manifest.json'])
        self.assertEqual(len(manifest['mapping']), 50)
        self.assertEqual(manifest['mapping']['H04']['glyph'], 'medical-card')
        self.assertEqual(manifest['mapping']['D09']['glyph'], 'chart')
        for ident in ['H01', 'D07', 'D08', 'T01', 'T03', 'T04', 'T07', 'B01', 'B02', 'B03']:
            self.assertIsNone(manifest['mapping'][ident]['glyph'])
        self.assertEqual(self.report['glyphs'], 30)
        self.assertEqual(self.report['selected_ids'], 35)
        self.assertEqual(self.report['preserved_ids'], 15)
        self.assertFalse({'X01', 'X02', 'X03', 'B04'} & manifest['mapping'].keys())

    def test_incomplete_mapping_fails_instead_of_silently_omitting_a_symbol(self):
        with patch.dict(library.MAPPING, clear=True), self.assertRaisesRegex(ValueError, 'Every stable catalogue ID'):
            library.build()

    def test_combined_page_has_unique_ids_and_resolves_all_local_assets(self):
        for page_path, page in self.outputs.items():
            if page_path.suffix != '.html':
                continue
            audit = Audit()
            audit.feed(page)
            self.assertEqual(len(audit.ids), len(set(audit.ids)), page_path)
            self.assertFalse(set(audit.uses) - set(audit.ids), page_path)
            for href in audit.links:
                path = href.split('#')[0]
                if path:
                    target = library.BASE / path
                    self.assertTrue(target in self.outputs or (library.ROOT / target).is_file(), href)
        catalogue_audit = Audit()
        catalogue_audit.feed(self.page)
        self.assertTrue(set(library.MAPPING).issubset(catalogue_audit.ids))

    def test_library_exports_only_the_default_native_family(self):
        manifest = json.loads(self.outputs[library.BASE / 'manifest.json'])
        self.assertEqual(manifest['mapping']['N02']['glyph'], 'flight-paper-plane')
        self.assertEqual(manifest['mapping']['H04']['glyph'], 'medical-card')
        self.assertEqual({Path(p).stem for p in manifest['assets']}, set(library.GLYPHS))
        self.assertEqual({p.name for p in self.outputs if p.suffix == '.html'}, {'index.html'})
        self.assertNotIn('alternatives', manifest)
        self.assertIn('Med<small>unbekannt', self.page)

    def test_unselected_master_is_rejected(self):
        original = Path.read_text
        def with_old_master(path, *args, **kwargs):
            text = original(path, *args, **kwargs)
            if path.name == 'glyphs.svg':
                text = text.replace('</svg>', '<symbol id="retired-plane" viewBox="0 0 96 96"/></svg>')
            return text
        with patch.object(Path, 'read_text', with_old_master), self.assertRaisesRegex(ValueError, 'Unselected master'):
            library.build()

    def test_check_detects_obsolete_generated_assets_without_removing_them(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            base = root / library.BASE
            (base / 'assets').mkdir(parents=True)
            stale = base / 'assets/retired-plane.svg'
            stale.write_text('<svg/>', encoding='utf-8')
            self.assertEqual(library.unexpected_outputs(root, self.outputs), [str(stale.relative_to(root))])
            self.assertTrue(stale.exists())


if __name__ == '__main__':
    unittest.main()

"""Asset contract checks for the offline design generator; no app/model calls."""
import base64
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import unittest
from unittest.mock import patch

from scripts import icon_option_2 as option


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


class IconOptionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.outputs, cls.report = option.build()
        cls.page = cls.outputs[option.BASE / 'index.html']

    def test_every_semantic_id_is_explicit_and_selected_artwork_stays_preserved(self):
        manifest = json.loads(self.outputs[option.BASE / 'manifest.json'])
        self.assertEqual(len(manifest['mapping']), 51)
        self.assertEqual(manifest['mapping']['H04']['glyph'], 'medical')
        for ident in ['N02', 'H01', 'D07', 'D08', 'T01', 'T03', 'T04', 'B01', 'B02', 'B03']:
            self.assertIsNone(manifest['mapping'][ident]['glyph'])
        self.assertEqual(self.report['reference_compositions'], 18)

    def test_incomplete_mapping_fails_instead_of_silently_omitting_a_symbol(self):
        with patch.dict(option.MAPPING, clear=True), self.assertRaisesRegex(ValueError, 'Every stable catalogue ID'):
            option.build()

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
                    target = option.BASE / path
                    self.assertTrue(target in self.outputs or (option.ROOT / target).is_file(), href)
        catalogue_audit = Audit()
        catalogue_audit.feed(self.page)
        self.assertTrue(set(option.MAPPING).issubset(catalogue_audit.ids))

    def test_medical_and_flight_proposals_export_without_selecting_a_replacement(self):
        manifest = json.loads(self.outputs[option.BASE / 'manifest.json'])
        candidates = manifest['alternatives']['candidates']
        self.assertEqual({c['id'] for c in candidates}, {'M1', 'M2', 'M3', 'F1', 'F2', 'F3'})
        self.assertEqual({c['target'] for c in candidates}, {'H04', 'N02'})
        self.assertIsNone(manifest['mapping']['N02']['glyph'])
        self.assertEqual(manifest['mapping']['H04']['glyph'], 'medical')
        for candidate in candidates:
            self.assertIn(option.BASE / 'assets' / (candidate['glyph'] + '.svg'), self.outputs)
        page = self.outputs[option.BASE / 'alternatives.html']
        self.assertIn('Med<small>unbekannt', page)
        self.assertEqual({c['id'] for c in candidates if c['recommended']}, {'M1', 'F1'})

    def test_original_comparison_pixels_are_embedded_unchanged(self):
        encoded = re.search(r'<img class="reference-layer" src="data:image/jpeg;base64,([^"]+)"', self.page)
        self.assertIsNotNone(encoded)
        self.assertEqual(base64.b64decode(encoded[1]), (option.ROOT / option.BASE / 'reference.jpg').read_bytes())
        self.assertNotIn('https://', self.page)


if __name__ == '__main__':
    unittest.main()

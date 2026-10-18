"""Windows UTF-8 diagnostic evidence check; this does not prove native UI."""
import json
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path
from unittest.mock import patch

from scripts.android_smoke import Smoke


class DiagnosticTests(unittest.TestCase):
    def test_successful_log_collection_preserves_unicode_on_windows(self):
        with tempfile.TemporaryDirectory() as folder:
            smoke = Smoke(Path(folder))
            with patch.object(smoke, 'shell', return_value='Synthetic log · Ü'):
                smoke.finish('passed')
            self.assertEqual((Path(folder) / 'logcat.txt').read_text(encoding='utf-8'), 'Synthetic log · Ü')
            report = json.loads((Path(folder) / 'report.json').read_text(encoding='utf-8'))
            self.assertEqual(report['diagnostics']['status'], 'complete')


class EnabledAncestry(unittest.TestCase):
    def test_disabled_ancestor_cannot_be_bypassed_by_matching_child(self):
        with tempfile.TemporaryDirectory() as directory:
            smoke = Smoke(Path(directory))
            smoke.screen = ET.fromstring('''<hierarchy><node enabled="true">
              <node text="Retrieve" enabled="false" bounds="[0,0][100,50]">
                <node text="Retrieve" enabled="true" bounds="[10,10][90,40]"/>
              </node>
              <node text="Enabled action" enabled="true" bounds="[0,60][100,110]">
                <node text="Enabled label" enabled="true" bounds="[10,70][90,100]"/>
              </node></node></hierarchy>''')
            smoke.dump = lambda: list(smoke.screen.iter('node'))
            with patch('scripts.android_smoke.time.sleep'):
                with self.assertRaises(AssertionError):
                    smoke.find('Retrieve', exact=True, enabled=True, attempts=1)
            self.assertEqual(smoke.find('Retrieve', exact=True, enabled=False).get('enabled'), 'false')
            self.assertEqual(smoke.find('Enabled label', exact=True, enabled=True).get('text'), 'Enabled label')

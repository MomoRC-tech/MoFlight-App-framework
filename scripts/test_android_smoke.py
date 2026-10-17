"""Selector regression: an enabled text child cannot authorize a disabled action."""
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path
from unittest.mock import patch
from android_smoke import Smoke


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
            with patch('android_smoke.time.sleep'):
                with self.assertRaises(AssertionError):
                    smoke.find('Retrieve', exact=True, enabled=True, attempts=1)
            self.assertEqual(smoke.find('Retrieve', exact=True, enabled=False).get('enabled'), 'false')
            self.assertEqual(smoke.find('Enabled label', exact=True, enabled=True).get('text'), 'Enabled label')


if __name__ == '__main__':
    unittest.main()

"""Windows UTF-8 diagnostic evidence check; this does not prove native UI."""
import json
import tempfile
import unittest
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

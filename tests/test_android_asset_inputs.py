"""Exercise the real Gradle input rule without an Android project or SDK."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


@unittest.skipUnless(os.environ.get('MOFLIGHT_TEST_GRADLE'), 'Set MOFLIGHT_TEST_GRADLE for focused Gradle execution')
class AssetInputTests(unittest.TestCase):
    def test_image_only_change_invalidates_bundle_but_noop_stays_cached(self):
        with tempfile.TemporaryDirectory(prefix='moflight-assets-') as folder:
            app = Path(folder)
            android = app / 'android'
            android.mkdir()
            asset = app / 'assets/fixture.png'
            asset.parent.mkdir()
            asset.write_bytes(b'synthetic image A')
            (android / 'settings.gradle').write_text("rootProject.name = 'synthetic-assets'\n")
            (android / 'build.gradle').write_text("""
tasks.register('createBundleReleaseJsAndAssets') {
    inputs.files(fileTree('..') { include '**/*.js' })
    outputs.file(layout.buildDirectory.file('packaged.png'))
    doLast { file('build/packaged.png').bytes = file('../assets/fixture.png').bytes }
}
""")
            def run():
                # A Windows Gradle daemon may inherit a captured stdout pipe.
                # File-backed diagnostics avoid waiting on the daemon for EOF.
                log_path = app / 'gradle.log'
                with log_path.open('wb') as log:
                    result = subprocess.run([os.environ['MOFLIGHT_TEST_GRADLE'],
                        '--offline', '--console=plain', '--max-workers=2', '--init-script',
                        str(ROOT / 'scripts/android-source-input.gradle'), 'createBundleReleaseJsAndAssets'],
                        cwd=android, env=dict(os.environ, EXPO_PUBLIC_MOFLIGHT_SOURCE='same-source'),
                        stdout=log, stderr=subprocess.STDOUT, timeout=60)
                output = log_path.read_text(encoding='utf-8', errors='replace')
                self.assertEqual(result.returncode, 0, output)
                return output
            run()
            self.assertEqual((android / 'build/packaged.png').read_bytes(), b'synthetic image A')
            asset.write_bytes(b'synthetic image B')
            changed = run()
            self.assertNotIn(':createBundleReleaseJsAndAssets UP-TO-DATE', changed)
            self.assertEqual((android / 'build/packaged.png').read_bytes(), b'synthetic image B')
            self.assertIn(':createBundleReleaseJsAndAssets UP-TO-DATE', run())

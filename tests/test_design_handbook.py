"""Documentation generation, portable assets, links and handoff integrity."""
import base64
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from scripts import design_handbook as guide


class HandbookGenerationTests(unittest.TestCase):
    def test_full_handoff_preserves_all_symbol_ids_and_matches_html(self):
        outputs,report=guide.build()
        self.assertEqual(report['symbols'],51)
        self.assertEqual(report['html_pages'],2)
        self.assertEqual(report['embedded_images'][str(guide.DESIGN/'design-guide.html').replace('\\','/')],8)
        text=outputs[guide.DESIGN/'design-brief.txt']
        for ident in ['N01','N05','H04','S02','A12','T06','X03','B04']:
            self.assertIn(ident+' · ',text)
        self.assertIn('No new visual choice is needed',text)
        self.assertNotIn('base64,',text)

    def test_rendered_export_cannot_omit_a_symbol_or_copyable_entry(self):
        outputs,_=guide.build()
        path=guide.DESIGN/'design-guide.html'
        outputs[path]=outputs[path].replace('id="H04"','id="missing-medical"')
        with self.assertRaisesRegex(ValueError,'Missing rendered symbols'):
            guide.validate_html(outputs,['H04'])

    def test_asset_embedding_preserves_original_bytes(self):
        path=Path('apps/platform-lab/assets/icons/aircraft-side.png')
        uri=guide.asset_uri(path)
        self.assertEqual(base64.b64decode(uri.split(',',1)[1]),(guide.ROOT/path).read_bytes())
        with self.assertRaises(ValueError): guide.asset_uri(Path('../outside.png'))

    def test_check_is_read_only_and_detects_stale_output(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);outputs={Path('guide.txt'):'new\n'}
            self.assertEqual(guide.write_outputs(outputs,root,check=True),['guide.txt'])
            self.assertFalse((root/'guide.txt').exists())
            guide.write_outputs(outputs,root)
            self.assertEqual(guide.write_outputs(outputs,root,check=True),[])
            (root/'guide.txt').write_text('stale\n',encoding='utf-8')
            self.assertEqual(guide.write_outputs(outputs,root,check=True),['guide.txt'])
            self.assertEqual((root/'guide.txt').read_text(),'stale\n')

    def test_source_color_change_requires_regeneration(self):
        outputs,report=guide.build()
        original=guide.read
        def changed(path):
            text=original(path)
            return text.replace("background: '#000d18'","background: '#010e19'") if path==guide.ROOT/guide.MOBILE/'theme.tsx' else text
        with patch.object(guide,'read',side_effect=changed):
            changed_outputs,changed_report=guide.build()
        self.assertNotEqual(report['input_sha256'],changed_report['input_sha256'])
        self.assertIn('#010e19',changed_outputs[guide.DESIGN/'foundations.md'])
        self.assertNotEqual(outputs[guide.DESIGN/'design-guide.html'],changed_outputs[guide.DESIGN/'design-guide.html'])

    def test_broken_markdown_anchor_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);(root/'page.md').write_text('# Present\n',encoding='utf-8')
            with self.assertRaisesRegex(ValueError,'missing anchor'):
                guide.validate_links('[broken](page.md#absent)',Path('index.md'),{},root)
            with self.assertRaisesRegex(ValueError,'missing link'):
                guide.validate_links('[missing](absent.md)',Path('index.md'),{},root)

    def test_export_links_rebase_to_chapters_and_reject_unsafe_protocols(self):
        origin=guide.DESIGN/'README.md';output=guide.DESIGN/'design-guide.html'
        self.assertEqual(guide.output_href('foundations.md#typography',origin,output,True),'#chapter-foundations-typography')
        self.assertEqual(guide.output_href('../symbol-reference.html#H04',origin,output,True),'#H04')
        with self.assertRaises(ValueError): guide.local_target('javascript:alert(1)',origin)
        with self.assertRaises(ValueError): guide.local_target('../../../../outside.md',origin)

    def test_supported_markdown_escapes_code_and_rejects_unhandled_html(self):
        origin=guide.DESIGN/'README.md';output=guide.DESIGN/'design-guide.html'
        rendered=guide.render_markdown('# Heading\n\n| One | Two |\n| --- | --- |\n| `#000d18` | **Text** |\n\n```html\n<script>example</script>\n```',origin,output)
        self.assertIn('chapter-overview-heading',rendered)
        self.assertIn('&lt;script&gt;',rendered)
        self.assertIn('<strong>Text</strong>',rendered)
        repeated=guide.render_markdown('## Colors\n\n## Colors',origin,output)
        self.assertIn('chapter-overview-colors-1',repeated)
        with self.assertRaises(ValueError): guide.render_markdown('<script>bad</script>',origin,output)
        with self.assertRaises(ValueError): guide.render_markdown('#',origin,output)

    def test_executable_sample_attributes_are_rejected(self):
        with self.assertRaises(ValueError): guide.SampleValidator().feed('<img src="asset:x.png" onerror="alert(1)">')
        with self.assertRaises(ValueError): guide.SampleValidator().feed('<script>bad</script>')

    def test_contrast_calculation_known_limits_and_alpha_rejection(self):
        self.assertAlmostEqual(guide.contrast('#ffffff','#000000'),21)
        self.assertAlmostEqual(guide.contrast('#123456','#123456'),1)
        with self.assertRaises(ValueError): guide.contrast('#ffffff80','#000000')


if __name__=='__main__':
    unittest.main()

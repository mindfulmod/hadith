import importlib.util
import json
import re
import shutil
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('jk_intake',ROOT/'scripts/import-bukhari-jk.py')
jk = importlib.util.module_from_spec(spec)
spec.loader.exec_module(jk)


class ArabicEditionInventoryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.raw = (jk.SOURCE/'source.mARkdown').read_bytes()
        cls.result = jk.build_inventory()

    def test_every_source_byte_is_preserved_once(self):
        blocks = self.result['blocks']
        self.assertEqual(blocks[0]['start'],0)
        self.assertEqual(blocks[-1]['end'],len(self.raw))
        for previous,current in zip(blocks,blocks[1:]):
            self.assertEqual(previous['end'],current['start'])
            self.assertEqual(previous['lineEnd']+1,current['lineStart'])
        for block in blocks:
            raw = self.raw[block['start']:block['end']]
            self.assertEqual(jk.digest(raw),block['sha256'])
            self.assertEqual(len(raw.splitlines()),block['lineEnd']-block['lineStart']+1)
        self.assertEqual(b''.join(self.raw[b['start']:b['end']] for b in blocks),self.raw)

    def test_all_source_markers_are_accounted_for_independently(self):
        text = self.raw.decode()
        numeric = list(re.finditer(r'^# ([0-9]+) ',text,re.M))
        headings = list(re.finditer(r'^### \|+',text,re.M))
        reports = [b for b in self.result['blocks'] if b['kind']=='report']
        self.assertEqual(len(numeric),7135)
        self.assertEqual(len(headings),4059)
        self.assertEqual(len(reports),7129)
        self.assertEqual(len(self.result['blocks']),len(numeric)+len(headings)+1)
        self.assertEqual(self.result['audit']['missingNumericLabels'],[])
        self.assertEqual(self.result['audit']['emptyRecords'],[])
        self.assertFalse(self.result['readerEligible'])
        self.assertTrue(all(b['status']=='unreviewed' for b in reports))

    def test_duplicate_and_suffixed_references_keep_distinct_content(self):
        reports = [b for b in self.result['blocks'] if b['kind']=='report']
        duplicates = [b for b in reports if b['reference']['label']=='3905']
        self.assertEqual([b['reference']['occurrence'] for b in duplicates],[1,2])
        self.assertEqual(len({b['id'] for b in duplicates}),2)
        self.assertNotEqual(duplicates[0]['sha256'],duplicates[1]['sha256'])
        self.assertEqual(self.result['audit']['suffixedReferences'],['619 م','4537 م','4626 م','6705 م'])
        self.assertEqual({b['reference']['number'] for b in reports},set(range(1,7125)))

    def test_six_numeric_chapter_headings_are_not_hadith(self):
        marked = [b for b in self.result['blocks'] if b.get('issue')=='chapter-heading-uses-report-marker']
        self.assertEqual([b['lineStart'] for b in marked],[4808,20679,30190,32250,41074,43213])
        self.assertTrue(all(b['kind']=='heading-context' and 'reference' not in b for b in marked))
        for block in marked:
            self.assertIn('باب',self.raw[block['start']:block['end']].decode())

    def test_multiline_context_and_nested_headings_are_not_absorbed_into_reports(self):
        raw=('######OpenITI#\n# metadata\n### | ( باب أول )\n# introduction\n'
             '### || ( 1 باب عنوان\n~~استمرار العنوان\n# تعليق مستقل\n'
             '### ||| عنوان فرعي\n# 1 حدثنا راو\n~~النص الأول\n'
             '# 2 باب آخر\n# مادة الباب\n# 2 م حدثنا راو\n~~النص الثاني\n').encode()
        result=jk.inventory(raw,{'id':'fixture','expectedSectionCount':1,'expectedNumberRange':[1,2]})
        reports=[b for b in result['blocks'] if b['kind']=='report']
        self.assertEqual(len(reports[0]['headingIds']),2)
        self.assertEqual(len(reports[1]['headingIds']),1)
        self.assertNotIn('تعليق مستقل',raw[reports[0]['start']:reports[0]['end']].decode())
        self.assertIn('تعليق مستقل',raw.decode())
        self.assertEqual(reports[1]['reference']['label'],'2 م')

    def test_unknown_structure_and_invalid_utf8_fail(self):
        manifest={'id':'fixture','expectedSectionCount':1,'expectedNumberRange':[1,2]}
        base=b'######OpenITI#\n### | section\n# 1 body\n'
        for raw in [base.replace(b'### | ',b'### |'),base.replace(b'# 1 ',b'# 1-'),base.replace(b'# 1 ',b'# 3 '),base+b'\xff']:
            with self.assertRaises((ValueError,UnicodeDecodeError)):
                jk.inventory(raw,manifest)
        with self.assertRaises(ValueError):
            jk.inventory(base,{**manifest,'expectedSectionCount':2})

    def test_source_and_metadata_modification_is_rejected(self):
        for name in ['source.mARkdown','upstream.yml']:
            with tempfile.TemporaryDirectory() as out:
                base=Path(out)
                for path in jk.SOURCE.iterdir():
                    if path.is_file():shutil.copyfile(path,base/path.name)
                with (base/name).open('ab') as stream:stream.write(b'changed')
                with self.assertRaisesRegex(ValueError,'Source integrity failed'):
                    jk.build_inventory(base)

    def test_committed_inventory_reproduces_and_sources_are_not_in_reader(self):
        self.assertEqual(json.loads(jk.OUTPUT.read_text()),self.result)
        published=json.loads((ROOT/'reader/books/catalog.json').read_text())
        self.assertEqual([e['number'] for e in published['entries']],list(range(1,332)))
        self.assertEqual(published['publication'],'personal-prototype')
        self.assertTrue(all(e['id'].startswith('bukhari:') for e in published['entries']))
        release=(ROOT/'reader/release.mjs').read_text()
        self.assertNotIn('openiti-bukhari-jk',release)
        self.assertNotIn('bukhari-ar-jk',release)


if __name__=='__main__':
    unittest.main()

import unittest,json,importlib.util
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def module(name,file):
 s=importlib.util.spec_from_file_location(name,ROOT/'scripts'/file);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
audit=module('adhan_audit','audit-wikisource-layout.py');book=module('adhan_book','import-wikisource-book.py')
class AdhanIntakeTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.directory=ROOT/'content/sources/wikisource-adhan';cls.manifest=json.loads((cls.directory/'manifest.json').read_text());cls.raw=(cls.directory/'source.html').read_bytes();cls.data=audit.build(cls.directory)
 def test_every_source_character_and_duplicate_marker_remain(self):
  d=self.data;s=d['summary'];self.assertEqual((s['blocks'],s['htmlHeadings'],s['numberedMarkers'],s['uniqueNumericLabels']),(224,80,122,121));self.assertEqual(s['numericRange'],[578,698]);self.assertEqual(s['sourceCodePoints'],39955);self.assertEqual(s['coveredCodePoints'],39955);self.assertEqual(s['duplicateLabels'],[{'number':619,'occurrences':2}]);markers=[m for m in d['markers']if m['number']==619];self.assertEqual([m['blockId']for m in markers],['mwiA','mwig']);self.assertNotEqual(markers[0]['id'],markers[1]['id'])
  for b in d['blocks']:
   spans=[s for s in d['segments']if s['blockId']==b['htmlId']];position=0;parts=[]
   for s in spans:self.assertEqual(s['start'],position);parts.append(b['text'][s['start']:s['end']]);position=s['end']
   self.assertEqual(position,len(b['text']));self.assertEqual(''.join(parts),b['text'])
 def test_ordinary_import_refuses_ambiguous_numbering(self):
  with self.assertRaisesRegex(ValueError,'duplicate-number-label'):book.extract(self.raw,self.manifest)
 def test_candidate_is_reproducible_and_cannot_enter_the_reader(self):
  self.assertEqual(self.data,json.loads((ROOT/'content/staging/bukhari-adhan-wikisource/layout-audit.json').read_text()));self.assertFalse(self.data['readerEligible']);self.assertEqual(self.data['status'],'candidate-layout-review-required');self.assertNotIn('records',self.data)
  registry=json.loads((ROOT/'content/sources/wikisource-books.json').read_text());row=next(x for x in registry['pendingLayoutAudits']if x['id']=='adhan');self.assertEqual(row['resolution'],'content/review/adhan-layout-review.json');self.assertEqual(row['inventory'],'content/staging/bukhari-adhan-wikisource/catalog.json');self.assertFalse(any(b['id']=='adhan'for b in json.loads((ROOT/'reader/books/catalog.json').read_text())['books']));self.assertNotIn('wikisource-adhan',(ROOT/'reader/release.mjs').read_text())
if __name__=='__main__':unittest.main()

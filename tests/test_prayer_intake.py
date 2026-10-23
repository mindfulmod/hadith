from published_fixture import LAST_NUMBER,BOOK_RANGES
import copy,importlib.util,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('resolution',ROOT/'scripts/resolve-wikisource-layout.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class PrayerIntakeTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.audit=m.audit_tool.build(ROOT/'content/sources/wikisource-prayer');cls.review=m.read(ROOT/'content/review/prayer-layout-review.json');cls.english=m.read(ROOT/'content/staging/bukhari-en-islamhouse/catalog.json');cls.result=m.resolve(cls.audit,cls.review,cls.english)
 def test_every_original_character_and_marker_remains_owned_once(self):
  r=self.result;self.assertEqual(len(r['originalBlocks']),305);self.assertEqual(len(r['blocks']),306);self.assertEqual(sum(len(b['text'])for b in r['blocks']),56260)
  for original in r['originalBlocks']:self.assertEqual(''.join(b['text']for b in r['blocks']if b['origin']['blockId']==original['htmlId']),original['text'])
  owned=r['blankIds']+r['formattingIds']+[x for c in r['chapters']for x in [c['headingId'],*c['contextIds']]]+[x for e in r['records']for x in e['paragraphIds']]
  self.assertEqual(len(owned),len(set(owned)));self.assertEqual(set(owned),{b['htmlId']for b in r['blocks']});self.assertEqual(r,m.read(ROOT/'content/staging/bukhari-prayer-wikisource/catalog.json'))
 def test_leading_newlines_are_preserved_and_do_not_join_distinct_reports(self):
  with self.assertRaisesRegex(ValueError,'explicit boundary review'):m.layout.require_simple_layout(self.audit['blocks'])
  r=self.result;self.assertEqual(r['blankIds'],['mwAaI@0-2','mwAe0']);self.assertEqual(next(b['text']for b in r['blocks']if b['htmlId']=='mwAaI@0-2'),'\n\n');a=next(e for e in r['records']if e['number']==453);self.assertEqual(a['sourceReference']['markerId'],'mwAaI:2');self.assertEqual(a['paragraphIds'],['mwAaI@2-243']);self.assertEqual(next(e for e in r['records']if e['number']==452)['paragraphIds'],['mwAZ8'])
 def test_missing_whitespace_markers_or_printed_proof_cannot_be_silently_accepted(self):
  for change in [lambda r:r['decisions'][0]['units'].pop(0),lambda r:r['decisions'][0]['units'][0].update(end=3),lambda r:r['decisions'][0]['units'][1].update(number=452),lambda r:r['decisions'][0]['printedWitnesses'].pop(),lambda r:r.update(auditSha256='0'*64)]:
   review=copy.deepcopy(self.review);change(review)
   with self.assertRaises(ValueError):m.resolve(self.audit,review,self.english)
 def test_intake_does_not_publish_unadmitted_candidates(self):
  r=self.result;self.assertFalse(r['readerEligible']);self.assertEqual([e['number']for e in r['records']],list(range(342,499)));self.assertEqual(len(r['chapters']),108)
  c=m.read(ROOT/'reader/books/catalog.json');self.assertEqual([e['number']for e in c['entries']if e['bookId']=='prayer'],list(BOOK_RANGES['prayer']));self.assertFalse(any(e['number']>LAST_NUMBER for e in c['entries']))
if __name__=='__main__':unittest.main()

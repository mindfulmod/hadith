import copy,importlib.util,json,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('resolution',ROOT/'scripts/resolve-wikisource-layout.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class TayammumIntakeTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.audit=m.audit_tool.build(ROOT/'content/sources/wikisource-tayammum');cls.review=m.read(ROOT/'content/review/tayammum-layout-review.json');cls.english=m.read(ROOT/'content/staging/bukhari-en-islamhouse/catalog.json');cls.result=m.resolve(cls.audit,cls.review,cls.english)
 def test_every_original_character_is_preserved_with_one_explicit_owner(self):
  r=self.result;self.assertEqual(len(r['originalBlocks']),25);self.assertEqual(len(r['blocks']),29);self.assertEqual(sum(len(b['text'])for b in r['blocks']),8062)
  for original in r['originalBlocks']:self.assertEqual(''.join(b['text']for b in r['blocks']if b['origin']['blockId']==original['htmlId']),original['text'])
  owned=r['blankIds']+r['formattingIds']+r['editorialArtifactIds']+[x for c in r['chapters']for x in [c['headingId'],*c['contextIds']]]+[x for e in r['records']for x in e['paragraphIds']]
  self.assertEqual(len(owned),len(set(owned)));self.assertEqual(set(owned),{b['htmlId']for b in r['blocks']});self.assertEqual(r,m.read(ROOT/'content/staging/bukhari-tayammum-wikisource/catalog.json'))
 def test_unformatted_chapter_and_editor_placeholder_cannot_be_imported_as_report_329(self):
  with self.assertRaisesRegex(ValueError,'explicit boundary review'):m.layout.require_simple_layout(self.audit['blocks'])
  r=self.result;self.assertEqual(r['records'][2]['paragraphIds'],['mwGg']);self.assertEqual(r['chapters'][2],{'id':'chapter-03','headingId':'mwHw@12-64','contextIds':['mwHw@67-233'],'entryNumbers':[330]});self.assertEqual(r['editorialArtifactIds'],['mwHw@0-9']);self.assertEqual(r['formattingIds'],['mwHw@9-12','mwHw@64-67']);self.assertEqual(next(b['text']for b in r['blocks']if b['role']=='editorial-artifact'),"'نص غليظ'")
 def test_discarded_text_stale_boundaries_or_missing_witnesses_are_rejected(self):
  for mutate in [lambda r:r['decisions'][0]['units'][0].update(kind='blank'),lambda r:r['decisions'][0]['units'][0].update(kind='formatting'),lambda r:r['decisions'][0]['units'][4].update(kind='editorial-artifact'),lambda r:r['decisions'][0]['units'][0].update(end=8),lambda r:r['decisions'][0]['printedWitnesses'].pop(),lambda r:r.update(auditSha256='0'*64),lambda r:r['decisions'][0]['units'].pop()]:
   review=copy.deepcopy(self.review);mutate(review)
   with self.assertRaises(ValueError):m.resolve(self.audit,review,self.english)
 def test_structural_intake_remains_ineligible_while_separately_reviewed_book_is_published(self):
  self.assertFalse(self.result['readerEligible']);self.assertEqual([r['number']for r in self.result['records']],list(range(327,342)));self.assertEqual(len(self.result['chapters']),8)
  catalog=m.read(ROOT/'reader/books/catalog.json');self.assertEqual([r['number']for r in catalog['entries']if r['bookId']=='tayammum'],list(range(327,342)));self.assertFalse(any(r['number']>=342 for r in catalog['entries']))
if __name__=='__main__':unittest.main()

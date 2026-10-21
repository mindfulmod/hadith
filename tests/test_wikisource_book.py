import copy,importlib.util,json,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('book',ROOT/'scripts/import-wikisource-book.py');book=importlib.util.module_from_spec(spec);spec.loader.exec_module(book)
class WikisourceBookTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.directory=ROOT/'content/sources/wikisource-faith';cls.manifest=json.loads((cls.directory/'manifest.json').read_text());cls.raw=(cls.directory/'source.html').read_bytes();cls.result=book.build(cls.directory)
 def test_all_numbered_spans_headings_context_and_blank_blocks_have_one_owner(self):
  d=self.result;self.assertEqual([r['number']for r in d['records']],list(range(8,59)));self.assertEqual(len(d['chapters']),42);self.assertEqual(len(d['blocks']),163)
  ids=d['blankIds']+[i for c in d['chapters']for i in [c['headingId'],*c['contextIds']]]+[i for r in d['records']for i in r['paragraphIds']]
  self.assertEqual(len(ids),len(set(ids)));self.assertEqual(set(ids),{b['htmlId']for b in d['blocks']});self.assertFalse(d['readerEligible'])
 def test_chapter_introductions_and_transmission_notes_are_not_discarded_or_confused(self):
  d=self.result;self.assertEqual(d['chapters'][0]['contextIds'],['mwBw','mwCA']);self.assertEqual(d['records'][0]['paragraphIds'],['mwCQ','mwCw'])
  self.assertEqual(d['records'][2]['paragraphIds'],['mwEg','mwFA','mwFQ']);self.assertEqual(d['blankIds'],['mw8g'])
  self.assertEqual(next(b['text']for b in d['blocks']if b['htmlId']=='mw8g'),'\n')
 def test_raw_revision_block_and_number_changes_fail_closed(self):
  with self.assertRaises(ValueError):book.extract(self.raw+b'changed',self.manifest)
  for old,new in [(b'"wgRevisionId":490285',b'"wgRevisionId":490286'),(b'[17]',b'[16]'),(b'<p id="mw8g">',b'<p id="mwNA">')]:
   self.assertIn(old,self.raw);raw=self.raw.replace(old,new,1);m=copy.deepcopy(self.manifest);m['file'].update(bytes=len(raw),sha256=book.sha(raw))
   with self.assertRaises(ValueError):book.extract(raw,m)
 def test_committed_inventory_is_reproducible(self):
  self.assertEqual(json.loads((ROOT/'content/staging/bukhari-faith-wikisource/catalog.json').read_text()),self.result)
if __name__=='__main__':unittest.main()

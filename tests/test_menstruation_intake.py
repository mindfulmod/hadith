import copy,importlib.util,json,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('book',ROOT/'scripts/import-wikisource-book.py');book=importlib.util.module_from_spec(spec);spec.loader.exec_module(book)
class MenstruationIntakeTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.directory=ROOT/'content/sources/wikisource-menstruation';cls.m=json.loads((cls.directory/'manifest.json').read_text());cls.raw=(cls.directory/'source.html').read_bytes();cls.i=book.build(cls.directory)
 def test_complete_intake_has_exact_ownership_without_admitting_unreviewed_entries(self):
  i=self.i;self.assertEqual(len(i['blocks']),74);self.assertEqual(len(i['chapters']),29);self.assertEqual([r['number']for r in i['records']],list(range(290,327)))
  owned=[b['htmlId']for b in i['bookIntroduction']['blocks']]+i['blankIds']+[x for c in i['chapters']for x in [c['headingId'],*c['contextIds']]]+[x for r in i['records']for x in r['paragraphIds']]
  self.assertEqual(len(owned),len(set(owned)));self.assertEqual(set(owned),{b['htmlId']for b in i['blocks']});self.assertEqual(sum(len(c['contextIds'])for c in i['chapters']),7)
  self.assertFalse(i['readerEligible']);self.assertTrue(all(r['status']=='unreviewed'for r in i['records']));self.assertEqual(book.encoded(i),(ROOT/'content/staging/bukhari-menstruation-wikisource/catalog.json').read_text())
  published=json.loads((ROOT/'reader/books/catalog.json').read_text());self.assertFalse(any(e['number']>=327 for e in published['entries']))
 def test_opening_quotation_and_context_are_not_attached_to_the_first_numbered_report(self):
  i=self.i;self.assertEqual(i['bookIntroduction']['blocks'][0]['htmlId'],'mwBA');self.assertEqual(i['chapters'][0]['contextIds'],['mwBw']);self.assertEqual(i['records'][0]['paragraphIds'],['mwCg']);self.assertEqual(i['chapters'][0]['entryNumbers'],[290]);self.assertEqual(i['chapters'][2]['contextIds'],['mwHQ'])
  self.assertEqual(i['blocks'][0]['text'],'وقول الله تعالى { ويسألونك عن المحيض قل هو أذى } إلى قوله { ويحب المتطهرين }')
 def test_a_changed_quotation_or_reporting_verb_cannot_reuse_the_old_source_pins(self):
  raw=self.raw.replace('أخبرتني عائشة'.encode(),'أخبرني عائشة'.encode(),1);self.assertNotEqual(raw,self.raw)
  with self.assertRaisesRegex(ValueError,'integrity'):book.extract(raw,self.m)
  m=copy.deepcopy(self.m);m['bookIntroduction']['blocks'][0]['textSha256']='0'*64
  with self.assertRaisesRegex(ValueError,'exact text changed'):book.extract(self.raw,m)

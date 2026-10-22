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
class KnowledgeInventoryTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.directory=ROOT/'content/sources/wikisource-knowledge';cls.manifest=json.loads((cls.directory/'manifest.json').read_text());cls.raw=(cls.directory/'source.html').read_bytes();cls.result=book.build(cls.directory)
 def test_every_numbered_report_and_source_block_has_one_owner(self):
  d=self.result;self.assertEqual([r['number']for r in d['records']],list(range(59,135)));self.assertEqual(len(d['chapters']),54);self.assertEqual(len(d['blocks']),178)
  owned=d['blankIds']+[i for c in d['chapters']for i in [c['headingId'],*c['contextIds']]]+[i for r in d['records']for i in r['paragraphIds']]
  self.assertEqual(len(owned),len(set(owned)));self.assertEqual(set(owned),{b['htmlId']for b in d['blocks']});self.assertFalse(d['readerEligible']);self.assertEqual(d['status'],'candidate-not-approved')
 def test_standalone_chapter_material_is_not_dropped_or_given_hadith_numbers(self):
  d=self.result;chapters=[c for c in d['chapters']if not c['entryNumbers']]
  self.assertEqual([c['id']for c in chapters],['chapter-01','chapter-06','chapter-11']);self.assertEqual([c['contextIds']for c in chapters],[['mwCA'],[],['mwRw']])
  self.assertEqual(d['records'][0]['chapterId'],'chapter-02');self.assertEqual(d['records'][0]['paragraphIds'],['mwCg','mwCw'])
  self.assertEqual(d['records'][-1]['paragraphIds'],['mwATs']);self.assertEqual(d['blankIds'],['mwBA'])
  self.assertEqual(sum(len(c['contextIds'])for c in d['chapters']),13)
 def test_the_pinned_knowledge_inventory_is_exact_and_repeatable(self):
  d=self.result;self.assertEqual(json.loads((ROOT/'content/staging/bukhari-knowledge-wikisource/catalog.json').read_text()),d)
  for block in d['blocks']:self.assertEqual(book.sha(block['text']),block['textSha256'])
  self.assertTrue(next(b['text']for b in d['blocks']if b['htmlId']=='mwDw').endswith(' '));self.assertEqual(d['blocks'][0]['text'],'\n')
  for old,new in [(b'"wgRevisionId":252975',b'"wgRevisionId":252976'),(b'[134]',b'[133]'),('id="باب_من_رفع_صوته_بالعلم"'.encode(),'id="mwCg"'.encode())]:
   self.assertIn(old,self.raw);raw=self.raw.replace(old,new,1);m=copy.deepcopy(self.manifest);m['file'].update(bytes=len(raw),sha256=book.sha(raw))
   with self.assertRaises(ValueError):book.extract(raw,m)
 def test_all_registered_sources_are_checked_and_intake_stays_unpublished(self):
  registry=json.loads((ROOT/'content/sources/wikisource-books.json').read_text());results=book.build_registered(registry,check=True)
  self.assertEqual([id for id,_ in results],['faith','knowledge'])
  self.assertEqual([len(d['records'])for _,d in results],[51,76]);self.assertTrue(all(not d['readerEligible']for _,d in results))
  published=json.loads((ROOT/'reader/books/catalog.json').read_text());self.assertEqual(published['entries'][-1]['number'],155)
  self.assertEqual(next(b for b in published['books']if b['id']=='knowledge')['entryNumbers'],list(range(59,135)))
  self.assertNotIn('content/staging/bukhari-knowledge-wikisource', (ROOT/'reader/release.mjs').read_text())
 def test_registry_refuses_duplicates_and_unexpected_paths(self):
  registry=json.loads((ROOT/'content/sources/wikisource-books.json').read_text())
  for mutate in [lambda d:d['books'].append(d['books'][0]),lambda d:d['books'][1].update(id='../secret'),lambda d:d['books'][1].update(sourceDirectory='/tmp/untrusted'),lambda d:d['books'][1].update(inventory='content/staging/../../reader/index.html'),lambda d:d.update(schemaVersion=2)]:
   bad=copy.deepcopy(registry);mutate(bad)
   with self.assertRaises(ValueError):book.inventory_paths(bad)
 def test_registry_and_manifest_cannot_read_outside_the_declared_source(self):
  import tempfile
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);(root/'content/sources').mkdir(parents=True);(root/'content/sources/wikisource-knowledge').symlink_to(self.directory,target_is_directory=True)
   registry={'schemaVersion':1,'books':[{'id':'knowledge','sourceDirectory':'content/sources/wikisource-knowledge','inventory':'content/staging/bukhari-knowledge-wikisource/catalog.json'}]}
   with self.assertRaises(ValueError):book.inventory_paths(registry,root=root)
   fake=root/'fake';fake.mkdir();m=copy.deepcopy(self.manifest);m['file']['path']='../source.html';(fake/'manifest.json').write_text(json.dumps(m))
   with self.assertRaises(ValueError):book.build(fake)

if __name__=='__main__':unittest.main()

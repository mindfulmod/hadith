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
  self.assertEqual([id for id,_ in results],['faith','knowledge','ghusl','menstruation'])
  self.assertEqual([len(d['records'])for _,d in results],[51,76,45,37]);self.assertTrue(all(not d['readerEligible']for _,d in results))
  published=json.loads((ROOT/'reader/books/catalog.json').read_text());self.assertEqual(published['entries'][-1]['number'],297)
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

class GhuslIntroductionTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.directory=ROOT/'content/sources/wikisource-ghusl';cls.manifest=json.loads((cls.directory/'manifest.json').read_text());cls.raw=(cls.directory/'source.html').read_bytes();cls.result=book.build(cls.directory)
 def extract_changed(self,raw,manifest=None):
  m=copy.deepcopy(manifest or self.manifest);m['file'].update(bytes=len(raw),sha256=book.sha(raw));return book.extract(raw,m)
 def test_book_introduction_and_every_source_block_have_separate_exact_ownership(self):
  d=self.result;self.assertEqual([r['number']for r in d['records']],list(range(245,290)));self.assertEqual(len(d['chapters']),29);self.assertEqual(len(d['blocks']),79)
  intro=[p['htmlId']for p in d['bookIntroduction']['blocks']];self.assertEqual(intro,['mwBA'])
  owned=intro+d['blankIds']+[i for c in d['chapters']for i in [c['headingId'],*c['contextIds']]]+[i for r in d['records']for i in r['paragraphIds']]
  self.assertEqual(len(owned),len(set(owned)));self.assertEqual(set(owned),{b['htmlId']for b in d['blocks']})
  self.assertEqual(d['chapters'][0]['id'],'chapter-01');self.assertEqual(d['chapters'][0]['contextIds'],[]);self.assertEqual(d['records'][0]['paragraphIds'],['mwBw'])
  self.assertFalse(d['readerEligible']);self.assertEqual(d['status'],'candidate-not-approved')
 def test_introduction_preserves_source_spelling_and_whitespace_without_normalizing(self):
  d=self.result;b=next(b for b in d['blocks']if b['htmlId']=='mwBA');self.assertTrue(b['text'].endswith(' '));self.assertIn('لمستم النساء',b['text'])
  self.assertEqual(d['bookIntroduction']['blocks'],[{'htmlId':'mwBA','textSha256':book.sha(b['text'])}]);self.assertEqual(d['bookIntroduction'],self.manifest['bookIntroduction'])
  self.assertEqual((ROOT/'content/staging/bukhari-ghusl-wikisource/catalog.json').read_text(),book.encoded(d))
 def test_undeclared_null_empty_or_invalid_introduction_fails_closed(self):
  for mutate in [lambda m:m.pop('bookIntroduction'),lambda m:m.update(bookIntroduction=None),lambda m:m['bookIntroduction'].update(blocks=[]),lambda m:m['bookIntroduction'].update(role='chapter-introduction'),lambda m:m['bookIntroduction'].update(status='approved'),lambda m:m['bookIntroduction'].update(note='')]:
   m=copy.deepcopy(self.manifest);mutate(m)
   with self.assertRaises(ValueError):book.extract(self.raw,m)
 def test_changed_text_wrong_ids_duplicate_pins_and_missing_paragraphs_are_rejected(self):
  for mutate in [lambda m:m['bookIntroduction']['blocks'][0].update(htmlId='mwBw'),lambda m:m['bookIntroduction']['blocks'][0].update(textSha256='0'*64),lambda m:m['bookIntroduction']['blocks'].append(m['bookIntroduction']['blocks'][0])]:
   m=copy.deepcopy(self.manifest);mutate(m)
   with self.assertRaises(ValueError):book.extract(self.raw,m)
  raw=self.raw.replace('وقول الله تعالى'.encode(),'وقول الله تعالي'.encode(),1);self.assertNotEqual(raw,self.raw)
  with self.assertRaisesRegex(ValueError,'exact text changed'):self.extract_changed(raw)
 def test_numbered_material_cannot_be_hidden_in_an_introduction_even_with_new_hashes(self):
  raw=self.raw.replace(b'<p id="mwBA">',b'<p id="mwBA">[244] ',1);self.assertNotEqual(raw,self.raw)
  with self.assertRaisesRegex(ValueError,'only unnumbered paragraphs'):self.extract_changed(raw)
 def test_declared_blocks_cannot_be_moved_into_a_chapter_or_report(self):
  # Valid HTML, updated raw hash and unchanged block count cannot reclassify a later paragraph.
  raw=self.raw.replace(b'id="mwBA"',b'id="temporary"',1).replace(b'id="mwBw"',b'id="mwBA"',1).replace(b'id="temporary"',b'id="mwBw"',1)
  with self.assertRaisesRegex(ValueError,'blocks or exact text changed'):self.extract_changed(raw)
 def test_sources_without_book_introductions_keep_their_existing_schema(self):
  for name in ['faith','knowledge']:
   result=book.build(ROOT/f'content/sources/wikisource-{name}');self.assertNotIn('bookIntroduction',result)
   m=json.loads((ROOT/f'content/sources/wikisource-{name}/manifest.json').read_text());m['bookIntroduction']=self.manifest['bookIntroduction']
   with self.assertRaisesRegex(ValueError,'only unnumbered paragraphs'):book.extract((ROOT/f'content/sources/wikisource-{name}/source.html').read_bytes(),m)

if __name__=='__main__':unittest.main()

import copy,importlib.util,json,tempfile,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def module(name,file):
 spec=importlib.util.spec_from_file_location(name,ROOT/'scripts'/file);result=importlib.util.module_from_spec(spec);spec.loader.exec_module(result);return result
layout=module('layout','wikisource_layout.py');audit=module('audit','audit-wikisource-layout.py');book=module('book','import-wikisource-book.py')
class WikisourceLayoutTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.directory=ROOT/'content/sources/wikisource-ablution';cls.result=audit.build(cls.directory);cls.manifest=json.loads((cls.directory/'manifest.json').read_text());cls.raw=(cls.directory/'source.html').read_bytes()
 def test_every_original_code_point_is_preserved_in_order_once(self):
  d=self.result;self.assertEqual(d['summary']['blocks'],252);self.assertEqual(d['summary']['coveredCodePoints'],34517);self.assertEqual(d['summary']['sourceCodePoints'],34517)
  for block in d['blocks']:
   spans=[s for s in d['segments']if s['blockId']==block['htmlId']];self.assertEqual(spans[0]['start'],0);self.assertEqual(spans[-1]['end'],len(block['text']));self.assertEqual(layout.sha(block['text']),block['textSha256']);position=0;parts=[]
   for span in spans:
    self.assertEqual(span['start'],position);value=block['text'][span['start']:span['end']];self.assertEqual(layout.sha(value),span['sha256']);parts.append(value);position=span['end']
   self.assertEqual(''.join(parts),block['text'])
 def test_noninitial_reports_are_observed_without_merging_them_into_prior_owners(self):
  d=self.result;markers={m['number']:m for m in d['markers']if m['number']in[155,170,195,221,239,242]}
  self.assertEqual(set(markers),{155,170,195,221,239,242});self.assertTrue(all(m['start']>0 for m in markers.values()))
  self.assertEqual(markers[155]['start'],2);self.assertEqual(markers[170]['start'],2)
  self.assertEqual(markers[195]['blockId'],'mwAQM');self.assertEqual(markers[239]['blockId'],'mwAZM')
  spans=[s for s in d['segments']if s['blockId']=='mwAZM'];self.assertEqual([s['kind']for s in spans],['text','numbered-marker-text']);self.assertEqual(spans[0]['end'],markers[239]['start'])
 def test_original_glyphs_duplicate_reference_and_unparsed_heading_are_not_silently_fixed(self):
  d=self.result;self.assertEqual(d['summary']['numberedMarkers'],110);self.assertEqual(d['summary']['uniqueNumericLabels'],109);self.assertEqual(d['summary']['unobservedLabelsWithinRange'],[160]);self.assertEqual(d['summary']['duplicateLabels'],[{'number':162,'occurrences':2}])
  both=[m for m in d['markers']if m['number']==162];self.assertEqual([m['label']for m in both],['١٦٢','162']);self.assertEqual([m['occurrence']for m in both],[1,2]);self.assertNotEqual(both[0]['id'],both[1]['id']);self.assertFalse(any(m['number']==160 for m in d['markers']))
  original=next(b for b in d['blocks']if b['htmlId']=='mweA');self.assertTrue(original['text'].startswith('===باب الاستجمار وترا===[١٦٢]'))
  spans=[s for s in d['segments']if s['blockId']=='mweA'];self.assertEqual([s['kind']for s in spans],['unparsed-heading','numbered-marker-text']);self.assertEqual(d['summary']['htmlHeadings'],75);self.assertEqual(d['summary']['unparsedHeadings'],1)
 def test_ordinary_import_refuses_this_layout_before_assigning_any_reports(self):
  with self.assertRaisesRegex(ValueError,'explicit boundary review'):book.extract(self.raw,self.manifest)
  for name in ['faith','knowledge']:self.assertFalse(book.build(ROOT/f'content/sources/wikisource-{name}')['readerEligible'])
  self.assertFalse(self.result['readerEligible']);self.assertNotIn('records',self.result);self.assertEqual(self.result['status'],'candidate-layout-review-required')
 def test_guard_rejects_each_unsupported_boundary_pattern(self):
  for text in ['\n[1] text','[1] text\n[2] text','intro [1] text','[١] text','[1]text','===Heading===[1] text','[1 text']:
   with self.subTest(text=text),self.assertRaisesRegex(ValueError,'explicit boundary review'):layout.require_simple_layout([{'htmlId':'x','tag':'p','text':text}])
  with self.assertRaisesRegex(ValueError,'duplicate-number-label'):layout.require_simple_layout([{'htmlId':'a','tag':'p','text':'[1] text'},{'htmlId':'b','tag':'p','text':'[1] other'}])
  with self.assertRaisesRegex(ValueError,'number-marker-in-heading'):layout.require_simple_layout([{'htmlId':'a','tag':'h3','text':'[1] heading'}])
  layout.require_simple_layout([{'htmlId':'h','tag':'h3','text':'Heading'},{'htmlId':'a','tag':'p','text':'[1] text'},{'htmlId':'b','tag':'p','text':'continuation'}])
 def test_opening_import_also_rejects_a_hidden_extra_reference(self):
  d=ROOT/'content/sources/wikisource-opening';manifest=json.loads((d/'manifest.json').read_text());raw=(d/'source.html').read_bytes();position=raw.index(b'</p>',raw.index(b'[7]'));raw=raw[:position]+b' [99] extra report'+raw[position:];manifest['file'].update(bytes=len(raw),sha256=book.sha(raw))
  with self.assertRaisesRegex(ValueError,'explicit boundary review'):audit.opening.extract(raw,manifest)
 def test_committed_audit_is_reproducible_and_corruption_is_refused(self):
  registry=json.loads((ROOT/'content/sources/wikisource-books.json').read_text());self.assertEqual(audit.build_registered(registry,True),[('ablution',self.result)])
  with tempfile.TemporaryDirectory()as tmp:
   d=Path(tmp)
   for mutate in [lambda m:m['file'].update(bytes=1),lambda m:m.update(revision=1),lambda m:m['expected']['layoutSummary'].update(numberedMarkers=103),lambda m:m['file'].update(path='../source.html')]:
    m=copy.deepcopy(self.manifest);mutate(m);(d/'manifest.json').write_text(json.dumps(m));(d/'source.html').write_bytes(self.raw)
    with self.assertRaises(ValueError):audit.build(d)
 def test_registry_refuses_reused_identity_paths_and_symlink_escape(self):
  registry=json.loads((ROOT/'content/sources/wikisource-books.json').read_text())
  for mutate in [lambda r:r['pendingLayoutAudits'].append(r['pendingLayoutAudits'][0]),lambda r:r['pendingLayoutAudits'][0].update(id='faith'),lambda r:r['pendingLayoutAudits'][0].update(sourceDirectory='/tmp/untrusted'),lambda r:r['pendingLayoutAudits'][0].update(audit='../reader/source-record.json')]:
   bad=copy.deepcopy(registry);mutate(bad)
   with self.assertRaises(ValueError):audit.audit_paths(bad)
  with tempfile.TemporaryDirectory()as tmp:
   root=Path(tmp);(root/'content/sources').mkdir(parents=True);(root/'content/sources/wikisource-ablution').symlink_to(self.directory,target_is_directory=True)
   with self.assertRaises(ValueError):audit.audit_paths(registry,root)
 def test_full_candidate_is_not_automatically_admitted_to_the_reader(self):
  catalog=json.loads((ROOT/'reader/books/catalog.json').read_text());self.assertEqual([b['id']for b in catalog['books']],['opening-revelation','faith','knowledge','ablution']);self.assertEqual(catalog['entries'][-1]['number'],167)
  release=(ROOT/'reader/release.mjs').read_text();self.assertNotIn('layout-audit',release);self.assertFalse(any(e['number']>167 for e in catalog['entries']))
if __name__=='__main__':unittest.main()

"""Protect partial comparison scope, exact paragraph boundaries and missing-print evidence."""
import copy, importlib.util, json, unittest
from pathlib import Path
from test_actions_prayer_intake import SourceParagraphs
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('funerals_check',ROOT/'scripts/check-funerals-intake.py');check=importlib.util.module_from_spec(spec);spec.loader.exec_module(check)

class FuneralsIntakeTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):cls.values=check.load()
 def rejected(self,changes):
  for change in changes:
   a,i,en=copy.deepcopy(self.values);change(a)
   with self.assertRaises(ValueError):check.validate(a,i,en)
 def test_full_inventory_and_actual_compared_epub_bodies(self):
  self.assertTrue(check.validate(*self.values));self.assertEqual(check.verify_epub(self.values[0],self.values[2]),30)
 def test_every_original_codepoint_remains_in_order(self):
  inv=self.values[1]
  for original in inv['originalBlocks']:
   self.assertEqual(''.join(b['text']for b in inv['blocks']if b['origin']['blockId']==original['htmlId']),original['text'])
  self.assertEqual(sum(len(b['text'])for b in inv['blocks']),56803)
 def test_rehashing_changed_arabic_does_not_override_pinned_html(self):
  a,i,en=copy.deepcopy(self.values);i['blocks'][2]['text']+=' changed';i['blocks'][2]['textSha256']=check.sha(i['blocks'][2]['text']);a['source']['inventorySha256']=check.hashjson(i)
  with self.assertRaises(ValueError):check.validate(a,i,en)
 def test_shared_paragraph_keeps_both_chains_newline_and_named_alternatives(self):
  inv=self.values[1];bs={b['htmlId']:b['text']for b in inv['blocks']};first=bs['mwYQ@0-256'];second=bs['mwYQ@256-562']
  self.assertTrue(first.endswith('\n'));self.assertTrue(first.startswith('[1208] حدثنا أبو النعمان'));self.assertTrue(second.startswith('[1209] حدثنا مسدد'));self.assertIn('قال أيوب فوقصته، وقال عمرو فأقصعته',second);self.assertTrue(second.endswith('قال أيوب يلبي، وقال عمرو ملبيا'))
  audit=check.read('content/staging/bukhari-funerals-wikisource/layout-audit.json')
  for start in [255,257]:
   r=check.read('content/review/funerals-layout-review.json');r['decisions'][0]['units'][0]['end']=start;r['decisions'][0]['units'][1]['start']=start
   with self.assertRaises(ValueError):check.resolver.resolve(audit,r,self.values[2])
 def test_missing_label_is_not_a_missing_split_record(self):
  self.assertEqual(self.values[0]['source']['unobservedNumericLabels'],[1201]);self.assertEqual([r['number']for r in self.values[1]['records']],check.REFERENCES);self.assertIn(1209,check.REFERENCES)
 def test_partial_work_cannot_be_promoted_to_complete_book_review(self):
  self.rejected([lambda a:a['comparisonScope'].update(fullBookComparisonComplete=True),lambda a:a['comparisonScope']['pendingReferences'].clear(),lambda a:a['comparisonScope']['locatedReferences'].append(1210),lambda a:a['comparisonScope'].update(newReaderEntries=29),lambda a:a.update(readerAdmission=True,independentReview='approved')])
 def test_compared_occurrences_cannot_be_dropped_duplicated_or_reordered(self):
  self.rejected([lambda a:a['records'].pop(),lambda a:a['records'].reverse(),lambda a:a['records'].__setitem__(1,copy.deepcopy(a['records'][0]))])
 def test_missing_print_report_needs_its_own_unadmitted_evidence(self):
  m=self.values[0]['missingPrintedReports'][0];self.assertEqual((m['printedReference'],m['comparisonLabel'],m['proposedAppReference']),(1260,1201,'1200b'));self.assertIsNone(m['arabicTranscription']);self.assertIsNone(m['englishTranslation'])
  self.rejected([lambda a:a['missingPrintedReports'].clear(),lambda a:a['missingPrintedReports'][0].update(printedReference=1259),lambda a:a['missingPrintedReports'][0].update(readerEligible=True),lambda a:a['missingPrintedReports'][0].update(arabicTranscription='invented'),lambda a:a['missingPrintedReports'][0].update(beforeReference=1203)])
 def test_shared_english_body_and_pointer_cannot_be_replaced_by_numeric_offset(self):
  rs={r['reference']:r for r in self.values[0]['records']};self.assertEqual(rs[1184]['englishComparisons']['khan']['references'],['2.23.333']);self.assertEqual(rs[1185]['englishComparisons']['khan']['references'],['2.23.333']);self.assertEqual(rs[1186]['englishComparisons']['khan']['parts'][1]['scope'],'as-above-pointer-only')
  self.rejected([lambda a:a['records'][5]['englishComparisons']['khan'].update(references=['2.23.334']),lambda a:a['records'][6]['englishComparisons']['khan']['parts'][1].update(scope='located-body')])
 def test_covering_shaving_comparison_difference_remains_explicit(self):
  rs={r['reference']:r for r in self.values[0]['records']}
  for n in range(1206,1210):
   self.assertIn('covering',rs[n]['englishComparisons']['bewley']['limitations'][0]);self.assertIn('shaving',rs[n]['englishComparisons']['bewley']['limitations'][0])
   self.rejected([lambda a:a['records'][check.COMPARED.index(n)]['englishComparisons']['bewley'].update(limitations=[])])
 def test_unpunctuated_1319_is_separate_and_chapter_comments_are_excluded(self):
  raw='<h2>Chapter 28. The Book of Funerals</h2>'+''.join(f'<p>{n}'+(' 'if n==1319 else'. ')+f'It is related body {n}</p>'+('<p>Unlabelled closing</p><h3>LXXX: Next chapter</h3><p>Chapter comment</p>'if n==1230 else'')for n in range(1180,1331))+'<p>Return to Contents</p>'
  found=check.locate_bewley(raw.encode());self.assertEqual(len(found),151);rows={r['reference']:r for r in found};self.assertEqual(rows[1319]['displayedReference'],'1319');self.assertEqual(rows[1319]['bodySha256'],check.sha('It is related body 1319'));self.assertEqual(rows[1230]['bodySha256'],check.sha('It is related body 1230 Unlabelled closing'))
 def test_web_boundaries_and_unique_labels_fail_closed(self):
  raw='<h2>Chapter 28. The Book of Funerals</h2>'+''.join(f'<p>{n}. Body</p>'for n in range(1180,1331))+'<p>Return to Contents</p>'
  for bad in [raw.replace('Return to Contents','No end'),raw.replace('<p>1319. Body</p>',''),raw.replace('<p>1319. Body</p>','<p>1318. Duplicate</p>'),raw.replace('<p>1319. Body</p>','<p>1320. Reordered</p>')]:
   with self.assertRaises(ValueError):check.locate_bewley(bad.encode())
 def test_actual_epub_body_binding_is_not_just_a_declared_hash(self):
  a,i,en=copy.deepcopy(self.values);a['records'][3]['englishComparisons']['khan']['parts'][0]['bodySha256']='0'*64
  with self.assertRaises(ValueError):check.verify_epub(a,en)
 def test_printed_variants_remain_exact_and_unapplied(self):
  for index in range(13):self.rejected([lambda a:a['unresolvedTextualDifferences'][index].update(status='approved'),lambda a:a['unresolvedTextualDifferences'][index]['witnesses'][0].update(pdfPage=999)])
  ending=next(v for v in self.values[0]['unresolvedTextualDifferences']if v['id']=='1198-address-and-ending')
  self.assertEqual(ending['witnesses'][1]['reading'],ending['sourceReading']);self.assertTrue(ending['witnesses'][0]['reading'].endswith('منها'))
 def test_all_chapter_material_and_pending_status_remain_separate(self):
  self.assertEqual(len(self.values[0]['chapterMaterial']),96);self.assertEqual(sum(len(c['context'])for c in self.values[0]['chapterMaterial']),27)
  self.rejected([lambda a:a['chapterMaterial'][13]['context'].clear(),lambda a:a['chapterMaterial'][13].update(readerEligible=True),lambda a:a['chapterMaterial'][0].update(englishStatus='approved')])
 def test_review_page_preserves_all_arabic_and_real_anchor_targets(self):
  a,inv,_=self.values;page=check.render(a,inv);self.assertEqual(page,(ROOT/'research/funerals-source-review.html').read_text());p=SourceParagraphs();p.feed(page);bs={b['htmlId']:b['text']for b in inv['blocks']};expected={str(r['number']):'\n\n'.join(bs[k]for k in r['paragraphIds'])for r in inv['records']};expected.update({k:bs[k]for c in inv['chapters']for k in[c['headingId'],*c['contextIds']]});self.assertEqual(p.texts,expected);self.assertEqual(len(p.ids),len(set(p.ids)));self.assertTrue(set(p.fragments)<=set(p.ids));self.assertIn('121 entries still awaiting comparison',page)

if __name__=='__main__':unittest.main()

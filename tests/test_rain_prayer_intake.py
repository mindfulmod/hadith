"""Keep omission evidence separate from the unchanged text and from reader admission."""
import copy,importlib.util,json,unittest,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def module(name,path):
 s=importlib.util.spec_from_file_location(name,ROOT/'scripts'/path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
check=module('rain_intake','check-rain-prayer-intake.py');english=module('rain_english','import-english.py')
class RainPrayerIntakeTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):cls.values=check.load()
 def changed(self,index,mutate,rebind=False):
  values=copy.deepcopy(self.values);mutate(values[index])
  if rebind:values[0]['missingPrintedReport'if index==1 else 'missingPrintedChapter']['sha256']=check.hashjson(values[index])
  return values
 def test_complete_inventory_and_audit_remain_candidates(self):
  self.assertTrue(check.validate(*self.values));i=self.values[3]
  self.assertEqual(i,check.read('content/staging/bukhari-rain-prayer-wikisource/catalog.json'))
  owned=i['blankIds']+[p for c in i['chapters']for p in [c['headingId'],*c['contextIds']]]+[p for r in i['records']for p in r['paragraphIds']]
  self.assertEqual(len(owned),70);self.assertEqual(len(set(owned)),70);self.assertEqual(set(owned),{b['htmlId']for b in i['blocks']});self.assertFalse(i['readerEligible'])
 def test_repeated_poem_and_both_occurrences_keep_all_seven_blocks(self):
  a,r,c,i,en=self.values;entry=next(r for r in i['records']if r['number']==963)
  self.assertEqual(entry['paragraphIds'],['mwEQ','mwEg','mwEw','mwFA','mwFg','mwFw','mwGA']);self.assertEqual(a['records'][3]['printedReferences'],[1008,1009])
  with self.assertRaisesRegex(ValueError,'ownership'):check.validate(*self.changed(0,lambda a:a['records'][3]['paragraphIds'].pop()))
  with self.assertRaisesRegex(ValueError,'Printed occurrence'):check.validate(*self.changed(0,lambda a:a['records'][3].update(printedReferences=[1008])))
 def test_mislabelled_english_occurrences_cannot_be_collapsed_or_silently_renumbered(self):
  for index,field,value in [(6,'displayedReference','966'),(7,'displayedReference','967'),(8,'occurrence',1)]:
   with self.assertRaisesRegex(ValueError,'Duplicate English labels'):check.validate(*self.changed(0,lambda a:a['records'][index]['englishComparisons']['bewley'].update({field:value})))
 def test_all_31_khan_bodies_match_the_actual_epub_and_no_absence_is_claimed_as_match(self):
  a,r,c,i,en=self.values;records={r['id'].split(':')[-1]:r for r in en['records']};count=0
  with zipfile.ZipFile(ROOT/'content/sources/islamhouse-bukhari/source.epub')as z:
   sections={}
   for row in a['records']:
    k=row['englishComparisons']['khan']
    if 'reference'not in k:continue
    record=records[k['reference']];name=record['section']
    if name not in sections:sections[name]=english.parse_section(z.read(name))
    body=[sections[name]['paragraphs'][n]for n in record['bodyParagraphs']];self.assertEqual(check.hashjson(body),k['bodySha256']);count+=1
    if row['reference']==972:self.assertIn('I p man',' '.join(body))
    if row['reference']==982:self.assertIn('cloak',' '.join(body));self.assertNotIn('armpits',' '.join(body))
  self.assertEqual(count,31)
  for n in [976,983]:
   with self.assertRaisesRegex(ValueError,'missing English occurrence'):check.validate(*self.changed(0,lambda a:a['records'][n-960]['englishComparisons']['khan'].update(reference='2.17.140')))
 def test_missing_report_is_bound_to_both_adjacent_reports_and_its_actual_chapter(self):
  for mutate in [lambda r:r.update(beforeReference=985),lambda r:r.update(previousArabicSha256='0'*64),lambda r:r.update(chapterId='chapter-21'),lambda r:r.update(printedReference='1029')]:
   with self.assertRaises(ValueError):check.validate(*self.changed(1,mutate,rebind=True))
 def test_empty_printed_chapter_cannot_become_narrated_content(self):
  for mutate in [lambda c:c.update(entryNumbers=['966b']),lambda c:c.update(contextParagraphs=['invented']),lambda c:c.update(beforeChapterId='chapter-06'),lambda c:c.update(englishStatus='approved')]:
   with self.assertRaises(ValueError):check.validate(*self.changed(2,mutate,rebind=True))
 def test_changed_or_one_sided_print_evidence_fails_even_after_rebinding_candidate(self):
  for mutate in [lambda r:r['witnesses'].pop(),lambda r:r['witnesses'][0].update(sourceSha256='0'*64),lambda r:r['witnesses'][1].update(pdfPage=999),lambda r:r.update(arabic=r['arabic']+' changed')]:
   with self.assertRaises(ValueError):check.validate(*self.changed(1,mutate,rebind=True))
 def test_corrections_are_proposals_with_exact_old_words_and_two_witnesses(self):
  for mutate in [lambda a:a['proposedCorrections'][0].update(status='applied'),lambda a:a['proposedCorrections'][0].update(before='قتيبة بن سعيد'),lambda a:a['proposedCorrections'][1]['witnesses'][0].update(reading='unrelated')]:
   with self.assertRaises(ValueError):check.validate(*self.changed(0,mutate))
  blocks={b['htmlId']:b['text']for b in self.values[3]['blocks']}
  for c in self.values[0]['proposedCorrections']:self.assertIn(c['before'],blocks[c['paragraphId']])
 def test_no_false_approval_or_reader_admission_can_be_recorded(self):
  for mutate in [lambda r:r.update(readerEligible=True),lambda r:r.update(independentReview='approved'),lambda r:r['referenceDecision'].update(status='user-confirmed')]:
   with self.assertRaises(ValueError):check.validate(*self.changed(1,mutate,rebind=True))
 def test_review_page_is_reproducible_and_candidates_are_not_in_reader(self):
  a,r,c,i,en=self.values;html=check.render(a,r,c);self.assertEqual((ROOT/'research/rain-prayer-source-review.html').read_text(),html)
  catalog=check.read('reader/books/catalog.json');self.assertNotIn('rain-prayer',[b['id']for b in catalog['books']]);self.assertNotIn('983b',[e['number']for e in catalog['entries']]);self.assertIn('not added to the reader',html)
if __name__=='__main__':unittest.main()

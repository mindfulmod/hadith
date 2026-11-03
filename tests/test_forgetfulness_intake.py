"""Protect distinct occurrences, exact source endings and comparison limitations."""
import copy, importlib.util, json, unittest
from pathlib import Path
from test_actions_prayer_intake import SourceParagraphs
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('forgetfulness_check',ROOT/'scripts/check-forgetfulness-intake.py');check=importlib.util.module_from_spec(spec);spec.loader.exec_module(check)

class ForgetfulnessIntakeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):cls.values=check.load()
    def rejected(self,changes):
        for change in changes:
            values=copy.deepcopy(self.values);change(values[0])
            with self.assertRaises(ValueError):check.validate(*values)
    def test_complete_inventory_and_actual_epub_bodies(self):
        self.assertTrue(check.validate(*self.values));self.assertEqual(check.verify_epub(self.values[0],self.values[2]),14)
    def test_missing_repeated_reordered_and_extra_entries_fail(self):
        self.rejected([lambda a:a['records'].pop(),lambda a:a['records'].reverse(),lambda a:a['records'].__setitem__(1,copy.deepcopy(a['records'][0])),lambda a:a['records'].append(copy.deepcopy(a['records'][-1]))])
    def test_shared_printed_number_requires_two_distinct_parts(self):
        a=self.values[0];self.assertEqual([r['printedReferences']for r in a['records'][4:6]],[[1228],[1228]]);self.assertEqual([r['printedOccurrence']['part']for r in a['records'][4:6]],[1,2])
        self.rejected([lambda a:a['records'][5]['printedOccurrence'].update(part=1),lambda a:a['records'][5].pop('printedOccurrence'),lambda a:a['records'][5].update(printedReferences=[1229]),lambda a:a['sharedPrintedReferences'][0].update(digitalReferences=[1170]),lambda a:a.update(distinctModernPrintedNumbers=14)])
    def test_full_sad_account_cannot_be_removed_even_with_new_hashes(self):
        a,inv,en=copy.deepcopy(self.values);b=next(b for b in inv['blocks']if b['htmlId']=='mwDg');self.assertIn('قال سعد ورأيت عروة',b['text']);b['text']=b['text'].split('قال سعد')[0];b['textSha256']=check.sha(b['text']);a['source']['inventorySha256']=check.hashjson(inv)
        with self.assertRaises(ValueError):check.validate(a,inv,en)
    def test_singular_prostration_ending_cannot_be_completed_from_parallel_report(self):
        a,inv,en=copy.deepcopy(self.values);b=next(b for b in inv['blocks']if b['htmlId']=='mwFA');self.assertTrue(b['text'].rstrip().endswith('ثم رفع'));b['text']+=' ثم سجد';b['textSha256']=check.sha(b['text']);a['source']['inventorySha256']=check.hashjson(inv)
        with self.assertRaises(ValueError):check.validate(a,inv,en)
    def test_narrator_question_and_closing_corroboration_are_complete(self):
        blocks={b['htmlId']:b['text']for b in self.values[1]['blocks']};self.assertIn('قلت لمحمد',blocks['mwGA']);self.assertTrue(blocks['mwGA'].rstrip().endswith('ليس في حديث أبي هريرة'));self.assertTrue(blocks['mwHQ'].rstrip().endswith('تابعه بن جريج عن ابن شهاب في التكبير'))
        self.rejected([lambda a:a['records'][5].update(paragraphIds=['mwFA']),lambda a:a['records'][7].update(arabicSha256='0'*64)])
    def test_every_recorded_difference_is_bound_to_exact_evidence(self):
        for i in range(14):
            self.rejected([lambda a:a['unresolvedTextualDifferences'].pop(i),lambda a:a['unresolvedTextualDifferences'][i].update(status='resolved'),lambda a:a['unresolvedTextualDifferences'][i]['witnesses'][0].update(pdfPage=999)])
    def test_english_limits_cannot_be_erased_or_declared_approval(self):
        for i,row in enumerate(self.values[0]['records']):
            for provider,c in row['englishComparisons'].items():
                if c['limitations']:self.rejected([lambda a:a['records'][i]['englishComparisons'][provider].update(limitations=[]),lambda a:a['records'][i]['englishComparisons'][provider].update(status='approved')])
    def test_actual_english_body_substitution_fails(self):
        a=copy.deepcopy(self.values[0]);a['records'][7]['englishComparisons']['khan']['bodySha256']='0'*64
        with self.assertRaises(ValueError):check.verify_epub(a,self.values[2])
        a=copy.deepcopy(self.values[0]);a['records'][0]['englishComparisons']['khan']['reference']='2.22.316'
        with self.assertRaises(ValueError):check.verify_epub(a,self.values[2])
    def test_web_locator_stops_at_funerals_and_keeps_unlabelled_closing_text(self):
        raw='<h2>Chapter 27. Chapters on Forgetfulness</h2>'+''.join(f'<p>{n}. Body {n}</p>'+('<p>Unlabelled closing account</p>'if n==1169 else'') for n in check.REFERENCES)+'<h2>Chapter 28. The Book of Funerals</h2><p>1180. Outside section</p>'
        found=check.locate_bewley(raw.encode());self.assertEqual(list(found),check.REFERENCES);self.assertEqual(found[1169]['body'],'Body 1169 Unlabelled closing account');self.assertEqual(found[1179]['body'],'Body 1179')
        for bad in [raw.replace('Chapter 28. The Book of Funerals','Different boundary'),raw.replace('<p>1171. Body 1171</p>',''),raw.replace('<p>1171. Body 1171</p>','<p>1170. Duplicate</p>')]:
            with self.assertRaises(ValueError):check.locate_bewley(bad.encode())
    def test_context_blank_and_boundary_cannot_be_reassigned(self):
        self.rejected([lambda a:a['chapterMaterial'][3]['context'].clear(),lambda a:a['chapterMaterial'][8].update(readerEligible=True),lambda a:a['source'].update(blankIds=[]),lambda a:a['sectionBoundary'].update(nextSelectedReference=1181),lambda a:a['sectionBoundary'].update(printedNextReferences=[1238])])
    def test_rendered_arabic_is_exact_and_anchor_targets_exist(self):
        a,inv,_=self.values;page=check.render(a,inv);self.assertEqual(page,(ROOT/'research/forgetfulness-source-review.html').read_text());p=SourceParagraphs();p.feed(page);bs={b['htmlId']:b['text']for b in inv['blocks']}
        expected={str(r['number']):'\n\n'.join(bs[k]for k in r['paragraphIds'])for r in inv['records']};expected.update({k:bs[k]for c in inv['chapters']for k in[c['headingId'],*c['contextIds']]});self.assertEqual(p.texts,expected);self.assertEqual(len(p.ids),len(set(p.ids)));self.assertTrue(set(p.fragments)<=set(p.ids))
    def test_intake_cannot_admit_translation_or_claim_independent_review(self):
        self.rejected([lambda a:a.update(readerAdmission=True),lambda a:a.update(independentReview='approved'),lambda a:a['source'].update(arabicChanged=True),lambda a:a['proposedCorrections'].append({'reference':1178})])
        from published_fixture import ENTRY_NUMBERS
        cat=json.loads((ROOT/'reader/books/catalog.json').read_text());self.assertEqual([r['number']for r in cat['entries']],ENTRY_NUMBERS);self.assertNotIn(1166,ENTRY_NUMBERS)

if __name__=='__main__':unittest.main()

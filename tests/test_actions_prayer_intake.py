"""Protect full routes, source variants and special English locators in Actions during Prayer."""
import copy
import importlib.util
import unittest
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('actions_check', ROOT / 'scripts/check-actions-prayer-intake.py')
check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check)


class SourceParagraphs(HTMLParser):
    def __init__(self):
        super().__init__()
        self.key = None
        self.texts = {}
        self.ids = []
        self.fragments = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if 'id' in attrs:
            self.ids.append(attrs['id'])
        if tag == 'a' and attrs.get('href', '').startswith('#'):
            self.fragments.append(attrs['href'][1:])
        if tag == 'p' and ('data-source' in attrs or 'data-block' in attrs):
            self.key = attrs.get('data-source', attrs.get('data-block'))
            if self.key in self.texts:
                raise ValueError('Repeated rendered source block')
            self.texts[self.key] = ''

    def handle_data(self, text):
        if self.key is not None:
            self.texts[self.key] += text

    def handle_endtag(self, tag):
        if tag == 'p':
            self.key = None


class ActionsPrayerIntakeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.values=check.load()

    def rejected(self,mutations):
        for mutate in mutations:
            values=copy.deepcopy(self.values);mutate(values[0])
            with self.assertRaises(ValueError):check.validate(*values)

    def test_complete_print_mapping_and_actual_epub_bodies(self):
        self.assertTrue(check.validate(*self.values));self.assertEqual(check.verify_epub(self.values[0],self.values[2]),27)
        self.assertEqual([p for r in self.values[0]['records']for p in r['printedReferences']],list(range(1198,1224)))

    def test_missing_duplicated_reordered_or_extra_occurrences_fail(self):
        self.rejected([lambda a:a['records'].pop(),lambda a:a['records'].reverse(),lambda a:a['records'].__setitem__(1,copy.deepcopy(a['records'][0])),lambda a:a['missingPrintedReports'].append({'reference':'1141b'})])

    def test_two_full_routes_stay_one_report_and_english_pointer_stays_separately_bound(self):
        audit,inv,_=self.values;row=audit['records'][1];self.assertEqual(row['printedReferences'],[1199]);self.assertEqual([p['reference']for p in row['englishComparisons']['khan']['parts']],['2.22.290','2.22.291'])
        block=next(b for b in inv['blocks']if b['htmlId']=='mwDQ');self.assertIn('حدثنا إسحاق بن منصور السلولي',block['text']);self.assertTrue(block['text'].rstrip().endswith('نحوه'))
        self.rejected([lambda a:a['records'][1]['englishComparisons']['khan']['parts'].pop(),lambda a:a['records'][1].update(printedReferences=[1199,1200]),lambda a:a['records'][1]['englishComparisons']['khan']['parts'][1].update(reference='2.22.292')])

    def test_irregular_297m_reference_cannot_be_normalized_to_an_adjacent_record(self):
        self.assertEqual(self.values[0]['records'][8]['englishComparisons']['khan']['reference'],'2.22.297m')
        self.rejected([lambda a:a['records'][8]['englishComparisons']['khan'].update(reference='2.22.297'),lambda a:a['records'][8]['englishComparisons']['khan'].update(reference='2.22.298'),lambda a:a['englishComparisons']['khan'].update(irregularReferenceMap={})])

    def test_english_actual_body_hashes_refuse_substitution_in_either_part(self):
        for index in [0,1]:
            a=copy.deepcopy(self.values[0]);a['records'][1]['englishComparisons']['khan']['parts'][index]['bodySha256']='0'*64
            with self.assertRaises(ValueError):check.verify_epub(a,self.values[2])
        self.rejected([lambda a:a['records'][8]['englishComparisons']['bewley'].update(bodySha256='0'*64)])

    def test_full_selected_lexical_note_and_attribution_cannot_disappear_even_after_rehashing_inventory(self):
        for pid,cut in [('mwNA','ثم قال النضر'),('mwYQ','قال أبو سلمة'),('mwWg','وقال هشام')]:
            audit,inv,en=copy.deepcopy(self.values);b=next(b for b in inv['blocks']if b['htmlId']==pid);self.assertIn(cut,b['text']);b['text']=b['text'].split(cut)[0];b['textSha256']=check.sha(b['text']);audit['source']['inventorySha256']=check.hashjson(inv)
            with self.assertRaises(ValueError):check.validate(audit,inv,en)

    def test_all_24_print_differences_stay_bound_to_the_original_words_and_inspected_pages(self):
        for index in range(24):
            self.rejected([lambda a:a['unresolvedTextualDifferences'].pop(index),lambda a:a['unresolvedTextualDifferences'][index].update(status='resolved'),lambda a:a['unresolvedTextualDifferences'][index]['witnesses'][0].update(pdfPage=999)])

    def test_expedition_and_opening_verb_variants_do_not_silently_correct_the_source(self):
        vs={v['id']:v for v in self.values[0]['unresolvedTextualDifferences']}
        self.assertTrue(vs['1153-expedition-count']['sourceReading'].endswith('وثمان'))
        self.assertTrue(all(w['reading'].endswith('أو ثمانيا')for w in vs['1153-expedition-count']['witnesses']))
        self.assertEqual(vs['1162-opening-reporting-verb']['sourceReading'],'حدثني عمرو بن علي');self.assertTrue(all(w['reading']=='حدثنا عمرو بن علي'for w in vs['1162-opening-reporting-verb']['witnesses']))

    def test_comparison_omissions_cannot_be_erased_or_promoted_to_wording_approval(self):
        for provider,refs in check.LIMITED.items():
            for n in refs:self.rejected([lambda a:a['records'][n-1140]['englishComparisons'][provider].update(limitations=[]),lambda a:a['records'][n-1140]['englishComparisons'][provider].update(status='approved')])

    def test_six_chapter_comments_and_context_only_chapter_keep_separate_ownership(self):
        _,inv,_=self.values;self.assertEqual([p for c in inv['chapters']for p in c['contextIds']],check.CONTEXT);self.assertEqual(inv['chapters'][12]['entryNumbers'],[])
        self.rejected([lambda a:a['source']['separateContextIds'].remove('mwRA'),lambda a:a['chapterWithoutNumberedReport'].update(chapterId='chapter-14'),lambda a:a['records'][17]['paragraphIds'].append('mwRA'),lambda a:a['chapterMaterial'][12].update(readerEligible=True)])

    def test_intake_cannot_claim_independent_review_or_apply_corrections(self):
        self.rejected([lambda a:a.update(readerAdmission=True),lambda a:a['source'].update(arabicChanged=True),lambda a:a['proposedCorrections'].append({'reference':1162}),lambda a:a.update(independentReview='approved')])

    def test_next_section_and_print_locations_do_not_drift(self):
        self.rejected([lambda a:a['sectionBoundary'].update(nextSelectedReference=1167),lambda a:a['sectionBoundary'].update(printedNextReferences=[1223]),lambda a:a['records'][14].update(printedPages={'brill-1862':[305],'dar-ibn-kathir-2002':[292]})])

    @staticmethod
    def synthetic_web():
        return ('<p>1139. Previous'+''.join(f'<p><a>{n}</a>. Body &amp; {n}. See 1140.<p>Continuation {n}.<p><b>IV: Following chapter</b><p>Separate comment.'for n in check.REFERENCES)+'<p>Chapter 27. Chapters on Forgetfulness<p>1166. Outside').encode()

    def test_web_locator_excludes_next_heading_context_and_section_but_retains_continuations(self):
        bodies=check.locate_bewley(self.synthetic_web());self.assertEqual(list(bodies),check.REFERENCES)
        for n,b in bodies.items():self.assertEqual(b['body'],f'Body & {n}. See 1140. Continuation {n}.')
        audit=copy.deepcopy(self.values[0])
        for r in audit['records']:r['englishComparisons']['bewley']['bodySha256']=check.sha(bodies[r['reference']]['body'])
        check.verify_bewley_bodies(audit,bodies);bodies[1165]['body']+=' Separate comment'
        with self.assertRaisesRegex(ValueError,'pinned locator'):check.verify_bewley_bodies(audit,bodies)

    def test_web_locator_refuses_duplicate_labels_or_missing_start_and_terminal_boundaries(self):
        for old,new in [(b'Chapter 27. Chapters on Forgetfulness',b'Unknown'),(b'<a>1144</a>',b'<a>1143</a>'),(b'<a>1140</a>',b'Unknown'),(b'<a>1165</a>',b'Unknown')]:
            with self.assertRaises(ValueError):check.locate_bewley(self.synthetic_web().replace(old,new))

    def test_review_page_exposes_every_exact_arabic_block_and_valid_internal_links(self):
        audit,inv,_=self.values;page=check.render(audit,inv);self.assertEqual(page,(ROOT/'research/actions-prayer-source-review.html').read_text());p=SourceParagraphs();p.feed(page);blocks={b['htmlId']:b['text']for b in inv['blocks']}
        expected={str(r['number']):'\n\n'.join(blocks[p]for p in r['paragraphIds'])for r in inv['records']};expected.update({p:blocks[p]for c in inv['chapters']for p in [c['headingId'],*c['contextIds']]})
        self.assertEqual(p.texts,expected);self.assertEqual(len(p.ids),len(set(p.ids)));self.assertTrue(set(p.fragments)<=set(p.ids))
        for phrase in ['Candidate evidence only','Khan 2.22.290 / 2.22.291','2.22.297m','Chapter 13 has context but no numbered report','English pending','lexical note']:self.assertIn(phrase,page)


if __name__=='__main__':unittest.main()

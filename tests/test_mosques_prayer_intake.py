"""Protect report identity where an English label and its body disagree."""
import copy
import importlib.util
import unittest
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('mosques_check', ROOT / 'scripts/check-mosques-prayer-intake.py')
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


class MosquesPrayerIntakeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.values = check.load()

    def rejected(self, mutations):
        for mutate in mutations:
            values = copy.deepcopy(self.values)
            mutate(values[0])
            with self.assertRaises(ValueError):
                check.validate(*values)

    def test_complete_print_mapping_and_actual_epub_bodies(self):
        self.assertTrue(check.validate(*self.values))
        self.assertEqual(check.verify_epub(self.values[0], self.values[2]), 8)
        self.assertEqual([p for r in self.values[0]['records'] for p in r['printedReferences']], list(range(1188,1198)))

    def test_missing_duplicated_and_reordered_occurrences_fail(self):
        self.rejected([lambda a:a['records'].pop(), lambda a:a['records'].reverse(),
                       lambda a:a['records'].__setitem__(1,copy.deepcopy(a['records'][0]))])

    def test_combined_print_divisions_do_not_create_suffixes_or_lose_passages(self):
        self.rejected([lambda a:a['combinedDigitalReferences'].clear(),
                       lambda a:a['records'][0].update(printedReferences=[1189]),
                       lambda a:a['records'][2].update(printedReferences=[1191]),
                       lambda a:a['missingPrintedReports'].append({'reference':'1132b'}),
                       lambda a:a['combinedDigitalReferences'][0]['boundaries'][0].update(start=0)])

    def test_introductory_fragment_and_route_switch_are_exact_source_content(self):
        audit,inv,en = copy.deepcopy(self.values)
        block = next(b for b in inv['blocks'] if b['htmlId']=='mwBg')
        self.assertIn('أربعا قال: قال: سمعت',block['text'])
        self.assertIn('ثنتي عشرة غزوة ح حدثنا علي',block['text'])
        block['text'] = '[1132] ' + block['text'].split('ح حدثنا علي')[1]
        block['textSha256'] = check.sha(block['text'])
        audit['source']['inventorySha256'] = check.hashjson(inv)
        with self.assertRaises(ValueError):
            check.validate(audit,inv,en)

    def test_english_boundary_mismatch_cannot_be_erased_relabelled_or_silently_repaired(self):
        self.rejected([lambda a:a['englishBoundaryDifferences'].clear(),
                       lambda a:a['englishBoundaryDifferences'][0]['mapping'][0].update(displayedLabels=['1132']),
                       lambda a:a['englishBoundaryDifferences'][0]['mapping'][1].update(selectedReference=1132),
                       lambda a:a['englishBoundaryDifferences'][0]['displayedBodies'][1].update(bodySha256='0'*64),
                       lambda a:a['records'][0]['englishComparisons']['bewley'].update(bodySha256='0'*64),
                       lambda a:a['englishComparisons']['bewley'].update(boundaryDifferenceIds=[])])

    def test_epub_identity_and_real_body_hashes_reject_adjacent_substitution(self):
        for field in ['bodySha256','recordSha256']:
            audit = copy.deepcopy(self.values[0]);audit['records'][0]['englishComparisons']['khan'][field] = '0'*64
            with self.assertRaisesRegex(ValueError,'English body'):
                check.verify_epub(audit,self.values[2])
        self.rejected([lambda a:a['records'][0]['englishComparisons']['khan'].update(reference='2.21.282')])

    def test_house_grave_readings_and_other_variants_remain_unapplied(self):
        for i in range(9):
            self.rejected([lambda a:a['unresolvedTextualDifferences'].pop(i),
                           lambda a:a['unresolvedTextualDifferences'][i].update(status='resolved'),
                           lambda a:a['unresolvedTextualDifferences'][i]['witnesses'][0].update(pdfPage=999)])
        variants = {v['id']:v for v in self.values[0]['unresolvedTextualDifferences']}
        self.assertEqual(variants['1137-house-grave-reading']['sourceReading'],'ما بين بيتي ومنبري')
        self.assertEqual(variants['1137-house-grave-reading']['witnesses'][0]['reading'],'ما بين قبري ومنبري')

    def test_comparison_limits_and_commentary_cannot_become_source_approval(self):
        for provider,refs in check.LIMITED.items():
            for n in refs:
                self.rejected([lambda a:a['records'][n-1132]['englishComparisons'][provider].update(limitations=[]),
                               lambda a:a['records'][n-1132]['englishComparisons'][provider].update(status='approved')])
        self.rejected([lambda a:a['classicalComparisonNotes'][0].update(role='hadith-wording'),
                       lambda a:a['classicalComparisonNotes'][0].update(independentReview='approved')])

    def test_chapter_headings_and_next_book_stay_outside_reports(self):
        self.rejected([lambda a:a['chapterMaterial'][4].update(readerEligible=True),
                       lambda a:a['source']['separateContextIds'].append('mwFw'),
                       lambda a:a['records'][5]['paragraphIds'].append('باب_فضل_ما_بين_القبر_والمنبر'),
                       lambda a:a['sectionBoundary'].update(selectedLastReference=1140),
                       lambda a:a['sectionBoundary'].update(printedNextReferences=[1197])])

    def test_intake_does_not_approve_or_correct_text(self):
        self.rejected([lambda a:a.update(readerAdmission=True),lambda a:a['source'].update(arabicChanged=True),
                       lambda a:a['proposedCorrections'].append({'reference':1132}),lambda a:a.update(independentReview='approved')])

    @staticmethod
    def synthetic_web():
        return ('<p>1131. Previous'+''.join(f'<p><a>{n}</a>. Body &amp; {n}. See 1132.<p>Continuation {n}.' for n in check.REFERENCES)+'<p><hr><p>Return to Contents<p>1140. Outside').encode()

    def test_web_terminal_boundary_excludes_footer_but_keeps_inline_refs_and_continuations(self):
        bodies = check.locate_bewley(self.synthetic_web())
        self.assertEqual(list(bodies),check.REFERENCES)
        for n,b in bodies.items():
            self.assertEqual(b['body'],f'Body & {n}. See 1132. Continuation {n}.')
        audit = copy.deepcopy(self.values[0])
        for r in audit['records']:
            r['englishComparisons']['bewley']['bodySha256'] = check.sha(bodies[r['reference']]['body'])
        check.verify_bewley_bodies(audit,bodies)
        bodies[1139]['body'] += ' Return to Contents'
        with self.assertRaisesRegex(ValueError,'pinned locator'):
            check.verify_bewley_bodies(audit,bodies)

    def test_web_locator_rejects_missing_end_duplicate_and_missing_labels(self):
        for old,new in [(b'<hr>',b''),(b'<a>1134</a>',b'<a>1133</a>'),(b'<a>1132</a>',b'Unknown'),(b'<a>1139</a>',b'Unknown')]:
            with self.assertRaises(ValueError):
                check.locate_bewley(self.synthetic_web().replace(old,new))

    def test_review_page_exposes_complete_source_and_evidence_navigation(self):
        audit,inv,_ = self.values;page = check.render(audit,inv)
        self.assertEqual(page,(ROOT/'research/mosques-prayer-source-review.html').read_text())
        parser = SourceParagraphs();parser.feed(page);blocks = {b['htmlId']:b['text'] for b in inv['blocks']}
        expected = {str(r['number']):'\n\n'.join(blocks[p] for p in r['paragraphIds']) for r in inv['records']}
        expected.update({c['headingId']:blocks[c['headingId']] for c in inv['chapters']})
        self.assertEqual(parser.texts,expected);self.assertEqual(len(parser.ids),len(set(parser.ids)))
        self.assertTrue(set(parser.fragments)<=set(parser.ids))
        for phrase in ['Candidate evidence only','Printed 1188 / 1189','Printed 1191 / 1192','English label and body mismatch','house/grave','English pending']:
            self.assertIn(phrase,page)


if __name__ == '__main__':
    unittest.main()

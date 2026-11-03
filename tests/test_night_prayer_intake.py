"""Protect complete occurrences and comparison limits before Night Prayer admission."""
import copy
import importlib.util
import unittest
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('night_check', ROOT / 'scripts/check-night-prayer-intake.py')
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


class NightPrayerIntakeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.values = check.load()

    def changed(self, mutate):
        values = copy.deepcopy(self.values)
        mutate(values[0])
        return values

    def rejected(self, mutations):
        for mutate in mutations:
            with self.assertRaises(ValueError):
                check.validate(*self.changed(mutate))

    def test_complete_intake_and_actual_epub_bodies(self):
        self.assertTrue(check.validate(*self.values))
        self.assertEqual(check.verify_epub(self.values[0], self.values[2]), 49)
        refs = {p for r in self.values[0]['records'] for p in r['printedReferences']}
        self.assertEqual(refs, set(range(1120, 1172)))

    def test_occurrences_cannot_be_dropped_duplicated_or_reordered(self):
        self.rejected([lambda a: a['records'].pop(3),
                       lambda a: a['records'].__setitem__(2, copy.deepcopy(a['records'][1])),
                       lambda a: a['records'].reverse(),
                       lambda a: a['records'][12].update(sourceRecordId=a['records'][11]['sourceRecordId'])])

    def test_combined_passages_cannot_be_split_into_fictitious_omissions(self):
        self.rejected([lambda a: a['combinedDigitalReferences'].clear(),
                       lambda a: a['missingPrintedReports'].append({'reference':'1105b'}),
                       lambda a: a['records'][1].update(printedReferences=[1121]),
                       lambda a: a['records'][36].update(printedReferences=[1156,1157]),
                       lambda a: a['combinedDigitalReferences'][1]['boundaries'].pop(),
                       lambda a: a['combinedDigitalReferences'][0]['boundaries'][0].update(start=0)])

    def test_shared_print_number_preserves_two_digital_identities(self):
        self.rejected([lambda a: a['sharedPrintedReferences'].clear(),
                       lambda a: a['sharedPrintedReferences'][0].update(digitalReferences=[1080]),
                       lambda a: a['sharedPrintedReferences'][0]['sourceRecordIds'].reverse(),
                       lambda a: a['records'][12].update(printedReferences=[1133])])
        self.assertEqual([r['printedReferences'] for r in self.values[0]['records'][11:13]], [[1132],[1132]])

    def test_poetry_and_closing_route_belong_to_the_complete_report(self):
        self.rejected([lambda a: a['poetryReport']['poetryParagraphIds'].pop(),
                       lambda a: a['poetryReport'].update(closingRouteParagraphId=None),
                       lambda a: a['poetryReport'].update(status='chapter-context'),
                       lambda a: a['records'][35]['paragraphIds'].pop(),
                       lambda a: a['records'][35].update(arabicSha256='0'*64)])
        r = self.values[1]['records'][35]
        self.assertEqual(r['paragraphIds'], ['mweA',*check.POETRY,'mwgA'])

    def test_untitled_heading_is_separate_unapplied_chapter_evidence(self):
        self.rejected([lambda a: a['printedHeadingProposals'].clear(),
                       lambda a: a['printedHeadingProposals'][0].update(headingArabic='باب الدعاء'),
                       lambda a: a['printedHeadingProposals'][0].update(readerEligible=True),
                       lambda a: a['printedHeadingProposals'][0].update(status='applied'),
                       lambda a: a['printedHeadingProposals'][0].update(beforeReference=1103)])

    def test_all_textual_differences_remain_bound_and_unapplied(self):
        for i in range(11):
            self.rejected([lambda a: a['unresolvedTextualDifferences'].pop(i),
                           lambda a: a['unresolvedTextualDifferences'][i].update(status='resolved'),
                           lambda a: a['unresolvedTextualDifferences'][i]['witnesses'][0].update(pdfPage=999),
                           lambda a: a['unresolvedTextualDifferences'][i].update(sourceBlockSha256='0'*64)])

    def test_1115_is_not_a_two_print_correction(self):
        i = next(i for i,v in enumerate(self.values[0]['unresolvedTextualDifferences']) if v['id'].startswith('1115-'))
        v = self.values[0]['unresolvedTextualDifferences'][i]
        self.assertIn('حدثني أبي عن أبي سلمة', v['sourceReading'])
        self.assertIn('حدثني أبي عن أبي سلمة', v['witnesses'][0]['reading'])
        self.assertIn('حدثني أبو سلمة', v['witnesses'][1]['reading'])
        self.rejected([lambda a: a['proposedCorrections'].append(copy.deepcopy(v)),
                       lambda a: a['unresolvedTextualDifferences'][i]['witnesses'][0].update(reading=v['witnesses'][1]['reading'])])

    def test_bounded_absence_cannot_use_neighbouring_translation(self):
        self.rejected([lambda a: a['records'][33]['englishComparisons']['khan'].update(reference='2.21.253'),
                       lambda a: a['records'][33]['englishComparisons']['khan'].update(status='located-body-not-wording-approval'),
                       lambda a: a['records'][33]['englishComparisons']['khan']['checkedReferences'].reverse(),
                       lambda a: a['englishComparisons']['khan'].update(absentReferences=[])])
        bad = self.changed(lambda a: a['records'][33]['englishComparisons']['khan']['checkedReferences'][0].update(bodySha256='0'*64))[0]
        with self.assertRaisesRegex(ValueError, 'English body'):
            check.verify_epub(bad, self.values[2])

    def test_reordered_english_and_distinct_251_suffixes(self):
        rows = {r['reference']:r['englishComparisons']['khan']['reference'] for r in self.values[0]['records']}
        self.assertEqual([rows[n] for n in [1099,1100,1109,1114,1115,1118]],
                         ['2.21.251r','2.21.251n','2.21.263','2.21.268','2.21.259','2.21.262'])
        for n, ref in [(1099,'2.21.251n'),(1100,'2.21.251r'),(1109,'2.21.259'),(1115,'2.21.265')]:
            self.rejected([lambda a: a['records'][n-1069]['englishComparisons']['khan'].update(reference=ref)])

    def test_actual_epub_binding_rejects_changed_text_or_record(self):
        for field in ['bodySha256','recordSha256']:
            bad = self.changed(lambda a: a['records'][0]['englishComparisons']['khan'].update({field:'0'*64}))[0]
            with self.assertRaisesRegex(ValueError, 'English body'):
                check.verify_epub(bad, self.values[2])

    def test_english_limitations_cannot_be_erased_or_promoted(self):
        for provider, refs in check.LIMITED.items():
            for n in refs:
                self.rejected([lambda a: a['records'][n-1069]['englishComparisons'][provider].update(limitations=[]),
                               lambda a: a['records'][n-1069]['englishComparisons'][provider].update(status='approved')])
        self.rejected([lambda a: a['records'][0]['englishComparisons']['khan'].update(limitations=['No problem'])])

    def test_chapter_context_ownership_and_english_remain_pending(self):
        self.rejected([lambda a: a['source']['separateContextIds'].pop(),
                       lambda a: a['source'].update(blankIds=[]),
                       lambda a: a['chapterMaterial'][0]['context'].clear(),
                       lambda a: a['chapterMaterial'][0].update(readerEligible=True),
                       lambda a: a['chapterMaterial'][2].update(englishStatus='approved')])

    def test_selected_subsection_boundary_does_not_absorb_the_next_page(self):
        self.rejected([lambda a: a['sectionBoundary'].update(selectedLastReference=1139),
                       lambda a: a['sectionBoundary'].update(nextSelectedReference=1120),
                       lambda a: a['sectionBoundary'].update(nextSourceRevision=0),
                       lambda a: a['sectionBoundary'].update(printedNextReferences=[1172])])

    def test_intake_cannot_certify_or_rewrite_the_source(self):
        self.rejected([lambda a: a.update(readerAdmission=True),
                       lambda a: a.update(independentReview='approved'),
                       lambda a: a['source'].update(arabicChanged=True),
                       lambda a: a['printedComparisons'][0].update(sha256='0'*64),
                       lambda a: a['englishComparisons']['bewley'].update(sha256='0'*64)])

    @staticmethod
    def synthetic_bewley():
        return ('<p>1069. Other section<p><b>Chapter 25. Night Prayer</b>' + ''.join(
            f'<P><a>{n}</a>. Body &amp; {n}. See 1102.\nSee 1119.<P>Continuation {n}.'
            for n in check.REFERENCES) + '<p>1119. Following subsection<p>1120. Outside').encode()

    def test_web_locator_handles_inline_references_and_multiblock_bodies(self):
        bodies = check.locate_bewley(self.synthetic_bewley())
        self.assertEqual(list(bodies), check.REFERENCES)
        for n, body in bodies.items():
            self.assertEqual(body['body'], f'Body & {n}. See 1102. See 1119. Continuation {n}.')
        audit = copy.deepcopy(self.values[0])
        for r in audit['records']:
            r['englishComparisons']['bewley']['bodySha256'] = check.sha(bodies[r['reference']]['body'])
        check.verify_bewley_bodies(audit, bodies)
        bodies[1102]['body'] += ' Modified'
        with self.assertRaisesRegex(ValueError, 'pinned locator'):
            check.verify_bewley_bodies(audit, bodies)

    def test_web_locator_rejects_missing_duplicate_or_unbounded_labels(self):
        raw = self.synthetic_bewley()
        for old,new in [(b'<a>1070</a>',b'<a>1069</a>'),(b'<a>1118</a>',b'<a>1120</a>'),
                        (b'Chapter 25.',b'Unknown'),(b'<p>1119.',b'<p>Other.'),
                        (b'<p>1120.',b'<p>1119.')]:
            with self.assertRaises(ValueError):
                check.locate_bewley(raw.replace(old,new))

    def test_render_preserves_complete_arabic_and_unique_fragment_targets(self):
        audit, inventory, _ = self.values
        rendered = check.render(audit, inventory)
        self.assertEqual(rendered, (ROOT / 'research/night-prayer-source-review.html').read_text())
        parser = SourceParagraphs();parser.feed(rendered)
        blocks = {b['htmlId']:b['text'] for b in inventory['blocks']}
        expected = {str(r['number']):'\n\n'.join(blocks[p] for p in r['paragraphIds']) for r in inventory['records']}
        expected.update({p:blocks[p] for c in inventory['chapters'] for p in [c['headingId'],*c['contextIds']]})
        self.assertEqual(parser.texts, expected)
        self.assertEqual(len(parser.ids),len(set(parser.ids)))
        self.assertTrue(set(parser.fragments) <= set(parser.ids))
        for phrase in ['Candidate evidence only','English remains pending','Printed 1156 / 1157 / 1158',
                       'Untitled printed chapter · not applied','2.21.252 and 2.21.253',
                       'not a correction supported by both prints','printed Night Prayer book continues']:
            self.assertIn(phrase, rendered)


if __name__ == '__main__':
    unittest.main()

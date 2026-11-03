"""Prevent occurrence loss, false comparison matches and accidental intake admission."""
import copy
import importlib.util
import unittest
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('shortening_check', ROOT / 'scripts/check-shortening-intake.py')
check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check)


class SourceParagraphs(HTMLParser):
    def __init__(self):
        super().__init__()
        self.key = None
        self.texts = {}

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'p' and ('data-source' in attrs or 'data-block' in attrs):
            self.key = attrs.get('data-source', attrs.get('data-block'))
            self.texts[self.key] = ''

    def handle_data(self, text):
        if self.key is not None:
            self.texts[self.key] += text

    def handle_endtag(self, tag):
        if tag == 'p':
            self.key = None


class ShorteningIntakeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.values = check.load()

    def changed(self, mutate):
        values = copy.deepcopy(self.values)
        mutate(values[0])
        return values

    def test_complete_intake_checks_without_reader_admission(self):
        self.assertTrue(check.validate(*self.values))
        self.assertEqual(check.verify_epub(self.values[0], self.values[2]), 39)
        self.assertEqual([p for r in self.values[0]['records'] for p in r['printedReferences']], list(range(1080, 1120)))

    def test_combined_report_is_not_an_omission_or_duplicate(self):
        for mutate in [lambda a: a['combinedDigitalReferences'].clear(),
                       lambda a: a['missingPrintedReports'].append({'reference': '1041b'}),
                       lambda a: a['records'][11].update(printedReferences=[1091]),
                       lambda a: a['records'][12].update(printedReferences=[1092]),
                       lambda a: a['combinedDigitalReferences'][0].update(boundaryStart=0)]:
            with self.assertRaises(ValueError):
                check.validate(*self.changed(mutate))

    def test_repeated_reports_cannot_be_dropped_reordered_or_reassigned(self):
        for mutate in [lambda a: a['records'].pop(7),
                       lambda a: a['records'].__setitem__(8, copy.deepcopy(a['records'][7])),
                       lambda a: a['records'][17].update(sourceRecordId=a['records'][16]['sourceRecordId'])]:
            with self.assertRaises(ValueError):
                check.validate(*self.changed(mutate))

    def test_shared_english_records_retain_distinct_complete_narrator_spans(self):
        rows = {r['reference']: r for r in self.values[0]['records']}
        for group in [[1046, 1047], [1052, 1053], [1055, 1056, 1057]]:
            spans = [rows[n]['englishComparisons']['khan']['span'] for n in group]
            self.assertEqual(spans[0]['start'], 0)
            for left, right in zip(spans, spans[1:]):
                self.assertEqual(left['end'], right['start'])
                self.assertNotEqual(left['sha256'], right['sha256'])
            bad = self.changed(lambda a: a['records'][group[1]-1030]['englishComparisons']['khan'].update(span=copy.deepcopy(spans[0])))[0]
            with self.assertRaisesRegex(ValueError, 'report span'):
                check.verify_epub(bad, self.values[2])
        bad = self.changed(lambda a: a['records'][0]['englishComparisons']['khan'].update(bodySha256='0'*64))[0]
        with self.assertRaisesRegex(ValueError, 'Recorded English paragraphs'):
            check.verify_epub(bad, self.values[2])

    def test_body_locations_cannot_follow_the_wrong_english_label(self):
        for n in [1053, 1054, 1055]:
            bad = self.changed(lambda a: a['records'][n-1030]['englishComparisons']['bewley'].update(displayedReference=str(n), occurrence=1))
            with self.assertRaisesRegex(ValueError, 'Bewley locator'):
                check.validate(*bad)
        with self.assertRaisesRegex(ValueError, 'English occurrence'):
            check.validate(*self.changed(lambda a: a['records'][17]['englishComparisons']['khan'].update(reference='2.20.203')))

    def test_comparison_limitations_cannot_be_erased_or_promoted(self):
        for provider, refs in check.LIMITED.items():
            for n in refs:
                for field, value in [('status', 'located-body-not-wording-approval'), ('limitations', [])]:
                    with self.assertRaisesRegex(ValueError, 'Comparison limitation'):
                        check.validate(*self.changed(lambda a: a['records'][n-1030]['englishComparisons'][provider].update({field: value})))

    def test_narrator_correction_is_a_separate_unapplied_proposal(self):
        for mutate in [lambda a: a['proposedCorrections'].clear(),
                       lambda a: a['proposedCorrections'][0].update(status='applied'),
                       lambda a: a['proposedCorrections'][0].update(sourceReading='عن ابن بريدة'),
                       lambda a: a['proposedCorrections'][0]['witnesses'][1].update(reading='عن أبي بريدة')]:
            with self.assertRaises(ValueError):
                check.validate(*self.changed(mutate))
        block = next(b for b in self.values[1]['blocks'] if b['htmlId'] == 'mwaA')
        self.assertIn('عن أبي بريدة', block['text'])
        self.assertIn('عبد الله بن بريدة', block['text'])

    def test_all_textual_differences_remain_bound_to_exact_locations(self):
        for i in range(5):
            for mutate in [lambda a: a['unresolvedTextualDifferences'].pop(i),
                           lambda a: a['unresolvedTextualDifferences'][i].update(status='resolved'),
                           lambda a: a['unresolvedTextualDifferences'][i]['witnesses'][0].update(pdfPage=999),
                           lambda a: a['unresolvedTextualDifferences'][i].update(sourceBlockSha256='0'*64)]:
                with self.assertRaises(ValueError):
                    check.validate(*self.changed(mutate))
        self.assertIsNone(self.values[0]['unresolvedTextualDifferences'][3]['witnesses'][0]['reading'])

    def test_arabic_chains_and_closing_comments_cannot_be_truncated(self):
        blocks = {b['htmlId']: b['text'] for b in self.values[1]['blocks']}
        for n, pid, words in [(1041, 'mwJQ', 'وزاد الليث'), (1064, 'mwaA', 'عن أبي بريدة'),
                              (1065, 'mwbA', 'قال أبو عبد الله')]:
            self.assertIn(words, blocks[pid])
            changed_hash = check.sha(blocks[pid].split(words)[0])
            with self.assertRaisesRegex(ValueError, 'Arabic changed'):
                check.validate(*self.changed(lambda a: a['records'][n-1030].update(arabicSha256=changed_hash)))

    def test_chapter_material_and_blank_blocks_remain_separate(self):
        for mutate in [lambda a: a['source']['separateContextIds'].pop(),
                       lambda a: a['source'].update(blankIds=[]),
                       lambda a: a['chapterMaterial'][3]['context'].clear(),
                       lambda a: a['chapterMaterial'][0].update(readerEligible=True),
                       lambda a: a['chapterMaterial'][19].update(englishStatus='approved'),
                       lambda a: a['chapterComparisonLimits'].clear()]:
            with self.assertRaises(ValueError):
                check.validate(*self.changed(mutate))

    def test_intake_cannot_certify_or_rewrite_the_source(self):
        for mutate in [lambda a: a.update(readerAdmission=True),
                       lambda a: a.update(independentReview='approved'),
                       lambda a: a['source'].update(arabicChanged=True),
                       lambda a: a['printedComparisons'][0].update(sha256='0'*64),
                       lambda a: a['englishComparisons']['bewley'].update(sha256='0'*64)]:
            with self.assertRaises(ValueError):
                check.validate(*self.changed(mutate))

    @staticmethod
    def synthetic_bewley():
        labels = list(range(1030, 1053)) + [1054, 1055, 1055] + list(range(1056, 1069))
        return ('<p>1030. Other book<p><b>Chapter 24. Shortening</b>' + ''.join(
            f'<P><a>{label}</a>. Body &amp; {n}. See 1036.\nSee 1064.<P>Continuation {n}.'
            for n, label in zip(range(1030, 1069), labels)) + '<P><b>Chapter 25. Next</b><p>1068. Other book').encode()

    def test_locator_ignores_cross_references_and_preserves_repeated_labels(self):
        bodies = check.locate_bewley(self.synthetic_bewley())
        self.assertEqual(list(bodies), check.REFERENCES)
        for n, body in bodies.items():
            self.assertEqual(body['body'], f'Body & {n}. See 1036. See 1064. Continuation {n}.')
        self.assertEqual((bodies[1054]['displayedReference'], bodies[1054]['occurrence']), ('1055', 1))
        self.assertEqual((bodies[1055]['displayedReference'], bodies[1055]['occurrence']), ('1055', 2))
        audit = copy.deepcopy(self.values[0])
        for row in audit['records']:
            row['englishComparisons']['bewley']['bodySha256'] = check.sha(bodies[row['reference']]['body'])
        check.verify_bewley_bodies(audit, bodies)
        bodies[1055]['occurrence'] = 1
        with self.assertRaisesRegex(ValueError, 'recorded locator'):
            check.verify_bewley_bodies(audit, bodies)

    def test_locator_rejects_new_missing_reordered_or_unbounded_labels(self):
        raw = self.synthetic_bewley()
        for old, new in [(b'<a>1032</a>', b'<a>1031</a>'), (b'<a>1054</a>', b'<a>1053</a>'),
                         (b'<a>1068</a>', b'<a>1069</a>'), (b'Chapter 24.', b'Unknown'),
                         (b'Chapter 25.', b'Unknown')]:
            with self.assertRaises(ValueError):
                check.locate_bewley(raw.replace(old, new))

    def test_review_page_preserves_complete_source_and_discloses_pending_status(self):
        audit, inventory, _ = self.values
        rendered = check.render(audit, inventory)
        self.assertEqual(rendered, (ROOT / 'research/shortening-source-review.html').read_text())
        parser = SourceParagraphs()
        parser.feed(rendered)
        blocks = {b['htmlId']: b['text'] for b in inventory['blocks']}
        expected = {str(r['number']): '\n\n'.join(blocks[p] for p in r['paragraphIds']) for r in inventory['records']}
        expected.update({p: blocks[p] for c in inventory['chapters'] for p in [c['headingId'], *c['contextIds']]})
        self.assertEqual(parser.texts, expected)
        for phrase in ['Candidate evidence only', 'English remains pending', 'Proposed correction · not applied',
                       'Printed 1091 / 1092', 'Bewley label 1055, occurrence 2', 'Absent from this inspected']:
            self.assertIn(phrase, rendered)


if __name__ == '__main__':
    unittest.main()

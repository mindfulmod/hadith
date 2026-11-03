"""Guard source boundaries, comparison limitations and candidate-only status."""
import copy
import importlib.util
import json
import unittest
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('eclipses_check', ROOT / 'scripts/check-eclipses-intake.py')
check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check)


class SourceParagraphs(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.current = None
        self.texts = {}

    def handle_starttag(self, tag, attrs):
        if tag == 'p' and 'data-source' in dict(attrs):
            self.current = int(dict(attrs)['data-source'])
            self.texts[self.current] = ''

    def handle_data(self, text):
        if self.current is not None:
            self.texts[self.current] += text

    def handle_endtag(self, tag):
        if tag == 'p':
            self.current = None


class EclipsesIntakeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.values = check.load()

    def changed(self, mutate):
        values = copy.deepcopy(self.values)
        mutate(values[0])
        return values

    def test_source_inventory_reproduces_every_block_without_reader_admission(self):
        audit, inventory, english = self.values
        self.assertTrue(check.validate(*self.values))
        self.assertEqual(inventory, check.read('content/staging/bukhari-eclipses-wikisource/catalog.json'))
        self.assertEqual(len(inventory['records']), 24)
        self.assertEqual(len(inventory['chapters']), 19)
        self.assertEqual(len(inventory['blocks']), 51)
        self.assertFalse(inventory['readerEligible'])
        self.assertTrue(all(r['status'] == 'unreviewed' for r in inventory['records']))
        # Later reader admissions live in separate review batches; intake stays unapproved.

    def test_combined_passages_cover_every_printed_occurrence_without_extra_app_numbers(self):
        audit = self.values[0]
        self.assertEqual([p for r in audit['records'] for p in r['printedReferences']], list(range(1040, 1067)))
        for n in [1002, 1007, 1016]:
            for mutate in [lambda a: a['records'][n-993]['printedReferences'].pop(),
                           lambda a: a['records'][n-993]['printedParts'][1].update(start=1),
                           lambda a: a['records'][n-993]['printedParts'][1].update(continuesWithinDigitalEntry=False)]:
                with self.assertRaises(ValueError):
                    check.validate(*self.changed(mutate))
        with self.assertRaises(ValueError):
            check.validate(*self.changed(lambda a: a['missingPrintedReports'].append({'appReference': '1002b'})))

    def test_repeated_accounts_cannot_be_deduplicated_or_given_the_other_chain(self):
        for mutate in [lambda a: a['records'].pop(14),
                       lambda a: a['records'][14].update(arabicSha256=a['records'][9]['arabicSha256']),
                       lambda a: a['records'][14].update(paragraphIds=a['records'][9]['paragraphIds']),
                       lambda a: a['records'][15].update(printedReferences=[1041])]:
            with self.assertRaises(ValueError):
                check.validate(*self.changed(mutate))

    def test_every_khan_body_is_verified_against_actual_pinned_epub(self):
        self.assertEqual(check.verify_epub(self.values[0], self.values[2]), 23)
        bad = self.changed(lambda a: a['records'][0]['englishComparisons']['khan'].update(bodySha256='0'*64))[0]
        with self.assertRaisesRegex(ValueError, 'Recorded English paragraphs'):
            check.verify_epub(bad, self.values[2])

    def test_absent_english_occurrence_cannot_be_claimed_by_adjacent_number(self):
        for mutate in [lambda a: a['records'][19]['englishComparisons']['khan'].update(reference='2.18.169'),
                       lambda a: a['records'][20]['englishComparisons']['khan'].update(reference='2.18.168')]:
            with self.assertRaises(ValueError):
                check.validate(*self.changed(mutate))

    def test_known_damaged_comparisons_cannot_be_silently_promoted(self):
        for provider, references in [('bewley', check.BEWLEY_LIMITED), ('khan', check.KHAN_LIMITED)]:
            for n in references:
                with self.assertRaises(ValueError):
                    check.validate(*self.changed(lambda a: a['records'][n-993]['englishComparisons'][provider].update(status='located-body-not-wording-approval')))

    def test_correction_keeps_both_prints_and_original_unmodified_digital_wording(self):
        for mutate in [lambda a: a['proposedCorrections'][0].update(status='applied'),
                       lambda a: a['proposedCorrections'][0].update(before='زياد بن علاقة'),
                       lambda a: a['proposedCorrections'][0]['witnesses'].pop(),
                       lambda a: a['proposedCorrections'][0]['witnesses'][0].update(pdfPage=270),
                       lambda a: a['proposedCorrections'][0]['witnesses'][1].update(reading='زيادة بن علاقة')]:
            with self.assertRaises(ValueError):
                check.validate(*self.changed(mutate))
        original = next(b['text'] for b in self.values[1]['blocks'] if b['htmlId'] == 'mwWg')
        self.assertIn('زيادة بن علاقة', original)

    def test_chapter_material_and_blank_block_cannot_be_dropped_or_narrated(self):
        for mutate in [lambda a: a['source']['separateContextIds'].pop(),
                       lambda a: a['source'].update(blankIds=[]),
                       lambda a: a['chapterMaterial'][4]['context'].clear(),
                       lambda a: a['chapterMaterial'][0].update(readerEligible=True),
                       lambda a: a['chapterMaterial'][0].update(englishStatus='approved')]:
            with self.assertRaises(ValueError):
                check.validate(*self.changed(mutate))

    def test_candidate_cannot_claim_independent_approval_or_change_source(self):
        for mutate in [lambda a: a.update(readerAdmission=True),
                       lambda a: a.update(independentReview='approved'),
                       lambda a: a['source'].update(arabicChanged=True),
                       lambda a: a['records'][0].update(arabicSha256='0'*64),
                       lambda a: a['printedComparisons'][0].update(sha256='0'*64)]:
            with self.assertRaises(ValueError):
                check.validate(*self.changed(mutate))

    @staticmethod
    def synthetic_bewley():
        return ('<p>Other chapter 992. Previous text</p>' + ''.join(
            f'<p><a>{n}</a> . Body &amp; {n}</p>' if n in [997, 1002, 1004] else f'<p>{n}. Body &amp; {n}</p>'
            for n in range(993, 1017)) + '<h1>Chapter 23.</h1><p>1017. Next book</p>').encode()

    def test_english_locator_keeps_linked_labels_and_excludes_adjacent_books(self):
        bodies = check.locate_bewley(self.synthetic_bewley())
        self.assertEqual(bodies, {n: f'Body & {n}' for n in range(993, 1017)})
        audit = copy.deepcopy(self.values[0])
        for row in audit['records']:
            row['englishComparisons']['bewley']['bodySha256'] = check.sha(bodies[row['reference']])
        check.verify_bewley_bodies(audit, bodies)
        bodies[1002] += ' altered'
        with self.assertRaisesRegex(ValueError, 'recorded locator'):
            check.verify_bewley_bodies(audit, bodies)

    def test_english_locator_refuses_missing_repeated_or_unbounded_labels(self):
        raw = self.synthetic_bewley()
        for old, new in [(b'<a>997</a>', b'<a>998</a>'), (b'1016.', b'1015.'), (b'Chapter 23.', b'Unknown end')]:
            with self.assertRaises(ValueError):
                check.locate_bewley(raw.replace(old, new))

    def test_generated_page_preserves_all_source_text_and_states_review_limits(self):
        audit, inventory, _ = self.values
        rendered = check.render(audit, inventory)
        self.assertEqual(rendered, (ROOT / 'research/eclipses-source-review.html').read_text())
        parser = SourceParagraphs()
        parser.feed(rendered)
        blocks = {b['htmlId']: b['text'] for b in inventory['blocks']}
        self.assertEqual(parser.texts, {r['number']: '\n\n'.join(blocks[p] for p in r['paragraphIds']) for r in inventory['records']})
        self.assertIn('Candidate evidence only', rendered)
        self.assertIn('This historical intake does not grant reader admission', rendered)
        self.assertIn('English remains pending', rendered)


if __name__ == '__main__':
    unittest.main()

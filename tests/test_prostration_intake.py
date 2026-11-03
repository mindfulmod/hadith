"""Protect source occurrences, unresolved differences and intake-only status."""
import copy
import importlib.util
import unittest
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('prostration_check', ROOT / 'scripts/check-prostration-intake.py')
check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check)


class SourceParagraphs(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.current = None
        self.texts = {}

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'p':
            self.current = attrs.get('data-source', attrs.get('data-block'))
            if self.current is not None:
                if self.current in self.texts:
                    raise ValueError('Duplicate source paragraph')
                self.texts[self.current] = ''

    def handle_data(self, text):
        if self.current is not None:
            self.texts[self.current] += text

    def handle_endtag(self, tag):
        if tag == 'p':
            self.current = None


class ProstrationIntakeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.values = check.load()

    def changed(self, mutate):
        values = copy.deepcopy(self.values)
        mutate(values[0])
        return values

    def test_complete_source_inventory_reproduces_without_reader_admission(self):
        audit, inventory, english = self.values
        self.assertTrue(check.validate(*self.values))
        self.assertEqual(inventory, check.read('content/staging/bukhari-prostration-wikisource/catalog.json'))
        self.assertEqual(len(inventory['records']), 13)
        self.assertEqual(len(inventory['chapters']), 12)
        self.assertEqual(len(inventory['blocks']), 30)
        self.assertFalse(inventory['readerEligible'])
        self.assertTrue(all(r['status'] == 'unreviewed' for r in inventory['records']))

    def test_printed_occurrences_keep_content_mapping_and_cross_page_continuations(self):
        audit = self.values[0]
        self.assertEqual([p for r in audit['records'] for p in r['printedReferences']], list(range(1067, 1080)))
        for mutate in [lambda a: a['records'][4]['printedPages']['brill-1862'].pop(),
                       lambda a: a['records'][9]['printedPages']['dar-ibn-kathir-2002'].pop(),
                       lambda a: a['records'][5].update(printedReferences=[1071]),
                       lambda a: a['missingPrintedReports'].append({'appReference': '1020b'})]:
            with self.assertRaises(ValueError):
                check.validate(*self.changed(mutate))

    def test_repeated_accounts_cannot_be_deduplicated_or_share_another_chain(self):
        for mutate in [lambda a: a['records'].pop(6),
                       lambda a: a['records'][6].update(arabicSha256=a['records'][5]['arabicSha256']),
                       lambda a: a['records'][9].update(paragraphIds=a['records'][8]['paragraphIds']),
                       lambda a: a['records'][12].update(sourceRecordId=a['records'][8]['sourceRecordId'])]:
            with self.assertRaises(ValueError):
                check.validate(*self.changed(mutate))

    def test_closing_transmission_comments_and_appraisal_remain_in_complete_arabic(self):
        blocks = {b['htmlId']: b['text'] for b in self.values[1]['blocks']}
        for paragraph, words in [('mwFQ', 'ورواه ابن طهمان عن أيوب'),
                                 ('mwKA', 'قال أبو بكر وكان ربيعة من خيار الناس'),
                                 ('mwKA', 'وزاد نافع عن ابن عمر')]:
            self.assertIn(words, blocks[paragraph])
            values = copy.deepcopy(self.values)
            row = next(r for r in values[0]['records'] if paragraph in r['paragraphIds'])
            row['arabicSha256'] = check.sha(blocks[paragraph].replace(words, ''))
            with self.assertRaisesRegex(ValueError, 'Arabic changed'):
                check.validate(*values)

    def test_every_khan_comparison_uses_actual_pinned_epub_body(self):
        self.assertEqual(check.verify_epub(self.values[0], self.values[2]), 13)
        bad = self.changed(lambda a: a['records'][0]['englishComparisons']['khan'].update(bodySha256='0'*64))[0]
        with self.assertRaisesRegex(ValueError, 'Recorded English paragraphs'):
            check.verify_epub(bad, self.values[2])

    def test_known_english_defects_cannot_be_promoted_or_matched_to_adjacent_report(self):
        for provider, refs in check.LIMITED.items():
            for n in refs:
                with self.assertRaisesRegex(ValueError, 'Comparison limitation'):
                    check.validate(*self.changed(lambda a: a['records'][n-1017]['englishComparisons'][provider].update(status='located-body-not-wording-approval')))
        with self.assertRaisesRegex(ValueError, 'English occurrence'):
            check.validate(*self.changed(lambda a: a['records'][5]['englishComparisons']['khan'].update(reference='2.19.179')))

    def test_material_ablution_variant_cannot_be_removed_or_resolved_silently(self):
        for mutate in [lambda a: a['unresolvedTextualDifferences'].pop(0),
                       lambda a: a['unresolvedTextualDifferences'][0].update(status='approved'),
                       lambda a: a['unresolvedTextualDifferences'][0].update(sourceReading='على وضوء'),
                       lambda a: a['unresolvedTextualDifferences'][0]['witnesses'][1].update(reading='على غير وضوء')]:
            with self.assertRaises(ValueError):
                check.validate(*self.changed(mutate))

    def test_other_textual_differences_retain_both_witnesses_without_correction(self):
        for i in [1, 2]:
            for mutate in [lambda a: a['unresolvedTextualDifferences'][i]['witnesses'].pop(),
                           lambda a: a['unresolvedTextualDifferences'][i].update(independentReview='approved'),
                           lambda a: a['unresolvedTextualDifferences'][i]['witnesses'][0].update(pdfPage=274)]:
                with self.assertRaises(ValueError):
                    check.validate(*self.changed(mutate))
        with self.assertRaises(ValueError):
            check.validate(*self.changed(lambda a: a['proposedCorrections'].append({'reference': 1018, 'status': 'applied'})))

    def test_chapter_comparison_is_separate_from_locator_report_body(self):
        for mutate in [lambda a: a['chapterComparisonLimits'].clear(),
                       lambda a: a['chapterComparisonLimits'][0].update(locatedWithinReportBody=1027),
                       lambda a: a['chapterComparisonLimits'][0].update(status='approved')]:
            with self.assertRaises(ValueError):
                check.validate(*self.changed(mutate))

    def test_chapter_and_blank_blocks_cannot_be_dropped_or_become_narration(self):
        for mutate in [lambda a: a['source']['separateContextIds'].pop(),
                       lambda a: a['source'].update(blankIds=[]),
                       lambda a: a['chapterMaterial'][4]['context'].clear(),
                       lambda a: a['chapterMaterial'][0].update(readerEligible=True),
                       lambda a: a['chapterMaterial'][0].update(englishStatus='approved')]:
            with self.assertRaises(ValueError):
                check.validate(*self.changed(mutate))

    def test_intake_cannot_claim_independent_approval_or_rewrite_source(self):
        for mutate in [lambda a: a.update(readerAdmission=True),
                       lambda a: a.update(independentReview='approved'),
                       lambda a: a['source'].update(arabicChanged=True),
                       lambda a: a['printedComparisons'][0].update(sha256='0'*64)]:
            with self.assertRaises(ValueError):
                check.validate(*self.changed(mutate))

    @staticmethod
    def synthetic_bewley():
        return ('<p>1017. Unrelated earlier material</p><h1>Chapter 23.</h1>' + ''.join(
            f'<p><a>{n}</a> . Body &amp; {n}</p>' if n in [1024, 1027] else f'<p>{n}. Body &amp; {n}</p>'
            for n in check.REFERENCES) + '<h1>Chapter 24.</h1><p>1029. Unrelated next book</p>').encode()

    def test_english_locator_respects_book_boundaries_and_spaced_labels(self):
        bodies = check.locate_bewley(self.synthetic_bewley())
        self.assertEqual(bodies, {n: f'Body & {n}' for n in check.REFERENCES})
        audit = copy.deepcopy(self.values[0])
        for row in audit['records']:
            row['englishComparisons']['bewley']['bodySha256'] = check.sha(bodies[row['reference']])
        check.verify_bewley_bodies(audit, bodies)
        bodies[1025] += ' changed'
        with self.assertRaisesRegex(ValueError, 'recorded locator'):
            check.verify_bewley_bodies(audit, bodies)

    def test_english_locator_rejects_missing_repeated_reordered_or_unbounded_labels(self):
        raw = self.synthetic_bewley()
        for old, new in [(b'<a>1024</a>', b'<a>1023</a>'), (b'1029. Body', b'1028. Body'),
                         (b'1022. Body', b'1023. Body'), (b'Chapter 23.', b'Unknown start'),
                         (b'Chapter 24.', b'Unknown end')]:
            with self.assertRaises(ValueError):
                check.locate_bewley(raw.replace(old, new))

    def test_review_page_preserves_every_report_heading_and_context_exactly(self):
        audit, inventory, _ = self.values
        rendered = check.render(audit, inventory)
        self.assertEqual(rendered, (ROOT / 'research/prostration-source-review.html').read_text())
        parser = SourceParagraphs()
        parser.feed(rendered)
        blocks = {b['htmlId']: b['text'] for b in inventory['blocks']}
        expected = {str(r['number']): '\n\n'.join(blocks[p] for p in r['paragraphIds']) for r in inventory['records']}
        expected.update({p: blocks[p] for c in inventory['chapters'] for p in [c['headingId'], *c['contextIds']]})
        self.assertEqual(parser.texts, expected)
        self.assertIn('Candidate evidence only', rendered)
        self.assertIn('English remains pending', rendered)
        self.assertIn('None is an applied correction', rendered)


if __name__ == '__main__':
    unittest.main()

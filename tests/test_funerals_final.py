"""Guard book boundaries, complete source ownership and shared comparison bodies."""
import copy
import importlib.util
import unittest
from pathlib import Path
from test_actions_prayer_intake import SourceParagraphs

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('funerals_final', ROOT / 'scripts/check-funerals-final.py')
check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check)

class FuneralsFinalTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.values = check.load()
        cls.rows = {r['reference']: r for r in cls.values[0]['records']}

    def rejected(self, mutate):
        values = copy.deepcopy(self.values)
        mutate(values[0])
        with self.assertRaises(ValueError):
            check.validate(*values)

    def test_actual_bodies_and_all_prior_stages_verify(self):
        self.assertTrue(check.validate(*self.values))
        self.assertEqual(check.verify_epub(self.values[0], self.values[-1]), 40)
        coverage = self.values[0]['cumulativeCoverage']
        self.assertEqual(len(coverage['selectedReferences']), 150)
        self.assertEqual(len(coverage['modernPrintedReferencesIncludingMissingReport']), 158)
        self.assertEqual(len(coverage['matchedEnglishReferencesIncludingMissingReport']), 149)

    def test_location_completion_cannot_approve_wording_or_admission(self):
        for change in [lambda a: a.update(readerAdmission=True),
                       lambda a: a.update(independentReview='approved'),
                       lambda a: a['comparisonScope'].update(fullBookComparisonComplete=True),
                       lambda a: a['comparisonScope'].update(newReaderEntries=41),
                       lambda a: a['cumulativeCoverage'].update(wordingApproved=True),
                       lambda a: a['cumulativeCoverage'].update(missingPrintedReportStillPending=False)]:
            self.rejected(change)

    def test_original_closing_note_ownership_is_not_silently_repaired(self):
        values = copy.deepcopy(self.values)
        a, inv = values[0], values[-2]
        blocks = {b['htmlId']: b for b in inv['blocks']}
        phrase = a['ownershipFindings'][0]['sourceReading']
        first = blocks[self.rows[1306]['paragraphIds'][0]]
        second = blocks[self.rows[1307]['paragraphIds'][0]]
        self.assertNotIn(phrase, first['text'])
        self.assertIn(phrase, second['text'])
        first['text'] += phrase
        second['text'] = second['text'].replace(phrase, '')
        with self.assertRaises(ValueError):
            check.validate_ownership(a, inv)

    def test_closing_note_evidence_requires_both_bound_originals(self):
        for mutate in [lambda a: a['ownershipFindings'][0].update(sourceOwner=1306),
                       lambda a: a['ownershipFindings'][0]['sourceBindings'].pop(),
                       lambda a: a['ownershipFindings'][0]['witnesses'].pop(),
                       lambda a: a['ownershipFindings'][0].update(status='approved')]:
            a = copy.deepcopy(self.values[0]); mutate(a)
            with self.assertRaises(ValueError):
                check.validate_ownership(a, self.values[-2])

    def test_shared_english_bodies_do_not_merge_source_entries(self):
        for left, right, english in [(1297,1298,'2.23.445'),(1326,1327,'2.23.474')]:
            a = self.rows[left]['englishComparisons']['khan']['parts'][0]
            b = self.rows[right]['englishComparisons']['khan']['parts'][0]
            self.assertEqual(a['reference'], english)
            self.assertEqual(b['reference'], english)
            self.assertEqual(a['bodySha256'], b['bodySha256'])
            self.assertEqual(a['scope'], 'shared-body-first-occurrence')
            self.assertEqual(b['scope'], 'shared-body-continuation')
            self.assertNotEqual(self.rows[left]['paragraphIds'], self.rows[right]['paragraphIds'])
        self.assertEqual(self.rows[1328]['englishComparisons']['khan']['references'], ['2.23.475'])

    def test_split_pointer_and_closing_stay_with_1303(self):
        match = self.rows[1303]['englishComparisons']['khan']
        self.assertEqual(match['references'], ['2.23.450','2.23.451'])
        self.assertEqual([p['scope'] for p in match['parts']], ['main-account','as-above-pointer-and-closing-statement'])
        self.assertEqual(self.rows[1304]['englishComparisons']['khan']['references'], ['2.23.452'])
        a = copy.deepcopy(self.values[0])
        a['records'][13]['englishComparisons']['khan']['parts'].pop()
        with self.assertRaises(ValueError):
            check.verify_epub(a, self.values[-1])

    def test_numeric_offsets_cannot_replace_shared_continuations(self):
        for wrong, following in [(1298,1299),(1327,1328)]:
            a = copy.deepcopy(self.values[0])
            a['records'][wrong-1290]['englishComparisons']['khan'] = copy.deepcopy(a['records'][following-1290]['englishComparisons']['khan'])
            with self.assertRaises(ValueError):
                check.verify_epub(a, self.values[-1])

    def test_three_selected_occurrences_share_one_printed_number(self):
        for n in [1324,1325,1326]:
            self.assertEqual(self.rows[n]['printedReferences'], [1390])
        self.assertEqual(len({self.rows[n]['sourceRecordId'] for n in [1324,1325,1326]}), 3)
        self.assertEqual(self.rows[1327]['printedReferences'], [1391])
        self.rejected(lambda a: a['records'].pop(35))

    def test_trailing_english_records_keep_original_labels_and_stay_excluded(self):
        boundary = self.values[0]['englishComparisons']['khan']['bookBoundary']
        self.assertEqual([p['reference'] for p in boundary['excludedTrailingRecords']], ['2.23.'+str(n) for n in range(478,484)])
        for mutate in [lambda a: a['englishComparisons']['khan']['bookBoundary']['excludedTrailingRecords'].pop(),
                       lambda a: a['englishComparisons']['khan']['bookBoundary']['excludedTrailingRecords'][0].update(retainedEnglishBook=24),
                       lambda a: a['englishComparisons']['khan']['bookBoundary']['excludedTrailingRecords'][0].update(readerAdmission=True),
                       lambda a: a['englishComparisons']['khan']['bookBoundary'].update(followingSectionFirstReference='2.24.478')]:
            a = copy.deepcopy(self.values[0]); mutate(a)
            with self.assertRaises(ValueError):
                check.verify_epub(a, self.values[-1])

    def test_cumulative_coverage_preserves_missing_report_and_absent_english(self):
        coverage = self.values[0]['cumulativeCoverage']
        self.assertNotIn(1201, coverage['selectedReferences'])
        self.assertIn(1260, coverage['modernPrintedReferencesIncludingMissingReport'])
        self.assertEqual(coverage['selectedReferencesWithoutPinnedEpubCounterpart'], [1234])
        for mutate in [lambda a: a['cumulativeCoverage']['stages'].pop(),
                       lambda a: a['cumulativeCoverage']['matchedEnglishReferencesIncludingMissingReport'].append('2.23.478'),
                       lambda a: a['missingPrintedReport'].update(readerEligible=True)]:
            self.rejected(mutate)

    def test_quran_reference_check_cannot_amend_original_phrase_or_brace(self):
        a, inv = self.values[0], self.values[-2]
        blocks = {b['htmlId']: b['text'] for b in inv['blocks']}
        body = '\n\n'.join(blocks[p] for p in self.rows[1305]['paragraphIds'])
        q = a['quranReferenceChecks'][0]
        self.assertIn(q['sourcePhrase'], body)
        self.assertNotIn(q['historicalPhrase'], body)
        self.assertEqual(body.count('{'), 1)
        self.assertEqual(body.count('}'), 0)
        self.assertEqual(q['bewleyDisplayedCitation'], '16:80')
        self.assertEqual(q['selectedPhraseLocation']['reference'], '27:80')
        self.rejected(lambda a: a['proposedCorrections'].append({'reference':1305,'text':q['historicalPhrase']}))

    def test_long_report_keeps_both_narrator_insertions_and_source_chapter(self):
        inv = self.values[-2]; blocks = {b['htmlId']: b['text'] for b in inv['blocks']}
        body = '\n\n'.join(blocks[p] for p in self.rows[1320]['paragraphIds'])
        self.assertIn('قال بعض أصحابنا عن موسى', body)
        self.assertIn('قال يزيد ووهب بن جرير عن جرير بن حازم', body)
        self.assertIn('فلو استكملت أتيت منزلك', body)
        self.assertEqual(self.rows[1320]['chapterId'], 'chapter-91')
        self.rejected(lambda a: a['records'][30].update(chapterId='chapter-93'))

    def test_print_differences_and_all_closing_routes_stay_explicit(self):
        variants = {v['id']:v for v in self.values[0]['unresolvedTextualDifferences']}
        self.assertEqual(len(variants), 28)
        self.assertNotIn('1320-final-conditional', variants)
        closing = variants['1329-closing-route-order']
        self.assertEqual(closing['witnesses'][0]['pdfPages'], [351,352])
        for name in ['عبد الله بن عبد القدوس','محمد بن أنس','علي بن الجعد','ابن عرعرة','ابن أبي عدي']:
            self.assertIn(name, closing['sourceReading'])
        self.rejected(lambda a: a['unresolvedTextualDifferences'][0].update(status='approved'))

    def test_page_preserves_every_full_source_and_internal_link(self):
        a, inv = self.values[0], self.values[-2]
        page = check.render(a, inv)
        self.assertEqual(page, (ROOT/'research/funerals-final-source-review.html').read_text())
        parser = SourceParagraphs(); parser.feed(page)
        blocks = {b['htmlId']: b['text'] for b in inv['blocks']}
        expected = {str(r['reference']): '\n\n'.join(blocks[p] for p in r['paragraphIds']) for r in a['records']}
        self.assertEqual(parser.texts, expected)
        self.assertEqual(len(parser.ids), len(set(parser.ids)))
        self.assertTrue(set(parser.fragments) <= set(parser.ids))
        self.assertIn('All 150 selected occurrences', page)
        self.assertIn('Wording review remains pending', page)
        self.assertIn('2.24.484', page)

if __name__ == '__main__':
    unittest.main()

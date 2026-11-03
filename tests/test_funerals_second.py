"""Guard body matching, chapter boundaries and the unresolved Funerals findings."""
import copy
import importlib.util
import unittest
from pathlib import Path
from test_actions_prayer_intake import SourceParagraphs

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('funerals_second', ROOT / 'scripts/check-funerals-second.py')
check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check)

class FuneralsSecondTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.values = check.load()

    def rejected(self, mutate):
        values = copy.deepcopy(self.values)
        mutate(values[0])
        with self.assertRaises(ValueError):
            check.validate(*values)

    def test_new_comparisons_match_actual_epub_and_original_inventory(self):
        self.assertTrue(check.validate(*self.values))
        self.assertEqual(check.verify_epub(self.values[0], self.values[3]), 40)

    def test_partial_scope_cannot_admit_or_skip_remaining_work(self):
        for change in [lambda a: a.update(readerAdmission=True),
                       lambda a: a.update(independentReview='approved'),
                       lambda a: a['comparisonScope'].update(fullBookComparisonComplete=True),
                       lambda a: a['comparisonScope']['pendingReferences'].clear(),
                       lambda a: a['comparisonScope'].update(newReaderEntries=40),
                       lambda a: a['records'].reverse()]:
            self.rejected(change)

    def test_combined_printed_accounts_are_complete_and_not_new_app_entries(self):
        a = self.values[0]
        rows = {r['reference']: r for r in a['records']}
        self.assertEqual(rows[1222]['printedReferences'], [1281, 1282])
        self.assertEqual(rows[1226]['printedReferences'], [1286, 1287, 1288])
        self.assertEqual(len(a['records']), 40)
        self.assertEqual(len(a['distinctModernPrintedReferencesAccountedFor']), 43)
        self.rejected(lambda a: a['records'][16]['printedReferences'].pop())

    def test_chain_disagreement_cannot_be_silently_normalized(self):
        a, first, inv, en = copy.deepcopy(self.values)
        v = next(v for v in a['unresolvedTextualDifferences'] if v['id'] == '1214-chain-link')
        self.assertEqual(v['sourceReading'], 'عن هشام عن عروة عن أبيه')
        self.assertEqual([w['reading'] for w in v['witnesses']], ['عن هشام بن عروة عن أبيه'] * 2)
        block = next(b for b in inv['blocks'] if b['htmlId'] == v['paragraphId'])
        block['text'] = block['text'].replace(v['sourceReading'], v['witnesses'][0]['reading'])
        block['textSha256'] = check.sha(block['text'])
        with self.assertRaises(ValueError):
            check.validate(a, first, inv, en)

    def test_split_english_closing_and_absent_report_do_not_shift_neighbors(self):
        rows = {r['reference']: r for r in self.values[0]['records']}
        self.assertEqual(rows[1230]['englishComparisons']['khan']['references'], ['2.23.379', '2.23.380'])
        self.assertEqual(rows[1230]['englishComparisons']['khan']['parts'][1]['scope'], 'closing-statement-only')
        self.assertEqual(rows[1231]['englishComparisons']['khan']['references'], ['2.23.381'])
        self.assertEqual(rows[1234]['englishComparisons']['khan']['references'], [])
        self.assertEqual(rows[1235]['englishComparisons']['khan']['references'], ['2.23.384'])
        a = copy.deepcopy(self.values[0])
        a['records'][24]['englishComparisons']['khan'] = copy.deepcopy(a['records'][25]['englishComparisons']['khan'])
        with self.assertRaises(ValueError):
            check.verify_epub(a, self.values[3])

    def test_actual_english_body_verification_rejects_hash_or_missing_part(self):
        for mutate in [lambda a: a['records'][20]['englishComparisons']['khan']['parts'][1].update(bodySha256='0' * 64),
                       lambda a: a['records'][20]['englishComparisons']['khan']['parts'].pop()]:
            a = copy.deepcopy(self.values[0]); mutate(a)
            with self.assertRaises(ValueError):
                check.verify_epub(a, self.values[3])

    def test_differently_punctuated_chapters_do_not_leak_into_report_bodies(self):
        headings = dict(zip([1239, 1241], check.base.BEWLEY_HEADING_EXCEPTIONS))
        raw = '<h2>Chapter 28. The Book of Funerals</h2>'
        for n in range(1180, 1331):
            raw += f'<p>{n}. Body {n}</p>'
            if n in headings:
                raw += f'<p>Retained closing</p><p><b>{headings[n]}</b></p><p>Separate chapter context</p>'
            if n == 1216:
                raw += '<p>I. This ordinary paragraph remains part of the report.</p>'
        raw += '<p>Return to Contents</p>'
        rows = {r['reference']: r for r in check.base.locate_bewley(raw.encode())}
        for n in headings:
            self.assertEqual(rows[n]['bodySha256'], check.sha(f'Body {n} Retained closing'))
        self.assertEqual(rows[1216]['bodySha256'], check.sha('Body 1216 I. This ordinary paragraph remains part of the report.'))
        self.assertEqual(rows[1240]['bodySha256'], check.sha('Body 1240'))

    def test_boundary_correction_provenance_identifies_only_two_replaced_locators(self):
        first = self.values[1]
        corrections = first['englishComparisons']['bewley']['boundaryCorrections']
        locators = {r['reference']: r for r in first['englishComparisons']['bewley']['bodyLocators']}
        self.assertEqual([c['reference'] for c in corrections], [1239, 1241])
        for c in corrections:
            self.assertNotEqual(c['previousBodySha256'], c['correctedBodySha256'])
            self.assertEqual(c['correctedBodySha256'], locators[c['reference']]['bodySha256'])
        self.rejected(lambda a: a['englishComparisons']['bewley']['boundaryCorrections'].clear())

    def test_missing_closing_is_disclosed_and_not_inserted(self):
        a, _, inv, _ = self.values
        v = next(v for v in a['unresolvedTextualDifferences'] if v['id'] == '1242-umar-closing')
        text = next(b['text'] for b in inv['blocks'] if b['htmlId'] == v['paragraphId'])
        self.assertNotIn('يضرب فيه بالعصا', text)
        self.assertTrue(all('يضرب فيه بالعصا' in w['reading'] for w in v['witnesses']))
        self.rejected(lambda a: a['proposedCorrections'].append({'reference': 1242, 'approved': True}))

    def test_order_and_missing_heading_findings_remain_explicit(self):
        findings = {f['id']: f for f in self.values[0]['presentationFindings']}
        self.assertEqual(findings['historical-order-1227-1228']['references'], [1227, 1228])
        self.assertEqual(findings['historical-order-1247-1248']['references'], [1247, 1248])
        self.assertIn('chapter 33', findings['printed-untitled-division-before-1231']['finding'])
        self.rejected(lambda a: a['presentationFindings'].clear())

    def test_contradictory_english_narrator_editorial_is_not_source_authority(self):
        rows = {r['reference']: r for r in self.values[0]['records']}
        self.assertIn('Ibn Abbas', rows[1210]['englishComparisons']['bewley']['limitations'][0])
        self.assertIn('Aisha instead of Amir', rows[1233]['englishComparisons']['khan']['limitations'][0])
        self.rejected(lambda a: a['records'][23]['englishComparisons']['khan']['limitations'].clear())

    def test_review_page_preserves_every_full_selected_report_and_links(self):
        a, _, inv, _ = self.values
        page = check.render(a, inv)
        self.assertEqual(page, (ROOT / 'research/funerals-second-source-review.html').read_text())
        parser = SourceParagraphs(); parser.feed(page)
        blocks = {b['htmlId']: b['text'] for b in inv['blocks']}
        expected = {str(r['reference']): '\n\n'.join(blocks[p] for p in r['paragraphIds']) for r in a['records']}
        self.assertEqual(parser.texts, expected)
        self.assertEqual(len(parser.ids), len(set(parser.ids)))
        self.assertTrue(set(parser.fragments) <= set(parser.ids))
        self.assertIn('remaining 81 entries', page)
        self.assertIn('No counterpart found in this pinned section', page)

if __name__ == '__main__':
    unittest.main()

"""Guard complete accounts, shared English bodies and unapplied print readings."""
import copy
import importlib.util
import unittest
from pathlib import Path
from test_actions_prayer_intake import SourceParagraphs

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('funerals_third', ROOT / 'scripts/check-funerals-third.py')
check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check)

class FuneralsThirdTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.values = check.load()
        cls.rows = {r['reference']: r for r in cls.values[0]['records']}

    def rejected(self, mutate):
        values = copy.deepcopy(self.values)
        mutate(values[0])
        with self.assertRaises(ValueError):
            check.validate(*values)

    def test_actual_bodies_and_previous_stages_are_verified(self):
        self.assertTrue(check.validate(*self.values))
        self.assertEqual(check.verify_epub(self.values[0], self.values[4]), 39)

    def test_partial_scope_cannot_admit_or_skip_pending_work(self):
        for change in [lambda a: a.update(readerAdmission=True),
                       lambda a: a.update(independentReview='approved'),
                       lambda a: a['comparisonScope'].update(fullBookComparisonComplete=True),
                       lambda a: a['comparisonScope']['pendingReferences'].clear(),
                       lambda a: a['comparisonScope'].update(newReaderEntries=40),
                       lambda a: a['records'].reverse()]:
            self.rejected(change)

    def test_combined_print_references_do_not_split_selected_accounts(self):
        self.assertEqual(self.rows[1250]['printedReferences'], [1312, 1313])
        self.assertEqual(self.rows[1260]['printedReferences'], [1323, 1324])
        self.assertEqual(self.rows[1261]['printedReferences'], [1325])
        self.assertEqual(self.rows[1263]['printedReferences'], [1327, 1328])
        self.assertEqual(self.rows[1289]['printedReferences'], [1354, 1355])
        self.assertEqual(len(self.values[0]['distinctModernPrintedReferencesAccountedFor']), 44)
        self.rejected(lambda a: a['records'][-1]['printedReferences'].pop())

    def test_historical_chain_cannot_be_inserted_into_original_source(self):
        a, prior, first, inv, en = copy.deepcopy(self.values)
        v = next(v for v in a['unresolvedTextualDifferences'] if v['id'] == '1261-intervening-chain')
        self.assertIn('معمر', v['witnesses'][0]['reading'])
        self.assertNotIn('معمر', v['witnesses'][1]['reading'])
        self.assertEqual(v['witnesses'][1]['pdfPages'], [319, 320])
        block = next(b for b in inv['blocks'] if b['htmlId'] == v['paragraphId'])
        block['text'] = block['text'].replace(v['sourceReading'], v['witnesses'][0]['reading'])
        block['textSha256'] = check.sha(block['text'])
        with self.assertRaises(ValueError):
            check.validate(a, prior, first, inv, en)

    def test_shared_english_body_has_two_explicit_source_owners(self):
        a = self.rows[1282]['englishComparisons']['khan']['parts'][0]
        b = self.rows[1283]['englishComparisons']['khan']['parts'][0]
        self.assertEqual(a['reference'], b['reference'])
        self.assertEqual(a['reference'], '2.23.431')
        self.assertEqual(a['bodySha256'], b['bodySha256'])
        self.assertEqual(a['scope'], 'shared-body-first-occurrence')
        self.assertEqual(b['scope'], 'shared-body-continuation')
        self.assertEqual(self.rows[1284]['englishComparisons']['khan']['references'], ['2.23.432'])
        self.assertEqual(self.rows[1289]['englishComparisons']['khan']['references'], ['2.23.437'])

    def test_numeric_offset_cannot_attach_mecca_body_to_uhud_continuation(self):
        a = copy.deepcopy(self.values[0])
        a['records'][33]['englishComparisons']['khan'] = copy.deepcopy(a['records'][34]['englishComparisons']['khan'])
        with self.assertRaises(ValueError):
            check.verify_epub(a, self.values[4])

    def test_epub_hash_and_shared_scope_fail_closed(self):
        for mutate in [lambda a: a['records'][33]['englishComparisons']['khan']['parts'][0].update(bodySha256='0'*64),
                       lambda a: a['records'][33]['englishComparisons']['khan']['parts'][0].update(scope='located-body'),
                       lambda a: a['records'][33]['englishComparisons']['khan']['parts'].clear()]:
            a = copy.deepcopy(self.values[0]); mutate(a)
            with self.assertRaises(ValueError):
                check.verify_epub(a, self.values[4])

    def test_closing_comment_roles_and_english_omissions_remain_disclosed(self):
        a = self.values[0]
        v = next(v for v in a['unresolvedTextualDifferences'] if v['id'] == '1277-closing-attributions')
        self.assertIn('قال أبو عبد الله', v['sourceReading'])
        self.assertNotIn('قال أبو عبد الله', v['witnesses'][0]['reading'])
        self.assertIn('Abu Abd Allah', self.rows[1277]['englishComparisons']['khan']['limitations'][0])
        self.rejected(lambda a: a['records'][27]['englishComparisons']['khan']['limitations'].clear())

    def test_short_parallel_occurrences_cannot_borrow_longer_wording(self):
        blocks = {b['htmlId']: b['text'] for b in self.values[3]['blocks']}
        body = lambda n: '\n\n'.join(blocks[p] for p in self.rows[n]['paragraphIds'])
        self.assertNotIn('يوم القيامة', body(1282))
        self.assertIn('يوم القيامة', body(1288))
        self.assertIn('في ثوب واحد', body(1282))
        self.assertNotIn('في ثوب واحد', body(1288))
        self.assertIn('single-garment', self.rows[1288]['englishComparisons']['bewley']['limitations'][0])
        self.rejected(lambda a: a['proposedCorrections'].append({'reference':1288,'text':'في ثوب واحد'}))

    def test_linked_opening_preserves_previous_chain_context(self):
        findings = {f['id']: f for f in self.values[0]['presentationFindings']}
        self.assertEqual(findings['linked-opening-1283']['references'], [1282, 1283])
        self.assertEqual(self.rows[1282]['chapterId'], self.rows[1283]['chapterId'])
        self.assertIn('separate reader note', findings['linked-opening-1283']['finding'])
        self.rejected(lambda a: a['presentationFindings'].clear())

    def test_name_and_honorific_variants_remain_unapplied(self):
        vs = {v['id']: v for v in self.values[0]['unresolvedTextualDifferences']}
        self.assertIn('أبو هارون', vs['1285-closing-narrator']['sourceReading'])
        self.assertIn('أبو هريرة', vs['1285-closing-narrator']['witnesses'][0]['reading'])
        injury = vs['1274-injury-and-honorific']
        self.assertIn('عليهما السلام', injury['sourceReading'])
        self.assertNotIn('ففقأ عينه', injury['sourceReading'])
        self.assertIn('ففقأ عينه', injury['witnesses'][0]['reading'])
        self.rejected(lambda a: a['unresolvedTextualDifferences'][0].update(status='approved'))

    def test_review_page_retains_complete_arabic_and_working_links(self):
        a, _, _, inv, _ = self.values
        page = check.render(a, inv)
        self.assertEqual(page, (ROOT/'research/funerals-third-source-review.html').read_text())
        parser = SourceParagraphs(); parser.feed(page)
        blocks = {b['htmlId']: b['text'] for b in inv['blocks']}
        expected = {str(r['reference']): '\n\n'.join(blocks[p] for p in r['paragraphIds']) for r in a['records']}
        self.assertEqual(parser.texts, expected)
        self.assertEqual(len(parser.ids), len(set(parser.ids)))
        self.assertTrue(set(parser.fragments) <= set(parser.ids))
        self.assertIn('remaining 41 entries', page)
        self.assertIn('109 of 150', page)

if __name__ == '__main__':
    unittest.main()

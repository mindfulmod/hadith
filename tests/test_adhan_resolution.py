"""Keep duplicate-labelled reports distinct without rewriting or shifting references."""
import copy
import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('adhan_resolution', ROOT / 'scripts/resolve-wikisource-layout.py')
resolution = importlib.util.module_from_spec(spec)
spec.loader.exec_module(resolution)


class AdhanResolutionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.audit = resolution.audit_tool.build(ROOT / 'content/sources/wikisource-adhan')
        cls.review = resolution.read(ROOT / 'content/review/adhan-layout-review.json')
        cls.english = resolution.read(ROOT / 'content/staging/bukhari-en-islamhouse/catalog.json')
        cls.result = resolution.resolve(cls.audit, cls.review, cls.english)

    def reject(self, mutate, message):
        review = copy.deepcopy(self.review)
        mutate(review)
        with self.assertRaisesRegex(ValueError, message):
            resolution.resolve(self.audit, review, self.english)

    def test_every_original_character_and_unit_has_one_owner(self):
        result = self.result
        self.assertEqual(result['originalBlocks'], self.audit['blocks'])
        self.assertEqual(len(result['blocks']), 224)
        self.assertEqual(sum(len(b['text']) for b in result['blocks']), 39955)
        for original in self.audit['blocks']:
            units = [b for b in result['blocks'] if b['origin']['blockId'] == original['htmlId']]
            self.assertEqual(''.join(b['text'] for b in units), original['text'])
            self.assertEqual(units[0]['origin']['start'], 0)
            self.assertEqual(units[-1]['origin']['end'], len(original['text']))
            self.assertTrue(all(b['origin']['blockSha256'] == original['textSha256'] for b in units))
        owned = result['blankIds'] + result['formattingIds']
        owned += [p for c in result['chapters'] for p in [c['headingId'], *c['contextIds']]]
        owned += [p for r in result['records'] for p in r['paragraphIds']]
        self.assertEqual(len(owned), len(set(owned)))
        self.assertEqual(set(owned), {b['htmlId'] for b in result['blocks']})

    def test_both_619_paragraphs_survive_with_different_reference_identities(self):
        records = self.result['records']
        self.assertEqual([r['number'] for r in records], list(range(578, 620)) + ['619b'] + list(range(620, 699)))
        first, second = [r for r in records if r['sourceReference']['number'] == 619]
        self.assertEqual([first['number'], second['number']], [619, '619b'])
        self.assertEqual(first['sourceReference'], {'label': '619', 'number': 619, 'markerId': 'mwiA:0', 'occurrence': 1})
        self.assertEqual(second['sourceReference'], {'label': '619', 'number': 619, 'markerId': 'mwig:0', 'occurrence': 2})
        self.assertNotEqual(first['id'], second['id'])
        self.assertNotEqual(first['paragraphIds'], second['paragraphIds'])
        self.assertEqual(second['referenceMapping']['bewley']['reference'], '619b')
        self.assertEqual(second['referenceMapping']['modernPrintReference'], '646')
        self.assertEqual(second['referenceMapping']['khan']['reference'], '1.11.619')
        blocks = {b['htmlId']: b['text'] for b in self.result['blocks']}
        self.assertTrue(blocks[first['paragraphIds'][0]].startswith('[619] '))
        self.assertTrue(blocks[second['paragraphIds'][0]].startswith('[619] '))
        self.assertIn('بسبع وعشرين', blocks[first['paragraphIds'][0]])
        self.assertIn('بخمس وعشرين', blocks[second['paragraphIds'][0]])

    def test_chapter_context_and_blanks_are_preserved_separately(self):
        result = self.result
        self.assertEqual(len(result['chapters']), 80)
        self.assertEqual(sum(len(c['contextIds']) for c in result['chapters']), 20)
        self.assertEqual(result['blankIds'], ['mwgA', 'mwAaw'])
        self.assertEqual(result['chapters'][29]['entryNumbers'], [619, '619b', 620])
        self.assertEqual(result['chapters'][0]['contextIds'], ['mwBg'])

    def test_dropping_merging_or_reordering_the_duplicate_is_refused(self):
        self.reject(lambda r: r['decisions'].clear(), 'Missing, duplicated')
        self.reject(lambda r: r['expected']['numbers'].remove('619b'), 'Resolved report references')
        self.reject(lambda r: r['expected']['numbers'].insert(43, 619), 'Invalid reviewed coverage')
        self.reject(lambda r: r['expected']['numbers'].reverse(), 'Invalid reviewed coverage')
        self.reject(lambda r: r['decisions'][0]['units'][0].update(end=10), 'Uncovered source tail')
        self.reject(lambda r: r['decisions'][0]['units'][0].update(kind='text'), 'source marker cannot be hidden')

    def test_suffixed_reference_requires_matching_book_and_pinned_evidence(self):
        self.reject(lambda r: r['decisions'][0]['units'][0].pop('referenceMapping'), 'Unexpected reference mapping')
        self.reject(lambda r: r['decisions'][0]['units'][0]['referenceMapping']['bewley'].update(reference='619'), 'Missing matched Bewley')
        self.reject(lambda r: r['decisions'][0]['units'][0]['referenceMapping']['bewley'].update(url='https://aishabewley.org/bukhari3'), 'Missing matched Bewley')
        self.reject(lambda r: r['decisions'][0]['units'][0]['referenceMapping']['khan'].update(reference='1.4.163'), 'Invalid English comparison')
        self.reject(lambda r: r['decisions'][0]['units'][0]['referenceMapping']['khan'].update(recordSha256='0' * 64), 'Stale English reference')
        self.reject(lambda r: r['decisions'][0]['units'][0]['referenceMapping'].update(sourceNumber=620), 'Mapping differs')

    def test_reference_parser_rejects_ambiguous_or_coerced_forms(self):
        for value in [True, False, 0, -1, 619.5, '619', '0619b', '619B', '619bb', '619 b', '٦١٩b', None, [], {}]:
            with self.subTest(value=value), self.assertRaisesRegex(ValueError, 'Invalid reviewed report reference'):
                resolution.reference_key(value)
        self.assertEqual(sorted([620, '619b', 619, 9, 10], key=resolution.reference_key), [9, 10, 619, '619b', 620])

    def test_two_inspected_prints_and_unchanged_source_are_required(self):
        self.reject(lambda r: r['decisions'][0]['printedWitnesses'].pop(), 'two distinct printed witnesses')
        self.reject(lambda r: r['decisions'][0]['printedWitnesses'][1].update(pdfPages=[]), 'Invalid printed witness')
        self.reject(lambda r: r.update(auditSha256='0' * 64), 'stale source evidence')
        self.reject(lambda r: r['decisions'][0].update(blockSha256='0' * 64), 'Changed original block')

    def test_schema_change_and_candidate_status_are_explicit(self):
        self.assertEqual(self.result['schemaVersion'], 3)
        self.assertEqual(self.result['status'], 'candidate-layout-mapped-not-approved')
        self.assertFalse(self.result['readerEligible'])
        self.assertTrue(all(r['status'] == 'unreviewed' for r in self.result['records']))
        self.assertEqual(self.result, resolution.read(ROOT / 'content/staging/bukhari-adhan-wikisource/catalog.json'))
        registry = resolution.read(ROOT / 'content/sources/wikisource-books.json')
        self.assertEqual(dict(resolution.build_registered(registry, check=True))['adhan'], self.result)


if __name__ == '__main__':
    unittest.main()

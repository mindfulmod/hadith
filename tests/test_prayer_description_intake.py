"""Protect the joined 817/818 source boundary and excluded overlapping page."""
import copy
import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


resolution = module('prayer_description_resolution', 'scripts/resolve-wikisource-layout.py')
book = module('prayer_description_book', 'scripts/import-wikisource-book.py')


def read(path):
    return json.loads((ROOT / path).read_text())


class PrayerDescriptionIntakeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory = ROOT / 'content/sources/wikisource-prayer-description'
        cls.audit = resolution.audit_tool.build(cls.directory)
        cls.review = read('content/review/prayer-description-layout-review.json')
        cls.english = read('content/staging/bukhari-en-islamhouse/catalog.json')
        cls.result = resolution.resolve(cls.audit, cls.review, cls.english)

    def test_every_original_character_has_one_owner_and_keeps_source_order(self):
        result = self.result
        self.assertEqual(len(result['originalBlocks']), 240)
        self.assertEqual(len(result['blocks']), 241)
        self.assertEqual(sum(len(b['text']) for b in result['blocks']), 45865)
        self.assertEqual([r['number'] for r in result['records']], list(range(699, 836)))
        self.assertEqual(result['originalBlocks'], self.audit['blocks'])
        self.assertEqual(result, read('content/staging/bukhari-prayer-description-wikisource/catalog.json'))
        cursor = 0
        for original in result['originalBlocks']:
            parts = [b for b in result['blocks'] if b['origin']['blockId'] == original['htmlId']]
            self.assertEqual(''.join(b['text'] for b in parts), original['text'])
            self.assertEqual([b['ordinal'] for b in parts], list(range(cursor, cursor + len(parts))))
            cursor += len(parts)
            for part in parts:
                origin = part['origin']
                self.assertEqual(part['text'], original['text'][origin['start']:origin['end']])
                self.assertEqual(origin['blockSha256'], original['textSha256'])
        owned = result['blankIds'] + result['formattingIds']
        owned += [i for c in result['chapters'] for i in [c['headingId'], *c['contextIds']]]
        owned += [i for r in result['records'] for i in r['paragraphIds']]
        self.assertEqual(len(owned), len(set(owned)))
        self.assertEqual(set(owned), {b['htmlId'] for b in result['blocks']})

    def test_joined_reports_keep_separate_chains_and_the_entire_closing_comment(self):
        blocks = {b['htmlId']: b for b in self.result['blocks']}
        first, second = [r for r in self.result['records'] if r['number'] in [817, 818]]
        self.assertEqual(first['paragraphIds'], ['mwAYM@0-567'])
        self.assertEqual(second['paragraphIds'], ['mwAYM@567-742'])
        self.assertNotEqual(first['id'], second['id'])
        self.assertEqual(first['chapterId'], second['chapterId'])
        a, b = [blocks[r['paragraphIds'][0]]['text'] for r in [first, second]]
        self.assertTrue(a.startswith('[817] حدثنا سعيد بن عفير'))
        self.assertTrue(a.endswith('وقال أحمد بن صالح بعد حديث يونس عن ابن شهاب وهو يثبت قول يونس  '))
        self.assertTrue(b.startswith('[818] حدثنا أبو معمر قال: حدثنا عبد الوارث عن عبد العزيز'))
        self.assertTrue(b.endswith('أو لا يصلين معنا '))
        self.assertEqual(a + b, next(x['text'] for x in self.audit['blocks'] if x['htmlId'] == 'mwAYM'))

    def test_ordinary_import_or_an_incomplete_boundary_map_is_refused(self):
        with self.assertRaisesRegex(ValueError, 'layout'):
            book.build(self.directory)
        mutations = [lambda r: r['decisions'].clear(),
                     lambda r: r['decisions'][0]['units'][0].update(end=566),
                     lambda r: r['decisions'][0]['units'][1].update(end=741),
                     lambda r: r['decisions'][0]['printedWitnesses'].pop()]
        for mutate in mutations:
            with self.subTest(mutation=mutate):
                changed = copy.deepcopy(self.review)
                mutate(changed)
                with self.assertRaises(ValueError):
                    resolution.resolve(self.audit, changed, self.english)

    def test_chapter_only_material_is_not_invented_as_numbered_hadith(self):
        result = self.result
        self.assertEqual(len(result['chapters']), 84)
        self.assertEqual(sum(len(c['contextIds']) for c in result['chapters']), 20)
        self.assertEqual([(c['id'], c['contextIds']) for c in result['chapters'] if not c['entryNumbers']],
                         [('chapter-38', ['mwvA']), ('chapter-49', ['mw8Q'])])
        context = {i for c in result['chapters'] for i in c['contextIds']}
        report = {i for r in result['records'] for i in r['paragraphIds']}
        self.assertFalse(context & report)
        self.assertFalse(result['readerEligible'])
        self.assertTrue(all(r['status'] == 'unreviewed' for r in result['records']))
        self.assertEqual(result['layoutReview']['status'], 'ai-reviewed-layout-only')

    def test_comparison_identity_does_not_assume_equal_reference_numbers(self):
        evidence = read('research/prayer-description-source-audit.json')['joinedParagraphEvidence']
        self.assertEqual([(r['selectedReference'], r['khan']['reference']) for r in evidence['matchedRecords']],
                         [(817, '1.12.814'), (818, '1.12.815')])
        for row in evidence['matchedRecords']:
            match = next(r for r in self.english['records'] if r['id'] == row['khan']['sourceRecordId'])
            self.assertEqual(match['textSha256'], row['khan']['recordSha256'])
            self.assertEqual(self.english['sourceSha256'], row['khan']['sourceSha256'])
            candidate = next(r for r in self.result['records'] if r['number'] == row['selectedReference'])
            self.assertEqual(candidate['id'], row['sourceRecordId'])
            self.assertEqual(candidate['paragraphIds'], row['paragraphIds'])

    def test_alternate_page_alignment_preserves_all_evidence_and_duplicate_labels(self):
        selected = resolution.audit_tool.build(ROOT / 'content/sources/wikisource-adhan')
        alternate = resolution.audit_tool.build(ROOT / 'content/sources/wikisource-congregation-overlap')
        review = read('content/review/congregation-overlap-review.json')
        self.assertEqual(selected['sourceSha256'], review['selectedSource']['sha256'])
        self.assertEqual(alternate['sourceSha256'], review['alternateSource']['sha256'])
        start = next(i for i, b in enumerate(selected['blocks']) if b['htmlId'] == 'باب_وجوب_صلاة_الجماعة')
        tail = selected['blocks'][start:]
        blank = [b for b in tail if not b['text'].strip()]
        self.assertEqual([(b['htmlId'], b['text']) for b in blank], [('mwAaw', '\n')])
        self.assertEqual(review['selectedOnlyBlankBlocks'], [{'htmlId': b['htmlId'], 'textSha256': b['textSha256'], 'codePoints': len(b['text'])} for b in blank])
        nonblank = [b for b in tail if b['text'].strip()]
        self.assertEqual(len(nonblank), 147)
        self.assertEqual(len(alternate['blocks']), 147)
        pairs = []
        for a, b in zip(nonblank, alternate['blocks']):
            self.assertEqual(a['tag'], b['tag'])
            kind = 'exact' if a['text'] == b['text'] else 'trailing-space-only' if a['text'].rstrip(' ') == b['text'].rstrip(' ') else 'added-tail'
            if kind == 'added-tail':
                self.assertEqual((a['htmlId'], b['htmlId']), ('mwpA', 'mwJw'))
                self.assertTrue(b['text'].startswith(a['text']))
            pairs.append({'selectedId': a['htmlId'], 'alternateId': b['htmlId'], 'tag': a['tag'], 'selectedSha256': a['textSha256'], 'alternateSha256': b['textSha256'], 'selectedCodePoints': len(a['text']), 'alternateCodePoints': len(b['text']), 'comparison': kind})
        self.assertEqual(pairs, review['pairs'])
        self.assertEqual([p['selectedId'] for p in pairs if p['comparison'] != 'exact'], ['mwpA', 'mwqA', 'mw0A', 'mwASQ'])
        self.assertEqual(sum(p['comparison'] == 'exact' for p in pairs), 143)
        self.assertEqual(sum(p['tag'] == 'h3' for p in pairs), 52)
        labels = [m['number'] for m in alternate['markers']]
        self.assertEqual(labels, [618, 619, *range(619, 699)])
        self.assertEqual(len(labels), 82)

    def test_alternate_page_remains_excluded_and_cannot_replace_the_selected_628(self):
        manifest = read('content/sources/wikisource-congregation-overlap/manifest.json')
        review = read('content/review/congregation-overlap-review.json')
        registry = read('content/sources/wikisource-books.json')
        self.assertFalse(manifest['readerEligible'])
        self.assertFalse(review['readerEligible'])
        self.assertEqual(manifest['status'], 'excluded-overlapping-alternate-text')
        self.assertNotIn('congregation-overlap', [r['id'] for r in registry['books'] + registry['pendingLayoutAudits']])
        selected = next(p for p in review['pairs'] if p['selectedId'] == 'mwpA')
        entry = next(e for e in read('content/review/adhan-third-review.json')['entries'] if e['number'] == 628)
        self.assertEqual(entry['arabicSha256'], selected['selectedSha256'])
        self.assertNotEqual(entry['arabicSha256'], selected['alternateSha256'])
        self.assertGreater(selected['alternateCodePoints'], selected['selectedCodePoints'])
        self.assertNotIn('congregation-overlap', (ROOT / 'reader/release.mjs').read_text())


if __name__ == '__main__':
    unittest.main()

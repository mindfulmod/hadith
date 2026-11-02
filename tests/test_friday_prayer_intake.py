"""Protect source ownership, edition grouping and English reference identity."""
import copy
import importlib.util
import json
import re
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


resolution = module('friday_resolution', 'scripts/resolve-wikisource-layout.py')
book = module('friday_book', 'scripts/import-wikisource-book.py')
english_tool = module('friday_english', 'scripts/import-english.py')


def read(path):
    return json.loads((ROOT / path).read_text())


class FridayPrayerIntakeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory = ROOT / 'content/sources/wikisource-friday-prayer'
        cls.audit = resolution.audit_tool.build(cls.directory)
        cls.review = read('content/review/friday-prayer-layout-review.json')
        cls.english = read('content/staging/bukhari-en-islamhouse/catalog.json')
        cls.result = resolution.resolve(cls.audit, cls.review, cls.english)
        cls.research = read('research/friday-prayer-source-audit.json')

    def test_every_character_and_source_order_survives_the_structural_map(self):
        result = self.result
        self.assertEqual(len(result['originalBlocks']), 115)
        self.assertEqual(len(result['blocks']), 116)
        self.assertEqual(sum(len(b['text']) for b in result['blocks']), 20570)
        self.assertEqual([r['number'] for r in result['records']], list(range(836, 900)))
        self.assertEqual(result, read('content/staging/bukhari-friday-prayer-wikisource/catalog.json'))
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

    def test_opening_quran_quotation_is_chapter_context_not_numbered_narration(self):
        blocks = {b['htmlId']: b for b in self.result['blocks']}
        chapter, report = self.result['chapters'][0], self.result['records'][0]
        self.assertEqual(chapter['contextIds'], ['mwBg@0-110'])
        self.assertEqual(report['paragraphIds'], ['mwBg@110-452'])
        context = blocks[chapter['contextIds'][0]]['text']
        narration = blocks[report['paragraphIds'][0]]['text']
        self.assertTrue(context.startswith('لقول الله تعالى'))
        self.assertTrue(context.endswith('إن كنتم تعلمون }\n'))
        self.assertTrue(narration.startswith('[836] حدثنا أبو اليمان'))
        self.assertIn('عبد الرحمن بن هرمز الأعرج مولى ربيعة بن الحارث', narration)
        self.assertEqual(report['sourceReference'], {'label': '836', 'number': 836, 'markerId': 'mwBg:110', 'occurrence': 1})
        self.assertEqual(context + narration, next(b['text'] for b in self.audit['blocks'] if b['htmlId'] == 'mwBg'))
        self.assertEqual(len(self.result['chapters']), 40)
        self.assertEqual(sum(len(c['contextIds']) for c in self.result['chapters']), 12)

    def test_ordinary_import_and_incomplete_or_fabricated_boundaries_are_refused(self):
        with self.assertRaisesRegex(ValueError, 'layout'):
            book.build(self.directory)
        mutations = [
            lambda r: r['decisions'].clear(),
            lambda r: r['decisions'][0]['units'][0].update(end=109),
            lambda r: r['decisions'][0]['units'][1].update(start=111),
            lambda r: r['decisions'][0]['units'][1].update(end=451),
            lambda r: r['decisions'][0]['units'][0].update(kind='blank'),
            lambda r: r['decisions'][0]['units'][0].update(kind='report-start', number=835),
            lambda r: r['decisions'][0]['units'][1].update(kind='text'),
            lambda r: r['decisions'][0]['units'].reverse(),
            lambda r: r['decisions'][0]['printedWitnesses'].pop(),
            lambda r: r['decisions'][0]['printedWitnesses'][0].update(sha256='0' * 64),
            lambda r: r['decisions'][0].update(blockSha256='0' * 64),
            lambda r: r.update(auditSha256='0' * 64),
        ]
        for mutate in mutations:
            with self.subTest(mutation=mutate):
                changed = copy.deepcopy(self.review)
                mutate(changed)
                with self.assertRaises(ValueError):
                    resolution.resolve(self.audit, changed, self.english)

    def test_three_modern_numbers_do_not_create_duplicates_of_the_compound_entry(self):
        finding = self.research['compoundReport']
        entry = next(r for r in self.result['records'] if r['number'] == 856)
        text = '\n\n'.join(next(b['text'] for b in self.result['blocks'] if b['htmlId'] == p) for p in entry['paragraphIds'])
        self.assertEqual(finding['modernPrintReferences'], ['896', '897', '898'])
        self.assertEqual(finding['arabicSha256'], resolution.layout.sha(text))
        self.assertEqual(finding['khanReference'], '2.13.21')
        self.assertIn('فسكت، ثم قال حق', text)
        self.assertIn('رواه أبان بن صالح عن مجاهد عن طاوس عن أبي هريرة', text)
        parts = finding['selectedSpans']
        self.assertEqual([(p['start'], p['end']) for p in parts], [(0, 254), (254, 326), (326, 445)])
        self.assertEqual(''.join(text[p['start']:p['end']] for p in parts), text)
        for p in parts:
            self.assertEqual(resolution.layout.sha(text[p['start']:p['end']]), p['selectedTextSha256'])
        self.assertEqual(len([r for r in self.result['records'] if r['number'] == 856]), 1)

    def test_same_legacy_english_number_cannot_stand_in_for_the_other_body(self):
        finding = self.research['englishReferenceCollision']
        self.assertEqual(finding['reference'], 880)
        evidence = finding['pinnedEpubRecordAtThatReference']
        record = next(r for r in self.english['records'] if r['id'] == evidence['sourceRecordId'])
        self.assertEqual(record['id'], 'islamhouse-bukhari-epub-2010:2.13.44')
        self.assertEqual(resolution.hashobj(record), evidence['recordSha256'])
        self.assertEqual(record['textSha256'], evidence['textSha256'])
        with zipfile.ZipFile(ROOT / 'content/sources/islamhouse-bukhari/source.epub') as archive:
            section = english_tool.parse_section(archive.read(record['section']))
        body = [section['paragraphs'][i] for i in record['bodyParagraphs']]
        self.assertEqual(body, ['Narrated Abu Said Al-Khudri: ', 'One day the Prophet sat on the pulpit and we sat around him. '])
        records = [r for r in self.english['records'] if r['reference']['volume'] == 2 and r['reference']['book'] == 13]
        self.assertEqual(len(records), 63)
        bodies = [section['paragraphs'][i] for r in records for i in r['bodyParagraphs']]
        self.assertFalse(any(re.search(r'asma|fatima|faint|waterskin', b, re.I) for b in bodies))
        self.assertEqual(finding['webWitness']['url'], 'https://sunnah.com/bukhari:922')
        self.assertEqual(finding['status'], 'no-corresponding-record-in-the-pinned-friday-section')

    def test_matched_english_evidence_remains_bound_to_the_exact_inventory(self):
        rows = self.research['englishComparisons']['matchedBoundaries']
        self.assertEqual([(r['reference'], r['khan']['reference']) for r in rows],
                         [(836, '2.13.1'), (856, '2.13.21'), (879, '2.13.44'), (881, '2.13.45'), (898, '2.13.62'), (899, '2.13.63')])
        for row in rows:
            evidence = row['khan']
            record = next(r for r in self.english['records'] if r['id'] == evidence['sourceRecordId'])
            self.assertEqual(resolution.hashobj(record), evidence['recordSha256'])
            self.assertEqual(record['textSha256'], evidence['textSha256'])
            self.assertEqual(self.english['sourceSha256'], evidence['sourceSha256'])
            selected = next(r for r in self.result['records'] if r['number'] == row['reference'])
            self.assertEqual(selected['id'], row['sourceRecordId'])

    def test_printed_heading_evidence_does_not_silently_change_digital_grouping(self):
        gap = self.research['printedChapterGap']
        self.assertEqual(gap['arabicHeading'], 'باب')
        self.assertEqual(gap['beforeSelectedReference'], 857)
        self.assertEqual(gap['status'], 'two-print-candidate-not-admitted')
        chapter = next(c for c in self.result['chapters'] if c['id'] == 'chapter-12')
        self.assertEqual(chapter['entryNumbers'], [854, 855, 856, 857, 858])
        self.assertEqual([w['sourceId'] for w in gap['printedWitnesses']], ['brill-1862', 'dar-ibn-kathir-2002'])
        self.assertFalse(self.result['readerEligible'])
        self.assertTrue(all(r['status'] == 'unreviewed' for r in self.result['records']))
        catalog = read('reader/books/catalog.json')
        self.assertIn('friday-prayer', [b['id'] for b in catalog['books']])
        self.assertEqual([e['number'] for e in catalog['entries'] if e['bookId'] == 'friday-prayer'], list(range(836, 859)))
        self.assertTrue(all(n not in [e['number'] for e in catalog['entries']] for n in range(859, 900)))


if __name__ == '__main__':
    unittest.main()

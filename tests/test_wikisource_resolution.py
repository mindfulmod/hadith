"""Guard the hand-recorded layout map without changing or approving source wording."""
import copy
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('resolution', ROOT / 'scripts/resolve-wikisource-layout.py')
resolution = importlib.util.module_from_spec(spec)
spec.loader.exec_module(resolution)


class WikisourceResolutionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.registry = resolution.read(ROOT / 'content/sources/wikisource-books.json')
        cls.audit = resolution.audit_tool.build(ROOT / 'content/sources/wikisource-ablution')
        cls.review = resolution.read(ROOT / 'content/review/ablution-layout-review.json')
        cls.english = resolution.read(ROOT / 'content/staging/bukhari-en-islamhouse/catalog.json')
        cls.result = resolution.resolve(cls.audit, cls.review, cls.english)

    def reject(self, mutate, message):
        review = copy.deepcopy(self.review)
        mutate(review)
        with self.assertRaisesRegex(ValueError, message):
            resolution.resolve(self.audit, review, self.english)

    @staticmethod
    def decision(review, block):
        return next(d for d in review['decisions'] if d['blockId'] == block)

    def test_every_original_code_point_survives_in_order_once(self):
        result = self.result
        self.assertEqual(result['originalBlocks'], self.audit['blocks'])
        self.assertEqual(len(result['blocks']), 261)
        self.assertEqual(sum(len(b['text']) for b in result['blocks']), 34517)
        for original in self.audit['blocks']:
            units = [u for u in result['blocks'] if u['origin']['blockId'] == original['htmlId']]
            self.assertEqual(''.join(u['text'] for u in units), original['text'])
            position = 0
            for unit in units:
                origin = unit['origin']
                self.assertEqual(origin['start'], position)
                self.assertEqual(unit['text'], original['text'][origin['start']:origin['end']])
                self.assertEqual(origin['blockSha256'], original['textSha256'])
                self.assertEqual(resolution.layout.sha(unit['text']), unit['textSha256'])
                position = origin['end']
            self.assertEqual(position, len(original['text']))
        owned = result['blankIds'] + result['formattingIds']
        owned += [uid for c in result['chapters'] for uid in [c['headingId'], *c['contextIds']]]
        owned += [uid for r in result['records'] for uid in r['paragraphIds']]
        self.assertEqual(len(owned), len(set(owned)))
        self.assertEqual(set(owned), {u['htmlId'] for u in result['blocks']})

    def test_duplicate_labels_retain_distinct_source_identities_and_mapping(self):
        records = self.result['records']
        self.assertEqual([r['number'] for r in records], list(range(135, 245)))
        self.assertEqual(len({r['id'] for r in records}), 110)
        first, later = [r for r in records if r['sourceReference']['number'] == 162]
        self.assertEqual((first['number'], later['number']), (160, 162))
        self.assertEqual(first['sourceReference'], {'label': '١٦٢', 'number': 162, 'markerId': 'mweA:24', 'occurrence': 1})
        self.assertEqual(later['sourceReference']['markerId'], 'mwgg:0')
        self.assertEqual(later['sourceReference']['occurrence'], 2)
        self.assertEqual(first['referenceMapping']['khan']['reference'], '1.4.163')
        self.assertEqual(first['referenceMapping']['modernPrintReference'], '162')
        blocks = {b['htmlId']: b for b in self.result['blocks']}
        self.assertTrue(blocks[first['paragraphIds'][0]]['text'].startswith('[١٦٢]'))
        self.assertTrue(blocks[later['paragraphIds'][0]]['text'].startswith('[162]'))
        self.assertNotEqual(first['paragraphIds'], later['paragraphIds'])
        self.assertNotIn('referenceMapping', later)

    def test_inline_heading_and_context_stay_separate_from_numbered_reports(self):
        result = self.result
        self.assertEqual(len(result['chapters']), 76)
        self.assertEqual([c['id'] for c in result['chapters'] if not c['entryNumbers']], ['chapter-01'])
        self.assertEqual(result['chapters'][0]['contextIds'], ['mwBg', 'mwBw'])
        chapter = next(c for c in result['chapters'] if c['headingId'] == 'mweA@3-21')
        self.assertEqual(chapter['entryNumbers'], [160])
        chapter = next(c for c in result['chapters'] if 239 in c['entryNumbers'])
        self.assertEqual(chapter['contextIds'], ['mwAZM@0-77'])
        report = next(r for r in result['records'] if r['number'] == 239)
        self.assertEqual(report['paragraphIds'], ['mwAZM@77-198'])
        self.assertEqual(result['formattingIds'], ['mweA@0-3', 'mweA@21-24'])
        for previous, following, block in [(194, 195, 'mwAQM'), (220, 221, 'mwAVQ'), (241, 242, 'mwAZw')]:
            a, b = [r for r in result['records'] if r['number'] in [previous, following]]
            self.assertNotEqual(a['paragraphIds'], b['paragraphIds'])
            self.assertTrue(a['paragraphIds'][0].startswith(block + '@0-'))
            self.assertTrue(b['paragraphIds'][0].startswith(block + '@'))

    def test_no_flagged_boundary_can_be_skipped_or_reviewed_twice(self):
        self.reject(lambda r: r['decisions'].pop(), 'Missing, duplicated')
        self.reject(lambda r: r['decisions'].append(copy.deepcopy(r['decisions'][0])), 'Missing, duplicated')
        self.reject(lambda r: r['decisions'].reverse(), 'source order')
        self.reject(lambda r: r['decisions'][0]['issueIndexes'].clear(), 'Unaccounted source layout issue')
        self.reject(lambda r: r['decisions'][0].update(id='changed'), 'Changed layout decision identity')

    def test_gaps_overlaps_and_dropped_tails_are_refused(self):
        for mutation in [lambda u: u[1].update(start=3), lambda u: u[1].update(start=1), lambda u: u[1].update(end=u[1]['end'] - 1)]:
            with self.subTest(mutation=mutation):
                self.reject(lambda r: mutation(self.decision(r, 'mwYQ')['units']), 'source span|Uncovered source tail')

    def test_report_or_heading_text_cannot_be_hidden_as_spacing_or_formatting(self):
        for role in ['text', 'blank', 'formatting', 'heading']:
            def mutate(review):
                unit = self.decision(review, 'mwYQ')['units'][1]
                unit.pop('number')
                unit['kind'] = role
            with self.subTest(role=role):
                self.reject(mutate, 'source marker cannot be hidden')
        self.reject(lambda r: self.decision(r, 'mwAZM')['units'][0].update(kind='blank'), 'Nonblank content')
        self.reject(lambda r: self.decision(r, 'mwAZM')['units'][0].update(kind='formatting'), 'Only exact reviewed heading delimiters')
        self.reject(lambda r: self.decision(r, 'mweA')['units'][1].update(start=2), 'source span')

    def test_reference_mapping_requires_exact_pinned_comparison_evidence(self):
        self.reject(lambda r: self.decision(r, 'mweA')['units'][-1].pop('referenceMapping'), 'Unexpected reference mapping fields')
        self.reject(lambda r: self.decision(r, 'mweA')['units'][-1]['referenceMapping']['khan'].update(recordSha256='0' * 64), 'Stale English reference evidence')
        self.reject(lambda r: self.decision(r, 'mweA')['units'][-1]['referenceMapping'].update(sourceLabel='162'), 'Mapping differs')
        self.reject(lambda r: self.decision(r, 'mweA')['units'][-1]['referenceMapping']['bewley'].update(reference='162'), 'Missing matched Bewley reference')
        self.reject(lambda r: self.decision(r, 'mwgg')['units'][0].update(referenceMapping={}), 'Unnecessary reference mapping')

    def test_printed_witnesses_and_review_status_cannot_be_invented(self):
        self.reject(lambda r: r.update(status='approved'), 'Invalid layout-review status')
        self.reject(lambda r: r.update(reviewerKind='human'), 'Invalid layout-review status')
        self.reject(lambda r: r['sources'][0].update(sha256='0' * 64), 'Unexpected printed sources')
        self.reject(lambda r: r['sources'][0].update(url='https://example.invalid'), 'Unexpected printed sources')
        self.reject(lambda r: r.update(pageNumbering='printed pages'), 'Ambiguous printed witness page numbering')
        self.reject(lambda r: r['decisions'][0]['printedWitnesses'].pop(), 'two distinct printed witnesses')
        for pages in [[], [0], [True], [53, 52], [52, 52]]:
            with self.subTest(pages=pages):
                self.reject(lambda r: r['decisions'][0]['printedWitnesses'][0].update(pdfPages=pages), 'Invalid printed witness evidence')
        self.reject(lambda r: r['decisions'][0].update(note=''), 'Missing boundary explanation')

    def test_stale_source_audit_or_block_evidence_is_rejected(self):
        self.reject(lambda r: r.update(auditSha256='0' * 64), 'stale source evidence')
        self.reject(lambda r: r['decisions'][0].update(blockSha256='0' * 64), 'Changed original block')
        for key in ['blocks', 'markers']:
            audit = copy.deepcopy(self.audit)
            if key == 'blocks':
                audit[key][0]['text'] += ' '
            else:
                audit[key][0]['start'] += 1
            review = copy.deepcopy(self.review)
            review['auditSha256'] = resolution.hashobj(audit)
            with self.subTest(key=key), self.assertRaisesRegex(ValueError, 'Changed or ambiguous original|Changed lexical audit'):
                resolution.resolve(audit, review, self.english)

    def test_expected_coverage_must_be_unique_ordered_and_complete(self):
        self.reject(lambda r: r['expected']['numbers'].append(244), 'Invalid reviewed coverage')
        self.reject(lambda r: r['expected']['numbers'].reverse(), 'Invalid reviewed coverage')
        self.reject(lambda r: r['expected']['numbers'].pop(), 'Resolved report references')
        self.reject(lambda r: r['expected'].update(chapters=75), 'Resolved chapter coverage')

    def test_registry_paths_cannot_escape_or_overlap_normal_import(self):
        row = self.registry['pendingLayoutAudits'][0]
        for key, value in [('resolution', '../review.json'), ('inventory', 'reader/books/ablution.json')]:
            registry = copy.deepcopy(self.registry)
            registry['pendingLayoutAudits'][0][key] = value
            with self.subTest(key=key), self.assertRaisesRegex(ValueError, 'Unexpected layout resolution paths'):
                resolution.resolution_paths(registry)
        registry = copy.deepcopy(self.registry)
        registry['books'].append({'id': 'ablution'})
        with self.assertRaisesRegex(ValueError, 'duplicate layout identity'):
            resolution.resolution_paths(registry)
        with tempfile.TemporaryDirectory() as directory, tempfile.TemporaryDirectory() as outside:
            root = Path(directory)
            link = root / row['resolution']
            link.parent.mkdir(parents=True)
            link.symlink_to(Path(outside) / 'review.json')
            with self.assertRaisesRegex(ValueError, 'escapes repository'):
                resolution.resolution_paths(self.registry, root)

    def test_saved_inventory_is_reproducible_and_only_explicit_batches_enter_reader(self):
        result = resolution.build_registered(self.registry, check=True)
        self.assertEqual(result, [('ablution', self.result)])
        self.assertEqual(self.result['status'], 'candidate-layout-mapped-not-approved')
        self.assertFalse(self.result['readerEligible'])
        self.assertTrue(all(r['status'] == 'unreviewed' for r in self.result['records']))
        reader = resolution.read(ROOT / 'reader/books/catalog.json')
        self.assertEqual([e['number'] for e in reader['entries'] if e['bookId'] == 'ablution'], list(range(135, 192)))
        self.assertEqual(len(self.result['layoutReview']['decisions']), 9)
        self.assertEqual(sum(len(d['issueIndexes']) for d in self.result['layoutReview']['decisions']), 11)


if __name__ == '__main__':
    unittest.main()

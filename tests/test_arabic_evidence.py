"""Evidence-pointer checks do not validate scholarly or visual judgements."""
import hashlib
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def read(path):
    return json.loads((ROOT/path).read_text())


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


class ArabicReferenceEvidenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.audit = read('research/arabic-reference-audit.json')
        cls.sources = {}
        for source in cls.audit['sources']:
            manifest = read(source['manifest'])
            catalog = read(source['catalog'])
            raw = (ROOT/source['manifest']).parent.joinpath('source.mARkdown').read_bytes()
            cls.sources[source['sourceId']] = (source, manifest, catalog, raw)

    def test_every_observation_points_to_unchanged_source_spans(self):
        for source, manifest, catalog, raw in self.sources.values():
            self.assertEqual(source['sha256'], sha(raw))
            self.assertEqual(catalog['sourceSha256'], sha(raw))
            self.assertEqual(source['sourceURL'], manifest['sourceURL'])
        seen = set()
        for finding in self.audit['findings']:
            self.assertNotIn(finding['id'], seen)
            seen.add(finding['id'])
            for evidence in finding['digital']:
                _, _, catalog, raw = self.sources[evidence['sourceId']]
                records = catalog.get('records', catalog.get('blocks', []))
                matches = [r for r in records if r['id'] == evidence['recordId']]
                self.assertEqual(len(matches), 1)
                record = matches[0]
                for key in ['start', 'end', 'sha256']:
                    self.assertEqual(evidence[key], record[key])
                self.assertEqual(evidence['offsetUnit'], catalog['offsetUnit'])
                if 'UTF-16' in evidence['offsetUnit']:
                    encoded = raw.decode('utf-8').encode('utf-16-le')
                    text = encoded[evidence['start']*2:evidence['end']*2].decode('utf-16-le')
                else:
                    text = raw[evidence['start']:evidence['end']].decode('utf-8')
                self.assertEqual(sha(text.encode('utf-8')), evidence['sha256'])
                number = record.get('number', record.get('reference', {}).get('number'))
                self.assertEqual(evidence['reference'], str(number))
                self.assertEqual(evidence['occurrence'], record.get('reference', {}).get('occurrence', 1))
                for phrase in evidence.get('contains', []):
                    self.assertIn(phrase, text)

    def test_missing_and_empty_labels_are_distinct_and_keep_original_inventory(self):
        source = self.sources['openiti-bukhari-shamela1681'][2]
        self.assertEqual(len(source['audit']['missingNumbers']), 173)
        self.assertEqual(len(source['audit']['emptyRecords']), 10)
        for finding in self.audit['findings']:
            for number in finding.get('absentNumericLabels', []):
                self.assertIn(number, source['audit']['missingNumbers'])
                self.assertNotIn(number, source['audit']['emptyRecords'])
            for number in finding.get('emptyNumericLabels', []):
                self.assertIn(number, source['audit']['emptyRecords'])
                self.assertNotIn(number, source['audit']['missingNumbers'])
        combined = [f for f in self.audit['findings'] if f['kind'] in ('combined-numbering', 'embedded-following-report')]
        self.assertEqual(sorted(n for f in combined for n in f['absentNumericLabels']), [409, 411, 4137])
        duplicates = [f for f in self.audit['findings'] if f['kind'] == 'duplicate-label-distinct-report']
        jk_records = [e for f in duplicates for e in f['digital'] if e['sourceId'] == 'openiti-bukhari-jk000110']
        self.assertEqual([e['occurrence'] for e in jk_records], [1, 2])
        self.assertEqual(len({e['recordId'] for e in jk_records}), 2)

    def test_public_audit_matches_inventory_and_cannot_be_publication_approval(self):
        alternate = read('research/alternate-arabic-source-audit.json')
        jk_source, manifest, catalog, _ = self.sources['openiti-bukhari-jk000110']
        self.assertEqual(alternate['audit'], catalog['audit'])
        self.assertEqual(alternate['sha256'], jk_source['sha256'])
        self.assertFalse(self.audit['readerEligible'])
        self.assertFalse(alternate['readerEligible'])
        self.assertFalse(catalog['readerEligible'])
        self.assertFalse(manifest['readerEligible'])
        witness = self.audit['comparisonWitness']
        for key in ['id', 'bytes', 'sha256', 'pageCount', 'edition']:
            self.assertEqual(witness[key], manifest['comparisonWitness'][key])
        self.assertRegex(witness['sha256'], r'^[0-9a-f]{64}$')
        for finding in self.audit['findings']:
            self.assertTrue(finding['pages'])
            self.assertTrue(all(p in witness['inspectedPages'] and 1 <= p <= witness['pageCount'] for p in finding['pages']))
        # Source observations must never enter the publication ledger by implication.
        ledger = read('content/review/opening-ledger.json')
        self.assertEqual(ledger['publication'], 'evaluation')
        self.assertTrue(all(e['status'] == 'evaluation-only' for e in ledger['entries']))


if __name__ == '__main__':
    unittest.main()
